import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Plug, RefreshCcw, Send, Settings2 } from "lucide-react";
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
import type { Integration } from "@/lib/types";

interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "password" | "number" | "email";
  placeholder?: string;
  help?: string;
}

interface IntegrationMeta {
  description: string;
  fields: FieldDef[];
  endpoint?: string; // shown with copy button
  endpointHelp?: string;
  test?: { label: string; inputLabel: string; inputKey: string; inputType: "email" | "tel" };
  note?: string;
}

const META: Record<string, IntegrationMeta> = {
  webhook: {
    description:
      "Generic inbound lead webhook — works with n8n, Zapier, landing pages and any custom form. Leads land in the CRM instantly with dedupe + admin alerts.",
    fields: [],
    endpoint: "/api/webhooks/leads?token=YOUR_TOKEN",
    endpointHelp: "POST JSON: { name, mobile, email?, city?, requirement?, source? }",
  },
  facebook_leads: {
    description:
      "Facebook / Instagram Lead Ads → CRM automatically. When someone submits a lead form, Meta pings this webhook and the CRM pulls the full lead via the Graph API.",
    fields: [
      {
        key: "verifyToken",
        label: "Verify Token",
        placeholder: "any secret string",
        help: "Enter the same value in Meta's webhook setup — used once during verification.",
      },
      {
        key: "pageAccessToken",
        label: "Page Access Token",
        type: "password",
        placeholder: "EAAG…",
        help: "Long-lived token with leads_retrieval permission for your Facebook page.",
      },
    ],
    endpoint: "/api/webhooks/facebook",
    endpointHelp:
      "In Meta for Developers → your App → Webhooks: subscribe the Page to the “leadgen” field with this Callback URL + your Verify Token.",
  },
  google_ads: {
    description:
      "Google Ads lead form extensions deliver submissions straight to this webhook — name, phone, email and city are mapped automatically.",
    fields: [
      {
        key: "key",
        label: "Webhook Key",
        placeholder: "any secret string",
        help: "Paste the same key in Google Ads → Lead form → Webhook integration.",
      },
    ],
    endpoint: "/api/webhooks/google-ads",
    endpointHelp:
      "In Google Ads lead form asset → Lead delivery option → Webhook: use this URL and the key above. “Send test data” is supported.",
  },
  whatsapp: {
    description:
      "WhatsApp Business Cloud API (Meta). When enabled, every new inbound lead automatically receives your “Welcome Lead” WhatsApp template, and the send is logged on the lead's timeline.",
    fields: [
      { key: "phoneNumberId", label: "Phone Number ID", placeholder: "1234567890" },
      { key: "accessToken", label: "Access Token", type: "password", placeholder: "EAAG…" },
    ],
    test: { label: "Send test WhatsApp", inputLabel: "Mobile number", inputKey: "mobile", inputType: "tel" },
    note: "Production numbers may require an approved message template for business-initiated chats; Meta test numbers work with plain text.",
  },
  smtp: {
    description:
      "Outgoing email via your SMTP server — used for password-reset emails and notifications. Works with Gmail (app password), Zoho, Amazon SES, etc.",
    fields: [
      { key: "host", label: "SMTP Host", placeholder: "smtp.gmail.com" },
      { key: "port", label: "Port", type: "number", placeholder: "587" },
      { key: "user", label: "Username", placeholder: "you@company.com" },
      { key: "pass", label: "Password / App Password", type: "password" },
      { key: "from", label: "From Address", type: "email", placeholder: "crm@company.com" },
    ],
    test: { label: "Send test email", inputLabel: "Send to", inputKey: "to", inputType: "email" },
  },
  cloudinary: {
    description:
      "CDN storage for property photos, brochures and documents. Configured via server environment variables (CLOUDINARY_*) for security — files fall back to local disk when unset.",
    fields: [],
    note: "Set CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET in the server .env and restart the API to activate.",
  },
};

export default function IntegrationsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canEdit = can("integrations", "update");
  const [configuring, setConfiguring] = useState<Integration | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () =>
      (await api.get<ApiResponse<Integration[]>>("/settings/integrations")).data.data,
  });

  const update = useMutation({
    mutationFn: async ({ key, body }: { key: string; body: Record<string, unknown> }) =>
      (await api.patch(`/settings/integrations/${key}`, body)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Integration updated");
    },
    onError: (err) => toast.error("Update failed", errorMessage(err)),
  });

  if (isError) {
    return (
      <>
        <PageHeader title="Integrations" />
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Integrations"
        description="Connect ad platforms, WhatsApp, email and automation tools — leads flow in automatically"
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data!.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              canEdit={canEdit}
              onToggle={(enabled) => update.mutate({ key: integration.key, body: { enabled } })}
              onConfigure={() => setConfiguring(integration)}
            />
          ))}
        </div>
      )}

      <ConfigDialog
        integration={configuring}
        onClose={() => setConfiguring(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["integrations"] })}
      />
    </div>
  );
}

function isConfigured(integration: Integration): boolean {
  const meta = META[integration.key];
  if (!meta || meta.fields.length === 0) return true;
  const c = (integration.config ?? {}) as Record<string, unknown>;
  return meta.fields.every((f) => !!c[f.key]);
}

function IntegrationCard({
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
  const meta = META[integration.key];
  const configured = isConfigured(integration);
  const hasSetup =
    (meta?.fields.length ?? 0) > 0 || !!meta?.endpoint || integration.key === "webhook";

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Plug className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-semibold">{integration.name}</h3>
            <div className="mt-1 flex gap-1.5">
              <Badge color={integration.enabled ? "#10B981" : "#6B7280"}>
                {integration.enabled ? "Enabled" : "Disabled"}
              </Badge>
              {integration.enabled && !configured && (
                <Badge color="#F59E0B">Needs setup</Badge>
              )}
              {integration.enabled && configured && (meta?.fields.length ?? 0) > 0 && (
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

      <p className="mt-3 flex-1 text-sm text-muted-foreground">
        {meta?.description ?? "External integration"}
      </p>

      {canEdit && hasSetup && (
        <div className="mt-4 border-t pt-3">
          <Button size="sm" variant="outline" onClick={onConfigure}>
            <Settings2 className="h-3.5 w-3.5" /> Configure
          </Button>
        </div>
      )}
      {meta?.note && !hasSetup && (
        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">{meta.note}</p>
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
  const meta = integration ? META[integration.key] : null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [testInput, setTestInput] = useState("");
  const [lastKey, setLastKey] = useState<string | null>(null);

  // Load current config when a different integration is opened.
  if (integration && integration.key !== lastKey) {
    setLastKey(integration.key);
    const c = (integration.config ?? {}) as Record<string, unknown>;
    setValues(
      Object.fromEntries((META[integration.key]?.fields ?? []).map((f) => [f.key, String(c[f.key] ?? "")]))
    );
    setTestInput("");
  }

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/settings/integrations/${integration!.key}`, {
          config: { ...(integration!.config ?? {}), ...values },
        })
      ).data,
    onSuccess: () => {
      onSaved();
      toast.success("Configuration saved");
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

  const regenerateToken = useMutation({
    mutationFn: async () => {
      const token = crypto.randomUUID().replace(/-/g, "");
      await api.patch(`/settings/integrations/webhook`, { config: { token } });
      return token;
    },
    onSuccess: () => {
      onSaved();
      toast.success("New token generated");
    },
    onError: (err) => toast.error("Failed", errorMessage(err)),
  });

  if (!integration || !meta) return null;

  const endpointUrl = meta.endpoint ? `${window.location.origin}${meta.endpoint}` : null;
  const webhookToken = (integration.config as { token?: string } | null)?.token;

  return (
    <Dialog
      open={!!integration}
      onClose={onClose}
      title={`Configure ${integration.name}`}
      description={meta.description}
      wide
    >
      <div className="space-y-4">
        {/* Webhook token management */}
        {integration.key === "webhook" && (
          <div>
            <Label>Webhook Token</Label>
            {webhookToken ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-muted px-2.5 py-2 text-xs">{webhookToken}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Copy token"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookToken);
                    toast.success("Token copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No token yet — generate one below.</p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              loading={regenerateToken.isPending}
              onClick={() => regenerateToken.mutate()}
            >
              <RefreshCcw className="h-3.5 w-3.5" /> {webhookToken ? "Regenerate" : "Generate"} token
            </Button>
          </div>
        )}

        {/* Config fields */}
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

        {/* Endpoint URL */}
        {endpointUrl && (
          <div>
            <Label>Endpoint URL</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg bg-muted px-2.5 py-2 text-xs">
                {integration.key === "webhook" && webhookToken
                  ? endpointUrl.replace("YOUR_TOKEN", webhookToken)
                  : endpointUrl}
              </code>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Copy endpoint URL"
                onClick={() => {
                  navigator.clipboard.writeText(
                    integration.key === "webhook" && webhookToken
                      ? endpointUrl.replace("YOUR_TOKEN", webhookToken)
                      : endpointUrl
                  );
                  toast.success("URL copied");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {meta.endpointHelp && (
              <p className="mt-1 text-xs text-muted-foreground">{meta.endpointHelp}</p>
            )}
            <p className="mt-1 text-xs text-warning">
              Note: for Facebook/Google to reach this URL it must be publicly accessible (deployed
              domain), not localhost.
            </p>
          </div>
        )}

        {meta.note && <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">{meta.note}</p>}

        {/* Test action */}
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
              <Button
                variant="outline"
                disabled={!testInput.trim()}
                loading={test.isPending}
                onClick={() => test.mutate()}
              >
                <Send className="h-4 w-4" /> {meta.test.label}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Save the configuration first, then run the test.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {meta.fields.length > 0 && (
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save Configuration
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
