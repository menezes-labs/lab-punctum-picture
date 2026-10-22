import { env } from "cloudflare:workers";
import { describe,expect,it } from "vitest";
import { handlePrivateGalleryRoutes,isPrivateGalleriesEnabled } from "../../worker/client/router";
import wrangler from "../../wrangler.jsonc?raw";
import workflow from "../../.github/workflows/cloudflare-git-main.yml?raw";
import { privateRequest } from "../integration/client-fixture";

describe("private rollout guard",()=>{
  it("defaults to off and denies every private surface before touching data",async()=>{
    for(const value of [undefined,"false","TRUE","1"]){
      const disabled={...env,PRIVATE_GALLERIES_ENABLED:value} as Env;
      expect(isPrivateGalleriesEnabled(disabled)).toBe(false);
      for(const path of ["/albuns","/albuns/entrar","/albuns/trocar-senha","/albuns/id","/admin/clientes","/admin/albuns-privados/id","/admin/api/clientes","/admin/api/albuns-privados","/api/client/session","/api/client/galleries/id/images/id/download"]){
        const response=await handlePrivateGalleryRoutes(privateRequest(path),new URL("http://localhost:8787"+path),disabled);
        expect(response?.status).toBe(404);expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
      }
    }
  });
  it("keeps source and generated deployment config off and routes pages through Worker",()=>{
    expect(wrangler).toContain('"PRIVATE_GALLERIES_ENABLED": "false"');
    expect(wrangler).toContain('"/albuns/*"');
    expect(workflow).toContain("PRIVATE_GALLERIES_ENABLED: 'false'");
  });
  it("blocks private optimizer sources even with cookies and encoded paths",async()=>{
    for(const source of ["/api/client/galleries/id/images/id/gallery","/admin/api/albuns-privados/id/images/id/thumb","/%61pi/client/galleries/id/images/id/gallery"]){
      const url=new URL("http://localhost:8787/_vinext/image");url.searchParams.set("url",source);
      const response=await handlePrivateGalleryRoutes(new Request(url,{headers:{Cookie:"punctum_client_session=anything"}}),url,env);
      expect(response?.status).toBe(404);
    }
  });
});
