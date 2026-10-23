import { envNumber, requireDb } from "../utils/env";
export const PRIVATE_BACKUP_TABLES = [
  "client_accounts",
  "client_galleries",
  "client_gallery_images",
  "client_gallery_upload_intents",
  "client_gallery_favorites",
] as const;
export async function hasPrivateGallerySchema(db: D1Database) {
  return Boolean(
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='client_gallery_upload_intents'",
      )
      .first(),
  );
}
export async function cleanupPrivateGalleryUploads(env: Env): Promise<void> {
  const db = requireDb(env);
  if (!(await hasPrivateGallerySchema(db)) || !env.ORIGINALS) return;
  const now = new Date().toISOString();
  const cutoff = new Date(
    Date.now() -
      envNumber(env, "CLEANUP_ORPHAN_UPLOAD_AGE_HOURS", 24) * 3_600_000,
  ).toISOString();
  const intents = (
    await db
      .prepare(
        `SELECT id,image_id AS imageId,storage_key AS storageKey FROM client_gallery_upload_intents
    WHERE status IN ('pending','uploaded','failed','expired') AND completed_at IS NULL AND expires_at<? AND created_at<? LIMIT 500`,
      )
      .bind(now, cutoff)
      .all<{ id: string; imageId: string; storageKey: string }>()
  ).results;
  for (const intent of intents) {
    const claimed = await db
      .prepare(
        `UPDATE client_gallery_upload_intents SET status='expired' WHERE id=? AND completed_at IS NULL AND status IN ('pending','uploaded','failed','expired')
      AND NOT EXISTS(SELECT 1 FROM client_gallery_images WHERE id=? AND status='ready') RETURNING id`,
      )
      .bind(intent.id, intent.imageId)
      .first();
    if (!claimed) continue;
    await db
      .prepare(
        "UPDATE client_gallery_images SET status='failed',updated_at=? WHERE id=? AND status!='ready'",
      )
      .bind(now, intent.imageId)
      .run();
    if (intent.storageKey.startsWith("client-galleries/"))
      await env.ORIGINALS.delete(intent.storageKey);
    await db
      .prepare(
        "UPDATE client_gallery_upload_intents SET completed_at=? WHERE id=? AND status='expired'",
      )
      .bind(now, intent.id)
      .run();
  }
}
