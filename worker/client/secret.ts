import { requiredEnvString } from "../utils/env";
import { AppError } from "../utils/errors";

export function requireClientSessionSecret(env: Env): string {
  const secret = requiredEnvString(env, "CLIENT_SESSION_SECRET");
  if (
    new TextEncoder().encode(secret).byteLength < 32 ||
    secret === Reflect.get(env, "ADMIN_SESSION_SECRET")
  )
    throw new AppError(
      503,
      "CLIENT_SECRET_INVALID",
      "Configuração de acesso indisponível.",
    );
  return secret;
}
