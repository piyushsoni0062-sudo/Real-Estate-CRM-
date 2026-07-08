import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import { env, useCloudinary } from "../config/env";
import { ApiError } from "../middleware/error";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (useCloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(ApiError.badRequest(`File type ${file.mimetype} is not allowed`));
    }
    cb(null, true);
  },
});

export interface StoredFile {
  url: string;
  publicId: string | null;
  provider: "local" | "cloudinary";
}

/** Persist a file buffer to Cloudinary when configured, otherwise local disk. */
export async function storeFile(file: Express.Multer.File): Promise<StoredFile> {
  if (useCloudinary) {
    const result = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ resource_type: "auto", folder: "real-estate-crm" }, (err, res) =>
            err || !res ? reject(err ?? new Error("Upload failed")) : resolve(res)
          )
          .end(file.buffer);
      }
    );
    return { url: result.secure_url, publicId: result.public_id, provider: "cloudinary" };
  }

  const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
  const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), file.buffer);
  return { url: `/uploads/${name}`, publicId: null, provider: "local" };
}

export async function deleteStoredFile(f: { url: string; publicId: string | null; provider: string }) {
  try {
    if (f.provider === "cloudinary" && f.publicId) {
      await cloudinary.uploader.destroy(f.publicId);
    } else if (f.provider === "local") {
      const filename = path.basename(f.url);
      await fs.promises.unlink(path.join(UPLOAD_DIR, filename)).catch(() => undefined);
    }
  } catch (err) {
    console.error("File delete failed:", err);
  }
}

export { UPLOAD_DIR };
