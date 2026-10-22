import { handleAdminApi } from "./api/admin";
import { handlePrivateGalleryRoutes } from "./client/router";
import { handleAdminAuth } from "./api/admin-auth";
import { handlePublicApi } from "./api/public";
import { serveMedia } from "./media/serve";
import { sitemap } from "./seo";
import { handleSiteMediaApi } from "./site-media";
import { requireAdmin } from "./utils/auth";
import { AppError } from "./utils/errors";
import { apiError, withSecurityHeaders } from "./utils/response";

/**
 * API-only entrypoint for the Workers Vitest pool.
 *
 * The production entrypoint also imports vinext virtual modules generated at
 * build time. Keeping those out of the isolated Worker tests lets the real API
 * handlers run against Miniflare's D1 and R2 implementations.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = request.headers.get("cf-ray") ?? crypto.randomUUID();
    const url = new URL(request.url);

    try {
      const privateResult = await handlePrivateGalleryRoutes(request, url, env);
      if (privateResult) return privateResult;
      const publicResponse = await handlePublicApi(request, url, env);
      if (publicResponse) return publicResponse;

      const adminAuthResponse = await handleAdminAuth(request, url, env);
      if (adminAuthResponse) return adminAuthResponse;

      const siteMediaResponse = await handleSiteMediaApi(request, url, env);
      if (siteMediaResponse) return siteMediaResponse;

      const adminResponse = await handleAdminApi(request, url, env);
      if (adminResponse) return adminResponse;

      const adminMediaMatch = url.pathname.match(
        /^\/admin\/media\/([^/]+)\/([^/]+)$/,
      );
      if (request.method === "GET" && adminMediaMatch) {
        await requireAdmin(request, env);
        return await serveMedia(
          request,
          env,
          decodeURIComponent(adminMediaMatch[1]),
          decodeURIComponent(adminMediaMatch[2]),
          { audience: "admin" },
        );
      }

      const mediaMatch = url.pathname.match(/^\/media\/([^/]+)\/([^/]+)$/);
      if (request.method === "GET" && mediaMatch) {
        return await serveMedia(
          request,
          env,
          decodeURIComponent(mediaMatch[1]),
          decodeURIComponent(mediaMatch[2]),
        );
      }

      if (request.method === "GET" && url.pathname === "/sitemap.xml") {
        return await sitemap(env);
      }

      if (
        url.pathname === "/studio-preview-internal" ||
        url.pathname.startsWith("/studio-preview-internal/")
      ) {
        throw new AppError(404, "NOT_FOUND", "Página não encontrada.");
      }

      if (request.method === "GET" && url.pathname === "/admin/studio/preview") {
        await requireAdmin(request, env);
        return withSecurityHeaders(
          new Response("<!doctype html><title>Prévia do Studio</title>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
          { studioPreview: true },
        );
      }

      throw new AppError(404, "not_found", "Rota não encontrada.");
    } catch (error) {
      return apiError(error, requestId);
    }
  },
} satisfies ExportedHandler<Env>;
