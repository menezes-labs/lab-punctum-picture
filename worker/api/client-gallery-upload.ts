import { clientImageIntentSchema } from "../../shared/client-galleries";
import {
  getGallery,
  serializeImage,
  getReadyGalleryImage,
} from "../client/repository";
import { base64Url } from "../client/passwords";
import { privateJson } from "../client/response";
import { assertAllowedOrigin, requireAdmin } from "../utils/auth";
import { requireDb, requireOriginals, requiredEnvString } from "../utils/env";
import { AppError } from "../utils/errors";
import { parseJson } from "../client/validation";
import { writeAudit } from "../utils/audit";
import { assertRateLimit } from "../utils/rate-limit";

type IntentRow = {
  id: string;
  galleryId: string;
  imageId: string;
  expectedMime: string;
  expectedSize: number;
  storageKey: string;
  status: string;
  expiresAt: string;
};
async function signature(intent: IntentRow, env: Env) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredEnvString(env, "CLIENT_SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(
          JSON.stringify([
            intent.id,
            intent.galleryId,
            intent.expectedMime,
            intent.expectedSize,
            intent.expiresAt,
          ]),
        ),
      ),
    ),
  );
}
function matchesMime(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg")
    return (
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (mime === "image/png")
    return (
      bytes.length >= 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
    );
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}
async function readBounded(request: Request, size: number) {
  if (!request.body || request.headers.get("content-length") !== String(size))
    throw new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > size) {
      await reader.cancel();
      throw new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere.");
    }
    chunks.push(item.value);
  }
  if (total !== size)
    throw new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere.");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function handleClientGalleryUploadApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  const match = url.pathname.match(
    /^\/admin\/api\/albuns-privados\/([^/]+)\/uploads\/(intents|([^/]+)\/(direct|complete))$/,
  );
  if (!match) return null;
  const actor = await requireAdmin(request, env);
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  const bucket = requireOriginals(env);
  const galleryId = match[1];
  await assertRateLimit(request, db, "private-upload", 200, 60);
  if (!(await getGallery(db, galleryId)))
    throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  if (match[2] === "intents" && request.method === "POST") {
    const input = await parseJson(request, clientImageIntentSchema);
    const id = crypto.randomUUID();
    const imageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const storageKey = `client-galleries/${galleryId}/${imageId}.${input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg"}`;
    const intent: IntentRow = {
      id,
      galleryId,
      imageId,
      expectedMime: input.mimeType,
      expectedSize: input.sizeBytes,
      storageKey,
      status: "pending",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    };
    const token = await signature(intent, env);
    await db.batch([
      db
        .prepare(
          `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,alt_text,position,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM client_gallery_images WHERE gallery_id=?),'pending',?,?)`,
        )
        .bind(
          imageId,
          galleryId,
          storageKey,
          input.filename,
          input.mimeType,
          input.sizeBytes,
          input.altText,
          galleryId,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
        VALUES (?,?,?,?,?,?,'pending',?,?)`,
        )
        .bind(
          id,
          galleryId,
          imageId,
          input.mimeType,
          input.sizeBytes,
          storageKey,
          intent.expiresAt,
          now,
        ),
    ]);
    return privateJson(
      {
        intentId: id,
        imageId,
        uploadUrl: new URL(
          `/admin/api/albuns-privados/${galleryId}/uploads/${id}/direct`,
          request.url,
        ).href,
        requiredHeaders: {
          "Content-Type": input.mimeType,
          "X-Upload-Token": token,
        },
      },
      { status: 201 },
    );
  }
  const intent = await db
    .prepare(
      `SELECT id,gallery_id AS galleryId,image_id AS imageId,expected_mime AS expectedMime,expected_size AS expectedSize,
    storage_key AS storageKey,status,expires_at AS expiresAt FROM client_gallery_upload_intents WHERE id=? AND gallery_id=?`,
    )
    .bind(match[3] ?? "", galleryId)
    .first<IntentRow>();
  if (!intent) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  if (
    intent.status === "completed" &&
    match[4] === "complete" &&
    request.method === "POST"
  ) {
    const image = await getReadyGalleryImage(db, galleryId, intent.imageId);
    if (image) return privateJson({ image: serializeImage(image) });
  }
  if (
    intent.expiresAt <= new Date().toISOString() ||
    !["pending", "uploaded"].includes(intent.status)
  )
    throw new AppError(
      409,
      "UPLOAD_CLOSED",
      "Este envio expirou ou já foi concluído.",
    );
  if (match[4] === "direct" && request.method === "PUT") {
    if (intent.status !== "pending")
      throw new AppError(409, "UPLOAD_CLOSED", "Este envio já foi recebido.");
    if (
      request.headers.get("X-Upload-Token") !== (await signature(intent, env))
    )
      throw new AppError(403, "UPLOAD_SIGNATURE", "Envio não autorizado.");
    if (request.headers.get("Content-Type") !== intent.expectedMime)
      throw new AppError(400, "UPLOAD_TYPE", "O tipo da foto não confere.");
    const bytes = await readBounded(request, intent.expectedSize);
    if (!matchesMime(bytes, intent.expectedMime))
      throw new AppError(
        400,
        "INVALID_IMAGE",
        "Envie uma imagem JPG, PNG ou WebP válida.",
      );
    const object = await bucket.put(intent.storageKey, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: intent.expectedMime },
    });
    if (!object)
      throw new AppError(409, "UPLOAD_CLOSED", "Este envio já foi recebido.");
    await db
      .prepare(
        "UPDATE client_gallery_upload_intents SET status='uploaded' WHERE id=? AND status='pending'",
      )
      .bind(intent.id)
      .run();
    return privateJson({ ok: true });
  }
  if (match[4] === "complete" && request.method === "POST") {
    if (intent.status !== "uploaded")
      throw new AppError(409, "UPLOAD_INCOMPLETE", "Conclua o envio da foto.");
    const head = await bucket.head(intent.storageKey);
    if (
      !head ||
      head.size !== intent.expectedSize ||
      head.httpMetadata?.contentType !== intent.expectedMime
    )
      throw new AppError(
        409,
        "UPLOAD_MISMATCH",
        "Não foi possível conferir o envio da foto.",
      );
    const object = await bucket.get(intent.storageKey);
    if (!object)
      throw new AppError(
        409,
        "UPLOAD_INCOMPLETE",
        "Não foi possível conferir o envio da foto.",
      );
    let width: number;
    let height: number;
    try {
      const [metadata, decode] = object.body.tee();
      const info = await env.IMAGES.info(metadata);
      if (!("width" in info) || !info.width || !info.height)
        throw new Error("Invalid raster");
      const validation = await env.IMAGES.input(decode)
        .transform({ width: 1, height: 1, fit: "scale-down" })
        .output({ format: "image/png" });
      await validation.response().arrayBuffer();
      width = info.width;
      height = info.height;
    } catch {
      await db.batch([
        db
          .prepare(
            "UPDATE client_gallery_upload_intents SET status='failed' WHERE id=?",
          )
          .bind(intent.id),
        db
          .prepare(
            "UPDATE client_gallery_images SET status='failed',updated_at=? WHERE id=?",
          )
          .bind(new Date().toISOString(), intent.imageId),
      ]);
      throw new AppError(
        400,
        "INVALID_IMAGE",
        "Não foi possível ler esta foto. Tente outro arquivo.",
      );
    }
    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          `UPDATE client_gallery_images SET status='ready',width=?,height=?,updated_at=? WHERE id=? AND status='pending'
        AND EXISTS(SELECT 1 FROM client_gallery_upload_intents WHERE id=? AND status='uploaded' AND expires_at>?)`,
        )
        .bind(width, height, now, intent.imageId, intent.id, now),
      db
        .prepare(
          `UPDATE client_gallery_upload_intents SET status='completed',completed_at=? WHERE id=? AND status='uploaded'
        AND EXISTS(SELECT 1 FROM client_gallery_images WHERE id=? AND status='ready')`,
        )
        .bind(now, intent.id, intent.imageId),
    ]);
    const image = await getReadyGalleryImage(db, galleryId, intent.imageId);
    if (!image) throw new AppError(409, "UPLOAD_CLOSED", "Este envio expirou.");
    await writeAudit(
      db,
      actor.email,
      "client_gallery.image_ready",
      "client_gallery",
      galleryId,
      { imageId: intent.imageId },
    );
    return privateJson({ image: serializeImage(image) });
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
}
