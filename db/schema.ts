import {
  index,
  foreignKey,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const siteSettings = sqliteTable("site_settings", {
  id: integer("id").primaryKey(),
  brandName: text("brand_name").notNull(),
  tagline: text("tagline"),
  aboutText: text("about_text"),
  whatsappE164: text("whatsapp_e164"),
  whatsappMessage: text("whatsapp_message"),
  instagramUrl: text("instagram_url"),
  contactEmail: text("contact_email"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  updatedAt: text("updated_at").notNull(),
});

export const siteConfig = sqliteTable("site_config", {
  id: integer("id").primaryKey(),
  schemaVersion: integer("schema_version").notNull(),
  configJson: text("config_json").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const siteConfigVersions = sqliteTable(
  "site_config_versions",
  {
    id: text("id").primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    state: text("state", { enum: ["draft", "published"] }).notNull(),
    revision: integer("revision").notNull(),
    configJson: text("config_json").notNull(),
    basedOnVersionId: text("based_on_version_id"),
    restoredFromVersionId: text("restored_from_version_id"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    publishedAt: text("published_at"),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    publishedBy: text("published_by"),
  },
  (table) => [
    uniqueIndex("idx_site_config_versions_single_draft")
      .on(table.state)
      .where(sql`${table.state} = 'draft'`),
    index("idx_site_config_versions_published_at").on(
      table.state,
      table.publishedAt,
    ),
  ],
);

export const siteConfigPointers = sqliteTable("site_config_pointers", {
  id: integer("id").primaryKey(),
  draftVersionId: text("draft_version_id")
    .notNull()
    .references(() => siteConfigVersions.id),
  publishedVersionId: text("published_version_id")
    .notNull()
    .references(() => siteConfigVersions.id),
  updatedAt: text("updated_at").notNull(),
});

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_categories_visible_sort").on(table.isVisible, table.sortOrder)],
);

export const albums = sqliteTable(
  "albums",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    location: text("location"),
    shootDate: text("shoot_date"),
    status: text("status", { enum: ["draft", "published", "archived"] }).notNull(),
    coverImageId: text("cover_image_id"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    publishedAt: text("published_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_albums_status_published_at").on(table.status, table.publishedAt),
    index("idx_albums_featured_sort").on(table.featured, table.sortOrder),
  ],
);

export const albumCategories = sqliteTable(
  "album_categories",
  {
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.albumId, table.categoryId] }),
    index("idx_album_categories_category_album").on(table.categoryId, table.albumId),
  ],
);

export const images = sqliteTable(
  "images",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    originalKey: text("original_key").notNull().unique(),
    originalFilename: text("original_filename"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    checksum: text("checksum"),
    altText: text("alt_text"),
    focalX: real("focal_x"),
    focalY: real("focal_y"),
    position: integer("position").notNull(),
    status: text("status", { enum: ["pending", "ready", "failed"] }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [index("idx_images_album_position").on(table.albumId, table.position)],
);

export const siteMedia = sqliteTable(
  "site_media",
  {
    id: text("id").primaryKey(),
    role: text("role", { enum: ["hero"] }).notNull(),
    storageKey: text("storage_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    status: text("status", { enum: ["pending", "ready", "failed"] }).notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_site_media_role_status_created").on(table.role, table.status, table.createdAt)],
);

export const uploadIntents = sqliteTable(
  "upload_intents",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    imageId: text("image_id")
      .notNull()
      .references(() => images.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    expectedMime: text("expected_mime").notNull(),
    expectedSize: integer("expected_size").notNull(),
    status: text("status", {
      enum: ["pending", "uploaded", "completed", "expired", "failed"],
    }).notNull(),
    createdBy: text("created_by").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
  },
  (table) => [index("idx_upload_intents_status_expires").on(table.status, table.expiresAt)],
);

export const inquiries = sqliteTable(
  "inquiries",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    instagram: text("instagram"),
    service: text("service"),
    desiredDate: text("desired_date"),
    message: text("message").notNull(),
    status: text("status", { enum: ["new", "read", "archived"] })
      .notNull()
      .default("new"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_inquiries_status_created").on(table.status, table.createdAt)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    dataJson: text("data_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_audit_log_created_at").on(table.createdAt)],
);

export const rateLimitBuckets = sqliteTable(
  "rate_limit_buckets",
  {
    bucketKey: text("bucket_key").primaryKey(),
    requestCount: integer("request_count").notNull(),
    windowStartedAt: text("window_started_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("idx_rate_limit_expires").on(table.expiresAt)],
);

export const backupRuns = sqliteTable(
  "backup_runs",
  {
    id: text("id").primaryKey(),
    objectKey: text("object_key").notNull(),
    status: text("status", { enum: ["completed", "failed"] }).notNull(),
    rowCountsJson: text("row_counts_json"),
    createdAt: text("created_at").notNull(),
    errorMessage: text("error_message"),
  },
  (table) => [index("idx_backup_runs_created").on(table.createdAt)],
);

export const adminCredentials = sqliteTable("admin_credentials", {
  id: integer("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
});

export const clientAccounts = sqliteTable("client_accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(1),
  disabledAt: text("disabled_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const clientGalleries = sqliteTable("client_galleries", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clientAccounts.id),
  title: text("title").notNull(),
  introduction: text("introduction").notNull().default(""),
  theme: text("theme", { enum: ["noir", "ivory", "warm"] }).notNull().default("noir"),
  coverImageId: text("cover_image_id"),
  allowDownloads: integer("allow_downloads", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  publishedAt: text("published_at"),
}, (t) => [index("idx_client_galleries_owner_status").on(t.clientId, t.status)]);
export const clientGalleryImages = sqliteTable("client_gallery_images", {
  id: text("id").primaryKey(),
  galleryId: text("gallery_id").notNull().references(() => clientGalleries.id),
  storageKey: text("storage_key").notNull().unique(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  altText: text("alt_text").notNull().default(""),
  position: integer("position").notNull(),
  status: text("status", { enum: ["pending", "ready", "failed"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
}, (t) => [index("idx_client_images_position").on(t.galleryId, t.position),
  index("idx_client_images_status").on(t.galleryId, t.status),
  uniqueIndex("idx_client_images_gallery_id").on(t.galleryId, t.id)]);
export const clientGalleryUploadIntents = sqliteTable("client_gallery_upload_intents", {
  id: text("id").primaryKey(),
  galleryId: text("gallery_id").notNull().references(() => clientGalleries.id),
  imageId: text("image_id").notNull(),
  expectedMime: text("expected_mime").notNull(),
  expectedSize: integer("expected_size").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  status: text("status", { enum: ["pending", "uploaded", "completed", "expired", "failed"] }).notNull().default("pending"),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, (t) => [index("idx_client_intents_expiry").on(t.status, t.expiresAt),
  foreignKey({columns:[t.galleryId,t.imageId],foreignColumns:[clientGalleryImages.galleryId,clientGalleryImages.id]})]);
export const clientGalleryFavorites = sqliteTable("client_gallery_favorites", {
  clientId: text("client_id").notNull().references(() => clientAccounts.id),
  galleryId: text("gallery_id").notNull().references(() => clientGalleries.id),
  imageId: text("image_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [primaryKey({ columns: [t.clientId, t.galleryId, t.imageId] }),
  foreignKey({columns:[t.galleryId,t.imageId],foreignColumns:[clientGalleryImages.galleryId,clientGalleryImages.id]})]);
