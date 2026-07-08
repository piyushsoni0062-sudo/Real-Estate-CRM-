import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { logAudit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

const LATE_AFTER_HOUR = 10; // check-in after 10:00 local time is marked LATE

function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const gps = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

// ---- GET /api/attendance/me/today ----
router.get(
  "/me/today",
  asyncHandler(async (req, res) => {
    const record = await prisma.attendance.findUnique({
      where: { userId_date: { userId: req.user!.id, date: todayUtcDate() } },
    });
    res.json({ success: true, data: record });
  })
);

// ---- POST /api/attendance/check-in ----
router.post(
  "/check-in",
  validate({ body: gps }),
  asyncHandler(async (req, res) => {
    const date = todayUtcDate();
    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId: req.user!.id, date } },
    });
    if (existing?.checkInAt) throw ApiError.badRequest("You have already checked in today");

    const now = new Date();
    const record = await prisma.attendance.upsert({
      where: { userId_date: { userId: req.user!.id, date } },
      create: {
        userId: req.user!.id,
        date,
        checkInAt: now,
        checkInLat: req.body.lat,
        checkInLng: req.body.lng,
        status: now.getHours() >= LATE_AFTER_HOUR ? "LATE" : "PRESENT",
      },
      update: {
        checkInAt: now,
        checkInLat: req.body.lat,
        checkInLng: req.body.lng,
        status: now.getHours() >= LATE_AFTER_HOUR ? "LATE" : "PRESENT",
      },
    });
    logAudit(req, "CHECK_IN", "Attendance", record.id);
    res.json({ success: true, data: record });
  })
);

// ---- POST /api/attendance/check-out ----
router.post(
  "/check-out",
  validate({ body: gps }),
  asyncHandler(async (req, res) => {
    const date = todayUtcDate();
    const record = await prisma.attendance.findUnique({
      where: { userId_date: { userId: req.user!.id, date } },
    });
    if (!record?.checkInAt) throw ApiError.badRequest("Check in before checking out");
    if (record.checkOutAt) throw ApiError.badRequest("You have already checked out today");

    const now = new Date();
    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOutAt: now,
        checkOutLat: req.body.lat,
        checkOutLng: req.body.lng,
        workMinutes: Math.round((now.getTime() - record.checkInAt.getTime()) / 60000),
      },
    });
    logAudit(req, "CHECK_OUT", "Attendance", record.id);
    res.json({ success: true, data: updated });
  })
);

// ---- GET /api/attendance — team attendance (admin/manager) ----
router.get(
  "/",
  requirePermission("attendance", "view"),
  validate({
    query: z.object({
      date: z.coerce.date().optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      userId: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { date, month, userId } = req.query as unknown as {
      date?: Date;
      month?: string;
      userId?: string;
    };

    let range: Prisma.DateTimeFilter | Date;
    if (month) {
      const [y, m] = month.split("-").map(Number);
      range = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
    } else {
      const d = date ?? new Date();
      range = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }

    const records = await prisma.attendance.findMany({
      where: { date: range instanceof Date ? range : range, ...(userId && { userId }) },
      include: {
        user: {
          select: {
            id: true, name: true, avatarUrl: true, designation: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: [{ date: "desc" }, { checkInAt: "asc" }],
    });
    res.json({ success: true, data: records });
  })
);

// ---- Leave management ----
router.get(
  "/leaves",
  asyncHandler(async (req, res) => {
    const canViewAll =
      req.user!.roleName === "Super Admin" || req.user!.permissions.has("attendance:manage");
    const leaves = await prisma.leave.findMany({
      where: canViewAll ? {} : { userId: req.user!.id },
      include: {
        user: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ success: true, data: leaves });
  })
);

router.post(
  "/leaves",
  validate({
    body: z
      .object({
        fromDate: z.coerce.date(),
        toDate: z.coerce.date(),
        type: z.enum(["CASUAL", "SICK", "EARNED", "UNPAID"]).default("CASUAL"),
        reason: z.string().max(500).optional(),
      })
      .refine((d) => d.toDate >= d.fromDate, { message: "toDate must be after fromDate" }),
  }),
  asyncHandler(async (req, res) => {
    const leave = await prisma.leave.create({
      data: { ...req.body, userId: req.user!.id },
    });
    res.status(201).json({ success: true, data: leave });
  })
);

router.patch(
  "/leaves/:id",
  requirePermission("attendance", "manage"),
  validate({ body: z.object({ status: z.enum(["APPROVED", "REJECTED"]) }) }),
  asyncHandler(async (req, res) => {
    const leave = await prisma.leave.update({
      where: { id: req.params.id },
      data: { status: req.body.status, approvedById: req.user!.id },
    });
    logAudit(req, `LEAVE_${req.body.status}`, "Leave", leave.id);
    res.json({ success: true, data: leave });
  })
);

export default router;
