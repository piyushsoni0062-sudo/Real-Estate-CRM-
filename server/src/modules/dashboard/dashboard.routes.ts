import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { asyncHandler } from "../../middleware/error";

const router = Router();
router.use(requireAuth, requirePermission("dashboard", "view"));

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---- GET /api/dashboard — all dashboard cards, charts and lists in one call ----
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const today = startOfToday();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const todayUtc = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    );

    const [
      todaysLeads,
      newLeads,
      openFollowUps,
      siteVisitsToday,
      bookingsThisMonth,
      revenueAgg,
      pendingTasks,
      presentToday,
      leadsBySource,
      stageFunnel,
      recentBookings,
      upcomingFollowUps,
      todaysTasks,
      latestActivities,
      monthlyBookings,
      employeePerformance,
      propertyPerformance,
    ] = await Promise.all([
      prisma.lead.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
      prisma.lead.count({
        where: { deletedAt: null, status: { order: 0 } },
      }),
      prisma.followUp.count({ where: { status: "PENDING" } }),
      prisma.siteVisit.count({
        where: { scheduledAt: { gte: today, lt: tomorrow }, status: { not: "CANCELLED" } },
      }),
      prisma.booking.count({
        where: { bookingDate: { gte: startOfMonth }, status: { not: "CANCELLED" } },
      }),
      prisma.booking.aggregate({
        _sum: { amount: true },
        where: {
          bookingDate: { gte: startOfMonth },
          status: { in: ["CONFIRMED", "COMPLETED"] },
        },
      }),
      prisma.task.count({
        where: { deletedAt: null, status: { in: ["TODO", "IN_PROGRESS"] } },
      }),
      prisma.attendance.count({
        where: { date: todayUtc, status: { in: ["PRESENT", "LATE", "HALF_DAY"] } },
      }),
      prisma.lead.groupBy({
        by: ["sourceId"],
        where: { deletedAt: null },
        _count: true,
      }),
      prisma.lead.groupBy({
        by: ["stageId"],
        where: { deletedAt: null, stageId: { not: null } },
        _count: true,
      }),
      prisma.booking.findMany({
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { name: true } },
          property: { select: { title: true, code: true } },
        },
      }),
      prisma.followUp.findMany({
        where: { status: "PENDING", dueAt: { gte: today } },
        take: 6,
        orderBy: { dueAt: "asc" },
        include: {
          lead: { select: { id: true, name: true, mobile: true } },
          assignedTo: { select: { name: true } },
        },
      }),
      prisma.task.findMany({
        where: {
          deletedAt: null,
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueAt: { gte: today, lt: tomorrow },
        },
        take: 6,
        orderBy: { dueAt: "asc" },
        include: { assignedTo: { select: { name: true } } },
      }),
      prisma.leadActivity.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true } },
          lead: { select: { id: true, name: true } },
        },
      }),
      prisma.booking.findMany({
        where: { bookingDate: { gte: sixMonthsAgo }, status: { in: ["CONFIRMED", "COMPLETED"] } },
        select: { bookingDate: true, amount: true },
      }),
      prisma.user.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true, name: true, salesTarget: true,
          _count: { select: { leadsAssigned: { where: { deletedAt: null } } } },
          bookings: {
            where: { status: { in: ["CONFIRMED", "COMPLETED"] }, bookingDate: { gte: startOfMonth } },
            select: { amount: true },
          },
        },
        take: 10,
      }),
      prisma.project.findMany({
        where: { deletedAt: null },
        select: {
          id: true, name: true,
          _count: { select: { leads: { where: { deletedAt: null } } } },
          properties: {
            where: { deletedAt: null },
            select: { status: true },
          },
        },
        take: 8,
      }),
    ]);

    // Resolve source/stage names for the groupBy results.
    const [sources, stages] = await Promise.all([
      prisma.leadSourceOption.findMany(),
      prisma.pipelineStage.findMany({ orderBy: { order: "asc" } }),
    ]);
    const sourceName = new Map(sources.map((s) => [s.id, s]));
    const stageName = new Map(stages.map((s) => [s.id, s]));

    // Monthly revenue series (last 6 months).
    const revenueByMonth = new Map<string, number>();
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - 5 + i, 1);
      revenueByMonth.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const b of monthlyBookings) {
      const key = `${b.bookingDate.getFullYear()}-${String(b.bookingDate.getMonth() + 1).padStart(2, "0")}`;
      if (revenueByMonth.has(key)) {
        revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(b.amount));
      }
    }

    res.json({
      success: true,
      data: {
        cards: {
          todaysLeads,
          newLeads,
          openFollowUps,
          siteVisitsToday,
          bookings: bookingsThisMonth,
          revenue: Number(revenueAgg._sum.amount ?? 0),
          pendingTasks,
          presentEmployees: presentToday,
        },
        charts: {
          leadSources: leadsBySource.map((g) => ({
            name: sourceName.get(g.sourceId)?.name ?? "Unknown",
            color: sourceName.get(g.sourceId)?.color ?? "#64748B",
            value: g._count,
          })),
          salesFunnel: stages.map((s) => ({
            name: s.name,
            color: s.color,
            value: stageFunnel.find((g) => g.stageId === s.id)?._count ?? 0,
          })),
          monthlyRevenue: Array.from(revenueByMonth, ([month, revenue]) => ({ month, revenue })),
          employeePerformance: employeePerformance
            .map((u) => ({
              name: u.name,
              leads: u._count.leadsAssigned,
              revenue: u.bookings.reduce((sum, b) => sum + Number(b.amount), 0),
              target: Number(u.salesTarget ?? 0),
            }))
            .sort((a, b) => b.revenue - a.revenue),
          propertyPerformance: propertyPerformance.map((p) => ({
            name: p.name,
            leads: p._count.leads,
            total: p.properties.length,
            sold: p.properties.filter((x) => x.status === "SOLD" || x.status === "BOOKED").length,
          })),
        },
        lists: {
          recentBookings,
          upcomingFollowUps,
          todaysTasks,
          latestActivities,
        },
      },
    });
  })
);

export default router;
