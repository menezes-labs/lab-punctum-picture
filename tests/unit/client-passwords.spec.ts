import { describe, expect, it, vi } from "vitest";
import {
  base64Url,
  unbase64Url,
  hashClientPassword,
  verifyClientPassword,
  generateTemporaryPassword,
} from "../../worker/client/passwords";
import {
  clientSessionCookie,
  clearClientSessionCookie,
} from "../../worker/client/auth";

describe("client credentials", () => {
  it("derives unique 310000 iteration credentials and rejects wrong passwords", async () => {
    const a = await hashClientPassword("correct password 123");
    const b = await hashClientPassword("correct password 123");
    expect(a.passwordIterations).toBe(310000);
    expect(a.passwordHash).not.toBe("correct password 123");
    expect(a.passwordSalt).not.toBe(b.passwordSalt);
    expect(await verifyClientPassword("correct password 123", a)).toBe(true);
    expect(await verifyClientPassword("incorrect", a)).toBe(false);
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
    expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(24);
  });
  it("retains standard PBKDF2 hashes when the edge WebCrypto cap is enforced", async () => {
    const native = crypto.subtle.deriveBits.bind(crypto.subtle);
    const capped = vi
      .spyOn(crypto.subtle, "deriveBits")
      .mockImplementation((algorithm, key, length) => {
        if (
          typeof algorithm === "object" &&
          "iterations" in algorithm &&
          Number(algorithm.iterations) > 100000
        )
          return Promise.reject(
            new Error(
              "Pbkdf2 failed: iteration counts above 100000 are not supported",
            ),
          );
        return native(algorithm, key, length);
      });
    try {
      const password = "synthetic edge compatibility password";
      const credential = await hashClientPassword(password);
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const expected = new Uint8Array(
        await native(
          {
            name: "PBKDF2",
            hash: "SHA-256",
            salt: unbase64Url(credential.passwordSalt).buffer as ArrayBuffer,
            iterations: 310000,
          },
          key,
          256,
        ),
      );
      expect(credential.passwordHash).toBe(base64Url(expected));
      expect(await verifyClientPassword(password, credential)).toBe(true);
      expect(await verifyClientPassword("incorrect", credential)).toBe(false);
    } finally {
      capped.mockRestore();
    }
  });
  it("uses a client-only hardened cookie", () => {
    expect(clientSessionCookie("token")).toContain(
      "punctum_client_session=token",
    );
    for (const value of [
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/",
      "Max-Age=43200",
    ])
      expect(clientSessionCookie("token")).toContain(value);
    expect(clearClientSessionCookie()).toContain("Max-Age=0");
  });
});
