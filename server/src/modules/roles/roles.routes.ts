import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { logAudit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

// ---- GET /api/roles — roles with their permissions ----
router.get(
  "/",
  requirePermission("roles", "view"),
  asyncHandler(async (_req, res) => {
    const [roles, permissions] = await Promise.all([
      prisma.role.findMany({
        include: {
          permissions: { include: { permission: true } },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.permission.findMany({ orderBy: [{ resource: "asc" }, { action: "asc" }] }),
    ]);
    res.json({
      success: true,
      data: {
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          userCount: r._count.users,
          permissions: r.permissions.map((p) => `${p.permission.resource}:${p.permission.action}`),
        })),
        allPermissions: permissions.map((p) => ({
          id: p.id,
          resource: p.resource,
          action: p.action,
        })),
      },
    });
  })
);

// ---- POST /api/roles ----
router.post(
  "/",
  requirePermission("roles", "create"),
  validate({
    body: z.object({
      name: z.string().min(2).max(60),
      description: z.string().max(300).optional(),
      permissionIds: z.array(z.string()).default([]),
    }),
  }),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.create({
      data: {
        name: req.body.name,
        description: req.body.description,
        permissions: {
          create: req.body.permissionIds.map((permissionId: string) => ({ permissionId })),
        },
      },
    });
    logAudit(req, "CREATE", "Role", role.id, undefined, req.body);
    res.status(201).json({ success: true, data: role });
  })
);

// ---- PATCH /api/roles/:id — update name/description and replace permissions ----
router.patch(
  "/:id",
  requirePermission("roles", "update"),
  validate({
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      description: z.string().max(300).optional().nullable(),
      permissionIds: z.array(z.string()).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) throw ApiError.notFound("Role not found");
    if (role.isSystem && req.body.name && req.body.name !== role.name) {
      throw ApiError.badRequest("System roles cannot be renamed");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (req.body.permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        await tx.rolePermission.createMany({
          data: req.body.permissionIds.map((permissionId: string) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }
      return tx.role.update({
        where: { id: role.id },
        data: { name: req.body.name, description: req.body.description ?? undefined },
      });
    });
    logAudit(req, "UPDATE", "Role", role.id, undefined, req.body);
    res.json({ success: true, data: updated });
  })
);

// ---- DELETE /api/roles/:id ----
router.delete(
  "/:id",
  requirePermission("roles", "delete"),
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw ApiError.notFound("Role not found");
    if (role.isSystem) throw ApiError.badRequest("System roles cannot be deleted");
    if (role._count.users > 0) {
      throw ApiError.conflict("Reassign users on this role before deleting it");
    }
    await prisma.role.delete({ where: { id: role.id } });
    logAudit(req, "DELETE", "Role", role.id);
    res.json({ success: true, message: "Role deleted" });
  })
);

export default router;
