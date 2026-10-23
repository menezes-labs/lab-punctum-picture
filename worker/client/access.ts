import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { createClientSession, clientSessionCookie } from "./auth";
import { getClientByEmail } from "./repository";
import { privateResponse } from "./response";
import { requiredEnvString, requireDb } from "../utils/env";
import { AppError } from "../utils/errors";

const signingKeys = new Map<string, JWTVerifyGetKey>();
export function accessConfiguration(env: Env) {
  const value = requiredEnvString(env, "CLIENT_ACCESS_TEAM_DOMAIN")
    .trim()
    .toLowerCase()
    .replace(/^https:\/\//, "")
    .replace(/\/$/, "");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/.test(value))
    throw new AppError(
      503,
      "CLIENT_ACCESS_CONFIG_INVALID",
      "Configuração de acesso indisponível.",
    );
  const audience = requiredEnvString(env, "CLIENT_ACCESS_AUD").trim();
  if (audience.length < 8 || audience.length > 256)
    throw new AppError(
      503,
      "CLIENT_ACCESS_CONFIG_INVALID",
      "Configuração de acesso indisponível.",
    );
  return { issuer: "https://" + value, audience };
}

export async function verifyClientAccessIdentity(
  token: string | null,
  env: Env,
  keySet?: JWTVerifyGetKey,
): Promise<string> {
  const { issuer, audience } = accessConfiguration(env);
  if (!token || token.length > 8192)
    throw new AppError(401, "CLIENT_ACCESS_REQUIRED", "Confirme seu acesso pelo e-mail.");
  const keys =
    keySet ??
    (() => {
      let current = signingKeys.get(issuer);
      if (!current) {
        current = createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs"));
        signingKeys.set(issuer, current);
      }
      return current;
    })();
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience,
      algorithms: ["RS256"],
    });
    if (
      typeof payload.email !== "string" ||
      payload.email.length > 180 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
    )
      throw new Error("Access email claim missing");
    return payload.email.toLowerCase();
  } catch {
    throw new AppError(
      401,
      "CLIENT_ACCESS_INVALID",
      "Não foi possível confirmar seu acesso.",
    );
  }
}

export async function handleClientAccessEntry(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "GET")
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
  const email = await verifyClientAccessIdentity(
    request.headers.get("cf-access-jwt-assertion"),
    env,
  );
  const account = await getClientByEmail(requireDb(env), email);
  if (!account || account.disabledAt || account.mustChangePassword)
    throw new AppError(
      403,
      "CLIENT_ACCESS_DENIED",
      "Este e-mail não está habilitado para um álbum privado.",
    );
  const token = await createClientSession(account, env);
  return privateResponse(
    new Response(null, {
      status: 303,
      headers: {
        Location: "/albuns",
        "Set-Cookie": clientSessionCookie(token),
      },
    }),
  );
}
