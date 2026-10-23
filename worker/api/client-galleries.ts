import { requireClient } from "../client/auth";
import {
  getOwnedGallery,
  getReadyGalleryImage,
  listPublishedGalleriesForClient,
  listGalleryImages,
  serializeGallery,
  serializeImage,
} from "../client/repository";
import { privateJson } from "../client/response";
import { assertAllowedOrigin } from "../utils/auth";
import { requireDb } from "../utils/env";
import { AppError } from "../utils/errors";
import { assertRateLimit } from "../utils/rate-limit";

export async function handleClientGalleriesApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  const match = url.pathname.match(
    /^\/api\/client\/galleries(?:\/([^/]+)(?:\/favorites\/([^/]+))?)?$/,
  );
  if (!match) return null;
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  const identity = await requireClient(request, env, db);
  const galleryId = match[1];
  const imageId = match[2];
  if (!galleryId && request.method === "GET")
    return privateJson({
      galleries: (await listPublishedGalleriesForClient(db, identity.id)).map(
        serializeGallery,
      ),
    });
  const gallery = galleryId
    ? await getOwnedGallery(db, identity.id, galleryId)
    : null;
  if (!gallery) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  if (!imageId && request.method === "GET") {
    const favorites = (
      await db
        .prepare(
          "SELECT image_id AS id FROM client_gallery_favorites WHERE client_id=? AND gallery_id=?",
        )
        .bind(identity.id, galleryId)
        .all<{ id: string }>()
    ).results;
    const ids = new Set(favorites.map((f) => f.id));
    return privateJson({
      gallery: {
        ...serializeGallery(gallery),
        images: (await listGalleryImages(db, galleryId, true)).map((i) => ({
          ...serializeImage(i),
          favorite: ids.has(i.id),
        })),
      },
    });
  }
  if (imageId && ["PUT", "DELETE"].includes(request.method)) {
    await assertRateLimit(
      request,
      db,
      "private-favorite:" + identity.id,
      200,
      60,
    );
    if (!(await getReadyGalleryImage(db, galleryId, imageId)))
      throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
    if (request.method === "PUT") {
      await db
        .prepare(
          `INSERT INTO client_gallery_favorites (client_id,gallery_id,image_id,created_at)
        SELECT c.id,g.id,i.id,? FROM client_accounts c JOIN client_galleries g ON g.client_id=c.id
        JOIN client_gallery_images i ON i.gallery_id=g.id WHERE c.id=? AND c.disabled_at IS NULL
        AND c.session_version=? AND c.must_change_password=0 AND g.id=? AND g.status='published' AND i.id=? AND i.status='ready' AND i.deleted_at IS NULL
        ON CONFLICT DO NOTHING`,
        )
        .bind(
          new Date().toISOString(),
          identity.id,
          identity.sessionVersion,
          galleryId,
          imageId,
        )
        .run();
    } else
      await db
        .prepare(
          "DELETE FROM client_gallery_favorites WHERE client_id=? AND gallery_id=? AND image_id=?",
        )
        .bind(identity.id, galleryId, imageId)
        .run();
    return privateJson({ favorite: request.method === "PUT" });
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
}
