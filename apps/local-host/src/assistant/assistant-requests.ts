import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";

/** The existing Send ledger: claiming writes; checking never creates or repeats a Send. */
export class AssistantRequests {
  constructor(private readonly db: DatabaseSync, private readonly now: () => Date) {}
  read(actorId: string, requestId: string): { state: "unknown" | "not-sent" } | { state: "sent"; result: AssistantSendResult } {
    const row = this.db.prepare("SELECT state, result FROM assistant_requests WHERE actor_id=? AND request_id=?").get(actorId, requestId) as { state: string; result: string | null } | undefined;
    if (!row) return { state: "not-sent" };
    return row.state === "done" && row.result ? { state: "sent", result: JSON.parse(row.result) as AssistantSendResult } : { state: "unknown" };
  }
  /**
   * Claim one Send. A repeat of a finished Send returns its outcome; a repeat while the first is still in flight is
   * refused rather than run twice. A Send that failed before it did anything is released so it can be tried again.
   */
  claimRequest(actorId: string, requestId: string): { claimed: true } | { claimed: false; result: AssistantSendResult } {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(requestId)) throw assistantErrors.conflict("发送标识无效，请重新发送");
    const inserted = this.db.prepare("INSERT OR IGNORE INTO assistant_requests(actor_id,request_id,state,created_at) VALUES (?,?,'pending',?)")
      .run(actorId, requestId, this.now().toISOString()).changes;
    if (inserted) return { claimed: true };
    const row = this.db.prepare("SELECT state, result FROM assistant_requests WHERE actor_id=? AND request_id=?").get(actorId, requestId) as { state: string; result: string | null };
    if (row.state !== "done" || !row.result) throw assistantErrors.pending_request("这次发送还在处理，不会重复提交");
    return { claimed: false, result: { ...(JSON.parse(row.result) as AssistantSendResult), outcome: "repeated" } };
  }

  finishRequest(actorId: string, requestId: string, result: AssistantSendResult): void {
    this.db.prepare("UPDATE assistant_requests SET state='done', work_id=?, result=? WHERE actor_id=? AND request_id=?")
      .run(result.work.work_id, JSON.stringify(result), actorId, requestId);
  }

  releaseRequest(actorId: string, requestId: string): void {
    this.db.prepare("DELETE FROM assistant_requests WHERE actor_id=? AND request_id=? AND state='pending'").run(actorId, requestId);
  }
}
