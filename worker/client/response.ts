import { withSecurityHeaders, json } from "../utils/response";
export function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Vary", "Cookie");
  return withSecurityHeaders(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}
export function privateJson(data: unknown, init: ResponseInit = {}) {
  return privateResponse(json(data, init));
}
