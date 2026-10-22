import { describe, expect, it } from "vitest";
import {
  galleryHref,
  privateImageUrl,
  loginErrorMessage,
} from "../../app/albuns/components/routes";
import { themeTokens } from "../../app/albuns/components/theme";
import {
  canSubmitPrivateGallery,
  uploadQueueBatch,
  runPrivateUploadQueue,
} from "../../app/admin/components/private-gallery-utils";

describe("private client navigation", () => {
  it("uses authenticated media paths and meaningful login errors", () => {
    expect(galleryHref("test-id")).toBe("/albuns/test-id");
    expect(privateImageUrl("gallery", "image", "thumb")).toBe(
      "/api/client/galleries/gallery/images/image/thumb",
    );
    expect(privateImageUrl("gallery", "image", "download", true)).toBe(
      "/admin/api/albuns-privados/gallery/images/image/download",
    );
    expect(loginErrorMessage(401)).toBe("E-mail ou senha incorretos.");
    expect(loginErrorMessage(429)).toContain("tentativas");
    expect(privateImageUrl("a/b", "c?d", "gallery")).not.toContain("a/b");
  });
  it("maps only known themes to fixed visual tokens", () => {
    expect(themeTokens("ivory")).not.toEqual(themeTokens("noir"));
    expect(themeTokens("warm")).not.toEqual(themeTokens("noir"));
    expect(themeTokens("url(https://evil.example)")).toEqual(
      themeTokens("noir"),
    );
  });
  it("requires a title and client and only queues incomplete work with three simultaneous uploads", async () => {
    expect(canSubmitPrivateGallery({ title: " ", clientId: "client" })).toBe(
      false,
    );
    expect(canSubmitPrivateGallery({ title: "Ensaio", clientId: "" })).toBe(
      false,
    );
    expect(
      canSubmitPrivateGallery({ title: "Ensaio", clientId: "client" }),
    ).toBe(true);
    expect(uploadQueueBatch([1, 2, 3, 4, 5], 3)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    let active = 0;
    let max = 0;
    const called: string[] = [];
    await runPrivateUploadQueue(
      [
        { id: "done", status: "completed" },
        { id: "1", status: "queued" },
        { id: "2", status: "failed" },
        { id: "3", status: "queued" },
        { id: "4", status: "queued" },
      ],
      async (job) => {
        active++;
        max = Math.max(max, active);
        called.push(job.id);
        await Promise.resolve();
        active--;
      },
    );
    expect(max).toBeLessThanOrEqual(3);
    expect(called).toEqual(["1", "2", "3", "4"]);
  });
});
