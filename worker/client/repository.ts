import type { ClientGalleryStatus, ClientTheme } from "../../shared/client-galleries";

export type ClientRow = {
  id: string; name: string; email: string; passwordHash: string; passwordSalt: string;
  passwordIterations: number; mustChangePassword: number; sessionVersion: number;
  disabledAt: string | null;
};
export type GalleryRow = {
  id: string; clientId: string; title: string; introduction: string; theme: ClientTheme;
  coverImageId: string | null; allowDownloads: number; status: ClientGalleryStatus;
};
export type GalleryImageRow = {
  id: string; galleryId: string; storageKey: string; originalFilename: string;
  mimeType: string; sizeBytes: number; width: number | null; height: number | null;
  altText: string; position: number; status: "pending" | "ready" | "failed"; deletedAt: string | null;
};
const CLIENT_COLUMNS = `id,name,email,password_hash AS passwordHash,password_salt AS passwordSalt,
  password_iterations AS passwordIterations,must_change_password AS mustChangePassword,
  session_version AS sessionVersion,disabled_at AS disabledAt`;
const GALLERY_COLUMNS = `g.id,g.client_id AS clientId,g.title,g.introduction,g.theme,
  g.cover_image_id AS coverImageId,g.allow_downloads AS allowDownloads,g.status`;
const IMAGE_COLUMNS = `id,gallery_id AS galleryId,storage_key AS storageKey,
  original_filename AS originalFilename,mime_type AS mimeType,size_bytes AS sizeBytes,
  width,height,alt_text AS altText,position,status,deleted_at AS deletedAt`;
export async function getActiveClient(db: D1Database, id: string): Promise<ClientRow | null> {
  return db.prepare(`SELECT ${CLIENT_COLUMNS} FROM client_accounts WHERE id=? AND disabled_at IS NULL`).bind(id).first<ClientRow>();
}
export async function getClientByEmail(db: D1Database, email: string): Promise<ClientRow | null> {
  return db.prepare(`SELECT ${CLIENT_COLUMNS} FROM client_accounts WHERE email=?`).bind(email).first<ClientRow>();
}
export async function getOwnedGallery(db: D1Database, clientId: string, galleryId: string): Promise<GalleryRow | null> {
  return db.prepare(`SELECT ${GALLERY_COLUMNS} FROM client_galleries g JOIN client_accounts c ON c.id=g.client_id
    WHERE g.id=? AND g.client_id=? AND g.status='published' AND c.disabled_at IS NULL`).bind(galleryId,clientId).first<GalleryRow>();
}
export async function getGallery(db: D1Database, id: string): Promise<GalleryRow | null> {
  return db.prepare(`SELECT ${GALLERY_COLUMNS} FROM client_galleries g WHERE g.id=?`).bind(id).first<GalleryRow>();
}
export async function getReadyGalleryImage(db: D1Database, galleryId: string, imageId: string): Promise<GalleryImageRow | null> {
  return db.prepare(`SELECT ${IMAGE_COLUMNS} FROM client_gallery_images
    WHERE gallery_id=? AND id=? AND status='ready' AND deleted_at IS NULL`).bind(galleryId,imageId).first<GalleryImageRow>();
}
export async function listGalleryImages(db: D1Database, galleryId: string, readyOnly = false): Promise<GalleryImageRow[]> {
  return (await db.prepare(`SELECT ${IMAGE_COLUMNS} FROM client_gallery_images
    WHERE gallery_id=? AND deleted_at IS NULL ${readyOnly ? "AND status='ready'" : ""} ORDER BY position,id`).bind(galleryId).all<GalleryImageRow>()).results;
}
export async function listPublishedGalleriesForClient(db: D1Database, clientId: string): Promise<GalleryRow[]> {
  return (await db.prepare(`SELECT ${GALLERY_COLUMNS} FROM client_galleries g JOIN client_accounts c ON c.id=g.client_id
    WHERE g.client_id=? AND g.status='published' AND c.disabled_at IS NULL ORDER BY g.published_at DESC,g.id`)
    .bind(clientId).all<GalleryRow>()).results;
}
export async function listAllGalleries(db: D1Database): Promise<GalleryRow[]> {
  return (await db.prepare(`SELECT ${GALLERY_COLUMNS} FROM client_galleries g ORDER BY g.updated_at DESC,g.id`).all<GalleryRow>()).results;
}
export function serializeGallery(gallery: GalleryRow) {
  return { ...gallery, allowDownloads: Boolean(gallery.allowDownloads) };
}
export function serializeImage(image: GalleryImageRow) {
  return { id: image.id, originalFilename: image.originalFilename, altText: image.altText,
    width: image.width, height: image.height, position: image.position, status: image.status };
}
