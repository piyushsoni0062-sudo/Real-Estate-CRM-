import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { buildOrderBy, paginated, paginationQuery, toSkipTake } from "../../utils/pagination";
import { logAudit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

const propertyBody = z.object({
  title: z.string().min(2).max(200),
  code: z.string().min(1).max(40),
  projectId: z.string().optional().nullable(),
  type: z.enum(["PLOT", "VILLA", "APARTMENT", "COMMERCIAL", "FARMHOUSE"]),
  status: z.enum(["AVAILABLE", "HOLD", "BOOKED", "SOLD"]).default("AVAILABLE"),
  facing: z.string().max(40).optional().nullable(),
  areaSqft: z.coerce.number().positive().optional().nullable(),
  price: z.coerce.number().positive("Price must be greater than 0"),
  location: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  amenities: z.array(z.string().max(60)).max(50).default([]),
});

const listQuery = paginationQuery.extend({
  type: z.enum(["PLOT", "VILLA", "APARTMENT", "COMMERCIAL", "FARMHOUSE"]).optional(),
  status: z.enum(["AVAILABLE", "HOLD", "BOOKED", "SOLD"]).optional(),
  projectId: z.string().optional(),
  priceMin: z.coerce.number().optional(),
  priceMax: z.coerce.number().optional(),
});

const include = {
  project: { select: { id: true, name: true } },
  images: { orderBy: { createdAt: "asc" as const } },
  _count: { select: { bookings: true, siteVisits: true } },
} satisfies Prisma.PropertyInclude;

// ---- GET /api/properties ----
router.get(
  "/",
  requirePermission("properties", "view"),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
      ...(q.type && { type: q.type }),
      ...(q.status && { status: q.status }),
      ...(q.projectId && { projectId: q.projectId }),
      ...(q.priceMin || q.priceMax
        ? { price: { ...(q.priceMin && { gte: q.priceMin }), ...(q.priceMax && { lte: q.priceMax }) } }
        : {}),
      ...(q.search && {
        OR: [
          { title: { contains: q.search, mode: "insensitive" as const } },
          { code: { contains: q.search, mode: "insensitive" as const } },
          { city: { contains: q.search, mode: "insensitive" as const } },
          { location: { contains: q.search, mode: "insensitive" as const } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.property.findMany({
        where, include,
        orderBy: buildOrderBy(q, ["createdAt", "price", "title", "areaSqft"]),
        ...toSkipTake(q),
      }),
      prisma.property.count({ where }),
    ]);
    res.json({ success: true, data: paginated(items, total, q) });
  })
);

// ---- GET /api/properties/:id ----
router.get(
  "/:id",
  requirePermission("properties", "view"),
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        ...include,
        priceHistory: { orderBy: { createdAt: "desc" }, take: 20 },
        bookings: {
          include: { lead: { select: { id: true, name: true, mobile: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!property) throw ApiError.notFound("Property not found");
    res.json({ success: true, data: property });
  })
);

// ---- POST /api/properties ----
router.post(
  "/",
  requirePermission("properties", "create"),
  validate({ body: propertyBody }),
  asyncHandler(async (req, res) => {
    const dup = await prisma.property.findFirst({
      where: { code: req.body.code, deletedAt: null },
    });
    if (dup) throw ApiError.conflict(`Unit code "${req.body.code}" already exists (${dup.title})`);

    const property = await prisma.property.create({
      data: {
        ...req.body,
        createdById: req.user!.id,
        priceHistory: { create: { price: req.body.price, changedById: req.user!.id } },
      },
      include,
    });
    logAudit(req, "CREATE", "Property", property.id, undefined, req.body);
    res.status(201).json({ success: true, data: property });
  })
);

// ---- PATCH /api/properties/:id ----
router.patch(
  "/:id",
  requirePermission("properties", "update"),
  validate({ body: propertyBody.partial() }),
  asyncHandler(async (req, res) => {
    const before = await prisma.property.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw ApiError.notFound("Property not found");

    const priceChanged =
      req.body.price !== undefined && Number(before.price) !== Number(req.body.price);

    const property = await prisma.property.update({
      where: { id: before.id },
      data: {
        ...req.body,
        updatedById: req.user!.id,
        ...(priceChanged && {
          priceHistory: { create: { price: req.body.price!, changedById: req.user!.id } },
        }),
      },
      include,
    });
    logAudit(req, "UPDATE", "Property", property.id, { price: before.price, status: before.status }, req.body);
    res.json({ success: true, data: property });
  })
);

// ---- DELETE /api/properties/:id — soft delete ----
router.delete(
  "/:id",
  requirePermission("properties", "delete"),
  asyncHandler(async (req, res) => {
    const property = await prisma.property.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!property) throw ApiError.notFound("Property not found");
    await prisma.property.update({
      where: { id: property.id },
      data: { deletedAt: new Date(), updatedById: req.user!.id },
    });
    logAudit(req, "DELETE", "Property", property.id);
    res.json({ success: true, message: "Property deleted" });
  })
);

export default router;
