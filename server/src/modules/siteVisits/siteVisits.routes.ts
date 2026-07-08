import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { buildOrderBy, paginated, paginationQuery, toSkipTake } from "../../utils/pagination";
import { logAudit, notify } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

const visitBody = z.object({
  leadId: z.string().min(1, "Lead is required"),
  propertyId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  assignedToId: z.string().min(1, "Executive is required"),
  scheduledAt: z.coerce.date(),
  remarks: z.string().max(1000).optional().nullable(),
});

const include = {
  lead: { select: { id: true, name: true, mobile: true } },
  property: { select: { id: true, title: true, code: true } },
  project: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.SiteVisitInclude;

// ---- GET /api/site-visits ----
router.get(
  "/",
  requirePermission("siteVisits", "view"),
  validate({
    query: paginationQuery.extend({
      status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED"]).optional(),
      assignedToId: z.string().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof paginationQuery> & {
      status?: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "RESCHEDULED";
      assignedToId?: string;
      from?: Date;
      to?: Date;
    };
    const where: Prisma.SiteVisitWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.assignedToId && { assignedToId: q.assignedToId }),
      ...(q.from || q.to
        ? { scheduledAt: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }
        : {}),
      ...(q.search && {
        lead: {
          OR: [
            { name: { contains: q.search, mode: "insensitive" as const } },
            { mobile: { contains: q.search } },
          ],
        },
      }),
    };
    const [items, total] = await Promise.all([
      prisma.siteVisit.findMany({
        where, include,
        orderBy: buildOrderBy(q, ["scheduledAt", "createdAt"], "scheduledAt"),
        ...toSkipTake(q),
      }),
      prisma.siteVisit.count({ where }),
    ]);
    res.json({ success: true, data: paginated(items, total, q) });
  })
);

// ---- POST /api/site-visits — schedule ----
router.post(
  "/",
  requirePermission("siteVisits", "create"),
  validate({ body: visitBody }),
  asyncHandler(async (req, res) => {
    const visit = await prisma.siteVisit.create({
      data: { ...req.body, createdById: req.user!.id },
      include,
    });
    await prisma.leadActivity.create({
      data: {
        leadId: visit.leadId,
        userId: req.user!.id,
        type: "SITE_VISIT",
        title: `Site visit scheduled for ${visit.scheduledAt.toLocaleString("en-IN")}`,
      },
    });
    if (visit.assignedToId !== req.user!.id) {
      notify(visit.assignedToId, {
        title: "Site visit assigned",
        body: `${visit.lead.name} — ${visit.scheduledAt.toLocaleString("en-IN")}`,
        type: "SITE_VISIT",
        link: "/site-visits",
      });
    }
    logAudit(req, "CREATE", "SiteVisit", visit.id, undefined, req.body);
    res.status(201).json({ success: true, data: visit });
  })
);

// ---- PATCH /api/site-visits/:id — update / reschedule / complete / cancel ----
router.patch(
  "/:id",
  requirePermission("siteVisits", "update"),
  validate({
    body: visitBody.partial().extend({
      status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "RESCHEDULED"]).optional(),
      feedback: z.string().max(2000).optional().nullable(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const before = await prisma.siteVisit.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound("Site visit not found");

    const rescheduled =
      req.body.scheduledAt && +new Date(req.body.scheduledAt) !== +before.scheduledAt;

    const visit = await prisma.siteVisit.update({
      where: { id: before.id },
      data: {
        ...req.body,
        ...(rescheduled && !req.body.status && { status: "RESCHEDULED" }),
      },
      include,
    });

    if (req.body.status && req.body.status !== before.status) {
      await prisma.leadActivity.create({
        data: {
          leadId: visit.leadId,
          userId: req.user!.id,
          type: "SITE_VISIT",
          title: `Site visit ${req.body.status.toLowerCase()}`,
          description: req.body.feedback ?? undefined,
        },
      });
    }
    logAudit(req, "UPDATE", "SiteVisit", visit.id, { status: before.status }, req.body);
    res.json({ success: true, data: visit });
  })
);

// ---- POST /api/site-visits/:id/check-in — GPS check-in ----
router.post(
  "/:id/check-in",
  requirePermission("siteVisits", "update"),
  validate({ body: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }) }),
  asyncHandler(async (req, res) => {
    const visit = await prisma.siteVisit.findUnique({ where: { id: req.params.id } });
    if (!visit) throw ApiError.notFound("Site visit not found");
    if (visit.checkInAt) throw ApiError.badRequest("Already checked in for this visit");

    const updated = await prisma.siteVisit.update({
      where: { id: visit.id },
      data: { checkInAt: new Date(), checkInLat: req.body.lat, checkInLng: req.body.lng },
      include,
    });
    res.json({ success: true, data: updated });
  })
);

// ---- DELETE /api/site-visits/:id ----
router.delete(
  "/:id",
  requirePermission("siteVisits", "delete"),
  asyncHandler(async (req, res) => {
    await prisma.siteVisit.delete({ where: { id: req.params.id } });
    logAudit(req, "DELETE", "SiteVisit", req.params.id);
    res.json({ success: true, message: "Site visit deleted" });
  })
);

export default router;
