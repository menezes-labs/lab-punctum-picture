import { handleClientAdminApi } from "../api/client-admin";
import {
  handleClientSessionApi,
  protectClientPage,
} from "../api/client-session";
import { handleClientGalleryUploadApi } from "../api/client-gallery-upload";
import { handleClientGalleriesApi } from "../api/client-galleries";
import { servePrivateGalleryImage } from "../media/private-gallery";
import { requireClient } from "./auth";
import { requireDb } from "../utils/env";
import { apiError } from "../utils/response";
import { envString } from "../utils/env";
import { AppError } from "../utils/errors";
import { privateResponse } from "./response";

export function isPrivateGalleriesEnabled(env: Env): boolean {
  return envString(env, "PRIVATE_GALLERIES_ENABLED") === "true";
}
export function isPrivateGalleryPath(path: string) {
  return /^\/(?:albuns(?:\/|$)|api\/client(?:\/|$)|admin\/(?:clientes|albuns-privados)(?:\/|$)|admin\/api\/(?:clientes|albuns-privados)(?:\/|$))/.test(
    path,
  );
}
export async function handlePrivateGalleryRoutes(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (url.pathname === "/_vinext/image") {
    const source = url.searchParams.get("url");
    if (source) {
      try {
        let path = new URL(source, url).pathname;
        for (let i = 0; i < 3; i++) {
          if (isPrivateGalleryPath(path))
            return privateResponse(new Response(null, { status: 404 }));
          const decoded = decodeURIComponent(path);
          if (decoded === path) break;
          path = decoded;
        }
      } catch {
        /* The public optimizer validates malformed sources. */
      }
    }
  }
  if (!isPrivateGalleryPath(url.pathname)) return null;
  try {
    if (!isPrivateGalleriesEnabled(env))
      throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
    const page = await protectClientPage(request, url, env);
    if (page) return page;
    const session = await handleClientSessionApi(request, url, env);
    if (session) return session;
    const media = url.pathname.match(
      /^\/(api\/client\/galleries|admin\/api\/albuns-privados)\/([^/]+)\/images\/([^/]+)\/(thumb|gallery|download)$/,
    );
    if (media && (request.method === "GET" || request.method === "HEAD")) {
      const response = await servePrivateGalleryImage(
        request,
        env,
        media[2],
        media[3],
        media[4] as "thumb" | "gallery" | "download",
        media[1].startsWith("admin") ? "admin" : "client",
      );
      return request.method === "HEAD"
        ? new Response(null, {
            status: response.status,
            headers: response.headers,
          })
        : response;
    }
    if (url.pathname.startsWith("/api/client/galleries"))
      await requireClient(request, env, requireDb(env));
    const client = await handleClientGalleriesApi(request, url, env);
    if (client) return client;
    const upload = await handleClientGalleryUploadApi(request, url, env);
    if (upload) return upload;
    const admin = await handleClientAdminApi(request, url, env);
    if (admin) return admin;
    if (
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/admin/api/")
    )
      throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
    return null;
  } catch (error) {
    return privateResponse(apiError(error));
  }
}
