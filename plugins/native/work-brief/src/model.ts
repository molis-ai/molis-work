import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ActionCard } from "@molis-ai/molis-work-plugin-sdk";

export const BRIEF_LIMITS = { title: 200, claims: 40, claim_text: 600, cites: 8, attention: 20, why: 300, next: 12, next_text: 200, versions: 60, id: 200, sources: 60, request_id: 200 } as const;

export type BriefScope = "home" | "topic" | "personal";
/** Who made a version: the person, the assistant's work, or a task (an object reference the page can open). */
export type ProducedBy = { kind: "person" } | { kind: "assistant" } | { kind: "task"; subject: ActionSubject };

/**
 * A basis as it was read when the version was saved: the object, its revision and title then. It is not a second copy of the object:
 * it only answers "what did this sentence stand on". `gap` says what a later refresh found (the frozen words stay those of the last read).
 */
export interface Cite {
  subject: ActionSubject;
  owner_plugin_id: string;
  revision: string;
  title: string;
  read_at: string;
  gap?: "changed" | "gone" | "unreadable";
}
/** A sentence. `supplied_by: "owner"` marks what the person said themselves: it carries no cite and never passes for something read. */
export interface Claim { claim_id: string; text: string; cites: Cite[]; supplied_by?: "owner"; edited?: true }
/** How one source read at the time. `turn` comes only from this brief's own content and the comparison with the version before. */
export interface SourceRow {
  plugin_id: string;
  /** The source plugin's name as its Manifest's `name_text`, with the name it had then as the fallback: it reads in the language shown. */
  name: OwnedTextRef;
  read: "ok" | "stale" | "unreadable" | "unauthorized" | "none";
  read_at?: string;
  summary?: OwnedTextRef;
  subjects: ActionSubject[];
  turn: "idle" | "moving" | "waiting" | "blocked";
}
export interface AttentionItem { item_id: string; subject: ActionSubject; owner_plugin_id: string; why: string; blocked?: true }
export interface NextOption {
  option_id: string;
  text: string;
  why: string;
  subject?: ActionSubject;
  act: { kind: "card"; card: ActionCard } | { kind: "assistant" };
}
export interface BriefBody { sources: SourceRow[]; claims: Claim[]; attention: AttentionItem[]; next: NextOption[] }
export interface BriefFixed { artifact_id: string; artifact_version: number; at: string }

export interface BriefRecord {
  brief_id: string;
  project_id: string;
  scope: BriefScope;
  title: string;
  current_version: number;
  revision: number;
  created_at: string;
  updated_at: string;
  fixed: Record<string, BriefFixed>;
}
export interface BriefVersionHead { version: number; base_version: number | null; as_of: string; created_at: string; produced_by: ProducedBy; fixed: BriefFixed | null }
export interface BriefVersion extends BriefVersionHead, BriefBody { brief_id: string }

/** A person's change to one sentence, kept until a later draft is merged with it. */
export interface BriefEdit { edit_id: string; claim_id: string; text: string | null; base_version: number; actor_id: string; at: string }
export interface ProposalConflict { claim_id: string; mine: string | null; theirs: string | null }
export interface BriefProposal { proposal_id: string; base_version: number; created_at: string; produced_by: ProducedBy; body: BriefBody; conflicts: ProposalConflict[] }
/** `unknown`: the run ended without a result this brief could record (cancelled, the page closed, the target did not confirm). The person checks at the owner's and clears it. */
export type NextMarkState = "later" | "handed" | "running" | "done" | "failed" | "stale" | "unknown";
export interface NextMark { option_id: string; state: NextMarkState; card?: ActionCard; actor_id: string; at: string }

/** One line of the comparison of two versions: nothing here is stored, it is computed from the two bodies. */
export type BriefChange =
  | { kind: "source"; plugin_id: string; name: OwnedTextRef; from: SourceRow["read"] | null; to: SourceRow["read"] | null; subjects_added: number; subjects_removed: number }
  | { kind: "claim"; claim_id: string; change: "added" | "removed" | "reworded" }
  | { kind: "cite"; claim_id: string; subject: ActionSubject; change: "added" | "removed" | "changed" | "gone" | "unreadable" }
  | { kind: "attention"; subject: ActionSubject; change: "added" | "removed" };

const subjectKey = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
export { subjectKey as briefSubjectKey };

/** What differs from `before` to `after`. A version with no difference is not saved by a refresh (WBR-10). */
export function compareBriefBodies(before: BriefBody | null, after: BriefBody): BriefChange[] {
  const changes: BriefChange[] = [];
  const was = new Map(before?.sources.map(row => [row.plugin_id, row]) ?? []);
  for (const row of after.sources) {
    const old = was.get(row.plugin_id); was.delete(row.plugin_id);
    const oldKeys = new Set(old?.subjects.map(subjectKey) ?? []), keys = new Set(row.subjects.map(subjectKey));
    const added = [...keys].filter(key => !oldKeys.has(key)).length, removed = [...oldKeys].filter(key => !keys.has(key)).length;
    if (!old || old.read !== row.read || added || removed || JSON.stringify(old.summary ?? null) !== JSON.stringify(row.summary ?? null))
      changes.push({ kind: "source", plugin_id: row.plugin_id, name: row.name, from: old?.read ?? null, to: row.read, subjects_added: added, subjects_removed: removed });
  }
  for (const old of was.values()) changes.push({ kind: "source", plugin_id: old.plugin_id, name: old.name, from: old.read, to: null, subjects_added: 0, subjects_removed: old.subjects.length });
  const claims = new Map(before?.claims.map(claim => [claim.claim_id, claim]) ?? []);
  for (const claim of after.claims) {
    const old = claims.get(claim.claim_id); claims.delete(claim.claim_id);
    if (!old) { changes.push({ kind: "claim", claim_id: claim.claim_id, change: "added" }); continue; }
    if (old.text !== claim.text) changes.push({ kind: "claim", claim_id: claim.claim_id, change: "reworded" });
    const cites = new Map(old.cites.map(cite => [subjectKey(cite.subject), cite]));
    for (const cite of claim.cites) {
      const prior = cites.get(subjectKey(cite.subject)); cites.delete(subjectKey(cite.subject));
      // A basis that reads again after a gap is a change even when the object itself stayed the same: the gap note goes.
      const change = !prior ? "added" as const : cite.gap === "gone" || cite.gap === "unreadable" ? (prior.gap === cite.gap ? null : cite.gap)
        : prior.gap || prior.revision !== cite.revision || prior.title !== cite.title ? "changed" as const : null;
      if (change) changes.push({ kind: "cite", claim_id: claim.claim_id, subject: cite.subject, change });
    }
    for (const prior of cites.values()) changes.push({ kind: "cite", claim_id: claim.claim_id, subject: prior.subject, change: "removed" });
  }
  for (const old of claims.values()) changes.push({ kind: "claim", claim_id: old.claim_id, change: "removed" });
  const waiting = new Set(before?.attention.map(item => subjectKey(item.subject)) ?? []);
  for (const item of after.attention) if (!waiting.delete(subjectKey(item.subject))) changes.push({ kind: "attention", subject: item.subject, change: "added" });
  for (const item of before?.attention ?? []) if (waiting.has(subjectKey(item.subject))) changes.push({ kind: "attention", subject: item.subject, change: "removed" });
  return changes;
}

/**
 * Whose turn a source is at, from this brief alone: something of it waits for the person (an attention item, blocked or not), its
 * objects came or went since the version before, or nothing. No plugin's own status word is read (contract-design §3.3).
 */
export function sourceTurn(row: Pick<SourceRow, "plugin_id" | "subjects" | "read">, attention: readonly AttentionItem[], before: SourceRow | undefined): SourceRow["turn"] {
  const mine = attention.filter(item => item.owner_plugin_id === row.plugin_id);
  if (mine.some(item => item.blocked)) return "blocked";
  if (mine.length) return "waiting";
  if (!before || row.read !== "ok") return "idle";
  const old = new Set(before.subjects.map(subjectKey)), now = row.subjects.map(subjectKey);
  return now.length !== old.size || now.some(key => !old.has(key)) ? "moving" : "idle";
}
