import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHmac, createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  privatePreviewConfig,
  waitForPreviewStatus,
  PRIVATE_PREVIEW_NAMES as names,
} from "./lib/private-preview.mjs";

assert.equal(
  process.env.PRIVATE_GALLERY_PREVIEW,
  "true",
  "This command is preview-only.",
);
assert.equal(
  process.env.GITHUB_ACTIONS,
  "true",
  "Run this credential-masking pilot only in GitHub Actions.",
);
const account = "257bca437616da74ece1ce4bbaf0bd89";
assert.equal(
  process.env.CLOUDFLARE_ACCOUNT_ID,
  account,
  "Unexpected Cloudflare account.",
);
const token = process.env.CLOUDFLARE_API_TOKEN;
const dbToken = process.env.CLOUDFLARE_D1_API_TOKEN;
assert.ok(token && dbToken, "Missing preview deployment credentials.");
const generated = "dist/server/wrangler.json";
const report = {
  status: "running",
  worker: names.worker,
  productionTouched: false,
  checks: [],
};
await mkdir("outputs", { recursive: true });
const record = (value) => {
  report.checks.push(value);
  console.log("PASS " + value);
};
async function api(path, { method = "GET", body, database = false } = {}) {
  const response = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + account + path,
    {
      method,
      headers: {
        Authorization: "Bearer " + (database ? dbToken : token),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(
      "Cloudflare " +
        method +
        " " +
        path +
        " failed: HTTP " +
        response.status +
        " codes " +
        JSON.stringify(result.errors?.map((e) => e.code)),
    );
  return result.result;
}
function wrangler(args, input, database = false) {
  const result = spawnSync("node_modules/.bin/wrangler", args, {
    encoding: "utf8",
    input,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: database ? dbToken : token,
      WRANGLER_SEND_METRICS: "false",
    },
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    console.error(result.stdout);
    throw new Error("Wrangler operation failed: " + args.slice(0, 2).join(" "));
  }
}
async function database(name) {
  const list = await api(
    "/d1/database?per_page=100&name=" + encodeURIComponent(name),
    { database: true },
  );
  const existing = list.find((d) => d.name === name);
  return (
    existing ??
    api("/d1/database", { method: "POST", database: true, body: { name } })
  );
}
async function query(id, sql, params = []) {
  const result = await api("/d1/database/" + id + "/query", {
    method: "POST",
    database: true,
    body: { sql, params },
  });
  return result[0]?.results ?? [];
}
const sign = (payload, secret) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
};
const mask = (value) => console.log("::add-mask::" + value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  // Check permissions before any resource creation. All names are dedicated to this QA.
  const subdomain = await api("/workers/subdomain");
  const buckets = await api("/r2/buckets");
  await api("/d1/database?per_page=100", { database: true });
  const origin =
    "https://" + names.worker + "." + subdomain.subdomain + ".workers.dev";
  report.previewUrl = origin;
  const source = await database(names.database);
  const restored = await database(names.restoreDatabase);
  assert.notEqual(source.uuid, restored.uuid);
  for (const name of [names.originals, names.restoreOriginals, names.backups]) {
    if (!buckets.buckets.some((b) => b.name === name))
      await api("/r2/buckets", { method: "POST", body: { name } });
    const managed = await api("/r2/buckets/" + name + "/domains/managed");
    assert.equal(managed.enabled, false, "QA buckets must remain private.");
  }
  record("isolated D1 databases and private R2 buckets");
  const originalConfig = JSON.parse(await readFile(generated, "utf8"));
  const configure = async (databaseId, restore = false) => {
    await writeFile(
      generated,
      JSON.stringify(
        privatePreviewConfig(originalConfig, {
          databaseId,
          origin,
          restored: restore,
        }),
      ),
    );
  };
  for (const [db, restore] of [
    [source, false],
    [restored, true],
  ]) {
    await configure(db.uuid, restore);
    wrangler(
      [
        "d1",
        "migrations",
        "apply",
        restore ? names.restoreDatabase : names.database,
        "--remote",
        "--config",
        generated,
      ],
      undefined,
      true,
    );
  }
  await configure(source.uuid);
  wrangler(["deploy", "--config", generated]);
  const adminSecret = randomBytes(32).toString("base64url");
  const clientSecret = randomBytes(32).toString("base64url");
  const password = randomBytes(24).toString("base64url");
  for (const value of [adminSecret, clientSecret, password]) mask(value);
  wrangler(
    ["secret", "bulk", "--config", generated],
    JSON.stringify({
      ADMIN_SESSION_SECRET: adminSecret,
      CLIENT_SESSION_SECRET: clientSecret,
      ADMIN_PASSWORD_HASH: createHash("sha256").update(password).digest("hex"),
    }),
  );
  const adminCookie =
    "punctum_admin_session=" +
    sign(
      {
        email: "qa@punctum.invalid",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      adminSecret,
    );
  mask(adminCookie);
  async function request(
    path,
    method = "GET",
    body,
    cookie = adminCookie,
    expected = 200,
  ) {
    const response = await fetch(origin + path, {
      method,
      redirect: "manual",
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status !== expected) {
      const failure = await response
        .clone()
        .json()
        .catch(() => ({}));
      const code = failure?.error?.code;
      const safeCode =
        typeof code === "string" && /^[A-Z_]+$/.test(code)
          ? " (" + code + ")"
          : "";
      throw new Error(
        method +
          " " +
          path +
          " expected HTTP " +
          expected +
          ", received " +
          response.status +
          safeCode,
      );
    }
    assert.equal(
      response.headers.get("cache-control"),
      "private, no-store",
      path + " private caching",
    );
    assert.match(
      response.headers.get("x-robots-tag") ?? "",
      /noindex/,
      path + " private indexing",
    );
    return response;
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(origin + "/albuns/entrar");
    if (response.status === 200) break;
    if (attempt === 11) throw new Error("Preview did not become ready.");
    await sleep(1000);
  }
  await request("/albuns/entrar", "GET", undefined, "");
  await request("/albuns", "GET", undefined, "", 303);
  await waitForPreviewStatus({
    probe: async () =>
      (
        await fetch(origin + "/admin/api/clientes", {
          headers: { Cookie: adminCookie },
        })
      ).status,
    pause: () => sleep(1000),
  });
  record(
    "deployed SSR login, page gate, private headers and rotated admin session",
  );
  const email = "pilot-" + randomUUID() + "@example.invalid";
  const accountData = await (
    await request(
      "/admin/api/clientes",
      "POST",
      { name: "Cliente fictício de homologação", email },
      adminCookie,
      201,
    )
  ).json();
  mask(accountData.temporaryPassword);
  const login = await request(
    "/api/client/session",
    "POST",
    { email, password: accountData.temporaryPassword },
    "",
  );
  const temporaryCookie = login.headers.get("set-cookie").split(";")[0];
  mask(temporaryCookie);
  await request(
    "/api/client/galleries",
    "GET",
    undefined,
    temporaryCookie,
    403,
  );
  const changed = await request(
    "/api/client/password",
    "POST",
    { password },
    temporaryCookie,
  );
  const cookie = changed.headers.get("set-cookie").split(";")[0];
  mask(cookie);
  await request("/api/client/me", "GET", undefined, temporaryCookie, 401);
  record(
    "first-password flow and old-session revocation on Cloudflare runtime",
  );
  const data = await (
    await request(
      "/admin/api/albuns-privados",
      "POST",
      {
        title: "Homologação — dez fotografias",
        clientId: accountData.client.id,
        theme: "ivory",
      },
      adminCookie,
      201,
    )
  ).json();
  const galleryId = data.gallery.id;
  const base = "/admin/api/albuns-privados/" + galleryId;
  const client = "/api/client/galleries/" + galleryId;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==",
    "base64",
  );
  const images = [];
  for (let i = 0; i < 10; i++) {
    const intent = await (
      await request(
        base + "/uploads/intents",
        "POST",
        {
          filename: "ficticia-" + i + ".png",
          mimeType: "image/png",
          sizeBytes: bytes.length,
        },
        adminCookie,
        201,
      )
    ).json();
    const upload = (content) =>
      fetch(intent.uploadUrl, {
        method: "PUT",
        headers: {
          ...intent.requiredHeaders,
          Origin: origin,
          Cookie: adminCookie,
          "Content-Length": String(content.length),
        },
        body: content,
      });
    if (i === 4)
      assert.equal((await upload(Buffer.alloc(bytes.length))).status, 400);
    assert.equal((await upload(bytes)).status, 200);
    await request(base + "/uploads/" + intent.intentId + "/complete", "POST");
    images.push(intent.imageId);
  }
  await request(base + "/cover", "PUT", { imageId: images[0] });
  await request(base + "/publish", "POST");
  const detail = await (await request(client, "GET", undefined, cookie)).json();
  assert.equal(detail.gallery.images.length, 10);
  await request(client + "/favorites/" + images[0], "PUT", undefined, cookie);
  await request(
    client + "/images/" + images[0] + "/download",
    "GET",
    undefined,
    cookie,
    403,
  );
  await request(base, "PATCH", { allowDownloads: true });
  const original = await request(
    client + "/images/" + images[0] + "/download",
    "GET",
    undefined,
    cookie,
  );
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  await request(
    client + "/images/" + images[0] + "/gallery",
    "GET",
    undefined,
    cookie,
  );
  await request(
    client + "/images/" + images[0] + "/gallery",
    "GET",
    undefined,
    "",
    404,
  );
  const publicLeak = await fetch(origin + "/media/" + images[0] + "/gallery");
  assert.equal(publicLeak.status, 404);
  assert.equal(
    (
      await fetch(
        origin +
          "/_vinext/image?url=" +
          encodeURIComponent(client + "/images/" + images[0] + "/gallery") +
          "&w=640&q=75",
        { headers: { Cookie: cookie } },
      )
    ).status,
    404,
  );
  record(
    "ten uploads, isolated retry, publication, favorites, downloads and public-media denial",
  );

  // Restore the private relational domain into another D1 and another private R2 bucket.
  const tables = [
    "client_accounts",
    "client_galleries",
    "client_gallery_images",
    "client_gallery_upload_intents",
    "client_gallery_favorites",
  ];
  let restoredRows = 0;
  for (const table of tables) {
    const rows = await query(source.uuid, "SELECT * FROM " + table);
    for (const row of rows) {
      const columns = Object.keys(row);
      assert.ok(columns.every((c) => /^[a-z_]+$/.test(c)));
      const keys =
        table === "client_gallery_favorites"
          ? ["client_id", "gallery_id", "image_id"]
          : ["id"];
      const updates = columns.filter((c) => !keys.includes(c));
      const sql =
        "INSERT INTO " +
        table +
        " (" +
        columns.join(",") +
        ") VALUES (" +
        columns.map(() => "?").join(",") +
        ") ON CONFLICT(" +
        keys.join(",") +
        ") DO UPDATE SET " +
        updates.map((c) => c + "=excluded." + c).join(",");
      await query(
        restored.uuid,
        sql,
        columns.map((c) => row[c]),
      );
      restoredRows++;
    }
  }
  const objects = await query(
    source.uuid,
    "SELECT gallery_id,storage_key,mime_type FROM client_gallery_images WHERE status='ready'",
  );
  for (let i = 0; i < objects.length; i++) {
    const key = objects[i].storage_key;
    assert.ok(
      key.startsWith("client-galleries/" + objects[i].gallery_id + "/"),
    );
    const file = "outputs/private-object-" + i + ".bin";
    wrangler([
      "r2",
      "object",
      "get",
      names.originals + "/" + key,
      "--file",
      file,
      "--remote",
    ]);
    const originalBytes = await readFile(file);
    wrangler([
      "r2",
      "object",
      "put",
      names.restoreOriginals + "/" + key,
      "--file",
      file,
      "--content-type",
      objects[i].mime_type,
      "--remote",
    ]);
    const restoredFile = "outputs/restored-object-" + i + ".bin";
    wrangler([
      "r2",
      "object",
      "get",
      names.restoreOriginals + "/" + key,
      "--file",
      restoredFile,
      "--remote",
    ]);
    assert.deepEqual(await readFile(restoredFile), originalBytes);
  }
  // A source-only revocation proves subsequent requests actually use restored bindings.
  await query(
    source.uuid,
    "UPDATE client_accounts SET disabled_at=? WHERE id=?",
    [new Date().toISOString(), accountData.client.id],
  );
  await request("/api/client/me", "GET", undefined, cookie, 401);
  await configure(restored.uuid, true);
  wrangler(["deploy", "--config", generated]);
  // Old cookies must remain valid against the restored credential/session rows.
  await waitForPreviewStatus({
    probe: async () =>
      (await fetch(origin + "/api/client/me", { headers: { Cookie: cookie } }))
        .status,
    transient: [401],
    pause: () => sleep(1000),
  });
  const restoredGallery = await (
    await request(client, "GET", undefined, cookie)
  ).json();
  assert.equal(restoredGallery.gallery.images.length, 10);
  assert.equal(
    restoredGallery.gallery.images.find((i) => i.id === images[0]).favorite,
    true,
  );
  for (const id of images) {
    const result = await request(
      client + "/images/" + id + "/download",
      "GET",
      undefined,
      cookie,
    );
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  }
  report.restoredRows = restoredRows;
  report.restoredObjects = objects.length;
  record(
    "D1 and R2 restoration: authenticated gallery, favorite and every original verified byte-for-byte",
  );
  await request(base + "/archive", "POST");
  await request(
    client + "/images/" + images[0] + "/gallery",
    "GET",
    undefined,
    cookie,
    404,
  );
  const reset = await (
    await request(
      "/admin/api/clientes/" + accountData.client.id + "/reset-password",
      "POST",
    )
  ).json();
  mask(reset.temporaryPassword);
  await request("/api/client/me", "GET", undefined, cookie, 401);
  const resetLogin = await request(
    "/api/client/session",
    "POST",
    { email, password: reset.temporaryPassword },
    "",
  );
  const resetCookie = resetLogin.headers.get("set-cookie").split(";")[0];
  mask(resetCookie);
  await request("/api/client/me", "GET", undefined, resetCookie);
  await request("/admin/api/clientes/" + accountData.client.id, "PATCH", {
    disabled: true,
  });
  await request("/api/client/me", "GET", undefined, resetCookie, 401);
  await request(
    "/api/client/session",
    "POST",
    { email, password: reset.temporaryPassword },
    "",
    401,
  );
  record("archive, reset and disabled account revocation after restoration");
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  throw error;
} finally {
  await writeFile(
    "outputs/private-galleries-preview-report.json",
    JSON.stringify(report, null, 2),
  );
}
