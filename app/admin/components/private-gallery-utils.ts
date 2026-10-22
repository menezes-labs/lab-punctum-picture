export function canSubmitPrivateGallery(form:{title:string;clientId:string}) {return Boolean(form.title.trim()&&form.clientId);}
export function uploadQueueBatch<T>(items:T[],limit=3):T[][] {
  const size=Math.max(1,Math.min(3,Math.floor(limit)||3));const groups:T[][]=[];
  for(let i=0;i<items.length;i+=size) groups.push(items.slice(i,i+size));
  return groups;
}
export async function runPrivateUploadQueue<T extends {status:string}>(jobs:T[],upload:(job:T)=>Promise<void>) {
  for(const group of uploadQueueBatch(jobs.filter(j=>j.status!=="completed"),3)) await Promise.allSettled(group.map(upload));
}
export type ClientAccountSummary={id:string;name:string;email:string;disabledAt:string|null;mustChangePassword:number};
export const PRIVATE_GALLERY_STATUS={draft:"Rascunho",published:"Publicado",archived:"Arquivado"};
