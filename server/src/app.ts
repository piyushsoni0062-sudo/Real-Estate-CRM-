import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { UPLOAD_DIR } from "./lib/uploader";

import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/users/users.routes";
import roleRoutes from "./modules/roles/roles.routes";
import leadRoutes from "./modules/leads/leads.routes";
import customerRoutes from "./modules/customers/customers.routes";
import projectRoutes from "./modules/projects/projects.routes";
import propertyRoutes from "./modules/properties/properties.routes";
import siteVisitRoutes from "./modules/siteVisits/siteVisits.routes";
import bookingRoutes from "./modules/bookings/bookings.routes";
import pipelineRoutes from "./modules/pipeline/pipeline.routes";
import taskRoutes from "./modules/tasks/tasks.routes";
import attendanceRoutes from "./modules/attendance/attendance.routes";
import notificationRoutes from "./modules/notifications/notifications.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import reportRoutes from "./modules/reports/reports.routes";
import settingRoutes from "./modules/settings/settings.routes";
import uploadRoutes from "./modules/uploads/uploads.routes";
import searchRoutes from "./modules/search/search.routes";
import webhookRoutes from "./modules/webhooks/webhooks.routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Global API rate limit (per IP).
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { success: false, message: "Too many requests, slow down." },
    })
  );

  // Locally stored uploads (Cloudinary handles delivery when configured).
  app.use("/uploads", express.static(path.resolve(UPLOAD_DIR), { maxAge: "7d" }));

  app.get("/api/health", (_req, res) =>
    res.json({ success: true, status: "ok", time: new Date().toISOString() })
  );

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/roles", roleRoutes);
  app.use("/api/leads", leadRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/properties", propertyRoutes);
  app.use("/api/site-visits", siteVisitRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/pipeline", pipelineRoutes);
  app.use("/api/tasks", taskRoutes);
  app.use("/api/attendance", attendanceRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/settings", settingRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/webhooks", webhookRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
