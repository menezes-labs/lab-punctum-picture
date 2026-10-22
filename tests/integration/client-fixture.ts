import { env } from "cloudflare:workers";
const migrations = import.meta.glob("../../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as unknown as Record<string, string>;
export async function bootstrapPrivateDb() {
  if (
    await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='client_accounts'",
    ).first()
  )
    return;
  for (const key of Object.keys(migrations).sort()) {
    for (const statement of migrations[key]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await env.DB.prepare(statement).run();
    }
  }
}
export async function seedClient(id = crypto.randomUUID()) {
  await env.DB.prepare(
    `INSERT INTO client_accounts
    (id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,created_at,updated_at)
    VALUES (?, 'Test', ?, 'hash', 'salt', 310000, 0, 1, datetime('now'), datetime('now'))`,
  )
    .bind(id, id + "@example.com")
    .run();
  return id;
}
export async function seedGallery(clientId: string, status = "published") {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO client_galleries (id,client_id,title,introduction,theme,allow_downloads,status,created_at,updated_at)
    VALUES (?,?,'Ensaio','','noir',0,?,datetime('now'),datetime('now'))`,
  )
    .bind(id, clientId, status)
    .run();
  return id;
}
export function privateRequest(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
) {
  return new Request("http://localhost:8787" + path, {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:8787",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
export async function seedReadyImage(galleryId: string) {
  const id = crypto.randomUUID();
  const key = `client-galleries/${galleryId}/${id}.png`;
  await env.DB.prepare(
    `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,alt_text,position,status,created_at,updated_at)
    VALUES (?,?,?,'test.png','image/png',1,'Pilot',0,'ready',datetime('now'),datetime('now'))`,
  )
    .bind(id, galleryId, key)
    .run();
  return id;
}
