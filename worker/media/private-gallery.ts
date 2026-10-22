import { requireClient } from "../client/auth";
import { getOwnedGallery, getGallery, getReadyGalleryImage } from "../client/repository";
import { privateResponse } from "../client/response";
import { requireAdmin } from "../utils/auth";
import { requireDb, requireOriginals } from "../utils/env";
import { AppError } from "../utils/errors";
import { IMAGE_PRESETS, negotiateImageFormat } from "./presets";

export async function servePrivateGalleryImage(request:Request,env:Env,galleryId:string,imageId:string,preset:"thumb"|"gallery"|"download",audience:"client"|"admin"):Promise<Response> {
  const missing=()=>new AppError(404,"NOT_FOUND","Recurso não encontrado.");
  const db=requireDb(env);
  let gallery;
  if(audience==="admin") { await requireAdmin(request,env); gallery=await getGallery(db,galleryId); }
  else {
    let identity;
    try { identity=await requireClient(request,env,db); }
    catch(e) { if(e instanceof AppError && (e.status===401 || e.status===403)) throw missing(); throw e; }
    gallery=await getOwnedGallery(db,identity.id,galleryId);
  }
  if(!gallery) throw missing();
  const image=await getReadyGalleryImage(db,galleryId,imageId);
  if(!image || !image.storageKey.startsWith(`client-galleries/${galleryId}/`)) throw missing();
  if(preset==="download" && audience==="client" && !gallery.allowDownloads) throw new AppError(403,"DOWNLOAD_DISABLED","O download deste álbum está desativado.");
  const object=await requireOriginals(env).get(image.storageKey);
  if(!object) throw missing();
  if(preset==="download") return privateResponse(new Response(object.body,{headers:{
    "Content-Type":image.mimeType,
    "Content-Disposition":`attachment; filename="foto-${image.id}.${image.mimeType==="image/png"?"png":image.mimeType==="image/webp"?"webp":"jpg"}"`,
  }}));
  if(!env.IMAGES) throw new AppError(503,"IMAGE_SERVICE_UNAVAILABLE","A prévia desta foto está temporariamente indisponível.");
  const size=IMAGE_PRESETS[preset]; const format=negotiateImageFormat(request.headers.get("Accept"));
  let transformed:Response;
  try {
    transformed=(await env.IMAGES.input(object.body).transform({width:size.width,height:size.height,fit:"scale-down"}).output({format,quality:size.quality})).response();
  } catch { throw new AppError(502,"IMAGE_TRANSFORM_FAILED","Não foi possível carregar esta foto."); }
  return privateResponse(new Response(transformed.body,{status:transformed.status,headers:{
    "Content-Type":format,"Content-Disposition":"inline",
  }}));
}
