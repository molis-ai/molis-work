import type { AssistantReplyTarget, AssistantThreadContext, AssistantThreadDraft } from "@molis-ai/molis-work-contracts/services/assistant";
import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";

export interface AssistantThreadRound {
  request_id: string;
  attempt_id: string;
  message_id: string;
  run_id: string | null;
  state: "failed" | "starting" | "running" | "delivered" | "delivery-failed" | "stopped" | "needs-check";
  error?: string;
  context: AssistantThreadContext;
  reader: ActionReference;
  writer: ActionReference;
}
export interface StartThreadReply {
  target: Omit<AssistantReplyTarget, "title">;
  message_id: string;
  draft?: AssistantThreadDraft;
}
export interface ThreadReplyStatus {
  work_id: string;
  revision: number;
  message_id: string;
  state: string;
  error?: string;
  truncated: boolean;
}

/** Discussion rounds consume only the owner-frozen snapshot; ordinary work memories and method catalogs stay out. */
export function threadReplyMaterials(workId: string, round: AssistantThreadRound) {
  const text = round.context.text, count = Math.max(1, Math.ceil(text.length / 18000));
  return { materials: Array.from({ length: count }, (_, index) => ({ source_artifact_id: workId, source_version: 1,
    material_id: `thread-${round.attempt_id}-${index}`, title: `${round.context.title} · 原评论上下文${round.context.truncated ? "（节选）" : ""} (${index + 1}/${count})`,
    text: text.slice(index * 18000, (index + 1) * 18000) })), told: { undos: [] as string[], jobs: [] as string[], unsettled: [] as string[] } };
}
