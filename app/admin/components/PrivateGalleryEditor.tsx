/* eslint-disable @next/next/no-img-element -- Private media must use authenticated Worker endpoints, without the public image optimizer. */
"use client";
import { useCallback,useEffect,useState,type FormEvent } from "react";
import Link from "next/link";
import type { ClientGallery,ClientTheme } from "../../../shared/client-galleries";
import { CLIENT_MAX_UPLOAD_BYTES,CLIENT_MIME_TYPES } from "../../../shared/client-galleries";
import { privateApi,errorMessage,PrivateApiError } from "../../albuns/components/api";
import { privateImageUrl } from "../../albuns/components/routes";
import { canSubmitPrivateGallery,runPrivateUploadQueue,PRIVATE_GALLERY_STATUS,type ClientAccountSummary } from "./private-gallery-utils";
import "./private-gallery-admin.css";

export function PrivateGalleriesManager() {
  const [galleries,setGalleries]=useState<ClientGallery[]>([]);const [clients,setClients]=useState<ClientAccountSummary[]>([]);
  const [title,setTitle]=useState("");const [clientId,setClientId]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);
  useEffect(()=>{void Promise.all([privateApi<{galleries:ClientGallery[]}>("/admin/api/albuns-privados"),privateApi<{clients:ClientAccountSummary[]}>("/admin/api/clientes")]).then(([g,c])=>{setGalleries(g.galleries);setClients(c.clients);}).catch(e=>setError(errorMessage(e))).finally(()=>setLoading(false));},[]);
  async function create(event:FormEvent){event.preventDefault();setBusy(true);setError("");try{const data=await privateApi<{gallery:ClientGallery}>("/admin/api/albuns-privados","POST",{title,clientId});window.location.replace("/admin/albuns-privados/"+data.gallery.id);}catch(e){setError(errorMessage(e));setBusy(false);}}
  return <div className="pga"><div className="admin-topbar"><div><p className="eyebrow">Coleções particulares</p><h1>Álbuns privados</h1></div><Link href="/admin/clientes" className="button secondary">Gerenciar clientes ↗</Link></div>
    {error&&<p role="alert" className="pga-error">{error}</p>}
    <section className="admin-card"><h2>Novo álbum</h2><form className="pga-form" onSubmit={create}><label>Título<input className="admin-input" value={title} onChange={e=>setTitle(e.target.value)} required maxLength={120}/></label><label>Cliente<select className="admin-select" value={clientId} onChange={e=>setClientId(e.target.value)} required><option value="">Selecione um cliente</option>{clients.filter(c=>!c.disabledAt).map(c=><option key={c.id} value={c.id}>{c.name} · {c.email}</option>)}</select></label><button className="button" disabled={busy||!canSubmitPrivateGallery({title,clientId})}>{busy?"Criando…":"Criar rascunho"}</button></form></section>
    {loading&&<p role="status">Carregando álbuns…</p>}
    {!loading&&galleries.length===0&&<p className="pga-note">Os álbuns criados aqui ficam separados do portfólio público.</p>}
    <div className="pga-list">{galleries.map(g=><Link className="admin-card pga-client" key={g.id} href={"/admin/albuns-privados/"+g.id} prefetch={false}><div><span className="pga-badge">{PRIVATE_GALLERY_STATUS[g.status]}</span><h2>{g.title}</h2><p>{clients.find(c=>c.id===g.clientId)?.name??"Cliente"}</p></div><span>Editar álbum ↗</span></Link>)}</div>
  </div>;
}
type UploadIntent={intentId:string;imageId:string;uploadUrl:string;requiredHeaders:Record<string,string>};
type UploadJob={id:string;file:File;status:"queued"|"uploading"|"completed"|"failed";progress:number;error?:string;intent?:UploadIntent;uploaded?:boolean};
function directUpload(intent:UploadIntent,file:File,onProgress:(n:number)=>void):Promise<void>{
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();xhr.open("PUT",intent.uploadUrl);xhr.withCredentials=true;
    for(const [key,value] of Object.entries(intent.requiredHeaders))xhr.setRequestHeader(key,value);
    xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};
    xhr.onerror=()=>reject(new Error("Conexão interrompida. Tente novamente."));xhr.ontimeout=()=>reject(new Error("O envio demorou demais. Tente novamente."));xhr.timeout=180000;
    xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300||xhr.status===409)resolve();else{let message="Não foi possível enviar a foto.";try{message=JSON.parse(xhr.responseText).error?.message??message;}catch{}reject(new Error(message));}};
    xhr.send(file);
  });
}
export function PrivateGalleryEditor({galleryId}:{galleryId:string}) {
  const base="/admin/api/albuns-privados/"+encodeURIComponent(galleryId);
  const [gallery,setGallery]=useState<ClientGallery|null>(null);const [form,setForm]=useState({title:"",introduction:"",theme:"noir" as ClientTheme,allowDownloads:false});
  const [error,setError]=useState("");const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);const [uploading,setUploading]=useState(false);const [jobs,setJobs]=useState<UploadJob[]>([]);
  const load=useCallback(async(resetForm=true)=>{const data=await privateApi<{gallery:ClientGallery}>(base);setGallery(data.gallery);if(resetForm)setForm({title:data.gallery.title,introduction:data.gallery.introduction,theme:data.gallery.theme,allowDownloads:data.gallery.allowDownloads});},[base]);
  useEffect(()=>{void Promise.resolve().then(()=>load()).catch(e=>setError(errorMessage(e)));},[load]);
  async function action(path:string,method="POST",body?:unknown) {
    setBusy(true);setError("");setNotice("");
    try{if(path==="/publish")await privateApi(base,"PATCH",form);await privateApi(base+path,method,body);await load(path===""||path==="/publish");setNotice("Álbum atualizado.");}
    catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  async function save(event:FormEvent){event.preventDefault();await action("","PATCH",form);}
  async function sendJobs(queue:UploadJob[]) {
    setUploading(true);setError("");setNotice("");
    await runPrivateUploadQueue(queue,async original=>{
      let job={...original};
      const patch=(values:Partial<UploadJob>)=>{job={...job,...values};setJobs(current=>current.map(j=>j.id===job.id?job:j));};
      patch({status:"uploading",error:undefined});
      try{
        if(!job.intent)patch({intent:await privateApi<UploadIntent>(base+"/uploads/intents","POST",{filename:job.file.name,mimeType:job.file.type,sizeBytes:job.file.size,altText:job.file.name.replace(/\.[^.]+$/,"")})});
        if(!job.uploaded){await directUpload(job.intent!,job.file,n=>patch({progress:n}));patch({uploaded:true});}
        await privateApi(base+"/uploads/"+job.intent!.intentId+"/complete","POST");
        patch({status:"completed",progress:100});
      }catch(e){patch({status:"failed",error:errorMessage(e),...(e instanceof PrivateApiError && [400,409].includes(e.status)?{intent:undefined,uploaded:false,progress:0}:{})});}
    });
    try{await load(false);}catch(e){setError(errorMessage(e));}
    setUploading(false);
  }
  function choose(files:FileList|null) {
    if(!files||uploading)return;
    const queue:UploadJob[]=Array.from(files).map(file=>({id:crypto.randomUUID(),file,status:"queued",progress:0}));
    const invalid=queue.find(j=>j.file.size>CLIENT_MAX_UPLOAD_BYTES||!(CLIENT_MIME_TYPES as readonly string[]).includes(j.file.type));
    if(invalid){setError("Escolha somente fotos JPG, PNG ou WebP de até 25 MiB: "+invalid.file.name);return;}
    setJobs(current=>[...current,...queue]);void sendJobs(queue);
  }
  async function move(index:number,offset:number) {
    const images=[...(gallery?.images??[])];const target=index+offset;if(target<0||target>=images.length)return;
    [images[index],images[target]]=[images[target],images[index]];
    await action("/order","PUT",{imageIds:images.map(i=>i.id)});
  }
  const blocked=busy||uploading;const images=gallery?.images??[];
  return <div className="pga"><div className="admin-topbar"><div><Link href="/admin/albuns-privados">← Álbuns privados</Link><h1>{gallery?.title??"Carregando álbum…"}</h1></div>{gallery&&<span className="pga-badge">{PRIVATE_GALLERY_STATUS[gallery.status]}</span>}</div>
    {error&&<p role="alert" className="pga-error">{error}</p>}{notice&&<p role="status" className="pga-note">{notice}</p>}
    {gallery&&<><section className="admin-card"><h2>A apresentação</h2><form className="pga-form pga-editor-form" onSubmit={save}>
      <label>Título<input className="admin-input" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required maxLength={120}/></label>
      <label>Tema<select className="admin-select" value={form.theme} onChange={e=>setForm({...form,theme:e.target.value as ClientTheme})}><option value="noir">Noir · escuro</option><option value="ivory">Ivory · claro</option><option value="warm">Warm · acolhedor</option></select></label>
      <label className="pga-wide">Introdução<textarea className="admin-input" value={form.introduction} onChange={e=>setForm({...form,introduction:e.target.value})} rows={4} maxLength={5000}/></label>
      <label className="pga-checkbox pga-wide"><input type="checkbox" checked={form.allowDownloads} onChange={e=>setForm({...form,allowDownloads:e.target.checked})}/>Permitir download das fotos originais</label>
      <div className="pga-actions pga-wide"><button className="button" disabled={blocked}>Salvar alterações</button><button className="button secondary" type="button" disabled={blocked||!gallery.coverImageId||images.every(i=>i.status!=="ready")} onClick={()=>action("/publish")}>Publicar para o cliente</button>
        {gallery.status==="published"&&<button type="button" className="button secondary" disabled={blocked} onClick={()=>action("/unpublish")}>Despublicar</button>}
        {gallery.status!=="archived"&&<button type="button" className="button secondary" disabled={blocked} onClick={()=>{if(window.confirm("Arquivar este álbum e revogar o acesso do cliente?"))void action("/archive");}}>Arquivar</button>}
      </div>
    </form><p className="pga-note">Para publicar: cliente ativo, título, ao menos uma foto pronta e uma capa. Arquivar ou despublicar interrompe o acesso do cliente. Favoritas: {gallery.favoriteCount??0}.</p></section>
    <section className="admin-card pga-upload"><h2>As fotografias</h2><label className="pga-file-label">Adicionar fotos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={blocked} onChange={e=>{choose(e.target.files);e.target.value="";}}/></label><p className="pga-note">JPG, PNG ou WebP · até 25 MiB por foto · até 3 envios simultâneos.</p>
      {jobs.length>0&&<ul className="pga-queue" aria-label="Progresso dos envios">{jobs.map(j=><li key={j.id}><span>{j.file.name}</span><progress value={j.progress} max={100} aria-label={"Envio de "+j.file.name}/><span>{j.status==="completed"?"Concluído":j.status==="failed"?j.error:j.progress===100?"Conferindo foto…":j.progress+"%"}</span>{j.status==="failed"&&<button className="button secondary" disabled={blocked} onClick={()=>sendJobs([j])}>Tentar novamente</button>}</li>)}</ul>}
    </section>
    <section className="pga-photo-grid" aria-label="Fotos do álbum">{images.map((image,index)=><article className="admin-card pga-photo" key={image.id}>
      {image.status==="ready"?<img src={privateImageUrl(galleryId,image.id,"thumb",true)} alt={image.altText||image.originalFilename} loading="lazy"/>:<div className="pga-placeholder">{image.status==="pending"?"Envio pendente":"Envio não concluído"}</div>}
      <p>{image.originalFilename}</p><span className="pga-badge">{gallery.coverImageId===image.id?"Capa · ":""}{image.favoriteCount??0} favoritas</span>
      <div className="pga-actions"><button className="button secondary" disabled={blocked||image.status!=="ready"||gallery.coverImageId===image.id} onClick={()=>action("/cover","PUT",{imageId:image.id})}>Usar na capa</button>
        <button className="button secondary" aria-label={"Mover "+image.originalFilename+" para cima"} disabled={blocked||index===0} onClick={()=>move(index,-1)}>↑</button><button className="button secondary" aria-label={"Mover "+image.originalFilename+" para baixo"} disabled={blocked||index===images.length-1} onClick={()=>move(index,1)}>↓</button>
      </div>
    </article>)}</section></>}
  </div>;
}
