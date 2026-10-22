/* eslint-disable @next/next/no-img-element -- Private media must use authenticated Worker endpoints, without the public image optimizer. */
"use client";
import { useEffect, useRef, useState } from "react";
import type { ClientImage } from "../../../shared/client-galleries";
import { privateImageUrl } from "./routes";

export function PhotoViewer({galleryId,images,index,onIndex,onClose,onFavorite,allowDownloads,busy,error}:{
  galleryId:string;images:ClientImage[];index:number;onIndex:(i:number)=>void;onClose:()=>void;
  onFavorite:(id:string)=>void;allowDownloads:boolean;busy:boolean;error?:string;
}) {
  const dialog=useRef<HTMLDialogElement>(null);const [light,setLight]=useState(false);const [failedId,setFailedId]=useState("");
  const image=images[index];
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const element=dialog.current; element?.showModal();
    const overflow=document.body.style.overflow; document.body.style.overflow="hidden";
    return()=>{element?.close();document.body.style.overflow=overflow;previous?.focus();};
  },[]);
  return <dialog ref={dialog} className={"pa-viewer"+(light?" pa-viewer-light":"")} aria-label="Visualização da fotografia"
    onCancel={event=>{event.preventDefault();onClose();}}
    onKeyDown={event=>{if(event.key==="ArrowRight"){event.preventDefault();onIndex((index+1)%images.length);}if(event.key==="ArrowLeft"){event.preventDefault();onIndex((index-1+images.length)%images.length);}}}>
    <div className="pa-viewer-toolbar"><span aria-live="polite">{index+1} / {images.length}</span><div>
      <button onClick={()=>setLight(!light)} aria-pressed={light}>Luz {light?"escura":"clara"}</button>
      <button onClick={onClose} aria-label="Fechar fotografia">Fechar ×</button>
    </div></div>
    {error && <p className="pa-error" role="alert">{error}</p>}
    <div className="pa-viewer-stage">
      <button className="pa-viewer-arrow" aria-label="Foto anterior" onClick={()=>onIndex((index-1+images.length)%images.length)}>‹</button>
      {failedId===image.id?<p role="alert">Não foi possível carregar esta foto. Feche e tente novamente.</p>:<img key={image.id} src={privateImageUrl(galleryId,image.id,"gallery")} alt={image.altText||image.originalFilename} onError={()=>setFailedId(image.id)} referrerPolicy="no-referrer"/>}
      <button className="pa-viewer-arrow" aria-label="Próxima foto" onClick={()=>onIndex((index+1)%images.length)}>›</button>
    </div>
    <div className="pa-viewer-toolbar"><p>{image.altText||image.originalFilename}</p><div>
      <button aria-pressed={image.favorite} disabled={busy} onClick={()=>onFavorite(image.id)}>{image.favorite?"♥ Favorita":"♡ Favoritar"}</button>
      {allowDownloads && <a href={privateImageUrl(galleryId,image.id,"download")} download>Baixar original ↓</a>}
    </div></div>
  </dialog>;
}
