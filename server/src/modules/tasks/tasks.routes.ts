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

const taskBody = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional().nullable(),
  leadId: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).default("TODO"),
  dueAt: z.coerce.date().optional().nullable(),
  repeat: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).default("NONE"),
  checklist: z
    .array(z.object({ text: z.string().max(300), done: z.boolean().default(false) }))
    .max(50)
    .optional()
    .nullable(),
});

const include = {
  assignedTo: { select: { id: true, name: true, avatarUrl: true } },
  createdBy: { select: { id: true, name: true } },
  lead: { select: { id: true, name: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { user: { select: { id: true, name: true } } },
  },
  attachments: true,
} satisfies Prisma.TaskInclude;

// ---- GET /api/tasks ----
router.get(
  "/",
  requirePermission("tasks", "view"),
  validate({
    query: paginationQuery.extend({
      status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
      priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
      assignedToId: z.string().optional(),
      mine: z.coerce.boolean().optional(),
      overdue: z.coerce.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof paginationQuery> & {
      status?: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
      priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      assignedToId?: string;
      mine?: boolean;
      overdue?: boolean;
    };
    const where: Prisma.TaskWhereInput = {
      deletedAt: null,
      ...(q.status && { status: q.status }),
      ...(q.priority && { priority: q.priority }),
      ...(q.assignedToId && { assignedToId: q.assignedToId }),
      ...(q.mine && { OR: [{ assignedToId: req.user!.id }, { createdById: req.user!.id }] }),
      ...(q.overdue && {
        dueAt: { lt: new Date() },
        status: { in: ["TODO", "IN_PROGRESS"] },
      }),
      ...(q.search && { title: { contains: q.search, mode: "insensitive" } }),
    };
    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where, include,
        orderBy: buildOrderBy(q, ["dueAt", "priority", "createdAt", "title"], "createdAt"),
        ...toSkipTake(q),
      }),
      prisma.task.count({ where }),
    ]);
    res.json({ success: true, data: paginated(items, total, q) });
  })
);

// ---- POST /api/tasks ----
router.post(
  "/",
  requirePermission("tasks", "create"),
  validate({ body: taskBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof taskBody>;
    const task = await prisma.task.create({
      data: {
        ...body,
        checklist: body.checklist ?? undefined,
        createdById: req.user!.id,
      },
      include,
    });
    if (task.assignedToId && task.assignedToId !== req.user!.id) {
      notify(task.assignedToId, {
        title: "New task assigned",
        body: task.title,
        type: "TASK",
        link: "/tasks",
      });
    }
    logAudit(req, "CREATE", "Task", task.id, undefined, body);
    res.status(201).json({ success: true, data: task });
  })
);

// ---- PATCH /api/tasks/:id ----
router.patch(
  "/:id",
  requirePermission("tasks", "update"),
  validate({ body: taskBody.partial() }),
  asyncHandler(async (req, res) => {
    const before = await prisma.task.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw ApiError.notFound("Task not found");
    const body = req.body as Partial<z.infer<typeof taskBody>>;

    const completing = body.status === "DONE" && before.status !== "DONE";
    const task = await prisma.task.update({
      where: { id: before.id },
      data: {
        ...body,
        checklist:
          body.checklist === undefined
            ? undefined
            : body.checklist === null
              ? Prisma.DbNull
              : body.checklist,
        ...(completing && { completedAt: new Date() }),
      },
      include,
    });

    // Recurring tasks spawn the next occurrence on completion.
    if (completing && before.repeat !== "NONE" && before.dueAt) {
      const next = new Date(before.dueAt);
      if (before.repeat === "DAILY") next.setDate(next.getDate() + 1);
      if (before.repeat === "WEEKLY") next.setDate(next.getDate() + 7);
      if (before.repeat === "MONTHLY") next.setMonth(next.getMonth() + 1);
      await prisma.task.create({
        data: {
          title: before.title,
          description: before.description,
          leadId: before.leadId,
          assignedToId: before.assignedToId,
          priority: before.priority,
          dueAt: next,
          repeat: before.repeat,
          checklist: before.checklist ?? undefined,
          createdById: before.createdById,
        },
      });
    }
    logAudit(req, "UPDATE", "Task", task.id, { status: before.status }, body);
    res.json({ success: true, data: task });
  })
);

// ---- POST /api/tasks/:id/comments ----
router.post(
  "/:id/comments",
  requirePermission("tasks", "update"),
  validate({ body: z.object({ body: z.string().min(1).max(2000) }) }),
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!task) throw ApiError.notFound("Task not found");
    const comment = await prisma.taskComment.create({
      data: { taskId: task.id, userId: req.user!.id, body: req.body.body },
      include: { user: { select: { id: true, name: true } } },
    });
    res.status(201).json({ success: true, data: comment });
  })
);

// ---- DELETE /api/tasks/:id — soft delete ----
router.delete(
  "/:id",
  requirePermission("tasks", "delete"),
  asyncHandler(async (req, res) => {
    const task = await prisma.task.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!task) throw ApiError.notFound("Task not found");
    await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
    logAudit(req, "DELETE", "Task", task.id);
    res.json({ success: true, message: "Task deleted" });
  })
);

export default router;
