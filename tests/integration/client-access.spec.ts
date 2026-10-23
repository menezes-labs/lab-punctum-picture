import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { accessConfiguration, verifyClientAccessIdentity } from "../../worker/client/access";
import { createClientSession, requireClient } from "../../worker/client/auth";
import { clientAuthMode } from "../../worker/client/auth-mode";
import { handleClientSessionApi } from "../../worker/api/client-session";
import { handleClientAdminApi } from "../../worker/api/client-admin";
import { handlePrivateGalleryRoutes } from "../../worker/client/router";
import { bootstrapPrivateDb, privateRequest, seedClient } from "../integration/client-fixture";

function accessEnv(): Env {
  return {
    ...env,
    CLIENT_AUTH_MODE: "access",
    CLIENT_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    CLIENT_ACCESS_AUD: "private-albums-audience-for-tests",
  } as Env;
}

describe("private client Access Free alternative", () => {
  beforeAll(bootstrapPrivateDb);

  it("validates signed Access JWT identity, issuer, audience and email", async () => {
    const config = accessConfiguration(accessEnv());
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-key";
    jwk.use = "sig";
    jwk.alg = "RS256";
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = async (props: { issuer?: string; audience?: string; email?: string }) =>
      new SignJWT({ email: props.email ?? "TEST@EXAMPLE.COM" })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(props.issuer ?? config.issuer)
        .setAudience(props.audience ?? config.audience)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    await expect(verifyClientAccessIdentity(await sign({}), accessEnv(), keys)).resolves.toBe(
      "test@example.com",
    );
    for (const token of [
      await sign({ issuer: "https://attacker.cloudflareaccess.com" }),
      await sign({ audience: "another-application" }),
      await sign({ email: "not-an-email" }),
    ]) {
      await expect(verifyClientAccessIdentity(token, accessEnv(), keys)).rejects.toMatchObject({
        status: 401,
        code: "CLIENT_ACCESS_INVALID",
      });
    }
    await expect(
      verifyClientAccessIdentity(null, accessEnv(), keys),
    ).rejects.toMatchObject({ code: "CLIENT_ACCESS_REQUIRED" });
  });

  it("accepts only a Cloudflare Access team domain and configured AUD", () => {
    expect(clientAuthMode(accessEnv())).toBe("access");
    expect(clientAuthMode(env)).toBe("password");
    expect(() =>
      accessConfiguration({
        ...accessEnv(),
        CLIENT_ACCESS_TEAM_DOMAIN: "attacker.example",
      } as Env),
    ).toThrowError("Configuração de acesso indisponível.");
  });

  it("never derives a password when creating an Access-only customer", async () => {
    const email = crypto.randomUUID() + "@example.com";
    const url = new URL("http://localhost:8787/admin/api/clientes");
    const created = await handleClientAdminApi(
      privateRequest(url.pathname, "POST", { name: "Access Example", email }),
      url,
      accessEnv(),
    );
    expect(created?.status).toBe(201);
    const result = (await created!.json()) as { client: { id: string }; temporaryPassword?: string; authMode: string };
    expect(result.authMode).toBe("access");
    expect(result.temporaryPassword).toBeUndefined();
    const stored = await env.DB.prepare(
      "SELECT password_hash AS passwordHash,must_change_password AS mustChangePassword FROM client_accounts WHERE id=?",
    )
      .bind(result.client.id)
      .first<{ passwordHash: string; mustChangePassword: number }>();
    expect(stored).toEqual({ passwordHash: "ACCESS_ONLY", mustChangePassword: 0 });

    await expect(
      handleClientSessionApi(
        privateRequest("/api/client/session", "POST", { email, password: "not-used" }),
        new URL("http://localhost:8787/api/client/session"),
        accessEnv(),
      ),
    ).rejects.toMatchObject({ status: 405 });
    const entry = new URL("http://localhost:8787/albuns/entrar");
    const response = await handlePrivateGalleryRoutes(new Request(entry), entry, accessEnv());
    expect(response?.status).toBe(401);
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("invalidates legacy cookies when the mode becomes Access and clears them on logout", async () => {
    const id = await seedClient();
    const legacy = await createClientSession({ id, sessionVersion: 1 }, env);
    await expect(
      requireClient(
        privateRequest("/api/client/me", "GET", undefined, "punctum_client_session=" + legacy),
        accessEnv(),
        env.DB,
      ),
    ).rejects.toMatchObject({ status: 401 });
    const out = await handleClientSessionApi(
      privateRequest("/api/client/session", "DELETE"),
      new URL("http://localhost:8787/api/client/session"),
      accessEnv(),
    );
    expect(out?.status).toBe(200);
    expect((await out!.json()) as { logoutUrl: string }).toMatchObject({
      logoutUrl: "/cdn-cgi/access/logout",
    });
    expect(out?.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
