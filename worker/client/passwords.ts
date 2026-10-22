export type ClientCredential = { passwordHash: string; passwordSalt: string; passwordIterations: number };
export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unbase64Url(value: string): Uint8Array {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}
async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({
    name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt).buffer, iterations,
  }, key, 256));
}
export function generateTemporaryPassword(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(24)));
}
export async function hashClientPassword(password: string): Promise<ClientCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 310_000;
  return { passwordHash: base64Url(await derive(password, salt, iterations)), passwordSalt: base64Url(salt), passwordIterations: iterations };
}
export async function verifyClientPassword(password: string, credential: ClientCredential): Promise<boolean> {
  try {
    if (credential.passwordIterations !== 310_000) return false;
    const expected = unbase64Url(credential.passwordHash);
    const actual = await derive(password, unbase64Url(credential.passwordSalt), credential.passwordIterations);
    if (expected.length !== actual.length) return false;
    let difference = 0;
    for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ expected[i];
    return difference === 0;
  } catch { return false; }
}
