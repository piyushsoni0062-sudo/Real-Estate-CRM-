import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { hashPassword } from "../../lib/password";
import { buildOrderBy, paginated, paginationQuery, toSkipTake } from "../../utils/pagination";
import { logAudit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

const mobileSchema = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");

const userBody = z.object({
  name: z.string().min(2).max(120),
  mobile: mobileSchema,
  email: z.string().email().optional().nullable(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  roleId: z.string().min(1, "Role is required"),
  departmentId: z.string().optional().nullable(),
  designation: z.string().max(100).optional().nullable(),
  salesTarget: z.coerce.number().nonnegative().optional().nullable(),
  isActive: z.boolean().default(true),
});

const select = {
  id: true, name: true, mobile: true, email: true, designation: true, avatarUrl: true,
  salesTarget: true, isActive: true, lastLoginAt: true, createdAt: true,
  role: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

// ---- GET /api/users — list (also powers Team page assignee pickers) ----
router.get(
  "/",
  requirePermission("users", "view"),
  validate({ query: paginationQuery.extend({ roleId: z.string().optional(), active: z.coerce.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof paginationQuery> & { roleId?: string; active?: boolean };
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q.roleId && { roleId: q.roleId }),
      ...(q.active !== undefined && { isActive: q.active }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: "insensitive" } },
          { mobile: { contains: q.search } },
          { email: { contains: q.search, mode: "insensitive" } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where, select,
        orderBy: buildOrderBy(q, ["name", "createdAt", "lastLoginAt"], "name"),
        ...toSkipTake(q),
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ success: true, data: paginated(items, total, q) });
  })
);

// ---- GET /api/users/:id — profile with performance stats ----
router.get(
  "/:id",
  requirePermission("users", "view"),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select,
    });
    if (!user) throw ApiError.notFound("User not found");

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [leadCount, siteVisits, bookings, revenue, pendingTasks] = await Promise.all([
      prisma.lead.count({ where: { assignedToId: user.id, deletedAt: null } }),
      prisma.siteVisit.count({ where: { assignedToId: user.id, status: "COMPLETED" } }),
      prisma.booking.count({
        where: { createdById: user.id, status: { in: ["CONFIRMED", "COMPLETED"] } },
      }),
      prisma.booking.aggregate({
        _sum: { amount: true },
        where: {
          createdById: user.id,
          status: { in: ["CONFIRMED", "COMPLETED"] },
          bookingDate: { gte: startOfMonth },
        },
      }),
      prisma.task.count({
        where: { assignedToId: user.id, status: { in: ["TODO", "IN_PROGRESS"] }, deletedAt: null },
      }),
    ]);

    res.json({
      success: true,
      data: {
        ...user,
        stats: {
          leads: leadCount,
          siteVisits,
          bookings,
          monthRevenue: revenue._sum.amount?.toString() ?? "0",
          pendingTasks,
        },
      },
    });
  })
);

// ---- POST /api/users ----
router.post(
  "/",
  requirePermission("users", "create"),
  validate({ body: userBody }),
  asyncHandler(async (req, res) => {
    const { password, ...rest } = req.body as z.infer<typeof userBody>;
    const user = await prisma.user.create({
      data: { ...rest, passwordHash: await hashPassword(password) },
      select,
    });
    logAudit(req, "CREATE", "User", user.id, undefined, rest);
    res.status(201).json({ success: true, data: user });
  })
);

// ---- PATCH /api/users/:id ----
router.patch(
  "/:id",
  requirePermission("users", "update"),
  validate({ body: userBody.partial() }),
  asyncHandler(async (req, res) => {
    const before = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw ApiError.notFound("User not found");
    const { password, ...rest } = req.body as Partial<z.infer<typeof userBody>>;
    const user = await prisma.user.update({
      where: { id: before.id },
      data: { ...rest, ...(password && { passwordHash: await hashPassword(password) }) },
      select,
    });
    logAudit(req, "UPDATE", "User", user.id, { name: before.name, roleId: before.roleId }, rest);
    res.json({ success: true, data: user });
  })
);

// ---- PATCH /api/users/me/profile — self-service profile update ----
router.patch(
  "/me/profile",
  validate({
    body: z.object({
      name: z.string().min(2).max(120).optional(),
      email: z.string().email().optional().nullable(),
      avatarUrl: z.string().url().optional().nullable(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: req.body,
      select,
    });
    res.json({ success: true, data: user });
  })
);

// ---- DELETE /api/users/:id — soft delete ----
router.delete(
  "/:id",
  requirePermission("users", "delete"),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.id) throw ApiError.badRequest("You cannot delete your own account");
    const user = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!user) throw ApiError.notFound("User not found");
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date(), isActive: false },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    logAudit(req, "DELETE", "User", user.id);
    res.json({ success: true, message: "User removed" });
  })
);

export default router;
