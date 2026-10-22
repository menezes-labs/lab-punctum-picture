import { describe, it, expect } from "vitest";
import {
  privatePreviewConfig,
  waitForPreviewStatus,
  PRIVATE_PREVIEW_NAMES,
} from "../../scripts/lib/private-preview.mjs";
describe("isolated gallery preview", () => {
  it("replaces all production bindings, routes, secrets and schedules", () => {
    const config = privatePreviewConfig(
      {
        account_id: "wrong",
        name: "production",
        routes: [{ pattern: "punctumpicture.com" }],
        triggers: { crons: ["0 * * * *"] },
        vars: {
          ENVIRONMENT: "production",
          SITE_ORIGIN: "https://punctumpicture.com",
          ADMIN_SESSION_SECRET: "old",
        },
        d1_databases: [{ database_id: "22697f13-7484-41e3-9441-f7b902c6577a" }],
        r2_buckets: [{ bucket_name: "punctum-picture-originals" }],
      },
      {
        databaseId: "22222222-2222-4222-8222-222222222222",
        origin: "https://preview.example.workers.dev",
      },
    );
    expect(config.name).toBe(PRIVATE_PREVIEW_NAMES.worker);
    expect(config.routes).toEqual([]);
    expect(config.triggers.crons).toEqual([]);
    expect(config.vars.PRIVATE_GALLERIES_ENABLED).toBe("true");
    expect(config.vars.ENVIRONMENT).toBe("preview");
    expect(config.vars.ADMIN_SESSION_SECRET).toBeUndefined();
    expect(config.vars.SITE_ORIGIN).toBe("https://preview.example.workers.dev");
    expect(config.d1_databases[0].database_name).toBe(
      PRIVATE_PREVIEW_NAMES.database,
    );
    expect(
      config.r2_buckets.every((b: { bucket_name: string }) =>
        b.bucket_name.includes("albums-qa"),
      ),
    ).toBe(true);
  });
  it("refuses production IDs, origins and invalid restoration bindings", () => {
    for (const databaseId of [
      "22697f13-7484-41e3-9441-f7b902c6577a",
      "4e959036-a3f0-4faf-bda2-fca9b4c5e984",
      "",
    ]) {
      expect(() =>
        privatePreviewConfig(
          {},
          { databaseId, origin: "https://qa.example.workers.dev" },
        ),
      ).toThrow();
    }
    expect(() =>
      privatePreviewConfig(
        {},
        {
          databaseId: "22222222-2222-4222-8222-222222222222",
          origin: "https://punctumpicture.com",
        },
      ),
    ).toThrow();
    const restored = privatePreviewConfig(
      {},
      {
        databaseId: "33333333-3333-4333-8333-333333333333",
        origin: "https://qa.example.workers.dev",
        restored: true,
      },
    );
    expect(restored.d1_databases[0].database_name).toBe(
      PRIVATE_PREVIEW_NAMES.restoreDatabase,
    );
    expect(restored.r2_buckets[0].bucket_name).toBe(
      PRIVATE_PREVIEW_NAMES.restoreOriginals,
    );
  });
});

describe("preview propagation gate", () => {
  it("waits for a newly rotated session before allowing the pilot to continue", async () => {
    const statuses = [403, 403, 200];
    let probes = 0,
      pauses = 0;
    await waitForPreviewStatus({
      probe: async () => {
        probes++;
        return statuses.shift()!;
      },
      pause: async () => {
        pauses++;
      },
    });
    expect(probes).toBe(3);
    expect(pauses).toBe(2);
  });
  it("fails closed for persistent auth failures and unrelated server errors", async () => {
    await expect(
      waitForPreviewStatus({
        probe: async () => 403,
        pause: async () => {},
        attempts: 2,
      }),
    ).rejects.toThrow("timed out");
    await expect(
      waitForPreviewStatus({ probe: async () => 500, pause: async () => {} }),
    ).rejects.toThrow("HTTP 500");
  });
});
