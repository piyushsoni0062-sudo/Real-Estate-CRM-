import { Router, Request } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../../lib/prisma";
import { ApiError, asyncHandler } from "../../middleware/error";
import { validate } from "../../middleware/validate";
import { notify } from "../../utils/audit";
import { sendWhatsAppText, welcomeMessageFor } from "../../lib/whatsapp";

const router = Router();

const GRAPH_API = "https://graph.facebook.com/v19.0";

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

async function integrationConfig<T>(key: string): Promise<{ enabled: boolean; config: T | null }> {
  const integration = await prisma.integration.findUnique({ where: { key } });
  return { enabled: !!integration?.enabled, config: (integration?.config as T | null) ?? null };
}

interface InboundLead {
  name: string;
  mobile: string;
  email?: string;
  city?: string;
  requirement?: string;
  sourceName: string;
}

const SOURCE_COLORS = ["#2563EB", "#7C3AED", "#DB2777", "#059669", "#D97706", "#0891B2", "#DC2626"];

/**
 * Finds a lead source by name (case-insensitive), creating it on the fly if it
 * doesn't exist. This lets any portal or custom source (Housing, 99acres,
 * a landing page, etc.) start flowing leads in without pre-configuration —
 * the new source then appears in filters and reports automatically.
 */
async function ensureLeadSource(name: string) {
  const clean = name.trim().slice(0, 60) || "Website";
  const existing = await prisma.leadSourceOption.findFirst({
    where: { name: { equals: clean, mode: "insensitive" } },
  });
  if (existing) return existing;
  const count = await prisma.leadSourceOption.count();
  return prisma.leadSourceOption.create({
    data: { name: clean, color: SOURCE_COLORS[count % SOURCE_COLORS.length] },
  });
}

/**
 * Shared inbound-lead pipeline used by every integration:
 * validates the mobile, dedupes, creates the lead + timeline entry,
 * notifies admins and fires the WhatsApp welcome message (if configured).
 */
async function captureInboundLead(
  input: InboundLead
): Promise<{ leadId: string; duplicate: boolean }> {
  const mobile = input.mobile.replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(mobile)) throw ApiError.badRequest("Invalid mobile number");

  const dup = await prisma.lead.findFirst({
    where: { mobile, deletedAt: null },
    select: { id: true },
  });
  if (dup) {
    await prisma.leadActivity.create({
      data: {
        leadId: dup.id,
        type: "IMPORT",
        title: `Repeat enquiry received via ${input.sourceName}`,
        description: input.requirement,
      },
    });
    return { leadId: dup.id, duplicate: true };
  }

  const [status, source, stage] = await Promise.all([
    prisma.leadStatusOption.findFirst({ orderBy: { order: "asc" } }),
    ensureLeadSource(input.sourceName),
    // Inbound leads land in the first Kanban stage automatically, otherwise
    // they'd have no stageId and never show up on the Sales Pipeline board.
    prisma.pipelineStage.findFirst({ orderBy: { order: "asc" } }),
  ]);
  if (!status) throw ApiError.badRequest("CRM is not seeded yet");

  const lead = await prisma.lead.create({
    data: {
      name: input.name.trim().slice(0, 120),
      mobile,
      email: input.email?.trim() || null,
      city: input.city?.trim() || null,
      requirement: input.requirement?.trim() || null,
      statusId: status.id,
      sourceId: source.id,
      stageId: stage?.id,
    },
  });
  await prisma.leadActivity.create({
    data: { leadId: lead.id, type: "CREATED", title: `Lead captured via ${input.sourceName}` },
  });

  // Alert admins about the fresh inbound lead.
  const admins = await prisma.user.findMany({
    where: { deletedAt: null, isActive: true, role: { name: { in: ["Super Admin", "Admin"] } } },
    select: { id: true },
  });
  for (const a of admins) {
    notify(a.id, {
      title: `New lead from ${input.sourceName}`,
      body: `${lead.name} (${lead.mobile})`,
      type: "LEAD_ASSIGNED",
      link: `/leads/${lead.id}`,
    });
  }

  // Auto WhatsApp welcome — fire and forget, logged on the timeline when sent.
  void (async () => {
    const message = await welcomeMessageFor(lead.name);
    const result = await sendWhatsAppText(mobile, message);
    if (result.sent) {
      await prisma.leadActivity
        .create({
          data: {
            leadId: lead.id,
            type: "WHATSAPP",
            title: "Auto welcome message sent via WhatsApp API",
            description: message,
          },
        })
        .catch(() => undefined);
    }
  })();

  return { leadId: lead.id, duplicate: false };
}

// ============================================================
// Generic inbound webhook — landing pages, n8n, Zapier, custom forms
// POST /api/webhooks/leads?token=...
// ============================================================
router.post(
  "/leads",
  webhookLimiter,
  validate({
    body: z.object({
      name: z.string().min(1).max(120),
      mobile: z.string().min(10).max(15),
      email: z.string().email().optional(),
      city: z.string().max(80).optional(),
      requirement: z.string().max(2000).optional(),
      source: z.string().max(60).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { enabled, config } = await integrationConfig<{ token?: string }>("webhook");
    if (!enabled || !config?.token || req.query.token !== config.token) {
      throw ApiError.unauthorized("Invalid webhook token");
    }
    // Source can come from ?source= in the URL (easiest — the same portal URL
    // just carries its own source tag) or from the JSON body.
    const querySource = typeof req.query.source === "string" ? req.query.source : undefined;
    const result = await captureInboundLead({
      name: req.body.name,
      mobile: req.body.mobile,
      email: req.body.email,
      city: req.body.city,
      requirement: req.body.requirement,
      sourceName: querySource || req.body.source || "Website",
    });
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  })
);

// ============================================================
// Facebook Lead Ads
//   GET  /api/webhooks/facebook  — Meta webhook verification handshake
//   POST /api/webhooks/facebook  — leadgen events → fetch lead via Graph API
// Config: { verifyToken, pageAccessToken }
// ============================================================
router.get(
  "/facebook",
  asyncHandler(async (req, res) => {
    const { enabled, config } = await integrationConfig<{ verifyToken?: string }>("facebook_leads");
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (enabled && mode === "subscribe" && config?.verifyToken && token === config.verifyToken) {
      return res.status(200).send(String(challenge ?? ""));
    }
    throw ApiError.forbidden("Facebook webhook verification failed");
  })
);

interface FacebookLeadgenPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: { leadgen_id?: string; form_id?: string; page_id?: string };
    }>;
  }>;
}

async function fetchFacebookLead(
  leadgenId: string,
  accessToken: string
): Promise<InboundLead | null> {
  const res = await fetch(`${GRAPH_API}/${leadgenId}?access_token=${encodeURIComponent(accessToken)}`);
  if (!res.ok) {
    console.error(`[facebook-leads] Graph API ${res.status} for leadgen ${leadgenId}`);
    return null;
  }
  const data = (await res.json()) as {
    field_data?: Array<{ name?: string; values?: string[] }>;
  };
  const fields = new Map(
    (data.field_data ?? []).map((f) => [f.name?.toLowerCase() ?? "", f.values?.[0] ?? ""])
  );
  const name = fields.get("full_name") || fields.get("name") || "Facebook Lead";
  const mobile = fields.get("phone_number") || fields.get("phone") || "";
  if (!mobile) return null;
  return {
    name,
    mobile,
    email: fields.get("email") || undefined,
    city: fields.get("city") || undefined,
    requirement: fields.get("message") || fields.get("requirement") || undefined,
    sourceName: "Facebook Ads",
  };
}

router.post(
  "/facebook",
  webhookLimiter,
  asyncHandler(async (req: Request, res) => {
    const { enabled, config } = await integrationConfig<{ pageAccessToken?: string }>(
      "facebook_leads"
    );
    if (!enabled) throw ApiError.forbidden("Facebook Lead Ads integration is disabled");

    const payload = req.body as FacebookLeadgenPayload;
    const leadgenIds: string[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field === "leadgen" && change.value?.leadgen_id) {
          leadgenIds.push(change.value.leadgen_id);
        }
      }
    }

    // Always 200 quickly — Meta retries on non-2xx and disables slow webhooks.
    res.json({ success: true, received: leadgenIds.length });

    if (!config?.pageAccessToken) {
      if (leadgenIds.length) {
        console.error("[facebook-leads] leadgen event received but pageAccessToken is not configured");
      }
      return;
    }
    for (const id of leadgenIds) {
      try {
        const lead = await fetchFacebookLead(id, config.pageAccessToken);
        if (lead) await captureInboundLead(lead);
      } catch (err) {
        console.error(`[facebook-leads] failed to capture leadgen ${id}:`, err);
      }
    }
  })
);

// ============================================================
// Google Ads lead form webhook
//   POST /api/webhooks/google-ads
// Google sends { google_key, user_column_data: [{ column_id, string_value }] }
// Config: { key }
// ============================================================
router.post(
  "/google-ads",
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const { enabled, config } = await integrationConfig<{ key?: string }>("google_ads");
    const body = req.body as {
      google_key?: string;
      is_test?: boolean;
      user_column_data?: Array<{ column_id?: string; column_name?: string; string_value?: string }>;
    };
    if (!enabled || !config?.key || body.google_key !== config.key) {
      throw ApiError.unauthorized("Invalid Google Ads key");
    }

    const byId = new Map(
      (body.user_column_data ?? []).map((c) => [
        (c.column_id ?? c.column_name ?? "").toUpperCase(),
        c.string_value ?? "",
      ])
    );
    const name = byId.get("FULL_NAME") || byId.get("FIRST_NAME") || "Google Ads Lead";
    const mobile = byId.get("PHONE_NUMBER") || "";
    if (!mobile) throw ApiError.badRequest("PHONE_NUMBER column missing");

    if (body.is_test) {
      // Google's "Send test data" button — validate without creating a lead.
      return res.json({ success: true, data: { test: true } });
    }
    const result = await captureInboundLead({
      name,
      mobile,
      email: byId.get("EMAIL") || undefined,
      city: byId.get("CITY") || undefined,
      sourceName: "Google Ads",
    });
    res.status(result.duplicate ? 200 : 201).json({ success: true, data: result });
  })
);

export default router;
