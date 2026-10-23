import type { AgentTurnSteer } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AgentMemorySourceRef, AgentMemorySourceSnapshot, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";

/** An original's identity never changes with its consuming Run, Work, queue job or retry. */
export interface MemoryInputIdentity { actor_id: string; session_id: string; kind: "original" | "supplement"; input_id: string }
const PREFIX = "molis-input:1:";

export function memoryInputSource(identity: MemoryInputIdentity): AgentMemorySourceRef {
  return { event_id: PREFIX + JSON.stringify([identity.actor_id, identity.session_id, identity.kind, identity.input_id]), version: "1" };
}

export function readMemoryInputSource(ref: AgentMemorySourceRef): MemoryInputIdentity | undefined {
  if (ref.version !== "1" || !ref.event_id.startsWith(PREFIX) || ref.event_id.length > 1000) return undefined;
  let fields: unknown;
  try { fields = JSON.parse(ref.event_id.slice(PREFIX.length)); } catch { return undefined; }
  if (!Array.isArray(fields) || fields.length !== 4 || !fields.every(value => typeof value === "string" && value.length > 0 && value.length <= 200)
    || !["original", "supplement"].includes(fields[2])) return undefined;
  const identity: MemoryInputIdentity = { actor_id: fields[0], session_id: fields[1], kind: fields[2], input_id: fields[3] };
  return memoryInputSource(identity).event_id === ref.event_id ? identity : undefined;
}

/** Only the runtime's personal text or its preserved raw personal original qualifies. */
export function personalInputText(text: string, receipt: Pick<AgentTurnSteer, "source" | "original">): string | undefined {
  return receipt.source === "person" ? text : receipt.source === "host" && receipt.original?.source === "person" ? receipt.original.text : undefined;
}

/** Candidate material is a projection of owner facts; SourcePort still rereads each reference at commit. */
export function memoryInputSnapshots(actorId: string, views: readonly AgentRunView[]): AgentMemorySourceSnapshot[] {
  const sources = new Map<string, AgentMemorySourceSnapshot>();
  const add = (identity: MemoryInputIdentity, text: string, at: number | undefined) => {
    if (!text.trim() || at === undefined || !Number.isFinite(at)) return;
    const ref = memoryInputSource(identity);
    if (!sources.has(ref.event_id)) sources.set(ref.event_id, { ...ref, speaker: { kind: "person", id: actorId }, derivation: "original", occurred_at_ms: at, text });
  };
  for (const view of views) {
    if (["failed", "cancelled", "stopped", "reconcile-required"].includes(view.phase)) continue;
    const original = view.original_input;
    if (original?.written_by === "person") add({ actor_id: actorId, session_id: original.ref.session_id, kind: "original", input_id: original.ref.input_id }, original.text, Date.parse(original.occurred_at));
    for (const turn of view.turns) if (turn.steer && ["applied", "read"].includes(turn.steer.state)) {
      const text = personalInputText(turn.text, turn.steer);
      if (text !== undefined) add({ actor_id: actorId, session_id: view.ref.session_id, kind: "supplement", input_id: turn.steer.id }, text, turn.steer.accepted_at_ms);
    }
  }
  return [...sources.values()];
}
