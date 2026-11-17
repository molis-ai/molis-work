import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;
import type { AssistantSendResult, AssistantRequestResult } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";

/** The existing Send ledger: claiming writes; checking never creates or repeats a Send. */
export class AssistantRequests {
  constructor(private readonly db: DatabaseSync, private readonly now: () => Date) {}
  read(actorId: string, requestId: string): { state: "unknown" | "not-sent" } | { state: "sent"; result: AssistantRequestResult } {
    const row = this.db.prepare("SELECT state, result FROM assistant_requests WHERE actor_id=? AND request_id=?").get(actorId, requestId) as { state: string; result: string | null } | undefined;
    if (!row) return { state: "not-sent" };
    return row.state === "done" && row.result ? { state: "sent", result: JSON.parse(row.result) as AssistantRequestResult } : { state: "unknown" };
  }
  /**
   * Claim one Send. A repeat of a finished Send returns its outcome; a repeat while the first is still in flight is
   * refused rather than run twice. A Send that failed before it did anything is released so it can be tried again.
   */
  claimRequest(actorId: string, requestId: string, workId?: string): { claimed: true } | { claimed: false; result: AssistantSendResult } {
    const claim = this.claim(actorId, requestId, workId, false);
    return claim.claimed ? claim : { claimed: false, result: { ...claim.result as AssistantSendResult, outcome: "repeated" } };
  }

  claimStop(actorId: string, requestId: string, workId: string): { claimed: true } | { claimed: false; result: Extract<AssistantRequestResult, { outcome: "stopped" }> } {
    return this.claim(actorId, requestId, workId, true) as ReturnType<AssistantRequests["claimStop"]>;
  }

  claimQuestion(actorId: string, requestId: string, workId: string, question: NonNullable<AssistantSendResult["question_request"]>): { claimed: true } | { claimed: false; result: AssistantSendResult } {
    const claim = this.claim(actorId, requestId, workId, false, question.operation);
    if (claim.claimed) return claim;
    const result = claim.result as AssistantSendResult;
    if (result.question_request?.fingerprint !== question.fingerprint) throw assistantErrors.conflict("The original question request has different input");
    return { claimed: false, result };
  }

  private claim(actorId: string, requestId: string, workId: string | undefined, stop: boolean, question?: "answer" | "resume-answer"): { claimed: true } | { claimed: false; result: AssistantRequestResult } {
    if (!/^[A-Za-z0-9-]{8,80}$/.test(requestId)) throw assistantErrors.conflict("Invalid request identifier");
    const inserted = this.db.prepare("INSERT OR IGNORE INTO assistant_requests(actor_id,request_id,work_id,state,created_at) VALUES (?,?,?,'pending',?)")
      .run(actorId, requestId, workId ?? null, this.now().toISOString()).changes;
    if (inserted) return { claimed: true };
    const row = this.db.prepare("SELECT state, result, work_id FROM assistant_requests WHERE actor_id=? AND request_id=?").get(actorId, requestId) as { state: string; result: string | null; work_id: string | null };
    if (workId !== undefined && row.work_id !== workId) throw assistantErrors.conflict("The request belongs to another Work");
    if (row.state !== "done" || !row.result) throw assistantErrors.pending_request("The original request is unconfirmed; it was not repeated");
    const result = JSON.parse(row.result) as AssistantRequestResult;
    if ((result.outcome === "stopped") !== stop) throw assistantErrors.conflict("The request belongs to another operation");
    if (("question_request" in result ? result.question_request?.operation : undefined) !== question) throw assistantErrors.conflict("The request belongs to another operation");
    return { claimed: false, result };
  }

  /** Candidate identities only; acceptance and author still come from the original input owner. */
  forWork(actorId: string, workId: string): readonly string[] {
    return (this.db.prepare("SELECT request_id FROM assistant_requests WHERE actor_id=? AND work_id=? ORDER BY created_at, request_id").all(actorId, workId) as { request_id: string }[]).map(row => row.request_id);
  }

  workOf(actorId: string, requestId: string): string | null | undefined {
    return (this.db.prepare("SELECT work_id FROM assistant_requests WHERE actor_id=? AND request_id=?").get(actorId, requestId) as { work_id: string | null } | undefined)?.work_id;
  }

  bindWork(actorId: string, requestId: string, workId: string): void {
    this.db.prepare("UPDATE assistant_requests SET work_id=? WHERE actor_id=? AND request_id=? AND state='pending' AND work_id IS NULL").run(workId, actorId, requestId);
    if (this.workOf(actorId, requestId) !== workId) throw assistantErrors.conflict("The request belongs to another Work");
  }

  finishRequest(actorId: string, requestId: string, result: AssistantRequestResult): void {
    this.db.prepare("UPDATE assistant_requests SET state='done', work_id=?, result=? WHERE actor_id=? AND request_id=?")
      .run(result.work.work_id, JSON.stringify(result), actorId, requestId);
  }

  releaseRequest(actorId: string, requestId: string): void {
    this.db.prepare("DELETE FROM assistant_requests WHERE actor_id=? AND request_id=? AND state='pending'").run(actorId, requestId);
  }
}
