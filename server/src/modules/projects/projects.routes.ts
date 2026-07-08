import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { paginated, paginationQuery, toSkipTake, buildOrderBy } from "../../utils/pagination";
import { logAudit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

const projectBody = z.object({
  name: z.string().min(2).max(150),
  location: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  status: z.enum(["UPCOMING", "ACTIVE", "COMPLETED"]).default("ACTIVE"),
  amenities: z.array(z.string().max(60)).max(50).default([]),
  nearby: z.array(z.object({ name: z.string(), distance: z.string() })).optional().nullable(),
  priceMin: z.coerce.number().nonnegative().optional().nullable(),
  priceMax: z.coerce.number().nonnegative().optional().nullable(),
});

// ---- GET /api/projects ----
router.get(
  "/",
  requirePermission("properties", "view"),
  validate({ query: paginationQuery.extend({ status: z.enum(["UPCOMING", "ACTIVE", "COMPLETED"]).optional() }) }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof paginationQuery> & { status?: "UPCOMING" | "ACTIVE" | "COMPLETED" };
    const where: Prisma.ProjectWhereInput = {
      deletedAt: null,
      ...(q.status && { status: q.status }),
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: "insensitive" } },
          { city: { contains: q.search, mode: "insensitive" } },
          { location: { contains: q.search, mode: "insensitive" } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          files: { orderBy: { createdAt: "asc" } },
          _count: { select: { properties: { where: { deletedAt: null } }, leads: true } },
        },
        orderBy: buildOrderBy(q, ["name", "createdAt"], "name"),
        ...toSkipTake(q),
      }),
      prisma.project.count({ where }),
    ]);
    res.json({ success: true, data: paginated(items, total, q) });
  })
);

// ---- GET /api/projects/:id — with inventory summary ----
router.get(
  "/:id",
  requirePermission("properties", "view"),
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        files: true,
        properties: { where: { deletedAt: null }, include: { images: { take: 1 } } },
      },
    });
    if (!project) throw ApiError.notFound("Project not found");

    const inventory = await prisma.property.groupBy({
      by: ["status"],
      where: { projectId: project.id, deletedAt: null },
      _count: true,
    });
    res.json({
      success: true,
      data: {
        ...project,
        inventory: Object.fromEntries(inventory.map((i) => [i.status, i._count])),
      },
    });
  })
);

// ---- POST /api/projects ----
router.post(
  "/",
  requirePermission("properties", "create"),
  validate({ body: projectBody }),
  asyncHandler(async (req, res) => {
    const project = await prisma.project.create({
      data: {
        ...req.body,
        nearby: req.body.nearby ?? undefined,
        createdById: req.user!.id,
      },
    });
    logAudit(req, "CREATE", "Project", project.id, undefined, req.body);
    res.status(201).json({ success: true, data: project });
  })
);

// ---- PATCH /api/projects/:id ----
router.patch(
  "/:id",
  requirePermission("properties", "update"),
  validate({ body: projectBody.partial() }),
  asyncHandler(async (req, res) => {
    const before = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw ApiError.notFound("Project not found");
    const project = await prisma.project.update({
      where: { id: before.id },
      data: { ...req.body, nearby: req.body.nearby ?? undefined, updatedById: req.user!.id },
    });
    logAudit(req, "UPDATE", "Project", project.id, undefined, req.body);
    res.json({ success: true, data: project });
  })
);

// ---- DELETE /api/projects/:id — soft delete ----
router.delete(
  "/:id",
  requirePermission("properties", "delete"),
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!project) throw ApiError.notFound("Project not found");
    const activeUnits = await prisma.property.count({
      where: { projectId: project.id, deletedAt: null },
    });
    if (activeUnits > 0) {
      throw ApiError.conflict(`This project still has ${activeUnits} active units. Remove them first.`);
    }
    await prisma.project.update({
      where: { id: project.id },
      data: { deletedAt: new Date(), updatedById: req.user!.id },
    });
    logAudit(req, "DELETE", "Project", project.id);
    res.json({ success: true, message: "Project deleted" });
  })
);

export default router;
