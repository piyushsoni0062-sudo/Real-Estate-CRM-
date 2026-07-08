import { Router, Request, Response } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import {
  generateRefreshToken,
  hashToken,
  refreshExpiry,
  signAccessToken,
} from "../../lib/tokens";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { requireAuth } from "../../middleware/auth";
import { logAudit } from "../../utils/audit";
import { sendMail } from "../../lib/mailer";
import { env, isProd } from "../../config/env";

const router = Router();

const REFRESH_COOKIE = "crm_refresh";
const mobileSchema = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Try again in 15 minutes." },
});

function setRefreshCookie(res: Response, token: string, rememberMe: boolean) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/api/auth",
    maxAge:
      (rememberMe ? env.REFRESH_TOKEN_TTL_DAYS_REMEMBER : env.REFRESH_TOKEN_TTL_DAYS) *
      24 * 60 * 60 * 1000,
  });
}

async function serializeUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    avatarUrl: user.avatarUrl,
    designation: user.designation,
    role: { id: user.role.id, name: user.role.name },
    permissions: user.role.permissions.map(
      (rp) => `${rp.permission.resource}:${rp.permission.action}`
    ),
  };
}

// ---- POST /api/auth/login ----
router.post(
  "/login",
  loginLimiter,
  validate({
    body: z.object({
      mobile: mobileSchema,
      password: z.string().min(1, "Password is required"),
      rememberMe: z.boolean().default(false),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { mobile, password, rememberMe } = req.body;
    const user = await prisma.user.findFirst({
      where: { mobile, deletedAt: null },
      include: { role: true },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw ApiError.unauthorized("Invalid mobile number or password");
    }
    if (!user.isActive) throw ApiError.forbidden("Your account has been deactivated");

    const { token, tokenHash } = generateRefreshToken();
    await prisma.$transaction([
      prisma.refreshToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt: refreshExpiry(rememberMe),
          userAgent: req.headers["user-agent"]?.slice(0, 255),
          ip: req.ip,
        },
      }),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    setRefreshCookie(res, token, rememberMe);
    logAudit(req, "LOGIN", "User", user.id);
    res.json({
      success: true,
      data: {
        accessToken: signAccessToken({ sub: user.id, roleId: user.roleId, roleName: user.role.name }),
        user: await serializeUser(user.id),
      },
    });
  })
);

// ---- POST /api/auth/refresh — rotates the refresh token ----
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw ApiError.unauthorized("No refresh token");

    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: { include: { role: true } } },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw ApiError.unauthorized("Refresh token expired or revoked");
    }
    if (!stored.user.isActive || stored.user.deletedAt) {
      throw ApiError.unauthorized("Account is inactive");
    }

    const { token, tokenHash } = generateRefreshToken();
    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.create({
        data: {
          tokenHash,
          userId: stored.userId,
          expiresAt: stored.expiresAt, // keep the original session window
          userAgent: req.headers["user-agent"]?.slice(0, 255),
          ip: req.ip,
        },
      }),
    ]);

    setRefreshCookie(res, token, true);
    res.json({
      success: true,
      data: {
        accessToken: signAccessToken({
          sub: stored.user.id,
          roleId: stored.user.roleId,
          roleName: stored.user.role.name,
        }),
        user: await serializeUser(stored.user.id),
      },
    });
  })
);

// ---- POST /api/auth/logout ----
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (raw) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(raw), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    res.json({ success: true, message: "Logged out" });
  })
);

// ---- POST /api/auth/logout-all — revoke every session ----
router.post(
  "/logout-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.refreshToken.updateMany({
      where: { userId: req.user!.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    logAudit(req, "LOGOUT_ALL", "User", req.user!.id);
    res.json({ success: true, message: "Logged out from all devices" });
  })
);

// ---- GET /api/auth/me ----
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await serializeUser(req.user!.id) });
  })
);

// ---- POST /api/auth/change-password ----
router.post(
  "/change-password",
  requireAuth,
  validate({
    body: z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8, "New password must be at least 8 characters"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    if (!(await verifyPassword(req.body.currentPassword, user.passwordHash))) {
      throw ApiError.badRequest("Current password is incorrect");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(req.body.newPassword) },
    });
    logAudit(req, "CHANGE_PASSWORD", "User", user.id);
    res.json({ success: true, message: "Password updated" });
  })
);

// ---- POST /api/auth/forgot-password — issues a reset token ----
router.post(
  "/forgot-password",
  loginLimiter,
  validate({ body: z.object({ mobile: mobileSchema }) }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { mobile: req.body.mobile, deletedAt: null, isActive: true },
    });
    // Always answer 200 so mobile numbers can't be enumerated.
    if (user) {
      const token = crypto.randomBytes(24).toString("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken: hashToken(token),
          resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
      // Deliver via SMTP when configured; the server log stays as admin fallback.
      let delivered = false;
      if (user.email) {
        const result = await sendMail(
          user.email,
          "Password reset — Real Estate CRM",
          `Hi ${user.name},\n\nYour password reset token is:\n\n${token}\n\nIt is valid for 30 minutes. Enter it on the reset page along with your new password.\n\nIf you did not request this, you can safely ignore this email.`
        );
        delivered = result.sent;
        if (!result.sent && result.error !== "SMTP is not configured") {
          console.error(`[password-reset] email delivery failed: ${result.error}`);
        }
      }
      if (!delivered) {
        console.info(`[password-reset] token for ${user.mobile}: ${token} (valid 30 min)`);
      }
    }
    res.json({
      success: true,
      message: "If this mobile number is registered, a reset link has been sent",
    });
  })
);

// ---- POST /api/auth/reset-password ----
router.post(
  "/reset-password",
  validate({
    body: z.object({
      mobile: mobileSchema,
      token: z.string().min(10),
      newPassword: z.string().min(8, "Password must be at least 8 characters"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: {
        mobile: req.body.mobile,
        resetToken: hashToken(req.body.token),
        resetTokenExpiresAt: { gt: new Date() },
      },
    });
    if (!user) throw ApiError.badRequest("Invalid or expired reset token");

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: await hashPassword(req.body.newPassword),
          resetToken: null,
          resetTokenExpiresAt: null,
        },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    res.json({ success: true, message: "Password has been reset. Please log in." });
  })
);

export default router;
