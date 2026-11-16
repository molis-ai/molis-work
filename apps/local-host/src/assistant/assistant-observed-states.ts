import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import type { AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import { attentionChanged } from "../attention-changes.js";

type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

/** The state the Host last saw each work in, kept apart from the work, so noticing never conflicts with the person's edits. */
export class AssistantObservedStates {
  constructor(private readonly db: DatabaseSync) {}

  of(actorId: string, workId: string): AssistantWorkState | null {
    const row = this.db.prepare("SELECT state FROM assistant_observed WHERE actor_id=? AND work_id=?").get(actorId, workId);
    return row ? String(row.state) as AssistantWorkState : null;
  }

  /** A state that differs from the last one seen is news to the page's 「等你」 (WLN-27). */
  set(actorId: string, workId: string, state: AssistantWorkState): void {
    const changed = this.db.prepare("INSERT INTO assistant_observed(actor_id,work_id,state) VALUES (?,?,?) ON CONFLICT(actor_id,work_id) DO UPDATE SET state=excluded.state WHERE state <> excluded.state").run(actorId, workId, state).changes;
    if (changed) attentionChanged(null);
  }
}
