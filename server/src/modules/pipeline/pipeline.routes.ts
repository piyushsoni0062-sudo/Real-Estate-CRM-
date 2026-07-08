import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { logAudit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

// ---- GET /api/pipeline — stages with their leads (kanban board) ----
router.get(
  "/",
  requirePermission("leads", "view"),
  asyncHandler(async (_req, res) => {
    const stages = await prisma.pipelineStage.findMany({
      orderBy: { order: "asc" },
      include: {
        leads: {
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: {
            id: true, name: true, mobile: true, budget: true, updatedAt: true,
            assignedTo: { select: { id: true, name: true, avatarUrl: true } },
            source: { select: { name: true, color: true } },
            project: { select: { name: true } },
          },
        },
      },
    });
    res.json({ success: true, data: stages });
  })
);

// ---- POST /api/pipeline/move — drag & drop a lead to another stage ----
router.post(
  "/move",
  requirePermission("leads", "update"),
  validate({
    body: z.object({
      leadId: z.string().min(1),
      stageId: z.string().min(1),
      lostReason: z.string().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const [lead, stage] = await Promise.all([
      prisma.lead.findFirst({
        where: { id: req.body.leadId, deletedAt: null },
        include: { stage: true },
      }),
      prisma.pipelineStage.findUnique({ where: { id: req.body.stageId } }),
    ]);
    if (!lead) throw ApiError.notFound("Lead not found");
    if (!stage) throw ApiError.notFound("Stage not found");

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        stageId: stage.id,
        updatedById: req.user!.id,
        ...(stage.isLost && req.body.lostReason && { lostReason: req.body.lostReason }),
      },
    });
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user!.id,
        type: "STAGE_CHANGE",
        title: `Moved ${lead.stage?.name ?? "Unstaged"} → ${stage.name}`,
        description: req.body.lostReason,
      },
    });
    logAudit(req, "STAGE_MOVE", "Lead", lead.id, { stageId: lead.stageId }, { stageId: stage.id });
    res.json({ success: true, data: updated });
  })
);

// ---- Stage management (custom pipelines) ----
router.post(
  "/stages",
  requirePermission("settings", "update"),
  validate({
    body: z.object({
      name: z.string().min(2).max(60),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#3B82F6"),
      order: z.number().int().min(0).default(0),
      isWon: z.boolean().default(false),
      isLost: z.boolean().default(false),
    }),
  }),
  asyncHandler(async (req, res) => {
    const stage = await prisma.pipelineStage.create({ data: req.body });
    res.status(201).json({ success: true, data: stage });
  })
);

router.patch(
  "/stages/:id",
  requirePermission("settings", "update"),
  validate({
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      order: z.number().int().min(0).optional(),
      isWon: z.boolean().optional(),
      isLost: z.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const stage = await prisma.pipelineStage.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: stage });
  })
);

router.delete(
  "/stages/:id",
  requirePermission("settings", "update"),
  asyncHandler(async (req, res) => {
    const leadCount = await prisma.lead.count({
      where: { stageId: req.params.id, deletedAt: null },
    });
    if (leadCount > 0) {
      throw ApiError.conflict(`Move the ${leadCount} leads in this stage before deleting it`);
    }
    await prisma.pipelineStage.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Stage deleted" });
  })
);

export default router;
