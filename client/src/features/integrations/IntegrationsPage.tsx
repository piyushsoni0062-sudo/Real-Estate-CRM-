import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Globe,
  Mail,
  MessageCircle,
  Plug,
  Plus,
  RefreshCcw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, ApiResponse, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import {
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Skeleton,
  Switch,
} from "@/components/ui/primitives";
import type { Integration, Option } from "@/lib/types";

const WEBHOOK_PATH = "/api/webhooks/leads";

function randomTestMobile() {
  return "9" + Math.floor(100000000 + Math.random() * 900000000).toString();
}

/** A read-only URL/snippet box with a copy button. */
function CopyBox({ value, label }: { value: string; label?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-muted px-2.5 py-2 text-xs">
          {value}
        </code>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Copy"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Copied");
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

// ---------------- Lead-source (webhook) cards ----------------

interface PortalSource {
  sourceName: string;
  label: string;
  description: string;
  steps: string[];
  /** Webhook path override (defaults to the generic lead webhook). */
  path?: string;
}

const PORTAL_SOURCES: PortalSource[] = [
  {
    sourceName: "Website",
    label: "Website / Landing Page",
    description: "Capture enquiries from your own website or landing page forms.",
    steps: [
      "Copy the URL above.",
      "In your website form settings (or form builder like Google Forms + Zapier, Elementor, WordPress CF7), set it to POST the form to this URL.",
      "Send the fields: name, mobile, email, city, requirement.",
      "Use the HTML snippet below for a ready-made form.",
    ],
  },
  {
    sourceName: "Housing",
    label: "Housing.com",
    description: "Bring Housing.com buyer enquiries straight into your pipeline.",
    steps: [
      "If your Housing seller account has a Webhook / Lead Push option (Pro/API plans), paste this URL there.",
      "Otherwise, connect your Housing lead-notification email to this URL using a free automation tool like Pabbly Connect or Zapier (Email Parser → Webhook).",
      "Every new Housing lead will then appear in the CRM automatically, tagged 'Housing'.",
    ],
  },
  {
    sourceName: "99acres",
    label: "99acres",
    description: "Auto-import 99acres leads into the CRM.",
    steps: [
      "If you have 99acres API / lead-push access, configure this URL as the webhook.",
      "Otherwise use Pabbly Connect / Zapier to forward 99acres lead emails to this URL.",
      "Leads flow in automatically, tagged '99acres'.",
    ],
  },
  {
    sourceName: "MagicBricks",
    label: "MagicBricks",
    description: "Auto-import MagicBricks leads into the CRM.",
    steps: [
      "If your MagicBricks account offers a webhook / lead API, paste this URL there.",
      "Otherwise use Pabbly Connect / Zapier to forward MagicBricks lead emails to this URL.",
      "Leads flow in automatically, tagged 'MagicBricks'.",
    ],
  },
  {
    sourceName: "WhatsApp",
    label: "WhatsApp Enquiries",
    description: "Push WhatsApp enquiries (via a chatbot or tool) into the CRM.",
    steps: [
      "Use a WhatsApp tool (WATI, AiSensy, Interakt, or n8n) that supports webhooks.",
      "Set it to POST new-contact details to this URL.",
      "Leads are tagged 'WhatsApp'.",
    ],
  },
  {
    sourceName: "Phone Call",
    label: "IVR / Phone Calls (Virtual Number)",
    path: "/api/webhooks/call",
    description:
      "Every incoming call on your business (virtual) number becomes a lead automatically — caller's number is captured, repeat calls are logged on the same lead.",
    steps: [
      "Get a virtual/IVR number from a cloud-telephony provider — Exotel, MyOperator, Tata Smartflo, Knowlarity or Servetel (₹500–1500/month).",
      "Advertise that number everywhere; set it to forward calls to your team's phones.",
      "In the provider's dashboard, add this URL as the 'call webhook' / 'Passthru' — it accepts the caller number as CallFrom, caller_id, from or mobile (GET or POST).",
      "Every call (answered or missed) instantly creates a lead tagged 'Phone Call'.",
    ],
  },
];

function webhookUrl(origin: string, token: string, source: string, path = WEBHOOK_PATH) {
  return `${origin}${path}?token=${token}&source=${encodeURIComponent(source)}`;
}

function SourceCard({
  source,
  token,
  origin,
  onTested,
  onRemove,
}: {
  source: PortalSource;
  token: string;
  origin: string;
  onTested: () => void;
  onRemove?: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const url = webhookUrl(origin, token, source.sourceName, source.path);

  const test = useMutation({
    mutationFn: async () => {
      // POST to the real webhook exactly like the portal would — proves the
      // token, URL and pipeline all work end to end.
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Test Lead — ${source.label}`,
          mobile: randomTestMobile(),
          city: "Mathura",
          requirement: `Test enquiry from ${source.label} integration`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      onTested();
      toast.success(
        "It works! ✅",
        "A test lead was created — open Lead Management to see it, then delete it."
      );
    },
    onError: (err) =>
      toast.error("Test failed", err instanceof Error ? err.message : errorMessage(err)),
  });

  const htmlSnippet = `<form method="POST" action="${url}">
  <input name="name" placeholder="Name" required />
  <input name="mobile" placeholder="Mobile" required />
  <input name="email" placeholder="Email" />
  <input name="city" placeholder="City" />
  <textarea name="requirement" placeholder="Requirement"></textarea>
  <button type="submit">Submit</button>
</form>`;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Globe className="h-[18px] w-[18px]" />
          </span>
          <div>
            <h4 className="text-sm font-semibold">{source.label}</h4>
            <Badge color="#10B981" className="mt-0.5">
              <CheckCircle2 className="h-3 w-3" /> Ready
            </Badge>
          </div>
        </div>
        {onRemove && (
          <Button size="sm" variant="ghost" aria-label="Remove source" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>

      <p className="mt-2.5 text-sm text-muted-foreground">{source.description}</p>

      <div className="mt-3">
        <CopyBox value={url} label="Your ready webhook URL" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" loading={test.isPending} onClick={() => test.mutate()}>
          <Send className="h-3.5 w-3.5" /> Send test lead
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          How to connect
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-muted/50 p-3">
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
            {source.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {source.sourceName === "Website" && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Ready-made HTML form
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed">
                {htmlSnippet}
              </pre>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------- Native ad-platform / messaging config ----------------

interface FieldDef {
  key: string;
  label: string;
  type?: string;
  placeholder?: string;
  help?: string;
}
interface NativeMeta {
  icon: ReactNode;
  description: string;
  fields: FieldDef[];
  endpointPath?: string;
  endpointHelp?: string;
  steps?: string[];
  test?: { label: string; inputLabel: string; inputKey: string; inputType: string };
  note?: string;
}

const NATIVE_META: Record<string, NativeMeta> = {
  facebook_leads: {
    icon: <Plug className="h-5 w-5" />,
    description:
      "Facebook / Instagram Lead Ads → CRM automatically. When someone submits a lead form, Meta notifies this webhook and the CRM pulls the full lead.",
    fields: [
      { key: "verifyToken", label: "Verify Token", placeholder: "any secret word", help: "Enter the same value in Meta's webhook setup." },
      { key: "pageAccessToken", label: "Page Access Token", type: "password", placeholder: "EAAG…", help: "Long-lived token with leads_retrieval permission." },
    ],
    endpointPath: "/api/webhooks/facebook",
    endpointHelp: "In Meta for Developers → Webhooks: subscribe your Page to 'leadgen' with this Callback URL + Verify Token.",
    steps: [
      "Create/open your app at developers.facebook.com.",
      "Add the 'Webhooks' product → Page → subscribe to the 'leadgen' field.",
      "Paste the Callback URL below and your Verify Token, then Verify.",
      "Generate a Page Access Token (leads_retrieval) and paste it here.",
    ],
  },
  google_ads: {
    icon: <Plug className="h-5 w-5" />,
    description:
      "Google Ads lead form extensions deliver submissions straight to the CRM — name, phone, email and city are mapped automatically.",
    fields: [{ key: "key", label: "Webhook Key", placeholder: "any secret word", help: "Paste the same key in Google Ads." }],
    endpointPath: "/api/webhooks/google-ads",
    endpointHelp: "In Google Ads → Lead form asset → Lead delivery → Webhook: use this URL + the key.",
    steps: [
      "In Google Ads, open your Lead form asset.",
      "Under 'Lead delivery option', choose Webhook integration.",
      "Paste the Webhook URL below and the key above.",
      "Click 'Send test data' — it's supported.",
    ],
  },
  whatsapp: {
    icon: <MessageCircle className="h-5 w-5" />,
    description:
      "WhatsApp Business Cloud API (Meta). When enabled, every new inbound lead automatically receives your 'Welcome Lead' WhatsApp message.",
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "1234567890" },
      { key: "accessToken", label: "Access Token", type: "password", placeholder: "EAAG…" },
    ],
    test: { label: "Send test WhatsApp", inputLabel: "Mobile number", inputKey: "mobile", inputType: "tel" },
    note: "Production numbers may need an approved template; Meta test numbers work with plain text.",
  },
  smtp: {
    icon: <Mail className="h-5 w-5" />,
    description:
      "Outgoing email via your SMTP server — used for password-reset emails and notifications. Works with Gmail (app password), Zoho, Amazon SES.",
    fields: [
      { key: "host", label: "SMTP Host", placeholder: "smtp.gmail.com" },
      { key: "port", label: "Port", type: "number", placeholder: "587" },
      { key: "user", label: "Username", placeholder: "you@company.com" },
      { key: "pass", label: "Password / App Password", type: "password" },
      { key: "from", label: "From Address", type: "email", placeholder: "crm@company.com" },
    ],
    test: { label: "Send test email", inputLabel: "Send to", inputKey: "to", inputType: "email" },
  },
};

function NativeCard({
  integration,
  canEdit,
  onToggle,
  onConfigure,
}: {
  integration: Integration;
  canEdit: boolean;
  onToggle: (enabled: boolean) => void;
  onConfigure: () => void;
}) {
  const meta = NATIVE_META[integration.key];
  const configured =
    meta.fields.length === 0 ||
    meta.fields.every((f) => !!(integration.config as Record<string, unknown> | null)?.[f.key]);

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {meta.icon}
          </span>
          <div>
            <h3 className="font-semibold">{integration.name}</h3>
            <div className="mt-1 flex gap-1.5">
              <Badge color={integration.enabled ? "#10B981" : "#6B7280"}>
                {integration.enabled ? "Enabled" : "Disabled"}
              </Badge>
              {integration.enabled && !configured && <Badge color="#F59E0B">Needs setup</Badge>}
              {integration.enabled && configured && (
                <Badge color="#10B981">
                  <CheckCircle2 className="h-3 w-3" /> Ready
                </Badge>
              )}
            </div>
          </div>
        </div>
        <Switch
          checked={integration.enabled}
          onCheckedChange={onToggle}
          disabled={!canEdit}
          label={`Toggle ${integration.name}`}
        />
      </div>
      <p className="mt-3 flex-1 text-sm text-muted-foreground">{meta.description}</p>
      {canEdit && (
        <div className="mt-4 border-t pt-3">
          <Button size="sm" variant="outline" onClick={onConfigure}>
            <Settings2 className="h-3.5 w-3.5" /> Configure
          </Button>
        </div>
      )}
    </Card>
  );
}

function ConfigDialog({
  integration,
  onClose,
  onSaved,
}: {
  integration: Integration | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const meta = integration ? NATIVE_META[integration.key] : null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [testInput, setTestInput] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);

  if (integration && integration.key !== lastKey) {
    setLastKey(integration.key);
    const c = (integration.config ?? {}) as Record<string, unknown>;
    setValues(
      Object.fromEntries((NATIVE_META[integration.key]?.fields ?? []).map((f) => [f.key, String(c[f.key] ?? "")]))
    );
    setTestInput("");
  }

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/settings/integrations/${integration!.key}`, {
          enabled: true,
          config: { ...(integration!.config ?? {}), ...values },
        })
      ).data,
    onSuccess: () => {
      onSaved();
      toast.success("Saved & enabled");
    },
    onError: (err) => toast.error("Save failed", errorMessage(err)),
  });

  const test = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/settings/integrations/${integration!.key}/test`, {
          [meta!.test!.inputKey]: testInput.trim(),
        })
      ).data as { message?: string },
    onSuccess: (d) => toast.success("Test successful", d.message),
    onError: (err) => toast.error("Test failed", errorMessage(err)),
  });

  if (!integration || !meta) return null;
  const endpointUrl = meta.endpointPath ? `${window.location.origin}${meta.endpointPath}` : null;

  return (
    <Dialog open onClose={onClose} title={`Configure ${integration.name}`} description={meta.description} wide>
      <div className="space-y-4">
        {meta.steps && (
          <ol className="list-decimal space-y-1.5 rounded-xl bg-muted/50 p-3 pl-7 text-sm text-muted-foreground">
            {meta.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}

        {meta.fields.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`cfg-${f.key}`}>{f.label}</Label>
            <Input
              id={`cfg-${f.key}`}
              type={f.type ?? "text"}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              autoComplete="off"
            />
            {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
          </div>
        ))}

        {endpointUrl && (
          <div>
            <CopyBox value={endpointUrl} label="Callback / Webhook URL" />
            {meta.endpointHelp && <p className="mt-1 text-xs text-muted-foreground">{meta.endpointHelp}</p>}
            <p className="mt-1 text-xs text-warning">
              This must be your live domain (already set up) — external platforms can't reach localhost.
            </p>
          </div>
        )}

        {meta.note && <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{meta.note}</p>}

        {meta.test && (
          <div className="rounded-xl border p-3">
            <Label htmlFor="cfg-test">{meta.test.inputLabel}</Label>
            <div className="flex gap-2">
              <Input
                id="cfg-test"
                type={meta.test.inputType}
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder={meta.test.inputType === "email" ? "you@company.com" : "9876543210"}
              />
              <Button variant="outline" disabled={!testInput.trim()} loading={test.isPending} onClick={() => test.mutate()}>
                <Send className="h-4 w-4" /> {meta.test.label}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Save first, then run the test.</p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {meta.fields.length > 0 && (
            <Button loading={save.isPending} onClick={() => save.mutate()}>Save & Enable</Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ---------------- Page ----------------

export default function IntegrationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("integrations", "update");
  const [configuring, setConfiguring] = useState<Integration | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const origin = window.location.origin;

  const { data: integrations, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () =>
      (await api.get<ApiResponse<Integration[]>>("/settings/integrations")).data.data,
  });

  const { data: sources } = useQuery({
    queryKey: ["lead-sources"],
    queryFn: async () => (await api.get<ApiResponse<Option[]>>("/settings/lead-sources")).data.data,
  });

  const webhook = integrations?.find((i) => i.key === "webhook");
  const token = (webhook?.config as { token?: string } | null)?.token ?? "";

  // Make the lead-capture webhook ready-to-use: auto-generate a token and
  // enable it the first time an admin opens this page.
  const ensureToken = useMutation({
    mutationFn: async () => {
      const newToken = crypto.randomUUID().replace(/-/g, "");
      return api.patch("/settings/integrations/webhook", {
        enabled: true,
        config: { token: newToken },
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
  });

  useEffect(() => {
    if (canEdit && webhook && !token && !ensureToken.isPending) {
      ensureToken.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhook, token, canEdit]);

  const toggle = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) =>
      api.patch(`/settings/integrations/${key}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (err) => toast.error("Update failed", errorMessage(err)),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const newToken = crypto.randomUUID().replace(/-/g, "");
      return api.patch("/settings/integrations/webhook", { config: { token: newToken } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("New token generated", "Old links stop working — update them.");
    },
  });

  const addCustom = useMutation({
    mutationFn: async () =>
      api.post("/settings/lead-sources", { name: customName.trim(), color: "#0EA5E9" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-sources"] });
      setAddOpen(false);
      setCustomName("");
      toast.success("Custom source added", "Scroll down to copy its webhook URL.");
    },
    onError: (err) => toast.error("Could not add", errorMessage(err)),
  });

  const removeSource = useMutation({
    mutationFn: async (id: string) => api.delete(`/settings/lead-sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-sources"] });
      toast.success("Source removed");
    },
    onError: (err) => toast.error("Cannot remove", errorMessage(err)),
  });

  const onTested = () => queryClient.invalidateQueries({ queryKey: ["leads"] });

  // Custom sources = lead sources the user added (not part of any built-in card / native platform).
  const builtInNames = useMemo(
    () =>
      new Set(
        [
          ...PORTAL_SOURCES.map((p) => p.sourceName.toLowerCase()),
          "facebook ads",
          "google ads",
          "landing page",
          "referral",
          "walk-in",
          "manual",
        ]
      ),
    []
  );
  const customSources = (sources ?? []).filter((s) => !builtInNames.has(s.name.toLowerCase()));

  if (isError) {
    return (
      <>
        <PageHeader title="Integrations" />
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </>
    );
  }

  const facebook = integrations?.find((i) => i.key === "facebook_leads");
  const google = integrations?.find((i) => i.key === "google_ads");
  const whatsapp = integrations?.find((i) => i.key === "whatsapp");
  const smtp = integrations?.find((i) => i.key === "smtp");
  const cloudinary = integrations?.find((i) => i.key === "cloudinary");

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Integrations"
        description="Connect your lead sources — leads flow into the CRM automatically"
      />

      {isLoading || !token ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-52 w-full" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Lead-capture hero */}
          <Card className="mb-6 border-primary/30 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h3 className="font-semibold">Lead Capture — one link per source</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Each card below gives you a ready link. Paste it into that platform (or an
                  automation tool like Zapier / Pabbly Connect) and new leads land in the CRM
                  instantly — deduped, tagged by source, and pushed to your pipeline.
                </p>
                {canEdit && (
                  <div className="mt-3 max-w-xl">
                    <CopyBox value={token} label="Your secret webhook token (shared by all source links)" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      loading={regenerate.isPending}
                      onClick={() => regenerate.mutate()}
                    >
                      <RefreshCcw className="h-3.5 w-3.5" /> Regenerate token
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Portal / website source cards */}
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Lead Sources
            </h2>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add custom source
              </Button>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {PORTAL_SOURCES.map((s) => (
              <SourceCard key={s.sourceName} source={s} token={token} origin={origin} onTested={onTested} />
            ))}
            {customSources.map((s) => (
              <SourceCard
                key={s.id}
                source={{
                  sourceName: s.name,
                  label: s.name,
                  description: "Custom lead source — paste this URL wherever your leads come from.",
                  steps: [
                    "Copy the URL above.",
                    "Paste it into your source's webhook field, or use Zapier / Pabbly Connect to forward leads to it.",
                    "Send fields: name, mobile, email, city, requirement.",
                  ],
                }}
                token={token}
                origin={origin}
                onTested={onTested}
                onRemove={
                  canEdit && !s.isSystem ? () => removeSource.mutate(s.id) : undefined
                }
              />
            ))}
          </div>

          {/* Ad platforms (native) */}
          <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ad Platforms
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {facebook && (
              <NativeCard
                integration={facebook}
                canEdit={canEdit}
                onToggle={(enabled) => toggle.mutate({ key: facebook.key, enabled })}
                onConfigure={() => setConfiguring(facebook)}
              />
            )}
            {google && (
              <NativeCard
                integration={google}
                canEdit={canEdit}
                onToggle={(enabled) => toggle.mutate({ key: google.key, enabled })}
                onConfigure={() => setConfiguring(google)}
              />
            )}
          </div>

          {/* Messaging */}
          <h2 className="mb-2 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Messaging
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {whatsapp && (
              <NativeCard
                integration={whatsapp}
                canEdit={canEdit}
                onToggle={(enabled) => toggle.mutate({ key: whatsapp.key, enabled })}
                onConfigure={() => setConfiguring(whatsapp)}
              />
            )}
            {smtp && (
              <NativeCard
                integration={smtp}
                canEdit={canEdit}
                onToggle={(enabled) => toggle.mutate({ key: smtp.key, enabled })}
                onConfigure={() => setConfiguring(smtp)}
              />
            )}
          </div>

          {/* Storage */}
          {cloudinary && (
            <Card className="mt-8 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Plug className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold">Cloudinary Storage</h3>
                  <Badge color={cloudinary.enabled ? "#10B981" : "#6B7280"} className="mt-1">
                    {cloudinary.enabled ? "Enabled" : "Local disk"}
                  </Badge>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                CDN storage for property photos and documents. Configured via server environment
                variables (CLOUDINARY_*) for security — files fall back to the server disk when unset.
              </p>
            </Card>
          )}
        </>
      )}

      <ConfigDialog
        integration={configuring}
        onClose={() => setConfiguring(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["integrations"] })}
      />

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add custom lead source">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Give the source a name (e.g. “Instagram”, “Newspaper Ad”, “Broker Ramesh”). You'll get a
            ready webhook URL for it.
          </p>
          <div>
            <Label htmlFor="custom-src">Source name</Label>
            <Input
              id="custom-src"
              value={customName}
              autoFocus
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && customName.trim().length >= 2 && addCustom.mutate()}
              placeholder="e.g. Instagram"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={customName.trim().length < 2} loading={addCustom.isPending} onClick={() => addCustom.mutate()}>
              Add source
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
