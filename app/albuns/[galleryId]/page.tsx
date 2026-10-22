import { PrivateGallery } from "../components/PrivateGallery";
export const metadata={title:"Seu álbum"};
export default async function GalleryPage({params}:{params:Promise<{galleryId:string}>}) {
  const {galleryId}=await params; return <PrivateGallery galleryId={galleryId}/>;
}
