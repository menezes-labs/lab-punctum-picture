/* eslint-disable @next/next/no-img-element -- Private media must use authenticated Worker endpoints, without the public image optimizer. */
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ClientGallery } from "../../../shared/client-galleries";
import { ClientHeader } from "./ClientHeader";
import { privateApi, errorMessage } from "./api";
import { galleryHref, privateImageUrl } from "./routes";
export function ClientLibrary() {
  const [galleries, setGalleries] = useState<ClientGallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    privateApi<{ galleries: ClientGallery[] }>("/api/client/galleries")
      .then((data) => {
        if (active) setGalleries(data.galleries);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <ClientHeader />
      <main className="pa-library">
        <p className="pa-eyebrow">Sua coleção particular</p>
        <h1>
          Memórias para
          <br />
          <em>ficar perto.</em>
        </h1>
        <div className="pa-section-heading">
          <span>Meus álbuns</span>
          <span>{galleries.length.toString().padStart(2, "0")}</span>
        </div>
        {loading && (
          <p role="status" className="pa-caption">
            Preparando os seus álbuns…
          </p>
        )}
        {error && (
          <p role="alert" className="pa-error">
            {error}
          </p>
        )}
        {!loading && !error && galleries.length === 0 && (
          <div className="pa-empty">
            <h2>Suas fotografias chegam em breve.</h2>
            <p>
              Quando o estúdio publicar um álbum para você, ele aparecerá aqui.
            </p>
          </div>
        )}
        <div className="pa-album-grid">
          {galleries.map((g, index) => (
            <Link
              className="pa-album-card"
              href={galleryHref(g.id)}
              prefetch={false}
              key={g.id}
            >
              {g.coverImageId && (
                <img
                  src={privateImageUrl(g.id, g.coverImageId, "gallery")}
                  alt={"Capa de " + g.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              )}
              <div>
                <span className="pa-eyebrow">
                  {String(index + 1).padStart(2, "0")} / Coleção privada
                </span>
                <h2>{g.title}</h2>
                <span aria-hidden="true">Explorar álbum ↗</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
