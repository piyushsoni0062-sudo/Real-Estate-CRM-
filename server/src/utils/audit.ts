import { Request } from "express";
import { prisma } from "../lib/prisma";

/** Fire-and-forget audit log entry — never blocks or fails the request. */
export function logAudit(
  req: Request,
  action: string,
  entity: string,
  entityId?: string | null,
  before?: unknown,
  after?: unknown
): void {
  prisma.auditLog
    .create({
      data: {
        userId: req.user?.id ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        before: before === undefined ? undefined : JSON.parse(JSON.stringify(before)),
        after: after === undefined ? undefined : JSON.parse(JSON.stringify(after)),
        ip: req.ip,
      },
    })
    .catch((err) => console.error("Audit log failed:", err));
}

/** Create an in-app notification for a user — fire-and-forget. */
export function notify(
  userId: string,
  data: { title: string; body?: string; type?: string; link?: string }
): void {
  prisma.notification
    .create({ data: { userId, ...data } })
    .catch((err) => console.error("Notification failed:", err));
}
