// Read-only Cloudflare Access QA discovery. Never print credentials or raw API responses.
import { mkdir, writeFile } from "node:fs/promises";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.PRIVATE_GALLERY_PREVIEW !== "true") {
  throw new Error("Access discovery is permitted only in the isolated GitHub QA workflow.");
}
const account = "257bca437616da74ece1ce4bbaf0bd89";
if (process.env.CLOUDFLARE_ACCOUNT_ID !== account) {
  throw new Error("Unexpected Cloudflare account; Access discovery aborted.");
}
const token = process.env.CLOUDFLARE_API_TOKEN;
const globalKey = process.env.CLOUDFLARE_GLOBAL_API_KEY;
const email = process.env.CLOUDFLARE_AUTH_EMAIL;
const headers =
  globalKey && email
    ? { "X-Auth-Key": globalKey, "X-Auth-Email": email }
    : token
      ? { Authorization: "Bearer " + token }
      : null;
if (!headers) throw new Error("No Cloudflare API credential available.");

const api = "https://api.cloudflare.com/client/v4/accounts/" + account;
const endpoints = {
  organization: "/access/organizations",
  applications: "/access/apps",
  identityProviders: "/access/identity_providers",
};
const report = {
  mode: globalKey && email ? "global-api-key" : "api-token",
  productionTouched: false,
  readOnly: true,
  access: {},
};
const results = {};
for (const [name, path] of Object.entries(endpoints)) {
  let result = { status: 0, success: false };
  try {
    const response = await fetch(api + path, { headers });
    const data = await response.json().catch(() => ({}));
    result = { status: response.status, success: response.ok && data.success === true };
    if (result.success) results[name] = data.result;
  } catch {
    result = { status: 0, success: false };
  }
  report.access[name] = result;
}
const normalized = (value) =>
  typeof value === "string" && /^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(value)
    ? value
    : null;
const org = results.organization ?? {};
report.teamDomain = normalized(org.auth_domain ?? org.domain ?? "");
const apps = Array.isArray(results.applications) ? results.applications : [];
const qaTarget = "punctum-picture-albums-qa.menezesx2k26.workers.dev/albuns/entrar";
const matched = apps.find((app) =>
  app?.type === "self_hosted" &&
  (app.domain === qaTarget ||
    app.destinations?.some((destination) => destination.uri === qaTarget))
);
report.qaApplication = matched?.id && matched?.aud
  ? { configured: true, hasAudience: true }
  : { configured: false, hasAudience: false };
const idps = Array.isArray(results.identityProviders) ? results.identityProviders : [];
report.oneTimePinAvailable = idps.some((idp) => idp?.type === "onetimepin");
await mkdir("outputs", { recursive: true });
await writeFile(
  "outputs/private-access-qa-discovery.json",
  JSON.stringify(report, null, 2),
);
console.log("Cloudflare Access permission discovery (read-only):", JSON.stringify(report));
