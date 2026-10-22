"use client";
import Link from "next/link";
import { useState } from "react";
import { privateApi, errorMessage } from "./api";
export function ClientHeader() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      await privateApi("/api/client/session", "DELETE");
      window.location.replace("/albuns/entrar");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <>
      <header className="pa-header">
        <Link className="pa-wordmark" href="/albuns" prefetch={false}>
          PUNCTUM <span>PICTURE</span>
        </Link>
        <nav aria-label="Seus álbuns">
          <Link href="/albuns" prefetch={false}>
            Meus álbuns
          </Link>
          <Link href="/albuns/trocar-senha" prefetch={false}>
            Senha
          </Link>
          <button onClick={logout} disabled={busy}>
            {busy ? "Saindo…" : "Sair"}
          </button>
        </nav>
      </header>
      {error && (
        <p role="alert" className="pa-error">
          {error}
        </p>
      )}
    </>
  );
}
