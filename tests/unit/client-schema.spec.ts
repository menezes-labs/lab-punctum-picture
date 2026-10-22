import { describe,expect,it } from "vitest";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { clientGalleryUploadIntents,clientGalleryFavorites } from "../../db/schema";
describe("private relational invariants",()=>{
  it("keeps the same-gallery image foreign key in both ORM relationships",()=>{
    for(const table of [clientGalleryUploadIntents,clientGalleryFavorites]){
      const relations=getTableConfig(table).foreignKeys.map(key=>key.reference());
      expect(relations.some(r=>r.columns.map(c=>c.name).join(",")==="gallery_id,image_id"
        && r.foreignColumns.map(c=>c.name).join(",")==="gallery_id,id")).toBe(true);
    }
  });
});
