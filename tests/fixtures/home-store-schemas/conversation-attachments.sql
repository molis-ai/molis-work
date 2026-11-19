CREATE TABLE attachments (
  plugin_id TEXT NOT NULL,
  install_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  text TEXT,
  text_meta TEXT,
  attached_at TEXT NOT NULL,
  PRIMARY KEY (plugin_id, install_id, project_id, sha256));
CREATE INDEX attachments_by_content ON attachments (sha256);
