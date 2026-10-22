import { describe, expect, it } from "vitest";
import { clientAccountCreateSchema, clientGalleryCreateSchema, clientGalleryUpdateSchema, clientImageIntentSchema, CLIENT_MAX_UPLOAD_BYTES } from "../../shared/client-galleries";

describe("private gallery contracts", () => {
  it("accepts a bounded private gallery and rejects arbitrary styles/fields", () => {
    const input = { clientId: "11111111-1111-4111-8111-111111111111", title: "Ensaio", theme: "noir" };
    expect(clientGalleryCreateSchema.safeParse(input).success).toBe(true);
    expect(clientGalleryCreateSchema.safeParse({ ...input, theme: "custom-script" }).success).toBe(false);
    expect(clientGalleryCreateSchema.safeParse({ ...input, status: "published" }).success).toBe(false);
    expect(clientGalleryUpdateSchema.safeParse({ clientId: input.clientId }).success).toBe(false);
  });
  it("normalizes accounts and bounds file sizes and MIME", () => {
    expect(clientAccountCreateSchema.parse({ name: " Ana ", email: "ANA@EXAMPLE.COM " }).email).toBe("ana@example.com");
    expect(CLIENT_MAX_UPLOAD_BYTES).toBe(26_214_400);
    const input = { filename: "a.jpg", mimeType: "image/jpeg", sizeBytes: 26_214_400 };
    expect(clientImageIntentSchema.safeParse(input).success).toBe(true);
    expect(clientImageIntentSchema.safeParse({ ...input, sizeBytes: 26_214_401 }).success).toBe(false);
    expect(clientImageIntentSchema.safeParse({ ...input, mimeType: "image/gif" }).success).toBe(false);
  });
});
