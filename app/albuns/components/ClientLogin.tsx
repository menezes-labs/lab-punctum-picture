"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { privateApi, errorMessage } from "./api";
import { loginErrorMessage } from "./routes";

export function ClientLogin({changePassword=false}:{changePassword?:boolean}) {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [confirmation,setConfirmation]=useState("");
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent) {
    event.preventDefault(); setError("");
    if(changePassword && password!==confirmation){setError("As senhas precisam ser iguais.");return;}
    setBusy(true);
    try {
      if(changePassword) {
        await privateApi("/api/client/password","POST",{password});
        window.location.replace("/albuns");
      } else {
        const response=await fetch("/api/client/session",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
        if(!response.ok) throw new Error(loginErrorMessage(response.status));
        const data=await response.json() as {mustChangePassword:boolean};
        window.location.replace(data.mustChangePassword?"/albuns/trocar-senha":"/albuns");
      }
      setPassword("");setConfirmation("");
    } catch(e){setError(errorMessage(e));setPassword("");setConfirmation("");setBusy(false);}
  }
  return <main className="pa-entry">
    <Link href="/" className="pa-wordmark">PUNCTUM <span>PICTURE</span></Link>
    <div className="pa-entry-grid">
      <section className="pa-entry-copy">
        <p className="pa-eyebrow">Um arquivo só seu</p>
        <h1>{changePassword?<>Suas memórias.<br/><em>Sua chave.</em></>:<>O que fica,<br/><em>é seu.</em></>}</h1>
        <p>{changePassword?"Escolha uma senha pessoal para abrir os seus álbuns. Ela deve ter pelo menos 12 caracteres.":"Fotografias para revisitar com calma. Entre para encontrar os seus álbuns, guardar favoritas e reviver cada detalhe."}</p>
        <span className="pa-entry-signature">Punctum Picture · Maria Helena</span>
      </section>
      <section className="pa-login-card" aria-labelledby="login-title">
        <p className="pa-eyebrow">Área do cliente</p>
        <h2 id="login-title">{changePassword?"Escolha sua senha":"Bem-vindo de volta"}</h2>
        <form onSubmit={submit}>
          {!changePassword && <label>E-mail<input type="email" name="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} maxLength={180} required/></label>}
          <label>{changePassword?"Nova senha":"Senha"}<input type="password" name="password" autoComplete={changePassword?"new-password":"current-password"} minLength={changePassword?12:1} maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} required/></label>
          {changePassword && <label>Confirme a nova senha<input type="password" name="confirmation" autoComplete="new-password" minLength={12} maxLength={1024} value={confirmation} onChange={e=>setConfirmation(e.target.value)} required/></label>}
          {error && <p role="alert" className="pa-error">{error}</p>}
          <button className="pa-primary" disabled={busy} type="submit">{busy?"Aguarde…":changePassword?"Salvar senha e entrar":"Abrir meus álbuns"} <span aria-hidden="true">↗</span></button>
        </form>
        <p className="pa-caption">{changePassword?"Sua senha é pessoal. Evite reutilizar senhas de outros serviços.":"Primeiro acesso ou esqueceu a senha? Peça uma nova senha temporária ao estúdio."}</p>
      </section>
    </div>
    <footer className="pa-entry-footer"><span>Fotografia que permanece.</span><Link href="/">Voltar ao Punctum ↗</Link></footer>
  </main>;
}
