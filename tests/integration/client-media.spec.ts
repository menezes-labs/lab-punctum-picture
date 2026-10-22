import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapPrivateDb,
  seedClient,
  seedGallery,
  privateRequest,
  seedReadyImage,
} from "./client-fixture";
import { handlePrivateGalleryRoutes } from "../../worker/client/router";
import { createClientSession } from "../../worker/client/auth";

const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);
type Intent = {
  intentId: string;
  imageId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
};
async function intent(
  gallery: string,
  sizeBytes = PNG.length,
  mimeType = "image/png",
) {
  return exports.default.fetch(
    privateRequest(
      "/admin/api/albuns-privados/" + gallery + "/uploads/intents",
      "POST",
      { filename: "pilot.png", mimeType, sizeBytes },
    ),
  );
}
async function upload(value: Intent, bytes = PNG) {
  return exports.default.fetch(
    new Request(value.uploadUrl, {
      method: "PUT",
      headers: {
        ...value.requiredHeaders,
        Origin: "http://localhost:8787",
        "Content-Length": String(bytes.length),
      },
      body: bytes,
    }),
  );
}
describe("isolated private uploads", () => {
  beforeAll(bootstrapPrivateDb);
  it("creates private galleries only for active clients and validates strict payloads", async () => {
    const id = await seedClient();
    const response = await exports.default.fetch(
      privateRequest("/admin/api/albuns-privados", "POST", {
        clientId: id,
        title: "Pilot",
        theme: "ivory",
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { gallery: { id: string } };
    expect(
      await env.DB.prepare("SELECT id FROM albums WHERE id=?")
        .bind(body.gallery.id)
        .first(),
    ).toBeNull();
    expect(
      (
        await exports.default.fetch(
          privateRequest("/admin/api/albuns-privados", "POST", {
            clientId: crypto.randomUUID(),
            title: "Missing",
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await exports.default.fetch(
          privateRequest("/admin/api/albuns-privados", "POST", {
            clientId: id,
            title: "Bad",
            status: "published",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("checks type/size/bytes/intent, completes after R2 verification and never stores publicly", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    expect((await intent(gallery, 26_214_401)).status).toBe(400);
    expect((await intent(gallery, PNG.length, "image/gif")).status).toBe(400);
    const response = await intent(gallery);
    expect(response.status).toBe(201);
    const value = (await response.json()) as Intent;
    expect(JSON.stringify(value)).not.toContain("client-galleries/");
    expect(
      (
        await exports.default.fetch(
          privateRequest(
            "/admin/api/albuns-privados/" +
              gallery +
              "/uploads/" +
              value.intentId +
              "/complete",
            "POST",
          ),
        )
      ).status,
    ).toBe(409);
    expect((await upload(value)).status).toBe(200);
    expect((await upload(value)).status).toBe(409);
    const complete = await exports.default.fetch(
      privateRequest(
        "/admin/api/albuns-privados/" +
          gallery +
          "/uploads/" +
          value.intentId +
          "/complete",
        "POST",
      ),
    );
    expect(complete.status).toBe(200);
    expect(
      (
        await exports.default.fetch(
          privateRequest(
            "/admin/api/albuns-privados/" +
              gallery +
              "/uploads/" +
              value.intentId +
              "/complete",
            "POST",
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare(
        "SELECT status FROM client_gallery_images WHERE id=?",
      )
        .bind(value.imageId)
        .first(),
    ).toEqual({ status: "ready" });
    const key = await env.DB.prepare(
      "SELECT storage_key AS key FROM client_gallery_images WHERE id=?",
    )
      .bind(value.imageId)
      .first<{ key: string }>();
    expect(key!.key).toMatch(/^client-galleries\//);
    expect((await env.ORIGINALS.head(key!.key))!.size).toBe(PNG.length);
    expect(
      (
        await exports.default.fetch(
          privateRequest("/media/" + value.imageId + "/thumb"),
        )
      ).status,
    ).toBe(404);
  });
  it("rejects tampered uploads, foreign intents and expiration without readiness", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const other = await seedGallery(await seedClient(), "draft");
    const value = (await (await intent(gallery)).json()) as Intent;
    expect(
      (
        await exports.default.fetch(
          privateRequest(
            "/admin/api/albuns-privados/" +
              other +
              "/uploads/" +
              value.intentId +
              "/complete",
            "POST",
          ),
        )
      ).status,
    ).toBe(404);
    const tampered = new Uint8Array(PNG.length);
    tampered.fill(65);
    expect((await upload(value, tampered)).status).toBe(400);
    await env.DB.prepare(
      "UPDATE client_gallery_upload_intents SET expires_at='2000-01-01T00:00:00Z' WHERE id=?",
    )
      .bind(value.intentId)
      .run();
    expect((await upload(value)).status).toBe(409);
    expect(
      await env.DB.prepare(
        "SELECT status FROM client_gallery_images WHERE id=?",
      )
        .bind(value.imageId)
        .first(),
    ).not.toEqual({ status: "ready" });
  });
  it("rejects a corrupt raster even when its header exposes valid dimensions", async () => {
    const gallery = await seedGallery(await seedClient(), "draft");
    const corrupt = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=",
      ),
      (c) => c.charCodeAt(0),
    );
    const value = (await (
      await intent(gallery, corrupt.length)
    ).json()) as Intent;
    expect((await upload(value, corrupt)).status).toBe(200);
    expect(
      (
        await exports.default.fetch(
          privateRequest(
            "/admin/api/albuns-privados/" +
              gallery +
              "/uploads/" +
              value.intentId +
              "/complete",
            "POST",
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      await env.DB.prepare(
        "SELECT status FROM client_gallery_images WHERE id=?",
      )
        .bind(value.imageId)
        .first(),
    ).toEqual({ status: "failed" });
  });
});

describe("private media authorization", () => {
  beforeAll(bootstrapPrivateDb);

  it("uses R2 metadata only for authorized HEAD requests", async () => {
    const gallery = await seedGallery(await seedClient());
    const imageId = await seedReadyImage(gallery);
    const stored = await env.DB.prepare(
      "SELECT storage_key AS storageKey FROM client_gallery_images WHERE id=?",
    )
      .bind(imageId)
      .first<{ storageKey: string }>();
    expect(stored).not.toBeNull();
    await env.ORIGINALS.put(stored!.storageKey, PNG, {
      httpMetadata: { contentType: "image/png" },
    });
    const metadataOnlyBucket = new Proxy(env.ORIGINALS, {
      get(target, key) {
        if (key === "get")
          return () => {
            throw new Error("HEAD must not read original photo bytes");
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const metadataOnlyImages = {
      input: () => {
        throw new Error("HEAD must not transform photo bytes");
      },
    };
    const isolated = {
      ...env,
      ORIGINALS: metadataOnlyBucket,
      IMAGES: metadataOnlyImages,
    } as unknown as Env;
    const base =
      "http://localhost:8787/admin/api/albuns-privados/" +
      gallery +
      "/images/" +
      imageId;
    for (const preset of ["thumb", "gallery", "download"]) {
      const url = new URL(base + "/" + preset);
      const response = await handlePrivateGalleryRoutes(
        new Request(url, { method: "HEAD" }),
        url,
        isolated,
      );
      expect(response?.status).toBe(200);
      expect(response?.body).toBeNull();
      expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response?.headers.get("X-Robots-Tag")).toContain("noindex");
      expect(response?.headers.get("Content-Disposition")).toContain(
        preset === "download" ? "attachment" : "inline",
      );
    }
  });

  it("authorizes every photo/download and immediately denies cross-client, revoked and unpublished access", async () => {
    const a = await seedClient();
    const b = await seedClient();
    const gallery = await seedGallery(a);
    const value = (await (await intent(gallery)).json()) as Intent;
    expect((await upload(value)).status).toBe(200);
    expect(
      (
        await exports.default.fetch(
          privateRequest(
            "/admin/api/albuns-privados/" +
              gallery +
              "/uploads/" +
              value.intentId +
              "/complete",
            "POST",
          ),
        )
      ).status,
    ).toBe(200);
    const cookieA =
      "punctum_client_session=" +
      (await createClientSession({ id: a, sessionVersion: 1 }, env));
    const cookieB =
      "punctum_client_session=" +
      (await createClientSession({ id: b, sessionVersion: 1 }, env));
    const path =
      "/api/client/galleries/" + gallery + "/images/" + value.imageId;
    expect(
      (await exports.default.fetch(privateRequest(path + "/gallery"))).status,
    ).toBe(404);
    expect(
      (
        await exports.default.fetch(
          privateRequest(path + "/gallery", "GET", undefined, cookieB),
        )
      ).status,
    ).toBe(404);
    const picture = await exports.default.fetch(
      privateRequest(path + "/gallery", "GET", undefined, cookieA),
    );
    expect(picture.status).toBe(200);
    expect(picture.headers.get("Cache-Control")).toBe("private, no-store");
    expect(picture.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(picture.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(picture.headers.has("ETag")).toBe(false);
    expect(
      (
        await exports.default.fetch(
          privateRequest(path + "/download", "GET", undefined, cookieA),
        )
      ).status,
    ).toBe(403);
    await env.DB.prepare(
      "UPDATE client_galleries SET allow_downloads=1 WHERE id=?",
    )
      .bind(gallery)
      .run();
    const download = await exports.default.fetch(
      privateRequest(path + "/download", "GET", undefined, cookieA),
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("Content-Disposition")).toContain("attachment");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(PNG);
    for (const status of ["draft", "archived"]) {
      await env.DB.prepare("UPDATE client_galleries SET status=? WHERE id=?")
        .bind(status, gallery)
        .run();
      expect(
        (
          await exports.default.fetch(
            privateRequest(path + "/gallery", "GET", undefined, cookieA),
          )
        ).status,
      ).toBe(404);
    }
    await env.DB.prepare(
      "UPDATE client_galleries SET status='published' WHERE id=?",
    )
      .bind(gallery)
      .run();
    for (const status of ["pending", "failed"]) {
      await env.DB.prepare(
        "UPDATE client_gallery_images SET status=? WHERE id=?",
      )
        .bind(status, value.imageId)
        .run();
      expect(
        (
          await exports.default.fetch(
            privateRequest(path + "/gallery", "GET", undefined, cookieA),
          )
        ).status,
      ).toBe(404);
    }
    await env.DB.prepare(
      "UPDATE client_gallery_images SET status='ready',deleted_at=datetime('now') WHERE id=?",
    )
      .bind(value.imageId)
      .run();
    expect(
      (
        await exports.default.fetch(
          privateRequest(path + "/gallery", "GET", undefined, cookieA),
        )
      ).status,
    ).toBe(404);
    await env.DB.prepare(
      "UPDATE client_gallery_images SET deleted_at=NULL WHERE id=?",
    )
      .bind(value.imageId)
      .run();
    await env.DB.prepare(
      "UPDATE client_accounts SET session_version=2 WHERE id=?",
    )
      .bind(a)
      .run();
    expect(
      (
        await exports.default.fetch(
          privateRequest(path + "/gallery", "GET", undefined, cookieA),
        )
      ).status,
    ).toBe(404);
    const optimized = await exports.default.fetch(
      privateRequest(
        "/_vinext/image?url=" +
          encodeURIComponent(path + "/gallery") +
          "&w=640&q=75",
        "GET",
        undefined,
        cookieA,
      ),
    );
    expect(optimized.status).toBe(404);
    expect(
      (
        await exports.default.fetch(
          privateRequest(
            "/admin/api/albuns-privados/" +
              gallery +
              "/images/" +
              value.imageId +
              "/thumb",
          ),
        )
      ).status,
    ).toBe(200);
  });
});
