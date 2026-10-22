CREATE TABLE client_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE CHECK(email = lower(trim(email))),
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK(password_iterations >= 310000),
  must_change_password INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1)),
  session_version INTEGER NOT NULL DEFAULT 1,
  disabled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE client_galleries (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES client_accounts(id),
  title TEXT NOT NULL,
  introduction TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT 'noir' CHECK(theme IN ('noir','ivory','warm')),
  cover_image_id TEXT,
  allow_downloads INTEGER NOT NULL DEFAULT 0 CHECK(allow_downloads IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX idx_client_galleries_owner_status ON client_galleries(client_id,status);
CREATE TABLE client_gallery_images (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES client_galleries(id),
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 26214400),
  width INTEGER,
  height INTEGER,
  alt_text TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(gallery_id,id)
);
CREATE INDEX idx_client_images_position ON client_gallery_images(gallery_id,position);
CREATE INDEX idx_client_images_status ON client_gallery_images(gallery_id,status);
CREATE TABLE client_gallery_upload_intents (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES client_galleries(id),
  image_id TEXT NOT NULL,
  expected_mime TEXT NOT NULL,
  expected_size INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploaded','completed','expired','failed')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(gallery_id,image_id) REFERENCES client_gallery_images(gallery_id,id)
);
CREATE INDEX idx_client_intents_expiry ON client_gallery_upload_intents(status,expires_at);
CREATE TABLE client_gallery_favorites (
  client_id TEXT NOT NULL REFERENCES client_accounts(id),
  gallery_id TEXT NOT NULL REFERENCES client_galleries(id),
  image_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(client_id,gallery_id,image_id),
  FOREIGN KEY(gallery_id,image_id) REFERENCES client_gallery_images(gallery_id,id)
);
