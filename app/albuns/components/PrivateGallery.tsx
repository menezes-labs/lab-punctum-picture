/* eslint-disable @next/next/no-img-element -- Private media must use authenticated Worker endpoints, without the public image optimizer. */
"use client";
import { useEffect, useState, type CSSProperties } from "react";
import type { ClientGallery } from "../../../shared/client-galleries";
import { ClientHeader } from "./ClientHeader";
import { PhotoViewer } from "./PhotoViewer";
import { themeTokens } from "./theme";
import { privateApi,errorMessage } from "./api";
import { privateImageUrl } from "./routes";

export function PrivateGallery({galleryId}:{galleryId:string}) {
  const [gallery,setGallery]=useState<ClientGallery|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  const [selected,setSelected]=useState<number|null>(null);const [pending,setPending]=useState<Set<string>>(new Set());
  useEffect(()=>{let active=true;privateApi<{gallery:ClientGallery}>("/api/client/galleries/"+encodeURIComponent(galleryId)).then(data=>{if(active)setGallery(data.gallery);}).catch(e=>{if(active)setError(errorMessage(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[galleryId]);
  async function favorite(id:string) {
    if(pending.has(id)) return; const image=gallery?.images?.find(i=>i.id===id);if(!image) return;
    setPending(current=>new Set(current).add(id));setError("");
    try {
      const data=await privateApi<{favorite:boolean}>("/api/client/galleries/"+encodeURIComponent(galleryId)+"/favorites/"+encodeURIComponent(id),image.favorite?"DELETE":"PUT");
      setGallery(current=>current?{...current,images:current.images?.map(i=>i.id===id?{...i,favorite:data.favorite}:i)}:current);
    }catch(e){setError(errorMessage(e));}
    finally{setPending(current=>{const next=new Set(current);next.delete(id);return next;});}
  }
  const images=gallery?.images??[];
  return <div style={themeTokens(gallery?.theme??"noir") as CSSProperties} className="pa-themed">
    <ClientHeader/><main className="pa-library">
      {loading && <p role="status">Abrindo o seu álbum…</p>}
      {error && <p role="alert" className="pa-error">{error}</p>}
      {gallery && <><p className="pa-eyebrow">Uma coleção só sua</p><h1>{gallery.title}</h1>
        {gallery.introduction && <p className="pa-introduction">{gallery.introduction}</p>}
        <div className="pa-section-heading"><span>{images.length} fotografias</span><span>{images.filter(i=>i.favorite).length} favoritas</span></div>
        {images.length===0 && <p>Nenhuma foto disponível neste álbum.</p>}
        <div className="pa-photo-grid">{images.map((image,index)=><figure className="pa-photo" key={image.id}>
          <button className="pa-photo-open" aria-label={"Abrir "+(image.altText||"fotografia "+(index+1))} onClick={()=>setSelected(index)}>
            <img src={privateImageUrl(gallery.id,image.id,"gallery")} alt={image.altText||image.originalFilename} loading="lazy" referrerPolicy="no-referrer"/>
          </button>
          <figcaption><span>{String(index+1).padStart(2,"0")}</span><div>
            <button aria-label={(image.favorite?"Remover dos favoritos: ":"Favoritar: ")+(image.altText||image.originalFilename)} aria-pressed={image.favorite} disabled={pending.has(image.id)} onClick={()=>favorite(image.id)}>{image.favorite?"♥":"♡"}</button>
            {gallery.allowDownloads && <a href={privateImageUrl(gallery.id,image.id,"download")} aria-label={"Baixar "+(image.altText||image.originalFilename)} download>↓</a>}
          </div></figcaption>
        </figure>)}</div>
        <p className="pa-gallery-end">Fotografias que permanecem. <span>Punctum Picture</span></p>
      </>}
    </main>
    {gallery && selected!==null && images[selected] && <PhotoViewer galleryId={gallery.id} images={images} index={selected} onIndex={setSelected} onClose={()=>setSelected(null)} onFavorite={favorite} allowDownloads={gallery.allowDownloads} busy={pending.has(images[selected].id)} error={error}/>}
  </div>;
}
