import { AppError } from "../utils/errors";
import { requireClientSessionSecret } from "./secret";
import { clientAuthMode } from "./auth-mode";
import { base64Url, unbase64Url } from "./passwords";
import { getActiveClient } from "./repository";
export const CLIENT_SESSION_TTL = 43_200;
const COOKIE = "punctum_client_session";
export type ClientIdentity = {
  id: string;
  name: string;
  mustChangePassword: boolean;
  sessionVersion: number;
};
async function key(env: Env) {
  const secret = requireClientSessionSecret(env);
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function createClientSession(
  identity: { id: string; sessionVersion: number },
  env: Env,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: identity.id,
        version: identity.sessionVersion,
        iat: now,
        exp: now + CLIENT_SESSION_TTL,
        audience: clientAuthMode(env) === "access" ? "punctum-client-access" : "punctum-client",
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await key(env),
      new TextEncoder().encode(payload),
    ),
  );
  return payload + "." + base64Url(signature);
}
export function clientSessionCookie(token: string) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${CLIENT_SESSION_TTL}; HttpOnly; Secure; SameSite=Strict`;
}
export function clearClientSessionCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
export async function requireClient(
  request: Request,
  env: Env,
  db: D1Database,
  options: { allowPasswordChange?: boolean } = {},
): Promise<ClientIdentity> {
  const token = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  const denied = () =>
    new AppError(401, "CLIENT_UNAUTHORIZED", "Entre para continuar.");
  if (!token || token.length > 2048) throw denied();
  let payload: {
    sub: string;
    version: number;
    exp: number;
    iat: number;
    audience: string;
  };
  try {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) throw denied();
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(env),
      new Uint8Array(unbase64Url(signature)).buffer,
      new TextEncoder().encode(body),
    );
    if (!valid) throw denied();
    payload = JSON.parse(new TextDecoder().decode(unbase64Url(body)));
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof payload.sub !== "string" ||
      !Number.isInteger(payload.version) ||
      !Number.isInteger(payload.exp) ||
      !Number.isInteger(payload.iat) ||
      payload.audience !==
        (clientAuthMode(env) === "access" ? "punctum-client-access" : "punctum-client") ||
      payload.exp <= now ||
      payload.iat > now + 30 ||
      payload.exp - payload.iat > CLIENT_SESSION_TTL
    )
      throw denied();
  } catch {
    throw denied();
  }
  const account = await getActiveClient(db, payload.sub);
  if (!account || account.sessionVersion !== payload.version) throw denied();
  if (account.mustChangePassword && !options.allowPasswordChange)
    throw new AppError(
      403,
      "PASSWORD_CHANGE_REQUIRED",
      "Troque sua senha para continuar.",
    );
  return {
    id: account.id,
    name: account.name,
    mustChangePassword: Boolean(account.mustChangePassword),
    sessionVersion: account.sessionVersion,
  };
}
