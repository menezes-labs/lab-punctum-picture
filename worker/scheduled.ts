import { envNumber, envString, requireDb } from "./utils/env";
import { PRIVATE_BACKUP_TABLES, hasPrivateGallerySchema, cleanupPrivateGalleryUploads } from "./client/maintenance";

const BACKUP_TABLES = [
  "site_settings",
  "categories",
  "albums",
  "album_categories",
  "images",
  "upload_intents",
  "inquiries",
  "audit_log",
  "admin_credentials",
  "rate_limit_buckets",
  "backup_runs",
  "site_config",
  "site_config_versions",
  "site_config_pointers",
] as const;

async function logicalBackup(env: Env): Promise<void> {
  const db = requireDb(env);
  if (!env.BACKUPS) {
    throw new Error("Binding BACKUPS indisponível");
  }

  const createdAt = new Date();
  const data: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  const tables=await hasPrivateGallerySchema(db) ? [...BACKUP_TABLES,...PRIVATE_BACKUP_TABLES] : BACKUP_TABLES;
  for (const table of tables) {
    const result = await db.prepare(`SELECT * FROM ${table}`).all();
    data[table] = result.results;
    rowCounts[table] = result.results.length;
  }

  const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
  const prefix = envString(env, "BACKUP_PREFIX") ?? "backups/d1";
  const dailyKey = `${prefix}/daily/${createdAt.toISOString().slice(0, 10)}/${stamp}.json`;
  const body = JSON.stringify({
    format: "punctum-picture-logical-backup-v1",
    createdAt: createdAt.toISOString(),
    data,
  });
  const puts: Promise<R2Object>[] = [
    env.BACKUPS.put(dailyKey, body, {
      httpMetadata: { contentType: "application/json" },
      customMetadata: { retention: "daily" },
    }),
  ];

  if (createdAt.getUTCDay() === 0) {
    puts.push(
      env.BACKUPS.put(`${prefix}/weekly/${createdAt.toISOString().slice(0, 10)}/${stamp}.json`, body, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { retention: "weekly" },
      }),
    );
  }
  if (createdAt.getUTCDate() === 1) {
    puts.push(
      env.BACKUPS.put(`${prefix}/monthly/${createdAt.toISOString().slice(0, 7)}/${stamp}.json`, body, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { retention: "monthly" },
      }),
    );
  }
  await Promise.all(puts);

  await db
    .prepare(
      `INSERT INTO backup_runs (
        id, object_key, status, row_counts_json, created_at
      ) VALUES (?, ?, 'completed', ?, ?)`,
    )
    .bind(crypto.randomUUID(), dailyKey, JSON.stringify(rowCounts), createdAt.toISOString())
    .run();
}

async function cleanupBackupPrefix(
  bucket: R2Bucket,
  prefix: string,
  maxAgeDays: number,
): Promise<void> {
  let cursor: string | undefined;
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    const expired = listed.objects.filter((object) => object.uploaded.getTime() < cutoff);
    if (expired.length > 0) {
      await bucket.delete(expired.map((object) => object.key));
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

async function cleanupOldBackups(env: Env): Promise<void> {
  if (!env.BACKUPS) return;
  const prefix = envString(env, "BACKUP_PREFIX") ?? "backups/d1";
  await Promise.all([
    cleanupBackupPrefix(env.BACKUPS, `${prefix}/daily/`, 7),
    cleanupBackupPrefix(env.BACKUPS, `${prefix}/weekly/`, 28),
    cleanupBackupPrefix(env.BACKUPS, `${prefix}/monthly/`, 183),
  ]);
}

async function cleanupOrphanUploads(env: Env): Promise<void> {
  const db = requireDb(env);
  const ageHours = envNumber(env, "CLEANUP_ORPHAN_UPLOAD_AGE_HOURS", 24);
  const cutoff = new Date(Date.now() - ageHours * 3_600_000).toISOString();
  const expired = await db
    .prepare(
      `SELECT id, image_id AS imageId, object_key AS objectKey
       FROM upload_intents
       WHERE status IN ('pending','uploaded') AND expires_at < ? AND created_at < ?
       LIMIT 500`,
    )
    .bind(new Date().toISOString(), cutoff)
    .all<{ id: string; imageId: string; objectKey: string }>();

  for (const intent of expired.results) {
    if (env.ORIGINALS) {
      await env.ORIGINALS.delete(intent.objectKey);
    }
    await db.batch([
      db
        .prepare(
          "UPDATE upload_intents SET status = 'expired', error_message = ? WHERE id = ?",
        )
        .bind("Expirado e limpo pelo cron", intent.id),
      db
        .prepare("UPDATE images SET status = 'failed', updated_at = ? WHERE id = ?")
        .bind(new Date().toISOString(), intent.imageId),
    ]);
  }
  await db
    .prepare("DELETE FROM rate_limit_buckets WHERE expires_at < ?")
    .bind(new Date().toISOString())
    .run();
}

export async function handleScheduled(
  event: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const jobs: Promise<void>[] = [cleanupOrphanUploads(env),cleanupPrivateGalleryUploads(env)];
  if (event.cron === "0 3 * * *") {
    jobs.push(logicalBackup(env), cleanupOldBackups(env));
  }
  ctx.waitUntil(Promise.all(jobs).then(() => undefined));
}
