"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { useSceneProgress } from "../../components/visual/useSceneProgress";
import type { EditorialConfig, HomeSectionConfig } from "../../../shared/config";
import type { CarouselImage } from "../../lib/portfolio";
import { EditorialText } from "../../components/EditorialText";
import { SpatialCarousel } from "../../components/visual/SpatialCarousel";
import { ExpandableDialog } from "../../components/visual/ExpandableDialog";
import { EdgeBlur } from "../../components/visual/EdgeBlur";
import { homeSectionAttributes } from "./section-attributes";

export function HomePhotoReelSection({
  copy,
  images,
  section,
}: {
  copy: EditorialConfig["home"]["carousel"];
  images: CarouselImage[];
  section: HomeSectionConfig;
}) {
  const [selectedImage, setSelectedImage] = useState<CarouselImage | null>(null);
  const scene = useSceneProgress();

  if (section.type !== "photo-reel") return null;

  const selectedImages = section.photoIds.length
    ? section.photoIds.flatMap((id) => {
        const image = images.find((candidate) => candidate.id === id);
        return image ? [image] : [];
      })
    : images.slice(0, 8);

  const variant = section.variant;

  return (
    <section
      ref={scene}
      className={`carousel-section carousel-section-${variant}`}
      aria-labelledby="carousel-title"
      {...homeSectionAttributes(section)}
    >
      <div className="carousel-heading reveal">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="carousel-title">
            <EditorialText text={copy.title} />
          </h2>
        </div>
        <p>{copy.body}</p>
      </div>

      {variant === "patch" ? (
        <div className="photo-patch-container">
          <EdgeBlur position="top" height="40px" />
          <div className="photo-patch" aria-label="Colagem de fotografias escolhidas">
            {selectedImages.slice(0, 6).map((image, index) => (
              <figure
                className={`photo-patch-item photo-patch-item-${index + 1}`}
                key={image.id}
                onClick={() => setSelectedImage(image)}
                style={{ cursor: "pointer" }}
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  unoptimized={image.src.startsWith("/media/")}
                  sizes="(max-width: 700px) 72vw, 32vw"
                />
                <figcaption>
                  <span>{image.category}</span>
                  <small>{image.albumTitle}</small>
                </figcaption>
              </figure>
            ))}
          </div>
          <EdgeBlur position="bottom" height="40px" />
        </div>
      ) : variant === "filmstrip" ? (
        <div className="filmstrip-reel-wrapper" aria-label="Sequência cinematográfica">
          <div className="filmstrip-sprocket-top" aria-hidden="true" />
          <div className="filmstrip-reel-track" tabIndex={0} role="region" aria-label="Fita de filme do acervo">
            {selectedImages.map((image, index) => (
              <div
                key={image.id}
                className="filmstrip-frame"
                onClick={() => setSelectedImage(image)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelectedImage(image);
                }}
              >
                <div className="filmstrip-frame-header">
                  <span className="filmstrip-number">#{String(index + 1).padStart(2, "0")}</span>
                  <span className="filmstrip-meta">35mm · ISO 400</span>
                </div>
                <div className="filmstrip-photo-wrap">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={720}
                    height={960}
                    unoptimized={image.src.startsWith("/media/")}
                    sizes="(max-width: 699px) 78vw, (max-width: 1199px) 52vw, 420px"
                    loading="lazy"
                    className="filmstrip-photo"
                  />
                </div>
                <div className="filmstrip-frame-footer">
                  <span className="filmstrip-title">{image.albumTitle}</span>
                  <span className="filmstrip-tag">{image.category}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="filmstrip-sprocket-bottom" aria-hidden="true" />
          <p className="filmstrip-hint">{copy.hint || "Deslize lateralmente para percorrer a fita de contato"}</p>
        </div>
      ) : (
        /* Default: horizontal 3D Spatial Carousel */
        <div className="spatial-reel-container" data-cursor="drag">
          <SpatialCarousel
            images={selectedImages}
            onSelectImage={(image) => setSelectedImage(image)}
          />
          <div className="spatial-reel-footer">
            <span className="spatial-reel-badge">Fotografias</span>
            <p className="spatial-reel-hint">
              {copy.hint || "Arraste para girar. Toque numa fotografia para abrir."}
            </p>
            <Link href="/arquivo" className="text-link" data-cursor="open">
              Ver arquivo completo ({images.length} fotografias) <ArrowUpRight size={15} />
            </Link>
          </div>

          {/* Folha de Contato Analógica — Negativos Selecionados */}
          <div className="home-contact-sheet">
            <div className="contact-sheet-header">
              <span className="contact-sheet-tag">Do acervo</span>
              <span className="contact-sheet-instruction">Abra uma fotografia para ver de perto</span>
            </div>
            <div className="contact-sheet-grid">
              {selectedImages.slice(0, 8).map((img) => (
                <button
                  key={img.id}
                  type="button"
                  className="contact-frame"
                  data-cursor="examine"
                  onClick={() => setSelectedImage(img)}
                  aria-label={`Examinar fotografia ${img.albumTitle || img.category}`}
                >
                  <div className="frame-image-wrapper">
                    <Image
                      src={img.src}
                      alt={img.alt}
                      width={280}
                      height={360}
                      unoptimized
                      sizes="140px"
                    />
                  </div>
                  
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ExpandableDialog
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </section>
  );
}
