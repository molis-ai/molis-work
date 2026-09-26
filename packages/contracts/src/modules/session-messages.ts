import type { WorkSessionRecord } from "./private-work-context.js";

/** Immutable delivery facts; current associations remain owned by the Session registry/Ledger. */
export type SessionMessageTarget = Pick<WorkSessionRecord, "session_id" | "project_id" | "runtime_id" | "native_runtime_session_id" | "current_goal_id" | "workspace_id" | "workspace_path" | "status">;
export interface SessionMessageContext { kind: string; id: string; content: string }
export interface SessionMessageRecord {
  request_id: string;
  actor_id: string;
  project_id: string;
  idempotency_key: string;
  target: SessionMessageTarget;
  text: string | null;
  context: SessionMessageContext | null;
  content_available: boolean;
  state: "pending" | "uncertain" | "failed" | "accepted";
  attempt_count: number;
  native_turn_id: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
}
export interface PrepareSessionMessage {
  actor_id: string;
  project_id: string;
  idempotency_key: string;
  session_id: string;
  expected_goal_id: string | null;
  text: string;
  context?: SessionMessageContext;
}
export interface SessionMessageApi {
  prepare(input: PrepareSessionMessage): SessionMessageRecord;
  get(requestId: string): SessionMessageRecord;
  claim(requestId: string, retry: boolean): { claimed: boolean; record: SessionMessageRecord };
  finish(requestId: string, attempt: number, result: { state: "accepted"; native_turn_id: string } | { state: "failed" | "uncertain"; error_code: string }): SessionMessageRecord;
}

export function sessionMessageTarget(session: WorkSessionRecord): SessionMessageTarget {
  return { session_id: session.session_id, project_id: session.project_id, runtime_id: session.runtime_id,
    native_runtime_session_id: session.native_runtime_session_id, current_goal_id: session.current_goal_id,
    workspace_id: session.workspace_id, workspace_path: session.workspace_path, status: session.status };
}
export function sessionMessagePrompt(record: Pick<SessionMessageRecord, "text" | "context">): string {
  return record.context ? `${record.context.content}\n\n用户消息：\n${record.text ?? ""}` : record.text ?? "";
}
