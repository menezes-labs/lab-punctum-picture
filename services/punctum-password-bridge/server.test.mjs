import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createPasswordBridgeServer, BRIDGE_PATH } from "./server.mjs";

const secret = "testing-only-long-secret-for-password-bridge!";
let server;
let base;
before(async () => {
  server = createPasswordBridgeServer({ secret });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });
async function send(operation, password, credential, overrides = {}) {
  const payload = JSON.stringify({ operation, password, ...(credential ? { credential } : {}) });
  const timestamp = String(overrides.timestamp ?? Date.now());
  const nonce = overrides.nonce ?? randomUUID();
  const signature = createHmac("sha256", overrides.secret ?? secret)
    .update(timestamp + "\n" + nonce + "\n" + payload)
    .digest("base64url");
  const response = await fetch(base + BRIDGE_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Punctum-Timestamp": timestamp,
      "X-Punctum-Nonce": nonce,
      "X-Punctum-Signature": overrides.signature ?? signature,
    },
    body: payload,
  });
  return { status: response.status, json: await response.json() };
}
test("creates and verifies PBKDF2-SHA256/310000 credentials", async () => {
  const hashed = await send("hash", "temporary-strong-password");
  assert.equal(hashed.status, 200);
  assert.equal(hashed.json.credential.passwordIterations, 310000);
  assert.match(hashed.json.credential.passwordSalt, /^[A-Za-z0-9_-]{22}$/);
  assert.match(hashed.json.credential.passwordHash, /^[A-Za-z0-9_-]{43}$/);
  const yes = await send("verify", "temporary-strong-password", hashed.json.credential);
  const no = await send("verify", "incorrect-password", hashed.json.credential);
  assert.deepEqual(yes, { status: 200, json: { valid: true } });
  assert.deepEqual(no, { status: 200, json: { valid: false } });
});
test("rejects absent or incorrect HMAC signature and stale request", async () => {
  const invalid = await send("hash", "password", undefined, { secret: "a-different-secret-with-no-authorization" });
  assert.equal(invalid.status, 401);
  const stale = await send("hash", "password", undefined, { timestamp: Date.now() - 120_000 });
  assert.equal(stale.status, 401);
  const unauthenticated = await fetch(base + BRIDGE_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "hash", password: "password" }),
  });
  assert.equal(unauthenticated.status, 401);
});
test("rejects replay and malformed credential; never returns a session", async () => {
  const nonce = randomUUID();
  const first = await send("hash", "password", undefined, { nonce });
  const second = await send("hash", "password", undefined, { nonce });
  assert.equal(first.status, 200);
  assert.equal(second.status, 401);
  const malformed = await send("verify", "password", {
    passwordHash: "bad", passwordSalt: "bad", passwordIterations: 1,
  });
  assert.equal(malformed.status, 400);
  assert.equal(first.json.token, undefined);
});
test("rejects oversized payloads and invalid routes without leaking implementation", async () => {
  const bad = await fetch(base + BRIDGE_PATH, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "x".repeat(5000),
  });
  assert.equal(bad.status, 413);
  const notFound = await fetch(base + "/internal/other", { method: "POST" });
  assert.equal(notFound.status, 404);
  const health = await fetch(base + "/healthz");
  assert.equal(health.status, 200);
});
