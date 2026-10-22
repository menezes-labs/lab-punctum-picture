import { PrivateGalleryEditor } from "../../components/PrivateGalleryEditor";
export const metadata={title:"Editar álbum privado"};
export default async function EditorPage({params}:{params:Promise<{galleryId:string}>}){const {galleryId}=await params;return <PrivateGalleryEditor galleryId={galleryId}/>;}
