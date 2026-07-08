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

const customerBody = z.object({
  name: z.string().min(2).max(120),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  email: z.string().email().optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  leadId: z.string().optional().nullable(),
});

const include = {
  lead: { select: { id: true, name: true, status: { select: { name: true } } } },
  bookings: {
    include: { property: { select: { id: true, title: true, code: true } } },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.CustomerInclude;

// ---- GET /api/customers ----
router.get(
  "/",
  requirePermission("customers", "view"),
  validate({ query: paginationQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof paginationQuery>;
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: "insensitive" } },
          { mobile: { contains: q.search } },
          { email: { contains: q.search, mode: "insensitive" } },
          { city: { contains: q.search, mode: "insensitive" } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where, include,
        orderBy: buildOrderBy(q, ["name", "createdAt"], "createdAt"),
        ...toSkipTake(q),
      }),
      prisma.customer.count({ where }),
    ]);
    res.json({ success: true, data: paginated(items, total, q) });
  })
);

// ---- GET /api/customers/:id ----
router.get(
  "/:id",
  requirePermission("customers", "view"),
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { ...include, files: true },
    });
    if (!customer) throw ApiError.notFound("Customer not found");
    res.json({ success: true, data: customer });
  })
);

// ---- POST /api/customers ----
router.post(
  "/",
  requirePermission("customers", "create"),
  validate({ body: customerBody }),
  asyncHandler(async (req, res) => {
    const dup = await prisma.customer.findFirst({
      where: { mobile: req.body.mobile, deletedAt: null },
    });
    if (dup) throw ApiError.conflict(`A customer with this mobile already exists (${dup.name})`);
    const customer = await prisma.customer.create({
      data: { ...req.body, createdById: req.user!.id },
      include,
    });
    logAudit(req, "CREATE", "Customer", customer.id, undefined, req.body);
    res.status(201).json({ success: true, data: customer });
  })
);

// ---- PATCH /api/customers/:id ----
router.patch(
  "/:id",
  requirePermission("customers", "update"),
  validate({ body: customerBody.partial() }),
  asyncHandler(async (req, res) => {
    const before = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!before) throw ApiError.notFound("Customer not found");
    const customer = await prisma.customer.update({
      where: { id: before.id },
      data: { ...req.body, updatedById: req.user!.id },
      include,
    });
    logAudit(req, "UPDATE", "Customer", customer.id, undefined, req.body);
    res.json({ success: true, data: customer });
  })
);

// ---- DELETE /api/customers/:id — soft delete ----
router.delete(
  "/:id",
  requirePermission("customers", "delete"),
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!customer) throw ApiError.notFound("Customer not found");
    await prisma.customer.update({
      where: { id: customer.id },
      data: { deletedAt: new Date(), updatedById: req.user!.id },
    });
    logAudit(req, "DELETE", "Customer", customer.id);
    res.json({ success: true, message: "Customer deleted" });
  })
);

export default router;
