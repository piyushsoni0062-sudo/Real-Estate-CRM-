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

const bookingBody = z.object({
  leadId: z.string().min(1),
  propertyId: z.string().min(1),
  amount: z.coerce.number().positive(),
  tokenAmount: z.coerce.number().nonnegative().optional().nullable(),
  paymentPlan: z.string().max(200).optional().nullable(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]).default("PENDING"),
  bookingDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const include = {
  lead: { select: { id: true, name: true, mobile: true } },
  customer: { select: { id: true, name: true } },
  property: { select: { id: true, title: true, code: true, price: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.BookingInclude;

// ---- GET /api/bookings ----
router.get(
  "/",
  requirePermission("bookings", "view"),
  validate({
    query: paginationQuery.extend({
      status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof paginationQuery> & {
      status?: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
      from?: Date;
      to?: Date;
    };
    const where: Prisma.BookingWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.from || q.to
        ? { bookingDate: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } }
        : {}),
      ...(q.search && {
        OR: [
          { lead: { name: { contains: q.search, mode: "insensitive" as const } } },
          { lead: { mobile: { contains: q.search } } },
          { property: { title: { contains: q.search, mode: "insensitive" as const } } },
          { property: { code: { contains: q.search, mode: "insensitive" as const } } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      prisma.booking.findMany({
        where, include,
        orderBy: buildOrderBy(q, ["bookingDate", "amount", "createdAt"], "bookingDate"),
        ...toSkipTake(q),
      }),
      prisma.booking.count({ where }),
    ]);
    res.json({ success: true, data: paginated(items, total, q) });
  })
);

// ---- POST /api/bookings — books a unit, converts lead to customer ----
router.post(
  "/",
  requirePermission("bookings", "create"),
  validate({ body: bookingBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof bookingBody>;
    const [lead, property] = await Promise.all([
      prisma.lead.findFirst({ where: { id: body.leadId, deletedAt: null } }),
      prisma.property.findFirst({ where: { id: body.propertyId, deletedAt: null } }),
    ]);
    if (!lead) throw ApiError.notFound("Lead not found");
    if (!property) throw ApiError.notFound("Property not found");
    if (property.status === "SOLD" || property.status === "BOOKED") {
      throw ApiError.conflict(`Unit ${property.code} is already ${property.status.toLowerCase()}`);
    }

    const booking = await prisma.$transaction(async (tx) => {
      // Convert lead into a customer record (idempotent per lead).
      let customer = await tx.customer.findUnique({ where: { leadId: lead.id } });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            leadId: lead.id,
            name: lead.name,
            mobile: lead.mobile,
            email: lead.email,
            city: lead.city,
            address: lead.address,
            createdById: req.user!.id,
          },
        });
      }
      await tx.property.update({ where: { id: property.id }, data: { status: "BOOKED" } });
      return tx.booking.create({
        data: { ...body, customerId: customer.id, createdById: req.user!.id },
        include,
      });
    });

    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: req.user!.id,
        type: "BOOKING",
        title: `Booked ${property.title} (${property.code}) for ₹${body.amount.toLocaleString("en-IN")}`,
      },
    });
    logAudit(req, "CREATE", "Booking", booking.id, undefined, body);
    res.status(201).json({ success: true, data: booking });
  })
);

// ---- PATCH /api/bookings/:id ----
router.patch(
  "/:id",
  requirePermission("bookings", "update"),
  validate({ body: bookingBody.partial().omit({ leadId: true, propertyId: true }) }),
  asyncHandler(async (req, res) => {
    const before = await prisma.booking.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound("Booking not found");

    const booking = await prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: before.id },
        data: req.body,
        include,
      });
      // Keep unit availability in sync with the booking lifecycle.
      if (req.body.status && req.body.status !== before.status) {
        if (req.body.status === "CANCELLED") {
          await tx.property.update({
            where: { id: before.propertyId },
            data: { status: "AVAILABLE" },
          });
        } else if (req.body.status === "COMPLETED") {
          await tx.property.update({ where: { id: before.propertyId }, data: { status: "SOLD" } });
        }
      }
      return updated;
    });
    logAudit(req, "UPDATE", "Booking", booking.id, { status: before.status }, req.body);
    res.json({ success: true, data: booking });
  })
);

export default router;
