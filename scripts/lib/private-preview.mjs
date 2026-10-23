export const PRIVATE_PREVIEW_NAMES = Object.freeze({
  worker: "punctum-picture-albums-qa",
  database: "punctum-picture-albums-qa",
  restoreDatabase: "punctum-picture-albums-qa-restore",
  originals: "punctum-picture-albums-qa-originals",
  restoreOriginals: "punctum-picture-albums-qa-restored",
  backups: "punctum-picture-albums-qa-backups",
});
const PRODUCTION_DATABASES = new Set([
  "22697f13-7484-41e3-9441-f7b902c6577a",
  "4e959036-a3f0-4faf-bda2-fca9b4c5e984",
]);
export function privatePreviewConfig(
  base,
  { databaseId, origin, restored = false },
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(databaseId ?? "") ||
    PRODUCTION_DATABASES.has(databaseId)
  )
    throw new Error("Preview requires an isolated database.");
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".workers.dev") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Preview requires its dedicated workers.dev origin.");
  const vars = { ...base.vars };
  const authMode = vars.CLIENT_AUTH_MODE ?? "password";
  if (!["password", "access"].includes(authMode))
    throw new Error("Invalid private auth mode.");
  for (const key of Object.keys(vars))
    if (/SECRET|PASSWORD|TOKEN|KEY/.test(key)) delete vars[key];
  const config = {
    ...base,
    name: PRIVATE_PREVIEW_NAMES.worker,
    account_id: "257bca437616da74ece1ce4bbaf0bd89",
    workers_dev: true,
    ...(authMode === "password" ? { limits: { cpu_ms: 2000 } } : {}),
    preview_urls: false,
    routes: [],
    triggers: { crons: [] },
    vars: {
      ...vars,
      ENVIRONMENT: "preview",
      PRIVATE_GALLERIES_ENABLED: "true",
      CLIENT_AUTH_MODE: authMode,
      ...(authMode === "access"
        ? {
            CLIENT_ACCESS_TEAM_DOMAIN: "qa-placeholder.cloudflareaccess.com",
            CLIENT_ACCESS_AUD: "qa-access-not-configured",
          }
        : {}),
      SITE_ORIGIN: url.origin,
      PUBLIC_SITE_URL: url.origin,
      ADMIN_ALLOWED_EMAILS: "qa@punctum.invalid",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: restored
          ? PRIVATE_PREVIEW_NAMES.restoreDatabase
          : PRIVATE_PREVIEW_NAMES.database,
        database_id: databaseId,
        migrations_dir: "../../migrations",
      },
    ],
    r2_buckets: [
      {
        binding: "ORIGINALS",
        bucket_name: restored
          ? PRIVATE_PREVIEW_NAMES.restoreOriginals
          : PRIVATE_PREVIEW_NAMES.originals,
      },
      { binding: "BACKUPS", bucket_name: PRIVATE_PREVIEW_NAMES.backups },
    ],
    images: { binding: "IMAGES" },
  };
  if (authMode === "access") delete config.limits;
  return config;
}

export async function waitForPreviewStatus({
  probe,
  expected = 200,
  transient = [403],
  pause,
  attempts = 30,
}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const status = await probe();
    if (status === expected) return;
    if (!transient.includes(status))
      throw new Error("Preview readiness failed: HTTP " + status);
    if (attempt + 1 < attempts) await pause();
  }
  throw new Error("Preview authentication/binding propagation timed out.");
}
