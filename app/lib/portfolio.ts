import type { PublicArchiveImage } from "../../shared/public-content";

export type CarouselImage = {
  id: string;
  number: number | null;
  src: string;
  alt: string;
  albumSlug: string | null;
  albumTitle: string;
  category: string;
};

// This is an editorial selection, not an alternate portfolio database. Every
// referenced album image is resolved against published D1 content before use.
export const EDITORIAL_CAROUSEL_IMAGE_IDS = [
  "static-p009",
  "static-p015",
  "static-p027",
  "static-p033",
  "static-p054",
  "static-p061",
  "static-p071",
  "static-p079",
  "static-p089",
  "static-p102",
  "static-p110",
] as const;

const MARIA_HELENA_EDITORIAL_IMAGE: CarouselImage = {
  id: "editorial-maria-helena",
  number: 1,
  src: "/photos/p001-autorretrato.jpg",
  alt: "Maria Helena fotografando com uma câmera em um estádio",
  albumSlug: null,
  albumTitle: "Maria Helena",
  category: "Autorretrato",
};

function staticPhotoNumber(id: string): number | null {
  const match = id.match(/^static-p(\d{3})$/);
  return match ? Number(match[1]) : null;
}

export function buildEditorialCarousel(
  images: PublicArchiveImage[],
): CarouselImage[] {
  return [
    MARIA_HELENA_EDITORIAL_IMAGE,
    ...images.map((image) => ({
      id: image.id,
      number: staticPhotoNumber(image.id),
      src: image.url,
      alt: image.altText || `Fotografia do ensaio ${image.albumTitle}`,
      albumSlug: image.albumSlug,
      albumTitle: image.albumTitle,
      category:
        image.categories.map((category) => category.name).join(" · ") ||
        "Sem categoria",
    })),
  ];
}
