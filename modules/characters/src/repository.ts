import type { DatabaseSync } from "node:sqlite";
import type { CharacterDraft } from "@molis-ai/molis-work-contracts/modules/characters";

/** Personal draft storage only. Published contents belong to Artifacts. */
export class CharactersRepository {
  constructor(private readonly db: DatabaseSync, private readonly actorId: string) {}

  list(): CharacterDraft[] {
    return (this.db.prepare("SELECT record FROM character_drafts WHERE owner_actor_id = ? ORDER BY updated_at DESC, character_id")
      .all(this.actorId) as { record: string }[]).map(row => JSON.parse(row.record) as CharacterDraft);
  }

  get(id: string): CharacterDraft | null {
    const row = this.db.prepare("SELECT record FROM character_drafts WHERE character_id = ? AND owner_actor_id = ?")
      .get(id, this.actorId) as { record: string } | undefined;
    return row ? JSON.parse(row.record) as CharacterDraft : null;
  }

  insert(record: CharacterDraft): void {
    this.db.prepare("INSERT INTO character_drafts (character_id, owner_actor_id, revision, updated_at, record) VALUES (?, ?, ?, ?, ?)")
      .run(record.character_id, this.actorId, record.revision, record.updated_at, JSON.stringify(record));
  }

  replace(previousRevision: number, record: CharacterDraft): boolean {
    return this.db.prepare("UPDATE character_drafts SET revision = ?, updated_at = ?, record = ? WHERE character_id = ? AND owner_actor_id = ? AND revision = ?")
      .run(record.revision, record.updated_at, JSON.stringify(record), record.character_id, this.actorId, previousRevision).changes === 1;
  }

  /** Freeze a confirmed draft while a synchronous Artifact publisher reads it. */
  immediate<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
}
