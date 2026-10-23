import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb, seedClient, seedGallery } from "./client-fixture";
import { cleanupPrivateGalleryUploads } from "../../worker/client/maintenance";

describe("private upload cleanup", () => {
  beforeAll(bootstrapPrivateDb);
  it("retries an expired upload after object deletion fails", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const image = crypto.randomUUID();
    const intent = crypto.randomUUID();
    const key = `client-galleries/${gallery}/${image}.jpg`;
    await env.DB.prepare(
      `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
      VALUES (?,?,?,'retry.jpg','image/jpeg',1,0,'pending','2000-01-01','2000-01-01')`,
    )
      .bind(image, gallery, key)
      .run();
    await env.DB.prepare(
      `INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
      VALUES (?,?,?,'image/jpeg',1,?,'uploaded','2000-01-01','2000-01-01')`,
    )
      .bind(intent, gallery, image, key)
      .run();
    await env.ORIGINALS.put(key, "x");
    const failing = new Proxy(env.ORIGINALS, {
      get(target, property) {
        if (property === "delete")
          return async () => {
            throw new Error("Simulated interrupted cleanup");
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expect(
      cleanupPrivateGalleryUploads({ ...env, ORIGINALS: failing } as Env),
    ).rejects.toThrow("Simulated interrupted cleanup");
    expect(await env.ORIGINALS.head(key)).not.toBeNull();
    await cleanupPrivateGalleryUploads(env);
    expect(await env.ORIGINALS.head(key)).toBeNull();
  });
  it("expires abandoned objects and leaves completed private originals intact", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const now = new Date().toISOString();
    const keys: string[] = [];
    for (const ready of [false, true]) {
      const image = crypto.randomUUID();
      const id = crypto.randomUUID();
      const key = `client-galleries/${gallery}/${image}.jpg`;
      keys.push(key);
      await env.DB.prepare(
        `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at)
        VALUES (?,?,?,'a.jpg','image/jpeg',1,0,?,'2000-01-01',?)`,
      )
        .bind(image, gallery, key, ready ? "ready" : "pending", now)
        .run();
      await env.DB.prepare(
        `INSERT INTO client_gallery_upload_intents (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at)
        VALUES (?,?,?,'image/jpeg',1,?,?,'2000-01-01','2000-01-01')`,
      )
        .bind(id, gallery, image, key, ready ? "completed" : "uploaded")
        .run();
      await env.ORIGINALS.put(key, "x");
    }
    await cleanupPrivateGalleryUploads(env);
    expect(await env.ORIGINALS.head(keys[0])).toBeNull();
    expect(await env.ORIGINALS.head(keys[1])).not.toBeNull();
    expect(
      (await env.DB.prepare(
        "SELECT status FROM client_gallery_upload_intents WHERE storage_key=?",
      )
        .bind(keys[0])
        .first<{ status: string }>())!.status,
    ).toBe("expired");
  });
});
