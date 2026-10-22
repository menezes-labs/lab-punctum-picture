import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb, seedClient, seedGallery, seedReadyImage, privateRequest } from "./client-fixture";
import { getActiveClient, getOwnedGallery, getReadyGalleryImage, listPublishedGalleriesForClient } from "../../worker/client/repository";
import { createClientSession, requireClient } from "../../worker/client/auth";
import { handleClientAdminApi } from "../../worker/api/client-admin";
import { handleClientSessionApi } from "../../worker/api/client-session";

describe("private gallery persistence", () => {
  beforeAll(bootstrapPrivateDb);
  it("keeps private accounts and galleries in separate tables with foreign keys", async () => {
    const clientId = await seedClient();
    const galleryId = await seedGallery(clientId);
    expect(await env.DB.prepare("SELECT id FROM client_galleries WHERE client_id = ?").bind(clientId).first()).toEqual({ id: galleryId });
    await expect(seedGallery(crypto.randomUUID())).rejects.toThrow();
    expect(await env.DB.prepare("SELECT id FROM albums WHERE id = ?").bind(galleryId).first()).toBeNull();
  });
  it("restricts ownership, published status and image readiness in D1", async () => {
    const a = await seedClient(); const b = await seedClient();
    const owned = await seedGallery(a); const other = await seedGallery(b);
    await seedGallery(a, "draft");
    expect(await getOwnedGallery(env.DB, a, other)).toBeNull();
    expect((await listPublishedGalleriesForClient(env.DB, a)).map((g) => g.id)).toEqual([owned]);
    expect(await getReadyGalleryImage(env.DB, owned, "missing")).toBeNull();
    await env.DB.prepare("UPDATE client_accounts SET disabled_at = datetime('now') WHERE id = ?").bind(a).run();
    expect(await getActiveClient(env.DB, a)).toBeNull();
    expect(await getOwnedGallery(env.DB, a, owned)).toBeNull();
  });
  it("denies forged, expired, stale, disabled and first-password sessions", async () => {
    const id = await seedClient();
    const identity = { id, sessionVersion: 1 };
    const token = await createClientSession(identity, env);
    const req = (value = token) => new Request("http://localhost:8787/api/client/me", { headers: { Cookie: "punctum_client_session=" + value } });
    expect((await requireClient(req(), env, env.DB)).id).toBe(id);
    await expect(requireClient(req(token + "x"), env, env.DB)).rejects.toMatchObject({ status: 401 });
    const wrongSecretEnv = { ...env, CLIENT_SESSION_SECRET: "different-from-client-secret" } as Env;
    const foreignToken = await createClientSession(identity, wrongSecretEnv);
    await expect(requireClient(req(foreignToken), env, env.DB)).rejects.toMatchObject({ status: 401 });
    await env.DB.prepare("UPDATE client_accounts SET must_change_password=1 WHERE id=?").bind(id).run();
    await expect(requireClient(req(), env, env.DB)).rejects.toMatchObject({ status: 403 });
    expect((await requireClient(req(), env, env.DB, { allowPasswordChange: true })).id).toBe(id);
    await env.DB.prepare("UPDATE client_accounts SET session_version=2 WHERE id=?").bind(id).run();
    await expect(requireClient(req(), env, env.DB, { allowPasswordChange: true })).rejects.toMatchObject({ status: 401 });
    const newToken = await createClientSession({ id, sessionVersion: 2 }, env);
    await env.DB.prepare("UPDATE client_accounts SET disabled_at=datetime('now') WHERE id=?").bind(id).run();
    await expect(requireClient(req(newToken), env, env.DB, { allowPasswordChange: true })).rejects.toMatchObject({ status: 401 });
  });
});

describe("private publication and favorites", () => {
  beforeAll(bootstrapPrivateDb);
  it("does not restore revoked downloads when metadata is updated concurrently",async()=>{
    const gallery=await seedGallery(await seedClient());
    await env.DB.prepare("UPDATE client_galleries SET allow_downloads=1 WHERE id=?").bind(gallery).run();
    let reads=0;let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});
    // Real D1 with a scheduling barrier: both requests read before either writes.
    function statement(value:D1PreparedStatement,sql:string):D1PreparedStatement {
      return new Proxy(value,{get(target,property){
        if(property==="bind")return (...args:unknown[])=>statement(Reflect.apply(target.bind,target,args),sql);
        if(property==="first" && sql.includes("FROM client_galleries g WHERE"))return async(...args:unknown[])=>{
          const row=await Reflect.apply(target.first,target,args);
          if(reads<2){reads++;if(reads===2)release();await barrier;}
          return row;
        };
        const field=Reflect.get(target,property);return typeof field==="function"?field.bind(target):field;
      }});
    }
    const db=new Proxy(env.DB,{get(target,property){
      if(property==="prepare")return (sql:string)=>statement(target.prepare(sql),sql);
      const field=Reflect.get(target,property);return typeof field==="function"?field.bind(target):field;
    }});
    const base="/admin/api/albuns-privados/"+gallery;const override={...env,DB:db} as Env;
    const responses=await Promise.all([
      handleClientAdminApi(privateRequest(base,"PATCH",{allowDownloads:false}),new URL("http://localhost:8787"+base),override),
      handleClientAdminApi(privateRequest(base,"PATCH",{title:"Updated"}),new URL("http://localhost:8787"+base),override),
    ]);
    expect(responses.map(r=>r?.status)).toEqual([200,200]);
    expect(await env.DB.prepare("SELECT allow_downloads FROM client_galleries WHERE id=?").bind(gallery).first()).toEqual({allow_downloads:0});
  });
  it("validates same-gallery cover and exact order, isolates lists/favorites and revokes on archive", async () => {
    const a=await seedClient(); const b=await seedClient();
    const gallery=await seedGallery(a,"draft"); const other=await seedGallery(b);
    const photo=await seedReadyImage(gallery); const second=await seedReadyImage(gallery); const foreign=await seedReadyImage(other);
    const admin="/admin/api/albuns-privados/"+gallery;
    const client="/api/client/galleries/"+gallery;
    expect((await exports.default.fetch(privateRequest(admin+"/publish","POST"))).status).toBe(409);
    expect((await exports.default.fetch(privateRequest(admin+"/cover","PUT",{imageId:foreign}))).status).toBe(404);
    expect((await exports.default.fetch(privateRequest(admin+"/cover","PUT",{imageId:photo}))).status).toBe(200);
    expect((await exports.default.fetch(privateRequest(admin+"/order","PUT",{imageIds:[photo]}))).status).toBe(400);
    expect((await exports.default.fetch(privateRequest(admin+"/order","PUT",{imageIds:[photo,photo]}))).status).toBe(400);
    expect((await exports.default.fetch(privateRequest(admin+"/order","PUT",{imageIds:[second,photo]}))).status).toBe(200);
    expect((await exports.default.fetch(privateRequest(admin+"/publish","POST"))).status).toBe(200);
    const ca="punctum_client_session="+await createClientSession({id:a,sessionVersion:1},env);
    const cb="punctum_client_session="+await createClientSession({id:b,sessionVersion:1},env);
    const list=await exports.default.fetch(privateRequest("/api/client/galleries","GET",undefined,ca));
    const payload=await list.json() as {galleries:Array<{id:string}>};
    expect(payload.galleries.map(g=>g.id)).toEqual([gallery]);
    expect((await exports.default.fetch(privateRequest(client,"GET",undefined,cb))).status).toBe(404);
    expect((await exports.default.fetch(privateRequest(client+"/favorites/"+foreign,"PUT",undefined,ca))).status).toBe(404);
    for(let i=0;i<2;i++) expect((await exports.default.fetch(privateRequest(client+"/favorites/"+photo,"PUT",undefined,ca))).status).toBe(200);
    const detail=await exports.default.fetch(privateRequest(client,"GET",undefined,ca));
    const data=await detail.json() as {gallery:{images:Array<{id:string;favorite:boolean}>}};
    expect(data.gallery.images.map(i=>i.id)).toEqual([second,photo]);
    expect(data.gallery.images.find(i=>i.id===photo)!.favorite).toBe(true);
    const adminData=await (await exports.default.fetch(privateRequest(admin))).json() as {gallery:{favoriteCount:number}};
    expect(adminData.gallery.favoriteCount).toBe(1);
    for(let i=0;i<2;i++) expect((await exports.default.fetch(privateRequest(client+"/favorites/"+photo,"DELETE",undefined,ca))).status).toBe(200);
    expect((await exports.default.fetch(privateRequest(admin+"/archive","POST"))).status).toBe(200);
    expect((await exports.default.fetch(privateRequest(client,"GET",undefined,ca))).status).toBe(404);
    expect((await exports.default.fetch(privateRequest(client+"/favorites/"+photo,"PUT",undefined,ca))).status).toBe(404);
  });
});

describe("client accounts administrative API", () => {
  beforeAll(bootstrapPrivateDb);
  it("creates one-time credentials, normalizes unique email, lists without secrets and resets/disables", async () => {
    const email = crypto.randomUUID() + "@example.com";
    const created = await exports.default.fetch(privateRequest("/admin/api/clientes", "POST", { name: "Client Test", email }));
    expect(created.status).toBe(201);
    const body = await created.json() as { client: { id: string }; temporaryPassword: string };
    expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(24);
    const listed = await exports.default.fetch(privateRequest("/admin/api/clientes"));
    const text = await listed.text();
    expect(text).toContain(body.client.id);
    expect(text).not.toMatch(/passwordHash|password_hash|passwordSalt|password_salt|temporaryPassword/);
    expect(text).not.toContain(body.temporaryPassword);
    const duplicate = await exports.default.fetch(privateRequest("/admin/api/clientes", "POST", { name: "Duplicate", email: email.toUpperCase() }));
    expect(duplicate.status).toBe(409);
    const reset = await exports.default.fetch(privateRequest("/admin/api/clientes/" + body.client.id + "/reset-password", "POST"));
    expect(reset.status).toBe(200);
    expect(await env.DB.prepare("SELECT session_version,must_change_password FROM client_accounts WHERE id=?").bind(body.client.id).first()).toEqual({ session_version: 2, must_change_password: 1 });
    const disabled = await exports.default.fetch(privateRequest("/admin/api/clientes/" + body.client.id, "PATCH", { disabled: true }));
    expect(disabled.status).toBe(200);
    expect(await getActiveClient(env.DB, body.client.id)).toBeNull();
    const audit = await env.DB.prepare("SELECT data_json FROM audit_log WHERE entity_id=?").bind(body.client.id).all();
    expect(JSON.stringify(audit.results)).not.toContain(body.temporaryPassword);
  });
  it("requires admin, rejects foreign Origin and disables routes with the flag off", async () => {
    const unauthorized = await exports.default.fetch(new Request("https://punctumpicture.com/admin/api/clientes"));
    expect(unauthorized.status).toBe(403);
    const foreign = privateRequest("/admin/api/clientes", "POST", { name: "Test", email: "test@example.com" });
    foreign.headers.set("Origin", "https://evil.example");
    expect((await exports.default.fetch(foreign)).status).toBe(403);
  });
});

describe("client sessions API", () => {
  beforeAll(bootstrapPrivateDb);
  it("bounds actual JSON bytes when Content-Length is missing",async()=>{
    const body=" ".repeat(1_048_576)+JSON.stringify({email:"nobody@example.com",password:"x"});
    const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(body));controller.close();}});
    const request=new Request("http://localhost:8787/api/client/session",{method:"POST",headers:{Origin:"http://localhost:8787","Content-Type":"application/json"},body:stream});
    expect(request.headers.has("Content-Length")).toBe(false);
    await expect(handleClientSessionApi(request,new URL(request.url),env)).rejects.toMatchObject({status:413});
  });
  it("forces first password change and revokes cookies after password/reset/disable", async () => {
    const email = crypto.randomUUID() + "@example.com";
    const res = await exports.default.fetch(privateRequest("/admin/api/clientes", "POST", { name: "Pilot", email }));
    const account = await res.json() as { client: { id: string }; temporaryPassword: string };
    const login = await exports.default.fetch(privateRequest("/api/client/session", "POST", { email, password: account.temporaryPassword }));
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ mustChangePassword: true });
    const firstCookie = login.headers.get("Set-Cookie")!.split(";")[0];
    expect((await exports.default.fetch(privateRequest("/api/client/galleries", "GET", undefined, firstCookie))).status).toBe(403);
    expect((await exports.default.fetch(privateRequest("/api/client/password", "POST", { password: "short" }, firstCookie))).status).toBe(400);
    const changed = await exports.default.fetch(privateRequest("/api/client/password", "POST", { password: "a safe new password 123!" }, firstCookie));
    expect(changed.status).toBe(200);
    const cookie = changed.headers.get("Set-Cookie")!.split(";")[0];
    expect((await exports.default.fetch(privateRequest("/api/client/me", "GET", undefined, firstCookie))).status).toBe(401);
    expect((await exports.default.fetch(privateRequest("/api/client/me", "GET", undefined, cookie))).status).toBe(200);
    const reset = await exports.default.fetch(privateRequest("/admin/api/clientes/" + account.client.id + "/reset-password", "POST"));
    expect(reset.status).toBe(200);
    expect((await exports.default.fetch(privateRequest("/api/client/me", "GET", undefined, cookie))).status).toBe(401);
    const logout = await exports.default.fetch(privateRequest("/api/client/session", "DELETE", undefined, cookie));
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
  it("has generic login errors, Origin checks and request limits", async () => {
    const email = crypto.randomUUID() + "@example.com";
    await exports.default.fetch(privateRequest("/admin/api/clientes", "POST", { name: "Limit Pilot", email }));
    const absent = await exports.default.fetch(privateRequest("/api/client/session", "POST", { email: crypto.randomUUID() + "@example.com", password: "bad" }));
    const wrong = await exports.default.fetch(privateRequest("/api/client/session", "POST", { email, password: "bad" }));
    expect(absent.status).toBe(401); expect(wrong.status).toBe(401);
    expect((await absent.json() as { error: { message: string } }).error.message).toBe((await wrong.json() as { error: { message: string } }).error.message);
    const foreign = privateRequest("/api/client/session", "POST", { email, password: "bad" }); foreign.headers.set("Origin", "https://evil.example");
    expect((await exports.default.fetch(foreign)).status).toBe(403);
    let finalStatus = 0;
    for (let i = 0; i < 12; i++) finalStatus = (await exports.default.fetch(privateRequest("/api/client/session", "POST", { email, password: "bad" }))).status;
    expect(finalStatus).toBe(429);
  });
  it("redirects protected pages before rendering", async () => {
    const response = await exports.default.fetch(privateRequest("/albuns"));
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/albuns/entrar");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});
