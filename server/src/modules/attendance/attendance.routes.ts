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

// ---- GET /api/attendance/report?month=YYYY-MM — per-employee monthly summary ----
router.get(
  "/report",
  requirePermission("attendance", "view"),
  validate({ query: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }) }),
  asyncHandler(async (req, res) => {
    const [y, m] = (req.query.month as string).split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 1));

    // Working days = Mon–Sat (Sunday off), capped at today for the current month.
    const today = new Date();
    const capUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    let workingDays = 0;
    for (let d = new Date(from); d < to && d.getTime() <= capUtc; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() !== 0) workingDays++;
    }

    const [users, records] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true, name: true, avatarUrl: true, designation: true,
          department: { select: { name: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.attendance.findMany({
        where: { date: { gte: from, lt: to } },
        select: { userId: true, status: true, workMinutes: true },
      }),
    ]);

    const summary = users.map((u) => {
      const mine = records.filter((r) => r.userId === u.id);
      const count = (s: string) => mine.filter((r) => r.status === s).length;
      const present = count("PRESENT");
      const late = count("LATE");
      const halfDay = count("HALF_DAY");
      const leave = count("LEAVE");
      const totalMinutes = mine.reduce((sum, r) => sum + (r.workMinutes ?? 0), 0);
      const attended = present + late + halfDay;
      return {
        user: u,
        present,
        late,
        halfDay,
        leave,
        absent: Math.max(0, workingDays - attended - leave),
        totalMinutes,
        avgMinutes: attended > 0 ? Math.round(totalMinutes / attended) : 0,
      };
    });

    res.json({ success: true, data: { month: req.query.month, workingDays, summary } });
  })
);

// ---- POST /api/attendance/mark — admin marks/corrects a day for an employee ----
router.post(
  "/mark",
  requirePermission("attendance", "manage"),
  validate({
    body: z.object({
      userId: z.string().min(1),
      date: z.coerce.date(),
      status: z.enum(["PRESENT", "LATE", "HALF_DAY", "LEAVE", "ABSENT"]),
      checkInAt: z.coerce.date().optional().nullable(),
      checkOutAt: z.coerce.date().optional().nullable(),
      notes: z.string().max(300).optional().nullable(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const d = req.body.date as Date;
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const workMinutes =
      req.body.checkInAt && req.body.checkOutAt
        ? Math.max(0, Math.round((+new Date(req.body.checkOutAt) - +new Date(req.body.checkInAt)) / 60000))
        : null;

    const record = await prisma.attendance.upsert({
      where: { userId_date: { userId: req.body.userId, date } },
      create: {
        userId: req.body.userId,
        date,
        status: req.body.status,
        checkInAt: req.body.checkInAt ?? null,
        checkOutAt: req.body.checkOutAt ?? null,
        workMinutes,
        notes: req.body.notes ?? `Marked by ${req.user!.name}`,
      },
      update: {
        status: req.body.status,
        checkInAt: req.body.checkInAt ?? null,
        checkOutAt: req.body.checkOutAt ?? null,
        workMinutes,
        notes: req.body.notes ?? `Corrected by ${req.user!.name}`,
      },
    });
    logAudit(req, "MARK_ATTENDANCE", "Attendance", record.id, undefined, req.body);
    res.json({ success: true, data: record });
  })
);

// ---- PATCH /api/attendance/:id — admin edits an existing punch ----
router.patch(
  "/:id",
  requirePermission("attendance", "manage"),
  validate({
    body: z.object({
      status: z.enum(["PRESENT", "LATE", "HALF_DAY", "LEAVE", "ABSENT"]).optional(),
      checkInAt: z.coerce.date().optional().nullable(),
      checkOutAt: z.coerce.date().optional().nullable(),
      notes: z.string().max(300).optional().nullable(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const before = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!before) throw ApiError.notFound("Attendance record not found");

    const checkInAt =
      req.body.checkInAt === undefined ? before.checkInAt : req.body.checkInAt;
    const checkOutAt =
      req.body.checkOutAt === undefined ? before.checkOutAt : req.body.checkOutAt;
    const workMinutes =
      checkInAt && checkOutAt
        ? Math.max(0, Math.round((+new Date(checkOutAt) - +new Date(checkInAt)) / 60000))
        : null;

    const record = await prisma.attendance.update({
      where: { id: before.id },
      data: {
        ...(req.body.status && { status: req.body.status }),
        checkInAt,
        checkOutAt,
        workMinutes,
        ...(req.body.notes !== undefined && { notes: req.body.notes }),
      },
    });
    logAudit(req, "UPDATE", "Attendance", record.id, before, req.body);
    res.json({ success: true, data: record });
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
