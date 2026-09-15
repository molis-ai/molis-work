import type { WorkSessionRecord, WorkSessionHandoffRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";

export function publicSessionRecord(session: WorkSessionRecord) {
  return {
    session_id: session.session_id,
    runtime_id: session.runtime_id,
    native_runtime_session_id: session.native_runtime_session_id,
    project_id: session.project_id,
    current_goal_id: session.current_goal_id,
    workspace_id: session.workspace_id,
    workspace_path: session.workspace_path,
    title: session.title,
    status: session.status,
    provenance: session.provenance,
    runtime_workspace_hint: typeof session.metadata.runtime_cwd === "string" ? session.metadata.runtime_cwd : null,
    created_at: session.created_at,
    updated_at: session.updated_at,
  };
}

export function publicSessionHandoff(
  handoff: WorkSessionHandoffRecord,
  includeContent = false,
) {
  return {
    package_id: handoff.package_id,
    source_session_id: handoff.source_session_id,
    source_project_id: handoff.source_project_id,
    source_goal_id: handoff.source_goal_id,
    target_runtime_id: handoff.target_runtime_id,
    target_project_id: handoff.target_project_id,
    target_workspace_id: handoff.target_workspace_id,
    target_workspace_path: handoff.target_workspace_path,
    destination_session_id: handoff.destination_session_id,
    state: handoff.state,
    delivery_mode: handoff.delivery_mode,
    content_available: handoff.content_available,
    content_digest: handoff.content_digest,
    ...(includeContent ? { content: handoff.content } : {}),
    attempt_count: handoff.attempt_count,
    error_code: handoff.error_code,
    error_message: handoff.error_message,
    retryable: handoff.retryable,
    created_at: handoff.created_at,
    updated_at: handoff.updated_at,
    sent_at: handoff.sent_at,
  };
}
