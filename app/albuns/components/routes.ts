export function galleryHref(id: string) {
  return "/albuns/" + encodeURIComponent(id);
}
export function privateImageUrl(
  galleryId: string,
  imageId: string,
  preset: "thumb" | "gallery" | "download",
  admin = false,
) {
  return (
    (admin ? "/admin/api/albuns-privados/" : "/api/client/galleries/") +
    encodeURIComponent(galleryId) +
    "/images/" +
    encodeURIComponent(imageId) +
    "/" +
    preset
  );
}
export function loginErrorMessage(status: number) {
  if (status === 401) return "E-mail ou senha incorretos.";
  if (status === 429) return "Muitas tentativas. Aguarde e tente novamente.";
  return "Não foi possível entrar. Tente novamente.";
}
