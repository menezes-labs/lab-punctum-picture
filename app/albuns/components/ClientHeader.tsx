"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { privateApi, errorMessage } from "./api";
export function ClientHeader() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"password" | "access" | null>(null);
  useEffect(() => {
    let active = true;
    void privateApi<{ authMode: "password" | "access" }>("/api/client/me")
      .then((data) => { if (active) setAuthMode(data.authMode); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  async function logout() {
    setBusy(true);
    try {
      const result = await privateApi<{ logoutUrl: string }>("/api/client/session", "DELETE");
      window.location.replace(result.logoutUrl);
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
          {authMode === "password" && (
            <Link href="/albuns/trocar-senha" prefetch={false}>
              Senha
            </Link>
          )}
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
