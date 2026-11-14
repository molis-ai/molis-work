import type { ExactRef, ModelEvent, SessionOpeningReader } from "@prologue/sdk";
import type { ChildOpeningFact, SessionIndex, SessionIndexStore } from "./prologue-session-index.js";

/** Only the caller-only creator contract makes this raw prefix an attestation; callers must first prove that generation. */
export function canonicalCallerOpening(events: readonly ModelEvent[]): string | undefined {
  const callers: string[] = [];
  for (const event of events) {
    if (event.type !== "prompt") break;
    if (event.role === "user" && event.source === undefined && event.steerId === undefined && event.carried === undefined) callers.push(event.text);
  }
  return callers.length === 1 && callers[0]!.trim() ? callers[0] : undefined;
}
const sameRef = (left: ExactRef<string> | null | undefined, right: ExactRef<string>) => !!left && left.kind === right.kind && left.id === right.id && left.revision === right.revision;
function childGeneration(facts: unknown, parentRun: string, session: ExactRef<"session">, run: ExactRef<"run">): boolean {
  // This optional persisted proof cannot make the original raw history unreadable.
  if (!Array.isArray(facts) || !facts.every((fact: Partial<ChildOpeningFact> | null) => fact && typeof fact === "object"
    && typeof fact.parent_run === "string" && fact.format === "caller-only-v1"
    && fact.session?.kind === "session" && typeof fact.session.id === "string" && Number.isInteger(fact.session.revision) && fact.session.revision > 0
    && fact.run?.kind === "run" && typeof fact.run.id === "string" && Number.isInteger(fact.run.revision) && fact.run.revision > 0)) return false;
  const matching = facts.filter(fact => fact.parent_run === parentRun && sameRef(fact.session, session) && sameRef(fact.run, run));
  return matching.length === 1 && matching[0]!.format === "caller-only-v1";
}
/** A safe task is exact text from the attested child's one caller opening, never the raw all-user display string. */
export function childCallerTask(facts: readonly ChildOpeningFact[], parentRun: string, session: ExactRef<"session">, run: ExactRef<"run">, events: readonly ModelEvent[]): string | undefined {
  return childGeneration(facts, parentRun, session, run) ? canonicalCallerOpening(events) : undefined;
}

/** Freeze this Session's accepted caller intents. Raw reading remains independent from model-history attribution. */
export function sessionOpeningReader(index: SessionIndex, store: SessionIndexStore): SessionOpeningReader {
  const saved = structuredClone(index);
  return async ({ sessionRef, runRef }) => {
    if (!sameRef(sessionRef, saved.ref) || runRef.kind !== "run" || runRef.revision !== 1) return { status: "unavailable" };
    const matches = saved.attempts.filter(attempt => attempt.run_id === runRef.id);
    if (matches.length !== 1) return { status: "unavailable" };
    const attempt = matches[0]!;
    if (attempt.refused || typeof attempt.task !== "string" || !attempt.task.trim()) return { status: "unavailable" };
    if (saved.parent_run && saved.attempts[0] === attempt) {
      // Old child task was filled from an untyped prompt; only its original parent's new-creation fact can attest it.
      const parent = await store.read(saved.parent_run.session_id);
      const parents = parent?.attempts.filter(item => item.run_id === saved.parent_run!.run_id) ?? [];
      if (!parent || parents.length !== 1 || parents[0]!.refused
        || ["project_id", "plugin_id", "install_id", "actor_id"].some(key => parent.owner[key as keyof typeof parent.owner] !== saved.owner[key as keyof typeof saved.owner])
        || !childGeneration(parents[0]!.child_openings ?? [], saved.parent_run.run_id, sessionRef, runRef)) return { status: "unavailable" };
    }
    return { status: "original", user: [attempt.task] };
  };
}
