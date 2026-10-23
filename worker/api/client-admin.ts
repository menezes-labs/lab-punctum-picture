import { z } from "zod";
import {
  clientAccountCreateSchema,
  clientGalleryCreateSchema,
  clientGalleryUpdateSchema,
} from "../../shared/client-galleries";
import {
  getActiveClient,
  getGallery,
  getReadyGalleryImage,
  listAllGalleries,
  listGalleryImages,
  serializeGallery,
  serializeImage,
} from "../client/repository";
import { generateTemporaryPassword } from "../client/passwords";
import { hashClientPasswordWithProvider } from "../client/password-provider";
import { privateJson } from "../client/response";
import { assertAllowedOrigin, requireAdmin } from "../utils/auth";
import { writeAudit } from "../utils/audit";
import { requireDb } from "../utils/env";
import { AppError } from "../utils/errors";
import { assertRateLimit } from "../utils/rate-limit";
import { parseJson } from "../client/validation";
import { clientAuthMode } from "../client/auth-mode";

const accountColumns =
  "id,name,email,disabled_at AS disabledAt,must_change_password AS mustChangePassword,created_at AS createdAt";
export async function handleClientAdminApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (/^\/admin\/api\/albuns-privados(?:\/|$)/.test(url.pathname))
    return handleGalleryAdminApi(request, url, env);
  if (!/^\/admin\/api\/clientes(?:\/|$)/.test(url.pathname)) return null;
  const actor = await requireAdmin(request, env);
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  const mode = clientAuthMode(env);
  await assertRateLimit(request, db, "client-admin", 200, 60);
  const match = url.pathname.match(
    /^\/admin\/api\/clientes(?:\/([^/]+)(?:\/(reset-password))?)?$/,
  );
  if (!match) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  const id = match[1];
  if (!id && request.method === "GET") {
    return privateJson({
      authMode: mode,
      clients: (
        await db
          .prepare(
            `SELECT ${accountColumns} FROM client_accounts ORDER BY created_at DESC,id`,
          )
          .all()
      ).results,
    });
  }
  if (!id && request.method === "POST") {
    const input = await parseJson(request, clientAccountCreateSchema);
    if (
      await db
        .prepare("SELECT id FROM client_accounts WHERE email=?")
        .bind(input.email)
        .first()
    )
      throw new AppError(
        409,
        "EMAIL_EXISTS",
        "Já existe um cliente com este e-mail.",
      );
    const temporaryPassword =
      mode === "password" ? generateTemporaryPassword() : undefined;
    const credential =
      temporaryPassword
        ? await hashClientPasswordWithProvider(temporaryPassword, env)
        : { passwordHash: "ACCESS_ONLY", passwordSalt: "ACCESS_ONLY", passwordIterations: 310_000 };
    const clientId = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db
        .prepare(
          `INSERT INTO client_accounts
        (id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,1,?,?)`,
        )
        .bind(
          clientId,
          input.name,
          input.email,
          credential.passwordHash,
          credential.passwordSalt,
          credential.passwordIterations,
          mode === "password" ? 1 : 0,
          now,
          now,
        )
        .run();
    } catch (e) {
      if (String(e).includes("UNIQUE constraint"))
        throw new AppError(
          409,
          "EMAIL_EXISTS",
          "Já existe um cliente com este e-mail.",
        );
      throw e;
    }
    await writeAudit(
      db,
      actor.email,
      "client.created",
      "client_account",
      clientId,
    );
    return privateJson(
      {
        client: { id: clientId, name: input.name, email: input.email },
        ...(temporaryPassword ? { temporaryPassword } : {}),
        authMode: mode,
      },
      { status: 201 },
    );
  }
  const existing = await db
    .prepare("SELECT id FROM client_accounts WHERE id=?")
    .bind(id ?? "")
    .first();
  if (!existing)
    throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  if (match[2] && request.method === "POST") {
    if (mode === "access") {
      await db
        .prepare(
          `UPDATE client_accounts SET password_hash='ACCESS_ONLY',password_salt='ACCESS_ONLY',
          password_iterations=310000,must_change_password=0,
          session_version=session_version+1,updated_at=? WHERE id=?`,
        )
        .bind(new Date().toISOString(), id)
        .run();
      await writeAudit(db, actor.email, "client.access_reauthorized", "client_account", id);
      return privateJson({ ok: true, authMode: mode });
    }
    const temporaryPassword = generateTemporaryPassword();
    const c = await hashClientPassword(temporaryPassword);
    await db
      .prepare(
        `UPDATE client_accounts SET password_hash=?,password_salt=?,password_iterations=?,
      must_change_password=1,session_version=session_version+1,updated_at=? WHERE id=?`,
      )
      .bind(
        c.passwordHash,
        c.passwordSalt,
        c.passwordIterations,
        new Date().toISOString(),
        id,
      )
      .run();
    await writeAudit(
      db,
      actor.email,
      "client.password_reset",
      "client_account",
      id,
    );
    return privateJson({ temporaryPassword });
  }
  if (!match[2] && request.method === "PATCH") {
    const input = await parseJson(
      request,
      z.object({ disabled: z.boolean() }).strict(),
    );
    await db
      .prepare(
        "UPDATE client_accounts SET disabled_at=?,session_version=session_version+1,updated_at=? WHERE id=?",
      )
      .bind(
        input.disabled ? new Date().toISOString() : null,
        new Date().toISOString(),
        id,
      )
      .run();
    await writeAudit(
      db,
      actor.email,
      input.disabled ? "client.disabled" : "client.enabled",
      "client_account",
      id,
    );
    return privateJson({ ok: true });
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
}

async function handleGalleryAdminApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const actor = await requireAdmin(request, env);
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  await assertRateLimit(request, db, "private-gallery-admin", 200, 60);
  const match = url.pathname.match(
    /^\/admin\/api\/albuns-privados(?:\/([^/]+)(?:\/(cover|order|publish|archive|unpublish))?)?$/,
  );
  if (!match) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  const id = match[1];
  if (!id && request.method === "GET")
    return privateJson({
      galleries: (await listAllGalleries(db)).map(serializeGallery),
    });
  if (!id && request.method === "POST") {
    const input = await parseJson(request, clientGalleryCreateSchema);
    if (!(await getActiveClient(db, input.clientId)))
      throw new AppError(404, "NOT_FOUND", "Cliente indisponível.");
    const galleryId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO client_galleries (id,client_id,title,introduction,theme,allow_downloads,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'draft',?,?)`,
      )
      .bind(
        galleryId,
        input.clientId,
        input.title,
        input.introduction ?? "",
        input.theme,
        input.allowDownloads ? 1 : 0,
        now,
        now,
      )
      .run();
    await writeAudit(
      db,
      actor.email,
      "client_gallery.created",
      "client_gallery",
      galleryId,
    );
    return privateJson(
      { gallery: serializeGallery((await getGallery(db, galleryId))!) },
      { status: 201 },
    );
  }
  const gallery = id ? await getGallery(db, id) : null;
  if (!gallery) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  const action = match[2];
  if (action === "cover" && request.method === "PUT") {
    const input = await parseJson(
      request,
      z.object({ imageId: z.uuid() }).strict(),
    );
    if (!(await getReadyGalleryImage(db, id, input.imageId)))
      throw new AppError(404, "NOT_FOUND", "Foto indisponível neste álbum.");
    await db
      .prepare(
        "UPDATE client_galleries SET cover_image_id=?,updated_at=? WHERE id=?",
      )
      .bind(input.imageId, new Date().toISOString(), id)
      .run();
    await writeAudit(
      db,
      actor.email,
      "client_gallery.cover_changed",
      "client_gallery",
      id,
    );
    return privateJson({ ok: true });
  }
  if (action === "order" && request.method === "PUT") {
    const input = await parseJson(
      request,
      z.object({ imageIds: z.array(z.uuid()).min(1).max(1000) }).strict(),
    );
    const images = await listGalleryImages(db, id);
    const unique = new Set(input.imageIds);
    if (
      unique.size !== input.imageIds.length ||
      images.length !== unique.size ||
      images.some((i) => !unique.has(i.id))
    )
      throw new AppError(
        400,
        "INVALID_ORDER",
        "Inclua cada foto do álbum uma única vez.",
      );
    await db.batch(
      input.imageIds.map((imageId, position) =>
        db
          .prepare(
            "UPDATE client_gallery_images SET position=?,updated_at=? WHERE id=? AND gallery_id=?",
          )
          .bind(position, new Date().toISOString(), imageId, id),
      ),
    );
    return privateJson({ ok: true });
  }
  if (action === "publish" && request.method === "POST") {
    const now = new Date().toISOString();
    const published = await db
      .prepare(
        `UPDATE client_galleries SET status='published',published_at=COALESCE(published_at,?),updated_at=?
      WHERE id=? AND length(trim(title))>0
      AND EXISTS(SELECT 1 FROM client_accounts c WHERE c.id=client_galleries.client_id AND c.disabled_at IS NULL)
      AND EXISTS(SELECT 1 FROM client_gallery_images i WHERE i.id=client_galleries.cover_image_id AND i.gallery_id=client_galleries.id AND i.status='ready' AND i.deleted_at IS NULL)
      RETURNING id`,
      )
      .bind(now, now, id)
      .first();
    if (!published)
      throw new AppError(
        409,
        "PUBLISH_INCOMPLETE",
        "Defina título, cliente ativo e capa com uma foto pronta antes de publicar.",
      );
    await writeAudit(
      db,
      actor.email,
      "client_gallery.published",
      "client_gallery",
      id,
    );
    return privateJson({ ok: true });
  }
  if (
    (action === "archive" || action === "unpublish") &&
    request.method === "POST"
  ) {
    await db
      .prepare("UPDATE client_galleries SET status=?,updated_at=? WHERE id=?")
      .bind(
        action === "archive" ? "archived" : "draft",
        new Date().toISOString(),
        id,
      )
      .run();
    await writeAudit(
      db,
      actor.email,
      "client_gallery." + action,
      "client_gallery",
      id,
    );
    return privateJson({ ok: true });
  }
  if (!action && request.method === "GET") {
    const favorites = (
      await db
        .prepare(
          "SELECT image_id AS imageId,COUNT(*) AS count FROM client_gallery_favorites WHERE gallery_id=? GROUP BY image_id",
        )
        .bind(id)
        .all<{ imageId: string; count: number }>()
    ).results;
    const counts = new Map(favorites.map((f) => [f.imageId, f.count]));
    return privateJson({
      gallery: {
        ...serializeGallery(gallery),
        favoriteCount: favorites.reduce((sum, f) => sum + f.count, 0),
        images: (await listGalleryImages(db, id)).map((i) => ({
          ...serializeImage(i),
          favoriteCount: counts.get(i.id) ?? 0,
        })),
      },
    });
  }
  if (!action && request.method === "PATCH") {
    const input = await parseJson(request, clientGalleryUpdateSchema);
    const columns = {
      title: "title",
      introduction: "introduction",
      theme: "theme",
      allowDownloads: "allow_downloads",
    } as const;
    const assignments: string[] = [];
    const values: (string | number)[] = [];
    for (const field of Object.keys(columns) as (keyof typeof columns)[]) {
      const value = input[field];
      if (value === undefined) continue;
      assignments.push(columns[field] + "=?");
      values.push(typeof value === "boolean" ? Number(value) : value);
    }
    assignments.push("updated_at=?");
    values.push(new Date().toISOString(), id);
    await db
      .prepare(
        "UPDATE client_galleries SET " + assignments.join(",") + " WHERE id=?",
      )
      .bind(...values)
      .run();
    await writeAudit(
      db,
      actor.email,
      "client_gallery.updated",
      "client_gallery",
      id,
    );
    return privateJson({
      gallery: serializeGallery((await getGallery(db, id))!),
    });
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
}
