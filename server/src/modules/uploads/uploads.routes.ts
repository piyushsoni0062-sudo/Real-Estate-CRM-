import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { ApiError, asyncHandler } from "../../middleware/error";
import { deleteStoredFile, storeFile, upload } from "../../lib/uploader";
import { logAudit } from "../../utils/audit";

const router = Router();
router.use(requireAuth);

// ---- POST /api/uploads — multipart upload, optionally attached to an entity ----
router.post(
  "/",
  requirePermission("files", "create"),
  upload.single("file"),
  validate({
    body: z.object({
      propertyId: z.string().optional(),
      projectId: z.string().optional(),
      customerId: z.string().optional(),
      taskId: z.string().optional(),
      leadId: z.string().optional(),
      title: z.string().max(200).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest("No file provided (field name: file)");
    const stored = await storeFile(req.file);
    const { leadId, title, ...attach } = req.body as Record<string, string | undefined>;

    const file = await prisma.fileUpload.create({
      data: {
        url: stored.url,
        publicId: stored.publicId,
        provider: stored.provider,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedById: req.user!.id,
        propertyId: attach.propertyId || undefined,
        projectId: attach.projectId || undefined,
        customerId: attach.customerId || undefined,
        taskId: attach.taskId || undefined,
      },
    });

    if (leadId) {
      await prisma.leadDocument.create({
        data: { leadId, fileId: file.id, title: title || req.file.originalname },
      });
      await prisma.leadActivity.create({
        data: {
          leadId,
          userId: req.user!.id,
          type: "DOCUMENT",
          title: `Document uploaded: ${req.file.originalname}`,
        },
      });
    }
    logAudit(req, "UPLOAD", "FileUpload", file.id, undefined, { filename: file.filename });
    res.status(201).json({ success: true, data: file });
  })
);

// ---- DELETE /api/uploads/:id ----
router.delete(
  "/:id",
  requirePermission("files", "delete"),
  asyncHandler(async (req, res) => {
    const file = await prisma.fileUpload.findUnique({ where: { id: req.params.id } });
    if (!file) throw ApiError.notFound("File not found");
    await prisma.fileUpload.delete({ where: { id: file.id } });
    await deleteStoredFile(file);
    logAudit(req, "DELETE", "FileUpload", file.id);
    res.json({ success: true, message: "File deleted" });
  })
);

export default router;
