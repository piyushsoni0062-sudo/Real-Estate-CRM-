import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/error";

const router = Router();
router.use(requireAuth);

// ---- GET /api/notifications — current user's notifications + due follow-up reminders ----
router.get(
  "/",
  validate({ query: z.object({ unreadOnly: z.coerce.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const unreadOnly = (req.query as { unreadOnly?: boolean }).unreadOnly;
    const [notifications, unreadCount, dueFollowUps, overdueTasks] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id, ...(unreadOnly && { readAt: null }) },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
      prisma.followUp.findMany({
        where: {
          assignedToId: req.user!.id,
          status: "PENDING",
          dueAt: { lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        },
        include: { lead: { select: { id: true, name: true, mobile: true } } },
        orderBy: { dueAt: "asc" },
        take: 20,
      }),
      prisma.task.count({
        where: {
          assignedToId: req.user!.id,
          deletedAt: null,
          status: { in: ["TODO", "IN_PROGRESS"] },
          dueAt: { lt: new Date() },
        },
      }),
    ]);
    res.json({
      success: true,
      data: { notifications, unreadCount, dueFollowUps, overdueTasks },
    });
  })
);

// ---- POST /api/notifications/read — mark some/all read ----
router.post(
  "/read",
  validate({ body: z.object({ ids: z.array(z.string()).optional() }) }),
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: {
        userId: req.user!.id,
        readAt: null,
        ...(req.body.ids?.length && { id: { in: req.body.ids } }),
      },
      data: { readAt: new Date() },
    });
    res.json({ success: true, message: "Marked as read" });
  })
);

// ---- DELETE /api/notifications/:id ----
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: req.user!.id },
    });
    res.json({ success: true, message: "Notification removed" });
  })
);

export default router;
