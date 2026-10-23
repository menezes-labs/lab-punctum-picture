import { AppError } from "../utils/errors";
import { envString } from "../utils/env";

export function clientAuthMode(env: Env): "password" | "access" {
  const mode = envString(env, "CLIENT_AUTH_MODE") ?? "password";
  if (mode === "password" || mode === "access") return mode;
  throw new AppError(
    503,
    "CLIENT_AUTH_MODE_INVALID",
    "Configuração de acesso indisponível.",
  );
}
