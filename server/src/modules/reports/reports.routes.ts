import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/error";
import { logAudit } from "../../utils/audit";

const router = Router();
router.use(requireAuth, requirePermission("reports", "view"));

const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function range(q: { from?: Date; to?: Date }) {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getFullYear(), to.getMonth() - 2, 1);
  return { from, to };
}

// ---- GET /api/reports/summary — one call powering the Reports page ----
router.get(
  "/summary",
  validate({ query: rangeQuery }),
  asyncHandler(async (req, res) => {
    const { from, to } = range(req.query as { from?: Date; to?: Date });
    const dateFilter = { gte: from, lte: to };

    const [
      leadsCreated,
      leadsBySource,
      leadsByStatus,
      bookings,
      revenue,
      lostLeads,
      siteVisits,
      visitsByStatus,
      employeeRows,
      attendanceRows,
      propertyByType,
    ] = await Promise.all([
      prisma.lead.count({ where: { deletedAt: null, createdAt: dateFilter } }),
      prisma.lead.groupBy({
        by: ["sourceId"],
        where: { deletedAt: null, createdAt: dateFilter },
        _count: true,
      }),
      prisma.lead.groupBy({
        by: ["statusId"],
        where: { deletedAt: null, createdAt: dateFilter },
        _count: true,
      }),
      prisma.booking.count({
        where: { bookingDate: dateFilter, status: { not: "CANCELLED" } },
      }),
      prisma.booking.aggregate({
        _sum: { amount: true },
        where: { bookingDate: dateFilter, status: { in: ["CONFIRMED", "COMPLETED"] } },
      }),
      prisma.lead.findMany({
        where: { deletedAt: null, lostReason: { not: null }, updatedAt: dateFilter },
        select: { lostReason: true },
      }),
      prisma.siteVisit.count({ where: { scheduledAt: dateFilter } }),
      prisma.siteVisit.groupBy({
        by: ["status"],
        where: { scheduledAt: dateFilter },
        _count: true,
      }),
      prisma.user.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true, name: true, salesTarget: true,
          role: { select: { name: true } },
          _count: {
            select: {
              leadsAssigned: { where: { deletedAt: null, createdAt: dateFilter } },
              siteVisits: { where: { scheduledAt: dateFilter, status: "COMPLETED" } },
            },
          },
          bookings: {
            where: { bookingDate: dateFilter, status: { in: ["CONFIRMED", "COMPLETED"] } },
            select: { amount: true },
          },
        },
      }),
      prisma.attendance.groupBy({
        by: ["status"],
        where: { date: { gte: from, lte: to } },
        _count: true,
      }),
      prisma.property.groupBy({
        by: ["type", "status"],
        where: { deletedAt: null },
        _count: true,
      }),
    ]);

    const [sources, statuses] = await Promise.all([
      prisma.leadSourceOption.findMany(),
      prisma.leadStatusOption.findMany({ orderBy: { order: "asc" } }),
    ]);
    const srcMap = new Map(sources.map((s) => [s.id, s]));
    const stMap = new Map(statuses.map((s) => [s.id, s]));

    // Lost reason analysis
    const lostReasons = new Map<string, number>();
    for (const l of lostLeads) {
      const key = (l.lostReason ?? "Unspecified").trim();
      lostReasons.set(key, (lostReasons.get(key) ?? 0) + 1);
    }

    const booked = statuses.find((s) => s.name === "Booked");
    const bookedCount = booked
      ? leadsByStatus.find((g) => g.statusId === booked.id)?._count ?? 0
      : 0;

    logAudit(req, "VIEW_REPORT", "Report", null);
    res.json({
      success: true,
      data: {
        range: { from, to },
        overview: {
          leadsCreated,
          bookings,
          revenue: Number(revenue._sum.amount ?? 0),
          siteVisits,
          conversionRate: leadsCreated ? +((bookedCount / leadsCreated) * 100).toFixed(1) : 0,
        },
        leadSource: leadsBySource.map((g) => ({
          name: srcMap.get(g.sourceId)?.name ?? "Unknown",
          color: srcMap.get(g.sourceId)?.color ?? "#64748B",
          value: g._count,
        })),
        leadStatus: statuses.map((s) => ({
          name: s.name,
          color: s.color,
          value: leadsByStatus.find((g) => g.statusId === s.id)?._count ?? 0,
        })),
        siteVisitStatus: visitsByStatus.map((g) => ({ name: g.status, value: g._count })),
        lostReasons: Array.from(lostReasons, ([name, value]) => ({ name, value })).sort(
          (a, b) => b.value - a.value
        ),
        employees: employeeRows
          .map((u) => ({
            id: u.id,
            name: u.name,
            role: u.role.name,
            leads: u._count.leadsAssigned,
            visits: u._count.siteVisits,
            bookings: u.bookings.length,
            revenue: u.bookings.reduce((sum, b) => sum + Number(b.amount), 0),
            target: Number(u.salesTarget ?? 0),
          }))
          .sort((a, b) => b.revenue - a.revenue),
        attendance: attendanceRows.map((g) => ({ name: g.status, value: g._count })),
        propertyInventory: propertyByType.map((g) => ({
          type: g.type,
          status: g.status,
          count: g._count,
        })),
      },
    });
  })
);

export default router;
