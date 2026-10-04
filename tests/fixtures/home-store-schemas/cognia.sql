CREATE TABLE cognia_domains (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);

CREATE TABLE cognia_drafts (id TEXT PRIMARY KEY,body TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);

CREATE TABLE cognia_materials (id TEXT PRIMARY KEY,source_id TEXT NOT NULL,path TEXT NOT NULL,updated_at TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(source_id,path));

CREATE TABLE cognia_previews (id TEXT PRIMARY KEY,body TEXT NOT NULL,expires_at INTEGER NOT NULL,receipt TEXT);

CREATE TABLE cognia_sources (id TEXT PRIMARY KEY,body TEXT NOT NULL);

CREATE TABLE cognia_versions (material_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(material_id,revision));
