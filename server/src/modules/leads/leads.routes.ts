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

const mobileSchema = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");

/** Maps zod-parsed JSON fields onto Prisma's Json input type (null → DbNull). */
function jsonInput(
  value: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

const leadBody = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  mobile: mobileSchema,
  email: z.string().email("Invalid email").optional().nullable(),
  altMobile: mobileSchema.optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  budgetMin: z.coerce.number().nonnegative().optional().nullable(),
  budgetMax: z.coerce.number().nonnegative().optional().nullable(),
  requirement: z.string().max(2000).optional().nullable(),
  propertyType: z.enum(["PLOT", "VILLA", "APARTMENT", "COMMERCIAL", "FARMHOUSE"]).optional().nullable(),
  statusId: z.string().optional(),
  sourceId: z.string().optional(),
  stageId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  lostReason: z.string().max(500).optional().nullable(),
  customFields: z.record(z.unknown()).optional().nullable(),
});

const listQuery = paginationQuery.extend({
  statusId: z.string().optional(),
  sourceId: z.string().optional(),
  stageId: z.string().optional(),
  assignedToId: z.string().optional(),
  projectId: z.string().optional(),
  city: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const include = {
  status: true,
  source: true,
  stage: true,
  assignedTo: { select: { id: true, name: true, avatarUrl: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.LeadInclude;

function listWhere(q: z.infer<typeof listQuery>): Prisma.LeadWhereInput {
  return {
    deletedAt: null,
    ...(q.statusId && { statusId: q.statusId }),
    ...(q.sourceId && { sourceId: q.sourceId }),
    ...(q.stageId && { stageId: q.stageId }),
    ...(q.assignedToId && { assignedToId: q.assignedToId }),
    ...(q.projectId && { projectId: q.projectId }),
    ...(q.city && { city: { contains: q.city, mode: "insensitive" } }),
    ...(q.from || q.to
      ? { createdAt: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }
      : {}),
    ...(q.search && {
      OR: [
        { name: { contains: q.search, mode: "insensitive" as const } },
        { mobile: { contains: q.search } },
        { email: { contains: q.search, mode: "insensitive" as const } },
        { city: { contains: q.search, mode: "insensitive" as const } },
      ],
    }),
  };
}

async function addActivity(
  leadId: string,
  userId: string | null,
  type: string,
  title: string,
  description?: string,
  meta?: unknown
) {
  await prisma.leadActivity.create({
    data: {
      leadId,
      userId,
      type,
      title,
      description,
      meta: meta === undefined ? undefined : JSON.parse(JSON.stringify(meta)),
    },
  });
}

async function defaults() {
  const [status, source] = await Promise.all([
    prisma.leadStatusOption.findFirst({ orderBy: { order: "asc" } }),
    prisma.leadSourceOption.findFirst({ where: { name: "Manual" } }).then(
      (s) => s ?? prisma.leadSourceOption.findFirstOrThrow()
    ),
  ]);
  if (!status) throw ApiError.badRequest("No lead statuses configured — seed the database first");
  return { statusId: status.id, sourceId: source.id };
}

// ---- GET /api/leads ----
router.get(
  "/",
  requirePermission("leads", "view"),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where = listWhere(q);
    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include,
        orderBy: buildOrderBy(q, ["createdAt", "updatedAt", "name", "score"]),
        ...toSkipTake(q),
      }),
      prisma.lead.count({ where }),
    ]);
    res.json({ success: true, data: paginated(items, total, q) });
  })
);

// ---- GET /api/leads/export — flat rows for Excel/CSV export ----
router.get(
  "/export",
  requirePermission("leads", "export"),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const leads = await prisma.lead.findMany({
      where: listWhere(q),
      include,
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    logAudit(req, "EXPORT", "Lead", null, undefined, { count: leads.length });
    res.json({
      success: true,
      data: leads.map((l) => ({
        Name: l.name,
        Mobile: l.mobile,
        Email: l.email ?? "",
        City: l.city ?? "",
        Status: l.status.name,
        Source: l.source.name,
        Stage: l.stage?.name ?? "",
        AssignedTo: l.assignedTo?.name ?? "",
        Project: l.project?.name ?? "",
        BudgetMin: l.budgetMin?.toString() ?? "",
        BudgetMax: l.budgetMax?.toString() ?? "",
        Requirement: l.requirement ?? "",
        CreatedAt: l.createdAt.toISOString(),
      })),
    });
  })
);

// ---- GET /api/leads/check-duplicate?mobile= ----
router.get(
  "/check-duplicate",
  requirePermission("leads", "view"),
  validate({ query: z.object({ mobile: z.string().min(4), excludeId: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const { mobile, excludeId } = req.query as { mobile: string; excludeId?: string };
    const dup = await prisma.lead.findFirst({
      where: { mobile, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) },
      select: { id: true, name: true, mobile: true, assignedTo: { select: { name: true } } },
    });
    res.json({ success: true, data: { duplicate: dup } });
  })
);

// ---- POST /api/leads ----
router.post(
  "/",
  requirePermission("leads", "create"),
  validate({ body: leadBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof leadBody>;
    const dup = await prisma.lead.findFirst({
      where: { mobile: body.mobile, deletedAt: null },
      select: { id: true, name: true },
    });
    if (dup) {
      throw ApiError.conflict(`A lead with this mobile already exists (${dup.name})`, {
        duplicateId: dup.id,
      });
    }
    const d = await defaults();
    const lead = await prisma.lead.create({
      data: {
        ...body,
        customFields: jsonInput(body.customFields),
        statusId: body.statusId ?? d.statusId,
        sourceId: body.sourceId ?? d.sourceId,
        createdById: req.user!.id,
      },
      include,
    });
    await addActivity(lead.id, req.user!.id, "CREATED", "Lead created");
    if (lead.assignedToId && lead.assignedToId !== req.user!.id) {
      notify(lead.assignedToId, {
        title: "New lead assigned",
        body: `${lead.name} (${lead.mobile})`,
        type: "LEAD_ASSIGNED",
        link: `/leads/${lead.id}`,
      });
    }
    logAudit(req, "CREATE", "Lead", lead.id, undefined, body);
    res.status(201).json({ success: true, data: lead });
  })
);

// ---- POST /api/leads/import — bulk rows from Excel/CSV upload (parsed client-side) ----
router.post(
  "/import",
  requirePermission("leads", "import"),
  validate({
    body: z.object({
      rows: z
        .array(
          z.object({
            name: z.string().min(1),
            mobile: z.string().min(10),
            email: z.string().optional(),
            city: z.string().optional(),
            requirement: z.string().optional(),
            source: z.string().optional(),
          })
        )
        .min(1)
        .max(2000),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { rows } = req.body as { rows: Array<Record<string, string | undefined>> };
    const d = await defaults();
    const sources = await prisma.leadSourceOption.findMany();
    const sourceByName = new Map(sources.map((s) => [s.name.toLowerCase(), s.id]));

    let created = 0;
    const skipped: Array<{ row: number; reason: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const mobile = (r.mobile ?? "").replace(/\D/g, "").slice(-10);
      if (!/^[6-9]\d{9}$/.test(mobile)) {
        skipped.push({ row: i + 1, reason: "Invalid mobile" });
        continue;
      }
      const dup = await prisma.lead.findFirst({ where: { mobile, deletedAt: null }, select: { id: true } });
      if (dup) {
        skipped.push({ row: i + 1, reason: "Duplicate mobile" });
        continue;
      }
      const lead = await prisma.lead.create({
        data: {
          name: r.name!.trim(),
          mobile,
          email: r.email?.trim() || null,
          city: r.city?.trim() || null,
          requirement: r.requirement?.trim() || null,
          statusId: d.statusId,
          sourceId: sourceByName.get((r.source ?? "").toLowerCase()) ?? d.sourceId,
          createdById: req.user!.id,
        },
      });
      await addActivity(lead.id, req.user!.id, "IMPORT", "Lead imported from file");
      created++;
    }
    logAudit(req, "IMPORT", "Lead", null, undefined, { created, skipped: skipped.length });
    res.json({ success: true, data: { created, skipped } });
  })
);

// ---- POST /api/leads/bulk — bulk assign / status / stage / delete ----
router.post(
  "/bulk",
  requirePermission("leads", "update"),
  validate({
    body: z.object({
      ids: z.array(z.string()).min(1).max(500),
      action: z.enum(["assign", "status", "stage", "delete"]),
      assignedToId: z.string().optional(),
      statusId: z.string().optional(),
      stageId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { ids, action, assignedToId, statusId, stageId } = req.body;
    const where = { id: { in: ids }, deletedAt: null };

    if (action === "assign") {
      if (!assignedToId) throw ApiError.badRequest("assignedToId is required");
      await prisma.lead.updateMany({ where, data: { assignedToId, updatedById: req.user!.id } });
      await prisma.leadActivity.createMany({
        data: ids.map((leadId: string) => ({
          leadId, userId: req.user!.id, type: "ASSIGNED", title: "Lead assigned (bulk)",
        })),
      });
      notify(assignedToId, {
        title: `${ids.length} leads assigned to you`,
        type: "LEAD_ASSIGNED",
        link: "/leads",
      });
    } else if (action === "status") {
      if (!statusId) throw ApiError.badRequest("statusId is required");
      await prisma.lead.updateMany({ where, data: { statusId, updatedById: req.user!.id } });
    } else if (action === "stage") {
      if (!stageId) throw ApiError.badRequest("stageId is required");
      await prisma.lead.updateMany({ where, data: { stageId, updatedById: req.user!.id } });
    } else {
      await prisma.lead.updateMany({
        where,
        data: { deletedAt: new Date(), updatedById: req.user!.id },
      });
    }
    logAudit(req, `BULK_${action.toUpperCase()}`, "Lead", null, undefined, { ids });
    res.json({ success: true, message: `${ids.length} leads updated` });
  })
);

// ---- GET /api/leads/:id — full detail with timeline ----
router.get(
  "/:id",
  requirePermission("leads", "view"),
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        ...include,
        createdBy: { select: { id: true, name: true } },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 100,
          include: { user: { select: { id: true, name: true } } },
        },
        notes: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
        documents: { include: { file: true }, orderBy: { createdAt: "desc" } },
        followUps: {
          orderBy: { dueAt: "asc" },
          include: { assignedTo: { select: { id: true, name: true } } },
        },
        siteVisits: {
          orderBy: { scheduledAt: "desc" },
          include: {
            assignedTo: { select: { id: true, name: true } },
            property: { select: { id: true, title: true } },
          },
        },
        tasks: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
        bookings: { include: { property: { select: { id: true, title: true } } } },
      },
    });
    if (!lead) throw ApiError.notFound("Lead not found");
    res.json({ success: true, data: lead });
  })
);

// ---- PATCH /api/leads/:id ----
router.patch(
  "/:id",
  requirePermission("leads", "update"),
  validate({ body: leadBody.partial() }),
  asyncHandler(async (req, res) => {
    const before = await prisma.lead.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { status: true, stage: true },
    });
    if (!before) throw ApiError.notFound("Lead not found");
    const body = req.body as Partial<z.infer<typeof leadBody>>;

    if (body.mobile && body.mobile !== before.mobile) {
      const dup = await prisma.lead.findFirst({
        where: { mobile: body.mobile, deletedAt: null, id: { not: before.id } },
      });
      if (dup) throw ApiError.conflict("Another lead already uses this mobile number");
    }

    const lead = await prisma.lead.update({
      where: { id: before.id },
      data: { ...body, customFields: jsonInput(body.customFields), updatedById: req.user!.id },
      include,
    });

    if (body.statusId && body.statusId !== before.statusId) {
      await addActivity(
        lead.id, req.user!.id, "STATUS_CHANGE",
        `Status changed: ${before.status.name} → ${lead.status.name}`
      );
    }
    if (body.stageId !== undefined && body.stageId !== before.stageId) {
      await addActivity(
        lead.id, req.user!.id, "STAGE_CHANGE",
        `Pipeline stage changed: ${before.stage?.name ?? "None"} → ${lead.stage?.name ?? "None"}`
      );
    }
    if (body.assignedToId && body.assignedToId !== before.assignedToId) {
      await addActivity(lead.id, req.user!.id, "ASSIGNED", `Assigned to ${lead.assignedTo?.name}`);
      if (body.assignedToId !== req.user!.id) {
        notify(body.assignedToId, {
          title: "Lead assigned to you",
          body: `${lead.name} (${lead.mobile})`,
          type: "LEAD_ASSIGNED",
          link: `/leads/${lead.id}`,
        });
      }
    }
    logAudit(req, "UPDATE", "Lead", lead.id, before, body);
    res.json({ success: true, data: lead });
  })
);

// ---- DELETE /api/leads/:id — soft delete ----
router.delete(
  "/:id",
  requirePermission("leads", "delete"),
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!lead) throw ApiError.notFound("Lead not found");
    await prisma.lead.update({
      where: { id: lead.id },
      data: { deletedAt: new Date(), updatedById: req.user!.id },
    });
    logAudit(req, "DELETE", "Lead", lead.id, lead);
    res.json({ success: true, message: "Lead deleted" });
  })
);

// ---- Notes ----
router.post(
  "/:id/notes",
  requirePermission("leads", "update"),
  validate({ body: z.object({ body: z.string().min(1).max(5000) }) }),
  asyncHandler(async (req, res) => {
    const note = await prisma.leadNote.create({
      data: { leadId: req.params.id, userId: req.user!.id, body: req.body.body },
      include: { user: { select: { id: true, name: true } } },
    });
    await addActivity(req.params.id, req.user!.id, "NOTE", "Note added", req.body.body.slice(0, 200));
    res.status(201).json({ success: true, data: note });
  })
);

router.delete(
  "/:id/notes/:noteId",
  requirePermission("leads", "update"),
  asyncHandler(async (req, res) => {
    const note = await prisma.leadNote.findFirst({
      where: { id: req.params.noteId, leadId: req.params.id },
    });
    if (!note) throw ApiError.notFound("Note not found");
    if (note.userId !== req.user!.id && req.user!.roleName !== "Super Admin") {
      throw ApiError.forbidden("You can only delete your own notes");
    }
    await prisma.leadNote.delete({ where: { id: note.id } });
    res.json({ success: true, message: "Note deleted" });
  })
);

// ---- Log an interaction (call / whatsapp / email) on the timeline ----
router.post(
  "/:id/interactions",
  requirePermission("leads", "update"),
  validate({
    body: z.object({
      type: z.enum(["CALL", "WHATSAPP", "EMAIL"]),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    await addActivity(req.params.id, req.user!.id, req.body.type, req.body.title, req.body.description);
    res.status(201).json({ success: true, message: "Interaction logged" });
  })
);

// ---- Follow-ups ----
router.post(
  "/:id/followups",
  requirePermission("leads", "update"),
  validate({
    body: z.object({
      dueAt: z.coerce.date(),
      assignedToId: z.string().optional(),
      repeat: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"),
      notes: z.string().max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const followUp = await prisma.followUp.create({
      data: {
        leadId: req.params.id,
        assignedToId: req.body.assignedToId ?? req.user!.id,
        dueAt: req.body.dueAt,
        repeat: req.body.repeat,
        notes: req.body.notes,
        createdById: req.user!.id,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });
    await addActivity(req.params.id, req.user!.id, "FOLLOWUP", "Follow-up scheduled", req.body.notes);
    res.status(201).json({ success: true, data: followUp });
  })
);

router.patch(
  "/:id/followups/:followUpId",
  requirePermission("leads", "update"),
  validate({
    body: z.object({
      status: z.enum(["PENDING", "DONE", "CANCELLED"]).optional(),
      dueAt: z.coerce.date().optional(),
      notes: z.string().max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.followUp.findFirst({
      where: { id: req.params.followUpId, leadId: req.params.id },
    });
    if (!existing) throw ApiError.notFound("Follow-up not found");

    const followUp = await prisma.followUp.update({
      where: { id: existing.id },
      data: {
        ...req.body,
        completedAt: req.body.status === "DONE" ? new Date() : existing.completedAt,
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    });

    // Recurring follow-ups roll forward automatically when completed.
    if (req.body.status === "DONE" && existing.repeat !== "NONE") {
      const next = new Date(existing.dueAt);
      if (existing.repeat === "DAILY") next.setDate(next.getDate() + 1);
      if (existing.repeat === "WEEKLY") next.setDate(next.getDate() + 7);
      if (existing.repeat === "MONTHLY") next.setMonth(next.getMonth() + 1);
      await prisma.followUp.create({
        data: {
          leadId: existing.leadId,
          assignedToId: existing.assignedToId,
          dueAt: next,
          repeat: existing.repeat,
          notes: existing.notes,
          createdById: req.user!.id,
        },
      });
    }
    res.json({ success: true, data: followUp });
  })
);

export default router;
