import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hasPermission, requireAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/error";

const router = Router();
router.use(requireAuth);

// ---- GET /api/search?q= — global search across leads, customers, properties, users ----
router.get(
  "/",
  validate({ query: z.object({ q: z.string().min(2).max(100) }) }),
  asyncHandler(async (req, res) => {
    const q = (req.query as { q: string }).q;
    const user = req.user!;
    const contains = { contains: q, mode: "insensitive" as const };

    const [leads, customers, properties, users] = await Promise.all([
      hasPermission(user, "leads", "view")
        ? prisma.lead.findMany({
            where: {
              deletedAt: null,
              OR: [{ name: contains }, { mobile: { contains: q } }, { email: contains }],
            },
            select: { id: true, name: true, mobile: true, status: { select: { name: true, color: true } } },
            take: 5,
          })
        : [],
      hasPermission(user, "customers", "view")
        ? prisma.customer.findMany({
            where: {
              deletedAt: null,
              OR: [{ name: contains }, { mobile: { contains: q } }, { email: contains }],
            },
            select: { id: true, name: true, mobile: true },
            take: 5,
          })
        : [],
      hasPermission(user, "properties", "view")
        ? prisma.property.findMany({
            where: {
              deletedAt: null,
              OR: [{ title: contains }, { code: contains }, { city: contains }],
            },
            select: { id: true, title: true, code: true, status: true },
            take: 5,
          })
        : [],
      hasPermission(user, "users", "view")
        ? prisma.user.findMany({
            where: {
              deletedAt: null,
              OR: [{ name: contains }, { mobile: { contains: q } }],
            },
            select: { id: true, name: true, designation: true, role: { select: { name: true } } },
            take: 5,
          })
        : [],
    ]);

    res.json({ success: true, data: { leads, customers, properties, users } });
  })
);

export default router;
