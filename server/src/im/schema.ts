import type { ImDatabase } from "./types.js";

/** Shared identity and event tables must already exist; IM never creates them. */
export function createImSchema(db: ImDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS im_rooms (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES mw_members(id),
      invite_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS im_members (
      room_id TEXT NOT NULL REFERENCES im_rooms(id), member_id TEXT NOT NULL REFERENCES mw_members(id),
      joined_at TEXT NOT NULL, PRIMARY KEY(room_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS im_threads (
      id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES im_rooms(id), title TEXT NOT NULL,
      source_message_id TEXT REFERENCES im_messages(id),
      created_by TEXT NOT NULL REFERENCES mw_members(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS im_messages (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      room_id TEXT NOT NULL REFERENCES im_rooms(id), thread_id TEXT REFERENCES im_threads(id),
      author_id TEXT NOT NULL REFERENCES mw_members(id), body TEXT NOT NULL,
      shared_message_id TEXT REFERENCES im_messages(id), created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS im_messages_stream ON im_messages(room_id, thread_id, sequence);
    CREATE TABLE IF NOT EXISTS im_thread_context (
      thread_id TEXT NOT NULL REFERENCES im_threads(id), message_id TEXT NOT NULL REFERENCES im_messages(id),
      position INTEGER NOT NULL, PRIMARY KEY(thread_id, message_id)
    );
    CREATE TABLE IF NOT EXISTS im_receipts (
      session_id TEXT NOT NULL REFERENCES mw_sessions(id), client_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL, result_json TEXT NOT NULL,
      PRIMARY KEY(session_id, client_id)
    );
  `);
  const columns = (table: string) => db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[];
  if (!columns('im_rooms').some(c => c.name === 'project_id')) db.exec('ALTER TABLE im_rooms ADD COLUMN project_id TEXT REFERENCES mw_projects(id)');
  if (!columns('im_messages').some(c => c.name === 'quote_id')) db.exec('ALTER TABLE im_messages ADD COLUMN quote_id TEXT REFERENCES im_messages(id)');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS im_project_room ON im_rooms(project_id) WHERE project_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS im_read_positions (
      member_id TEXT NOT NULL REFERENCES mw_members(id), room_id TEXT NOT NULL REFERENCES im_rooms(id),
      target TEXT NOT NULL, sequence INTEGER NOT NULL, PRIMARY KEY(member_id,room_id,target)
    );`);
  // Preserve identifiers and dependent foreign keys while making the source optional.
  if (columns('im_threads').find(c => c.name === 'source_message_id')?.notnull) {
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.transaction(() => db.exec(`CREATE TABLE im_threads_next (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES im_rooms(id), title TEXT NOT NULL,
        source_message_id TEXT REFERENCES im_messages(id), created_by TEXT NOT NULL REFERENCES mw_members(id),
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        INSERT INTO im_threads_next SELECT * FROM im_threads;
        DROP TABLE im_threads; ALTER TABLE im_threads_next RENAME TO im_threads;`)).immediate();
    } finally { db.exec('PRAGMA foreign_keys = ON'); }
  }
}
