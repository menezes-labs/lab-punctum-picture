import { env } from "cloudflare:workers";
import { describe,expect,it,vi } from "vitest";
vi.mock("vinext/server/app-router-entry",()=>({default:{fetch:async()=>new Response("Application HTML")}}));
import worker from "../../worker/index";
describe("private production redirects",()=>{
  it("marks private canonical and administrative redirects no-store and noindex",async()=>{
    for(const [url,status] of [["https://www.punctumpicture.com/albuns/entrar",308],["https://punctumpicture.com/admin/clientes",303]] as const){
      const response=await worker.fetch(new Request(url),env,{} as ExecutionContext);
      expect(response.status).toBe(status);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    }
  });
});
