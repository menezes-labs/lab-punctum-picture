import {
  hashClientPassword,
  verifyClientPassword,
  base64Url,
  type ClientCredential,
} from "./passwords";
import { envString } from "../utils/env";
import { AppError } from "../utils/errors";

const PATH = "/internal/punctum-password/v1";
type BridgeFetch = typeof fetch;

function providerConfig(env: Env) {
  const mode = envString(env, "CLIENT_PASSWORD_BACKEND") ?? "local";
  if (mode === "local") return null;
  if (mode !== "hostinger")
    throw new AppError(503, "PASSWORD_BACKEND_INVALID", "Configuração de senha indisponível.");
  const text = envString(env, "CLIENT_PASSWORD_SERVICE_URL");
  const secret = envString(env, "CLIENT_PASSWORD_SERVICE_SECRET");
  if (!text || !secret || new TextEncoder().encode(secret).length < 32)
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  let url: URL;
  try { url = new URL(text); }
  catch { throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível."); }
  if (
    url.protocol !== "https:" || !url.hostname ||
    url.username || url.password || url.search || url.hash || url.pathname !== PATH
  ) throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  return { url: url.href, secret };
}
async function callBridge(
  payload: { operation: "hash" | "verify"; password: string; credential?: ClientCredential },
  env: Env,
  fetcher: BridgeFetch,
) {
  const config = providerConfig(env);
  if (!config) throw new AppError(503, "PASSWORD_BACKEND_INVALID", "Serviço de senhas indisponível.");
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();
  const message = new TextEncoder().encode(timestamp + "\n" + nonce + "\n" + body);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(config.secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = base64Url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, message)),
  );
  let response: Response;
  try {
    response = await fetcher(config.url, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Punctum-Timestamp": timestamp,
        "X-Punctum-Nonce": nonce,
        "X-Punctum-Signature": signature,
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  }
  if (!response.ok)
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  let data: unknown;
  try {
    if (Number(response.headers.get("content-length") ?? "0") > 2048)
      throw new Error("response too large");
    const text = await response.text();
    if (text.length > 2048) throw new Error("response too large");
    data = JSON.parse(text);
  } catch {
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  }
  return data;
}
function isCredential(value: unknown): value is ClientCredential {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.passwordHash === "string" && /^[A-Za-z0-9_-]{43}$/.test(c.passwordHash) &&
    typeof c.passwordSalt === "string" && /^[A-Za-z0-9_-]{22}$/.test(c.passwordSalt) &&
    c.passwordIterations === 310_000
  );
}
export async function hashClientPasswordWithProvider(
  password: string,
  env: Env,
  fetcher: BridgeFetch = fetch,
): Promise<ClientCredential> {
  if (!providerConfig(env)) return hashClientPassword(password);
  const data = await callBridge({ operation: "hash", password }, env, fetcher);
  const credential = (data as { credential?: unknown } | null)?.credential;
  if (!isCredential(credential))
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  return credential;
}
export async function verifyClientPasswordWithProvider(
  password: string,
  credential: ClientCredential,
  env: Env,
  fetcher: BridgeFetch = fetch,
): Promise<boolean> {
  if (!providerConfig(env)) return verifyClientPassword(password, credential);
  const data = await callBridge({ operation: "verify", password, credential }, env, fetcher);
  const valid = (data as { valid?: unknown } | null)?.valid;
  if (typeof valid !== "boolean")
    throw new AppError(503, "PASSWORD_BACKEND_UNAVAILABLE", "Serviço de senhas indisponível.");
  return valid;
}
