/**
 * A delegation is a letter for people between two sessions (the SDK's envelope, never handed to a model): the
 * request carries the task and the fixed outputs handed over, each delivery is a reply carrying the fixed output
 * handed back, and every step — sent, delivered, accepted, started, delivered back, taken or returned with why — is
 * on the request's history. Everything here reads letters; nothing touches storage or the Host.
 */
import type { AgentMessageAttachment, AgentSessionMessage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { DELEGATION_STATE_LABEL, type DelegationState } from "./cooperation.js";

export const isDelegation = (letter: AgentSessionMessage) => letter.audience === "people" && letter.kind === "request";
export const letterBody = (letter: AgentSessionMessage): Record<string, unknown> => {
  try { const value = JSON.parse(letter.body) as unknown; return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; }
};
export const artifactOf = (attachment: AgentMessageAttachment | undefined) => attachment?.kind === "artifact" && attachment.version !== undefined ? { artifact_id: attachment.id, version: attachment.version } : undefined;
export const asAttachment = (reference: { artifact_id: string; version: number }): AgentMessageAttachment => ({ kind: "artifact", id: reference.artifact_id, version: reference.version });
const iso = (ms: number) => new Date(ms).toISOString();
type LetterHistory = NonNullable<AgentSessionMessage["history"]>;
/** The delegation's state from its letter's: accepted and started is under way; how it was cancelled says why. */
export const delegationStateOf = (state: AgentSessionMessage["state"], history: LetterHistory): DelegationState => {
  if (state === "queued") return "received";
  if (state === "accepted") return history.some(entry => entry.event === "started") ? "committing" : "accepted";
  if (state === "cancelled") { const how = history.find(entry => entry.state === "cancelled")?.event; return how === "failed" ? "failed" : how === "rejected" ? "rejected" : "cancelled"; }
  if (state === "expired") return "failed";
  return state;
};
const RECEIPT_EVENT: Record<string, string> = { sent: "submitted" };

/** How this project names the two ends: a runtime session's Coding session, and what the page shows about one. */
export interface DelegationSides<Side> {
  codingOf(runtimeSession: string): string | null;
  sideOf(sessionId: string | null): Side;
}

/** What the page shows about one delegation letter and the replies to it. */
export function delegationViewOf<Side>(letter: AgentSessionMessage, letters: readonly AgentSessionMessage[], sides: DelegationSides<Side>) {
  const said = letterBody(letter), history = letter.history ?? [];
  const replies = letters.filter(one => one.audience === "people" && one.kind === "reply" && one.in_reply_to === letter.message_id);
  const deliveries = replies.map(reply => {
    const about = letterBody(reply), decided = (reply.history ?? []).find(entry => entry.state === "accepted" || entry.state === "rejected");
    return { delivery_id: reply.message_id, kind: about.kind === "changeset" ? "changeset" as const : "report" as const, artifact: artifactOf(reply.attachments?.[0]) ?? null,
      run_id: String(about.run_id ?? ""), title: String(about.title ?? ""), note: String(about.note ?? ""),
      state: decided?.state === "rejected" ? "rejected" as const : decided ? "accepted" as const : "sent" as const,
      ...(decided?.state === "rejected" && decided.note ? { reason: decided.note } : {}), sent_at: iso(reply.sent_at_ms),
      ...(decided ? { decided_at: iso(decided.at_ms), decided_by: decided.by ?? "" } : {}) };
  });
  const receipts = history.map((entry, index) => ({ event: RECEIPT_EVENT[entry.event] ?? entry.event, state: delegationStateOf(entry.state, history.slice(0, index + 1)),
    at: iso(entry.at_ms), actor: entry.by ?? "", ...(entry.note ? { note: entry.note } : {}), ...(artifactOf(entry.attachments?.[0]) ? { artifact: artifactOf(entry.attachments?.[0]) } : {}),
    ...(entry.late ? { recorded_only: true as const } : {}) }));
  const state = delegationStateOf(letter.state, history), from = sides.codingOf(letter.from_session), to = sides.codingOf(letter.to_session);
  return { delegation_id: letter.message_id, from_session: from, to_session: to, title: String(said.title ?? ""), task: String(said.task ?? ""),
    materials: (letter.attachments ?? []).flatMap(one => artifactOf(one) ?? []), hops: letter.hops ?? 1, state, state_label: DELEGATION_STATE_LABEL[state],
    // Every step either letter took: an action named against an older count is refused as a change under it.
    revision: history.length + replies.reduce((sum, reply) => sum + (reply.history?.length ?? 0), 0), deliveries, receipts,
    created_at: iso(letter.sent_at_ms), from: sides.sideOf(from), to: sides.sideOf(to) };
}
