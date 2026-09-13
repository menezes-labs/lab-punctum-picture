"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./motion-preference";
import type { CarouselImage } from "../../lib/portfolio";

interface SpatialCarouselProps {
  images: readonly CarouselImage[];
  onSelectImage?: (image: CarouselImage) => void;
  className?: string;
  autoPlay?: boolean;
}

function bypassImageOptimizer(source: string) {
  return source.startsWith("/media/");
}

export function SpatialCarousel({
  images,
  onSelectImage,
  className = "",
  autoPlay = false,
}: SpatialCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Interaction tracking refs
  const startXRef = useRef(0);
  const startRotationRef = useRef(0);
  const velocityRef = useRef(0);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);
  const gestureRef = useRef<{id:number; y:number; axis:"pending"|"horizontal"|"vertical"} | null>(null);
  const movedRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);

  const count = images.length;
  const angleStep = count > 0 ? 360 / count : 0;
  const radius = Math.max(380, Math.round((count * 180) / (2 * Math.PI)));

  const reducedMotion = useReducedMotion();

  // Momentum decay animation
  const animateMomentum = useCallback(() => {
    function loop() {
      if (Math.abs(velocityRef.current) > 0.05) {
        velocityRef.current *= 0.94; // friction
        setRotation((prev) => prev + velocityRef.current);
        animFrameRef.current = requestAnimationFrame(loop);
      } else {
        velocityRef.current = 0;
      }
    }
    animFrameRef.current = requestAnimationFrame(loop);
  }, []);

  const handlePointerDown = (clientX: number) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setIsDragging(true);
    startXRef.current = clientX;
    lastXRef.current = clientX;
    lastTimeRef.current = performance.now();
    startRotationRef.current = rotation;
    velocityRef.current = 0;
  };

  const handlePointerMove = (clientX: number) => {
    if (!isDragging) return;
    const now = performance.now();
    const dt = Math.max(now - lastTimeRef.current, 1);
    const dx = clientX - lastXRef.current;

    // Drag sensitivity: 0.25 deg per pixel
    const deltaTotal = (clientX - startXRef.current) * 0.25;
    setRotation(startRotationRef.current + deltaTotal);

    velocityRef.current = (dx / dt) * 8;
    lastXRef.current = clientX;
    lastTimeRef.current = now;
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    animateMomentum();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      velocityRef.current = 0;
    }
    if (e.key === "ArrowLeft") {
      setRotation((prev) => prev + angleStep);
    } else if (e.key === "ArrowRight") {
      setRotation((prev) => prev - angleStep);
    }
  };

  useEffect(() => () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  useEffect(() => {
    if (reducedMotion && animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      velocityRef.current = 0;
    }
  }, [reducedMotion]);

  // Autoplay slow rotation if requested and not interacting
  useEffect(() => {
    if (!autoPlay || isDragging || reducedMotion) return;
    const interval = setInterval(() => {
      setRotation((prev) => prev - 0.2);
    }, 30);
    return () => clearInterval(interval);
  }, [autoPlay, isDragging, reducedMotion]);

  if (!images.length) return null;

  // Reduced motion fallback: elegant responsive gallery reel
  if (reducedMotion) {
    return (
      <div className={`spatial-carousel-fallback ${className}`}>
        <div className="spatial-fallback-grid">
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              className="spatial-fallback-item"
              onClick={() => onSelectImage?.(image)}
            >
              <Image
                src={image.src}
                alt={image.alt}
                width={640}
                height={800}
                unoptimized={bypassImageOptimizer(image.src)}
                sizes="(max-width: 699px) calc(100vw - 3rem), (max-width: 1199px) 50vw, 33vw"
                loading="lazy"
                decoding="async"
                className="spatial-card-image"
              />
              <span className="spatial-fallback-caption">
                {image.category} — {image.albumTitle}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`spatial-carousel-stage ${isDragging ? "is-dragging" : ""} ${className}`}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0) return;
        gestureRef.current = {id:e.pointerId,y:e.clientY,axis:"pending"};
        movedRef.current = false;
        handlePointerDown(e.clientX);
      }}
      onPointerMove={(e) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.id !== e.pointerId) return;
        const dx = Math.abs(e.clientX - startXRef.current);
        const dy = Math.abs(e.clientY - gesture.y);
        if (Math.max(dx,dy) > 6) movedRef.current = true;
        if (gesture.axis === "pending" && Math.max(dx,dy) > 6) {
          gesture.axis = dx > dy ? "horizontal" : "vertical";
          if (gesture.axis === "horizontal") e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (gesture.axis === "horizontal") handlePointerMove(e.clientX);
      }}
      onPointerUp={(e) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.id !== e.pointerId) return;
        gestureRef.current = null;
        if (gesture.axis === "horizontal") handlePointerUp();
        else setIsDragging(false);
      }}
      onPointerCancel={() => {
        gestureRef.current = null;
        movedRef.current = true;
        velocityRef.current = 0;
        setIsDragging(false);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      }}
      onPointerLeave={() => {
        if (gestureRef.current?.axis === "pending") {
          gestureRef.current = null;
          setIsDragging(false);
        }
      }}
      onDragStart={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="region"
      aria-label="Carrossel tridimensional de fotografias. Use as setas esquerda e direita para navegar ou arraste com o mouse/toque."
    >
      <div
        className="spatial-cylinder"
        style={{
          transform: `rotateY(${rotation}deg)`,
        }}
      >
        {images.map((image, index) => {
          const itemAngle = index * angleStep;
          const relativeAngle = ((itemAngle + rotation) % 360 + 360) % 360;
          const isFront = relativeAngle < 70 || relativeAngle > 290;

          return (
            <button
              key={image.id}
              type="button"
              tabIndex={isFront ? 0 : -1}
              aria-label={`Abrir ${image.albumTitle || image.alt}`}
              className={`spatial-card ${isFront ? "is-front" : "is-back"}`}
              style={{
                transform: `rotateY(${itemAngle}deg) translateZ(${radius}px)`,
              }}
              onClick={(e) => {
                if (e.detail === 0 || !movedRef.current) {
                  if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
                  velocityRef.current = 0;
                  onSelectImage?.(image);
                }
              }}
            >
              <div className="spatial-card-inner">
                <Image
                  src={image.src}
                  alt={image.alt}
                  width={640}
                  height={900}
                  unoptimized={bypassImageOptimizer(image.src)}
                  sizes="(max-width: 699px) 230px, (max-width: 1279px) 25vw, 320px"
                  loading="lazy"
                  decoding="async"
                  className="spatial-card-image"
                />
                <div className="spatial-card-overlay">
                  <span className="spatial-card-category">{image.category}</span>
                  <p className="spatial-card-title">{image.albumTitle}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="spatial-carousel-hud" aria-hidden="true">
        <span>Arraste ou use ← → para girar</span>
        <span>{images.length} fotografias em cena</span>
      </div>
    </div>
  );
}
