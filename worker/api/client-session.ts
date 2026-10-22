import { z } from "zod";
import {
  createClientSession,
  clientSessionCookie,
  clearClientSessionCookie,
  requireClient,
} from "../client/auth";
import { hashClientPassword, verifyClientPassword } from "../client/passwords";
import { getClientByEmail, getActiveClient } from "../client/repository";
import { privateJson, privateResponse } from "../client/response";
import { assertAllowedOrigin } from "../utils/auth";
import { requireDb } from "../utils/env";
import { AppError } from "../utils/errors";
import { parseJson } from "../client/validation";
import { writeAudit } from "../utils/audit";

const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(180),
    password: z.string().min(1).max(1024),
  })
  .strict();
const DUMMY = {
  passwordHash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  passwordSalt: "AAAAAAAAAAAAAAAAAAAAAA",
  passwordIterations: 310_000,
};
async function loginLimit(request: Request, db: D1Database, email: string) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() + 900_000).toISOString();
  for (const [scope, max] of [
    [`client-login:ip:${ip}`, 50],
    [`client-login:account:${email}`, 10],
  ] as const) {
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope)),
      ),
      (n) => n.toString(16).padStart(2, "0"),
    ).join("");
    const bucket = await db
      .prepare(
        `INSERT INTO rate_limit_buckets (bucket_key,request_count,window_started_at,expires_at)
      VALUES (?,1,?,?) ON CONFLICT(bucket_key) DO UPDATE SET
      request_count=CASE WHEN expires_at<=? THEN 1 ELSE request_count+1 END,
      window_started_at=CASE WHEN expires_at<=? THEN excluded.window_started_at ELSE window_started_at END,
      expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING request_count AS count`,
      )
      .bind(hash, now, expiry, now, now, now)
      .first<{ count: number }>();
    if (!bucket || bucket.count > max)
      throw new AppError(
        429,
        "RATE_LIMITED",
        "Muitas tentativas. Aguarde e tente novamente.",
      );
  }
}
export async function handleClientSessionApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (
    !["/api/client/session", "/api/client/password", "/api/client/me"].includes(
      url.pathname,
    )
  )
    return null;
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  if (url.pathname === "/api/client/session" && request.method === "DELETE")
    return privateJson(
      { ok: true },
      { headers: { "Set-Cookie": clearClientSessionCookie() } },
    );
  if (url.pathname === "/api/client/session" && request.method === "POST") {
    const input = await parseJson(request, loginSchema);
    await loginLimit(request, db, input.email);
    const account = await getClientByEmail(db, input.email);
    const valid = await verifyClientPassword(input.password, account ?? DUMMY);
    if (!account || account.disabledAt || !valid)
      throw new AppError(
        401,
        "CLIENT_LOGIN_FAILED",
        "E-mail ou senha incorretos.",
      );
    const token = await createClientSession(account, env);
    return privateJson(
      { mustChangePassword: Boolean(account.mustChangePassword) },
      { headers: { "Set-Cookie": clientSessionCookie(token) } },
    );
  }
  const identity = await requireClient(request, env, db, {
    allowPasswordChange: true,
  });
  if (url.pathname === "/api/client/me" && request.method === "GET")
    return privateJson({
      client: { id: identity.id, name: identity.name },
      mustChangePassword: identity.mustChangePassword,
    });
  if (url.pathname === "/api/client/password" && request.method === "POST") {
    const input = await parseJson(
      request,
      z.object({ password: z.string().min(12).max(1024) }).strict(),
    );
    const account = await getActiveClient(db, identity.id);
    if (!account)
      throw new AppError(401, "CLIENT_UNAUTHORIZED", "Entre para continuar.");
    if (await verifyClientPassword(input.password, account))
      throw new AppError(
        400,
        "SAME_PASSWORD",
        "Escolha uma senha diferente da senha atual.",
      );
    const c = await hashClientPassword(input.password);
    const updated = await db
      .prepare(
        `UPDATE client_accounts SET password_hash=?,password_salt=?,password_iterations=?,
      must_change_password=0,session_version=session_version+1,updated_at=? WHERE id=? AND session_version=? AND disabled_at IS NULL
      RETURNING session_version AS sessionVersion`,
      )
      .bind(
        c.passwordHash,
        c.passwordSalt,
        c.passwordIterations,
        new Date().toISOString(),
        identity.id,
        identity.sessionVersion,
      )
      .first<{ sessionVersion: number }>();
    if (!updated)
      throw new AppError(401, "CLIENT_UNAUTHORIZED", "Entre novamente.");
    const token = await createClientSession(
      { id: identity.id, sessionVersion: updated.sessionVersion },
      env,
    );
    await writeAudit(
      db,
      "client:" + identity.id,
      "client.password_changed",
      "client_account",
      identity.id,
    );
    return privateJson(
      { ok: true },
      { headers: { "Set-Cookie": clientSessionCookie(token) } },
    );
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
}
export async function protectClientPage(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (
    !/^\/albuns(?:\/|$)/.test(url.pathname) ||
    url.pathname === "/albuns/entrar"
  )
    return null;
  try {
    const identity = await requireClient(request, env, requireDb(env), {
      allowPasswordChange: true,
    });
    if (identity.mustChangePassword && url.pathname !== "/albuns/trocar-senha")
      return privateResponse(
        new Response(null, {
          status: 303,
          headers: { Location: "/albuns/trocar-senha" },
        }),
      );
  } catch (e) {
    if (e instanceof AppError && (e.status === 401 || e.status === 403))
      return privateResponse(
        new Response(null, {
          status: 303,
          headers: { Location: "/albuns/entrar" },
        }),
      );
    throw e;
  }
  return null;
}
