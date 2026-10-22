import { describe,expect,it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PhotoViewer } from "../../app/albuns/components/PhotoViewer";
describe("private viewer feedback",()=>{
  it("renders favorite failure feedback inside the modal",()=>{
    const html=renderToStaticMarkup(createElement(PhotoViewer,{
      galleryId:"gallery",images:[{id:"image",altText:"Retrato",originalFilename:"photo.jpg",position:0,status:"ready" as const,favorite:false}],
      index:0,onIndex:()=>{},onClose:()=>{},onFavorite:()=>{},allowDownloads:false,busy:false,error:"Não foi possível salvar a favorita.",
    }));
    const dialog=html.slice(html.indexOf("<dialog"));
    expect(dialog).toContain('role="alert"');
    expect(dialog).toContain("Não foi possível salvar a favorita.");
  });
});
