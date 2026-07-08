import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { verifyAccessToken } from "../lib/tokens";
import { ApiError, asyncHandler } from "./error";

export interface AuthUser {
  id: string;
  name: string;
  mobile: string;
  roleId: string;
  roleName: string;
  permissions: Set<string>; // "resource:action"
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Verifies the Bearer access token and loads the user with role permissions. */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw ApiError.unauthorized("Missing access token");

  let payload;
  try {
    payload = verifyAccessToken(header.slice(7));
  } catch {
    throw ApiError.unauthorized("Invalid or expired access token");
  }

  const user = await prisma.user.findFirst({
    where: { id: payload.sub, deletedAt: null, isActive: true },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user) throw ApiError.unauthorized("Account is inactive or removed");

  req.user = {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    roleId: user.roleId,
    roleName: user.role.name,
    permissions: new Set(
      user.role.permissions.map((rp) => `${rp.permission.resource}:${rp.permission.action}`)
    ),
  };
  next();
});

export function hasPermission(user: AuthUser, resource: string, action: string): boolean {
  return (
    user.roleName === "Super Admin" ||
    user.permissions.has(`${resource}:${action}`) ||
    user.permissions.has(`${resource}:manage`)
  );
}

/** Route guard: requires `resource:action` (or `resource:manage`, or Super Admin). */
export function requirePermission(resource: string, action: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!hasPermission(req.user, resource, action)) {
      return next(ApiError.forbidden(`Requires permission ${resource}:${action}`));
    }
    next();
  };
}
