import { describe, expect, it } from "vitest";
import { hashClientPassword, verifyClientPassword, generateTemporaryPassword } from "../../worker/client/passwords";
import { clientSessionCookie, clearClientSessionCookie } from "../../worker/client/auth";

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
  it("uses a client-only hardened cookie", () => {
    expect(clientSessionCookie("token")).toContain("punctum_client_session=token");
    for (const value of ["HttpOnly","Secure","SameSite=Strict","Path=/","Max-Age=43200"]) expect(clientSessionCookie("token")).toContain(value);
    expect(clearClientSessionCookie()).toContain("Max-Age=0");
  });
});
