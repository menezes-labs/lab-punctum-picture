import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./worker/test-entry.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        assets: {
          directory: "./public",
          binding: "ASSETS",
        },
        bindings: {
          ENVIRONMENT: "local",
          SITE_ORIGIN: "http://localhost:8787",
          PUBLIC_SITE_URL: "http://localhost:8787",
          CLOUDFLARE_TEAM_DOMAIN: "example.cloudflareaccess.com",
          CLOUDFLARE_ACCESS_AUD: "test-audience",
          ADMIN_ALLOWED_EMAILS: "maria.helena.ifc@gmail.com,menezesx2k26@gmail.com",
          ADMIN_PASSWORD_HASH: "c638833f69bbfb3c267afa0a74434812436b8f08a81fd263c6be6871de4f1265",
          ADMIN_SESSION_SECRET: "test-only-session-secret-with-enough-entropy",
          CLIENT_SESSION_SECRET: "test-only-independent-client-session-secret",
          PRIVATE_GALLERIES_ENABLED: "true",
          ADMIN_LOGIN_RATE_LIMIT_MAX: "10",
          ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900",
          MAX_UPLOAD_BYTES: "26214400",
          ALLOWED_MIME_TYPES: "image/jpeg,image/png,image/webp",
          PRESIGNED_URL_TTL_SECONDS: "900",
          CONTACT_RATE_LIMIT_WINDOW_SECONDS: "3600",
          CONTACT_RATE_LIMIT_MAX: "5",
          ADMIN_RATE_LIMIT_WINDOW_SECONDS: "60",
          ADMIN_RATE_LIMIT_MAX: "200",
        },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.spec.ts"],
    testTimeout: 20_000,
  },
});
