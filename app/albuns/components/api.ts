"use client";
export class PrivateApiError extends Error {
  constructor(message:string,readonly status:number,readonly code?:string){super(message);}
}
export async function privateApi<T>(path:string,method="GET",body?:unknown):Promise<T> {
  const response=await fetch(path,{method,cache:"no-store",credentials:"same-origin",
    headers:body===undefined?undefined:{"Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json() as T & {error?:{message?:string;code?:string}};
  if(!response.ok) {
    if(path.startsWith("/api/client/") && path!=="/api/client/session") {
      if(response.status===401) window.location.replace("/albuns/entrar");
      if(data.error?.code==="PASSWORD_CHANGE_REQUIRED") window.location.replace("/albuns/trocar-senha");
    }
    throw new PrivateApiError(data.error?.message ?? "Não foi possível concluir. Tente novamente.",response.status,data.error?.code);
  }
  return data;
}
export function errorMessage(error:unknown) {
  return error instanceof Error ? error.message : "Não foi possível conectar. Tente novamente.";
}
