import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { logAudit } from "../../utils/audit";
import { sendMail } from "../../lib/mailer";
import { sendWhatsAppText } from "../../lib/whatsapp";

const router = Router();
router.use(requireAuth);

// ---- Company name for the sidebar — available to every logged-in user ----
router.get(
  "/branding",
  asyncHandler(async (_req, res) => {
    const setting = await prisma.setting.findUnique({ where: { key: "company" } });
    const value = (setting?.value as { name?: string } | null) ?? null;
    res.json({ success: true, data: { companyName: value?.name?.trim() ?? "" } });
  })
);

// ---- Company / theme key-value settings ----
router.get(
  "/",
  requirePermission("settings", "view"),
  asyncHandler(async (_req, res) => {
    const settings = await prisma.setting.findMany();
    res.json({
      success: true,
      data: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    });
  })
);

router.put(
  "/:key",
  requirePermission("settings", "update"),
  validate({ body: z.object({ value: z.unknown() }) }),
  asyncHandler(async (req, res) => {
    const value = JSON.parse(JSON.stringify(req.body.value ?? null));
    const setting = await prisma.setting.upsert({
      where: { key: req.params.key },
      create: { key: req.params.key, value, updatedById: req.user!.id },
      update: { value, updatedById: req.user!.id },
    });
    logAudit(req, "UPDATE", "Setting", setting.key);
    res.json({ success: true, data: setting });
  })
);

// ---- Lead status options ----
router.get(
  "/lead-statuses",
  asyncHandler(async (_req, res) => {
    const items = await prisma.leadStatusOption.findMany({ orderBy: { order: "asc" } });
    res.json({ success: true, data: items });
  })
);

router.post(
  "/lead-statuses",
  requirePermission("settings", "update"),
  validate({
    body: z.object({
      name: z.string().min(2).max(60),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#64748B"),
      order: z.number().int().min(0).default(99),
    }),
  }),
  asyncHandler(async (req, res) => {
    const item = await prisma.leadStatusOption.create({ data: req.body });
    res.status(201).json({ success: true, data: item });
  })
);

router.patch(
  "/lead-statuses/:id",
  requirePermission("settings", "update"),
  validate({
    body: z.object({
      name: z.string().min(2).max(60).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      order: z.number().int().min(0).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const item = await prisma.leadStatusOption.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: item });
  })
);

router.delete(
  "/lead-statuses/:id",
  requirePermission("settings", "update"),
  asyncHandler(async (req, res) => {
    const item = await prisma.leadStatusOption.findUnique({ where: { id: req.params.id } });
    if (!item) throw ApiError.notFound("Status not found");
    if (item.isSystem) throw ApiError.badRequest("System statuses cannot be deleted");
    const inUse = await prisma.lead.count({ where: { statusId: item.id, deletedAt: null } });
    if (inUse > 0) throw ApiError.conflict(`${inUse} leads use this status. Reassign them first.`);
    await prisma.leadStatusOption.delete({ where: { id: item.id } });
    res.json({ success: true, message: "Status deleted" });
  })
);

// ---- Lead source options ----
router.get(
  "/lead-sources",
  asyncHandler(async (_req, res) => {
    const items = await prisma.leadSourceOption.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, data: items });
  })
);

router.post(
  "/lead-sources",
  requirePermission("settings", "update"),
  validate({
    body: z.object({
      name: z.string().min(2).max(60),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#64748B"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const item = await prisma.leadSourceOption.create({ data: req.body });
    res.status(201).json({ success: true, data: item });
  })
);

router.delete(
  "/lead-sources/:id",
  requirePermission("settings", "update"),
  asyncHandler(async (req, res) => {
    const item = await prisma.leadSourceOption.findUnique({ where: { id: req.params.id } });
    if (!item) throw ApiError.notFound("Source not found");
    if (item.isSystem) throw ApiError.badRequest("System sources cannot be deleted");
    const inUse = await prisma.lead.count({ where: { sourceId: item.id, deletedAt: null } });
    if (inUse > 0) throw ApiError.conflict(`${inUse} leads use this source. Reassign them first.`);
    await prisma.leadSourceOption.delete({ where: { id: item.id } });
    res.json({ success: true, message: "Source deleted" });
  })
);

// ---- Email / WhatsApp templates ----
router.get(
  "/templates",
  requirePermission("settings", "view"),
  asyncHandler(async (_req, res) => {
    const items = await prisma.template.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, data: items });
  })
);

router.post(
  "/templates",
  requirePermission("settings", "update"),
  validate({
    body: z.object({
      name: z.string().min(2).max(100),
      type: z.enum(["EMAIL", "WHATSAPP"]),
      subject: z.string().max(200).optional().nullable(),
      body: z.string().min(1).max(10000),
    }),
  }),
  asyncHandler(async (req, res) => {
    const item = await prisma.template.create({ data: req.body });
    res.status(201).json({ success: true, data: item });
  })
);

router.patch(
  "/templates/:id",
  requirePermission("settings", "update"),
  validate({
    body: z.object({
      name: z.string().min(2).max(100).optional(),
      subject: z.string().max(200).optional().nullable(),
      body: z.string().min(1).max(10000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const item = await prisma.template.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: item });
  })
);

router.delete(
  "/templates/:id",
  requirePermission("settings", "update"),
  asyncHandler(async (req, res) => {
    await prisma.template.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: "Template deleted" });
  })
);

// ---- Integrations ----
router.get(
  "/integrations",
  requirePermission("integrations", "view"),
  asyncHandler(async (_req, res) => {
    const items = await prisma.integration.findMany({ orderBy: { name: "asc" } });
    res.json({ success: true, data: items });
  })
);

router.patch(
  "/integrations/:key",
  requirePermission("integrations", "update"),
  validate({
    body: z.object({
      enabled: z.boolean().optional(),
      config: z.record(z.unknown()).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const item = await prisma.integration.update({
      where: { key: req.params.key },
      data: {
        ...(req.body.enabled !== undefined && { enabled: req.body.enabled }),
        ...(req.body.config && { config: JSON.parse(JSON.stringify(req.body.config)) }),
      },
    });
    logAudit(req, "UPDATE", "Integration", item.key);
    res.json({ success: true, data: item });
  })
);

// ---- Integration test hooks ----
router.post(
  "/integrations/smtp/test",
  requirePermission("integrations", "update"),
  validate({ body: z.object({ to: z.string().email("Enter a valid email") }) }),
  asyncHandler(async (req, res) => {
    const result = await sendMail(
      req.body.to,
      "SMTP test — Real Estate CRM",
      "Congratulations! Your SMTP integration is working. Password-reset and reminder emails will be delivered."
    );
    if (!result.sent) throw ApiError.badRequest(result.error ?? "Send failed");
    logAudit(req, "TEST", "Integration", "smtp");
    res.json({ success: true, message: `Test email sent to ${req.body.to}` });
  })
);

router.post(
  "/integrations/whatsapp/test",
  requirePermission("integrations", "update"),
  validate({
    body: z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile") }),
  }),
  asyncHandler(async (req, res) => {
    const result = await sendWhatsAppText(
      req.body.mobile,
      "Test message from Real Estate CRM — your WhatsApp Business API integration is working! ✅"
    );
    if (!result.sent) throw ApiError.badRequest(result.error ?? "Send failed");
    logAudit(req, "TEST", "Integration", "whatsapp");
    res.json({ success: true, message: `Test WhatsApp sent to ${req.body.mobile}` });
  })
);

// ---- Departments ----
router.get(
  "/departments",
  asyncHandler(async (_req, res) => {
    const items = await prisma.department.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: items });
  })
);

router.post(
  "/departments",
  requirePermission("settings", "update"),
  validate({ body: z.object({ name: z.string().min(2).max(80) }) }),
  asyncHandler(async (req, res) => {
    const item = await prisma.department.create({ data: req.body });
    res.status(201).json({ success: true, data: item });
  })
);

// ---- Audit logs ----
router.get(
  "/audit-logs",
  requirePermission("settings", "view"),
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      entity: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; limit: number; entity?: string };
    const where = q.entity ? { entity: q.entity } : {};
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({
      success: true,
      data: {
        items,
        meta: { total, page: q.page, limit: q.limit, totalPages: Math.max(1, Math.ceil(total / q.limit)) },
      },
    });
  })
);

// ---- Backup (JSON export of core config) / Restore ----
router.get(
  "/backup",
  requirePermission("settings", "manage"),
  asyncHandler(async (req, res) => {
    const [settings, statuses, sources, stages, templates, integrations] = await Promise.all([
      prisma.setting.findMany(),
      prisma.leadStatusOption.findMany(),
      prisma.leadSourceOption.findMany(),
      prisma.pipelineStage.findMany(),
      prisma.template.findMany(),
      prisma.integration.findMany(),
    ]);
    logAudit(req, "BACKUP", "Setting", null);
    res.json({
      success: true,
      data: {
        exportedAt: new Date().toISOString(),
        settings, statuses, sources, stages, templates, integrations,
      },
    });
  })
);

router.post(
  "/restore",
  requirePermission("settings", "manage"),
  validate({
    body: z.object({
      settings: z.array(z.object({ key: z.string(), value: z.unknown() })).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const settings = (req.body.settings ?? []) as Array<{ key: string; value: unknown }>;
    for (const s of settings) {
      const value = JSON.parse(JSON.stringify(s.value ?? null));
      await prisma.setting.upsert({
        where: { key: s.key },
        create: { key: s.key, value, updatedById: req.user!.id },
        update: { value, updatedById: req.user!.id },
      });
    }
    logAudit(req, "RESTORE", "Setting", null, undefined, { count: settings.length });
    res.json({ success: true, message: `${settings.length} settings restored` });
  })
);

export default router;
