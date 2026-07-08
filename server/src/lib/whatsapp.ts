import { prisma } from "./prisma";

const GRAPH_API = "https://graph.facebook.com/v19.0";

/**
 * Sends a WhatsApp text message via the Meta WhatsApp Business Cloud API.
 * Requires the "whatsapp" integration to be enabled with phoneNumberId +
 * accessToken. Business-initiated conversations may require an approved
 * template on production numbers; text messages work with Meta test numbers
 * and inside an open 24-hour customer session.
 */
export async function sendWhatsAppText(
  mobile10: string,
  body: string
): Promise<{ sent: boolean; error?: string }> {
  const integration = await prisma.integration.findUnique({ where: { key: "whatsapp" } });
  const c = integration?.config as { phoneNumberId?: string; accessToken?: string } | null;
  if (!integration?.enabled || !c?.phoneNumberId || !c?.accessToken) {
    return { sent: false, error: "WhatsApp Business API is not configured" };
  }
  try {
    const res = await fetch(`${GRAPH_API}/${c.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: `91${mobile10}`,
        type: "text",
        text: { body },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) return { sent: false, error: data.error?.message ?? `HTTP ${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

/** Renders the "Welcome Lead" WhatsApp template for a lead, with a safe fallback. */
export async function welcomeMessageFor(name: string, project?: string | null): Promise<string> {
  const template = await prisma.template.findUnique({
    where: { name_type: { name: "Welcome Lead", type: "WHATSAPP" } },
  });
  const body =
    template?.body ??
    "Namaste {{name}}! Thank you for your interest{{project}}. Our executive will call you shortly.";
  return body
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*project\s*\}\}/gi, project ? ` in ${project}` : "our projects");
}
