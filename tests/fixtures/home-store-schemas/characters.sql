CREATE TABLE character_drafts (
      character_id TEXT PRIMARY KEY,
      owner_actor_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      record TEXT NOT NULL
    );
