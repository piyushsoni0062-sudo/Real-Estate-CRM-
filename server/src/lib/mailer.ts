import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { env } from "../config/env";

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

/**
 * SMTP settings come from the "smtp" integration (Settings → Integrations)
 * when enabled, falling back to SMTP_* environment variables.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const integration = await prisma.integration.findUnique({ where: { key: "smtp" } });
  const c = integration?.config as
    | { host?: string; port?: number | string; user?: string; pass?: string; from?: string; secure?: boolean }
    | null;
  if (integration?.enabled && c?.host && c?.user) {
    const port = Number(c.port ?? 587);
    return {
      host: c.host,
      port,
      user: c.user,
      pass: c.pass ?? "",
      from: c.from || c.user,
      secure: c.secure ?? port === 465,
    };
  }
  if (env.SMTP_HOST && env.SMTP_USER) {
    return {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
      secure: env.SMTP_PORT === 465,
    };
  }
  return null;
}

export async function sendMail(
  to: string,
  subject: string,
  text: string
): Promise<{ sent: boolean; error?: string }> {
  const cfg = await getSmtpConfig();
  if (!cfg) return { sent: false, error: "SMTP is not configured" };
  try {
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 10_000,
    });
    await transport.sendMail({ from: cfg.from, to, subject, text });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}
