import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createClientSession } from "../../worker/client/auth";
import { requireClientSessionSecret } from "../../worker/client/secret";

describe("private-gallery session secret gate", () => {
  it("requires at least 32 UTF-8 bytes and separation from the admin key", async () => {
    const invalid = [
      { ...env, CLIENT_SESSION_SECRET: "x".repeat(31) },
      { ...env, CLIENT_SESSION_SECRET: env.ADMIN_SESSION_SECRET },
    ] as Env[];
    for (const candidate of invalid) {
      expect(() => requireClientSessionSecret(candidate)).toThrowError(
        "Configuração de acesso indisponível.",
      );
      await expect(
        createClientSession(
          { id: crypto.randomUUID(), sessionVersion: 1 },
          candidate,
        ),
      ).rejects.toMatchObject({
        status: 503,
        code: "CLIENT_SECRET_INVALID",
      });
    }
  });

  it("accepts a distinct 32-byte minimum and the isolated preview secret", async () => {
    const minimum = { ...env, CLIENT_SESSION_SECRET: "z".repeat(32) } as Env;
    expect(requireClientSessionSecret(minimum)).toHaveLength(32);
    expect(requireClientSessionSecret(env)).toBe(env.CLIENT_SESSION_SECRET);
    await expect(
      createClientSession({ id: crypto.randomUUID(), sessionVersion: 1 }, env),
    ).resolves.toContain(".");
  });
});
