"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { privateApi, errorMessage } from "../../albuns/components/api";
import type { ClientAccountSummary } from "./private-gallery-utils";
import "./private-gallery-admin.css";

export function ClientAccountsManager() {
  const [clients, setClients] = useState<ClientAccountSummary[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [authMode, setAuthMode] = useState<"password" | "access">("password");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const data = await privateApi<{ clients: ClientAccountSummary[]; authMode: "password" | "access" }>(
      "/admin/api/clientes",
    );
    setClients(data.clients);
    setAuthMode(data.authMode);
    setLoading(false);
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch((e) => {
        setError(errorMessage(e));
        setLoading(false);
      });
  }, [load]);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCredential(null);
    setCopied(false);
    setNotice("");
    try {
      const data = await privateApi<{ temporaryPassword?: string }>(
        "/admin/api/clientes",
        "POST",
        { name, email },
      );
      if (data.temporaryPassword) setCredential({ email, password: data.temporaryPassword });
      else setNotice("Cliente cadastrado. Envie o endereço /albuns/entrar para confirmar o e-mail pelo Cloudflare Access.");
      setName("");
      setEmail("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function manage(client: ClientAccountSummary, reset = false) {
    if (
      reset &&
      !window.confirm(
        authMode === "access"
          ? "Revogar todas as sessões deste cliente e confirmar novamente o acesso pelo e-mail?"
          : "Gerar uma nova senha temporária? Isso encerra todos os acessos atuais deste cliente.",
      )
    )
      return;
    if (
      !reset &&
      !client.disabledAt &&
      !window.confirm("Desativar o cliente e encerrar todos os seus acessos?")
    )
      return;
    setBusy(true);
    setError("");
    setCredential(null);
    setCopied(false);
    setNotice("");
    try {
      if (reset) {
        const data = await privateApi<{ temporaryPassword?: string }>(
          "/admin/api/clientes/" + client.id + "/reset-password",
          "POST",
        );
        if (data.temporaryPassword) {
          setCredential({ email: client.email, password: data.temporaryPassword });
        } else {
          setNotice("Sessões revogadas. O próximo acesso exigirá confirmação pelo e-mail.");
        }
      } else
        await privateApi("/admin/api/clientes/" + client.id, "PATCH", {
          disabled: !client.disabledAt,
        });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pga">
      <div className="admin-topbar">
        <div>
          <p className="eyebrow">Entrega particular</p>
          <h1>Clientes</h1>
        </div>
        <Link className="button secondary" href="/admin/albuns-privados">
          Álbuns privados ↗
        </Link>
      </div>
      {error && (
        <p role="alert" className="pga-error">
          {error}
        </p>
      )}
      {notice && <p role="status" className="pga-note">{notice}</p>}
      {authMode === "access" && (
        <p className="pga-note">O acesso é por código de e-mail, validado pelo Cloudflare Access. Não serão emitidas senhas temporárias.</p>
      )}
      {credential && (
        <section
          className="admin-card pga-credential"
          aria-label="Credencial temporária"
        >
          <h2>Guarde esta senha agora</h2>
          <p>
            Ela aparece apenas nesta emissão. Compartilhe-a diretamente com o
            cliente por um canal de sua confiança.
          </p>
          <p>
            <strong>{credential.email}</strong>
          </p>
          <code>{credential.password}</code>
          <div className="pga-actions">
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credential.password);
                  setCopied(true);
                } catch {
                  setError(
                    "Não foi possível copiar. Selecione a senha e copie manualmente.",
                  );
                }
              }}
            >
              {copied ? "Copiada" : "Copiar senha"}
            </button>
            <button
              className="button secondary"
              onClick={() => setCredential(null)}
            >
              Ocultar senha
            </button>
          </div>
          <p>
            Entrada do cliente:{" "}
            <a href="/albuns/entrar" target="_blank" rel="noreferrer">
              /albuns/entrar ↗
            </a>
            . No primeiro acesso, ele escolherá uma senha pessoal.
          </p>
        </section>
      )}
      <section className="admin-card">
        <h2>Novo cliente</h2>
        <form onSubmit={create} className="pga-form">
          <label>
            Nome
            <input
              className="admin-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={120}
              required
              autoComplete="name"
            />
          </label>
          <label>
            E-mail
            <input
              className="admin-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={180}
              required
              autoComplete="email"
            />
          </label>
          <button className="button" disabled={busy} type="submit">
            {busy ? "Aguarde…" : authMode === "access" ? "Cadastrar cliente" : "Cadastrar e gerar senha"}
          </button>
        </form>
      </section>
      <section className="pga-list" aria-label="Clientes cadastrados">
        {loading && <p role="status">Carregando clientes…</p>}
        {!loading && clients.length === 0 && (
          <p>Nenhum cliente cadastrado. Comece pelo formulário acima.</p>
        )}
        {clients.map((client) => (
          <article className="admin-card pga-client" key={client.id}>
            <div>
              <h2>{client.name}</h2>
              <p>{client.email}</p>
              <span className="pga-badge">
                {client.disabledAt
                  ? "Desativado"
                  : authMode === "password" && client.mustChangePassword
                    ? "Aguardando troca de senha"
                    : "Ativo"}
              </span>
            </div>
            <div className="pga-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => manage(client, true)}
              >
                {authMode === "access" ? "Revogar sessões" : "Nova senha"}
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => manage(client)}
              >
                {client.disabledAt ? "Reativar" : "Desativar"}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
