export const SURFACE_CORRECTIONS_SCHEMA_SQL = `
  CREATE TABLE surface_corrections (
    actor_id TEXT NOT NULL,
    slot_key TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    correction TEXT NOT NULL,
    form TEXT,
    position INTEGER,
    revision INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (actor_id, slot_key, subject_kind, subject_id, correction)
  );
`;
