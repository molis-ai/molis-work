import { performance } from "node:perf_hooks";
import type { AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";

type Audit = NonNullable<PrologueNodeAdapterOptions["audit"]>;
type Entry = Parameters<NonNullable<Audit["memoryPhase"]>>[0];
type Phase = Entry["phase"];
type Row = Entry & { atMs: number };
export interface PhaseMeasurement {
  state: "complete" | "not-run" | "incomplete" | "invalid";
  durationMs: number | null;
  settlement: "resolved" | "rejected" | null;
  outcome: string | null;
  errorCode: string | null;
  reason: string | null;
  issues: string[];
}
export interface MemoryPhaseObservation {
  method: "sdk-opening-memory-phases-v1";
  sessionId: string | null;
  openingReceiptId: string | null;
  taskRecall: PhaseMeasurement;
  openingMemoryPreparation: PhaseMeasurement;
  raw: Row[];
  overflow: number;
  unrelated: number;
}

/** Copy only the SDK's safe closed fields; never ordinary AuditEntry details or foreign extras. */
function safeRow(entry: Entry, atMs: number): Row {
  const common = { atMs, sessionRef: { kind: entry.sessionRef.kind, id: entry.sessionRef.id, revision: entry.sessionRef.revision }, openingReceiptId: entry.openingReceiptId };
  if (entry.boundary === "not-run") return { ...common, phase: entry.phase, boundary: entry.boundary, reason: entry.reason };
  const phase = entry.phase === "taskRecall" ? { phase: entry.phase, receiptId: entry.receiptId } : { phase: entry.phase };
  if (entry.boundary === "begin") return { ...common, ...phase, boundary: entry.boundary };
  const error = "errorCode" in entry && entry.errorCode !== undefined ? { errorCode: entry.errorCode } : {};
  if (entry.settlement === "rejected") return { ...common, ...phase, boundary: entry.boundary, settlement: entry.settlement, ...error };
  return entry.phase === "taskRecall"
    ? { ...common, phase: entry.phase, receiptId: entry.receiptId, boundary: entry.boundary, settlement: entry.settlement, outcome: entry.outcome, ...error }
    : { ...common, phase: entry.phase, boundary: entry.boundary, settlement: entry.settlement };
}

function measure(raw: readonly Row[], phase: Phase, invalid: readonly string[]): PhaseMeasurement {
  const rows = raw.filter(row => row.phase === phase);
  const result: PhaseMeasurement = { state: "incomplete", durationMs: null, settlement: null, outcome: null, errorCode: null, reason: null, issues: [...invalid] };
  if (!rows.length) result.issues.push("missing");
  else if (rows.length === 1 && rows[0]!.boundary === "not-run") {
    result.state = "not-run"; result.reason = rows[0]!.reason;
  } else {
    const begins = rows.filter(row => row.boundary === "begin"), ends = rows.filter(row => row.boundary === "end");
    if (rows.some(row => row.boundary === "not-run") || begins.length > 1 || ends.length > 1) result.issues.push("duplicate-or-mixed-boundary");
    else if (!begins.length || !ends.length) result.issues.push("unpaired");
    else {
      const begin = begins[0]!, end = ends[0]!;
      if (rows[0] !== begin) result.issues.push("boundary-order");
      if (begin.phase === "taskRecall" && end.phase === "taskRecall" && begin.receiptId !== end.receiptId) result.issues.push("task-receipt-mismatch");
      const elapsed = end.atMs - begin.atMs;
      if (!Number.isFinite(begin.atMs) || !Number.isFinite(end.atMs) || elapsed < 0) result.issues.push("invalid-clock");
      result.settlement = end.settlement;
      result.outcome = "outcome" in end ? end.outcome : null;
      result.errorCode = "errorCode" in end ? end.errorCode ?? null : null;
      if (!result.issues.length) { result.state = "complete"; result.durationMs = elapsed; }
    }
  }
  if (result.issues.some(issue => issue !== "missing" && issue !== "unpaired")) result.state = "invalid";
  return result;
}

export function missingMemoryPhases(): MemoryPhaseObservation {
  return { method: "sdk-opening-memory-phases-v1", sessionId: null, openingReceiptId: null,
    taskRecall: measure([], "taskRecall", []), openingMemoryPreparation: measure([], "openingMemoryPreparation", []), raw: [], overflow: 0, unrelated: 0 };
}

/** One start at a time in the existing evaluation environment, not a Runtime session registry. */
export function memoryPhaseObservation(now: () => number = () => performance.now()) {
  let active: { sessionId: string; raw: Row[]; first: Entry | undefined; invalid: Set<string>; overflow: number; unrelated: number } | undefined;
  const audit: Audit = { record() {}, memoryPhase(entry) {
    const atMs = now();
    if (!active) return undefined;
    if (entry.sessionRef.id !== active.sessionId) { active.unrelated++; return undefined; }
    if (!Number.isFinite(atMs) || atMs < 0 || (active.raw.length > 0 && atMs < active.raw.at(-1)!.atMs)) active.invalid.add("invalid-clock");
    const first = active.first ??= safeRow(entry, atMs);
    if (entry.sessionRef.kind !== first.sessionRef.kind || entry.sessionRef.revision !== first.sessionRef.revision) active.invalid.add("session-ref-mismatch");
    if (entry.openingReceiptId !== first.openingReceiptId) active.invalid.add("opening-receipt-mismatch");
    if (active.raw.length === 8) { active.overflow++; active.invalid.add("overflow"); }
    else active.raw.push(safeRow(entry, atMs));
    return undefined;
  } };
  return { audit,
    bind(session: AgentSessionRef) {
      if (active) throw new Error("Memory phase observation already has an active sample");
      if (session.runtime_id !== "prologue") throw new Error("Memory phase observation requires the Prologue session");
      const sample = { sessionId: session.session_id, raw: [] as Row[], first: undefined as Entry | undefined, invalid: new Set<string>(), overflow: 0, unrelated: 0 };
      active = sample;
      return () => {
        if (active === sample) active = undefined;
        return { method: "sdk-opening-memory-phases-v1" as const, sessionId: sample.sessionId, openingReceiptId: sample.first?.openingReceiptId ?? null,
          taskRecall: measure(sample.raw, "taskRecall", [...sample.invalid]), openingMemoryPreparation: measure(sample.raw, "openingMemoryPreparation", [...sample.invalid]),
          raw: sample.raw.map(row => safeRow(row, row.atMs)), overflow: sample.overflow, unrelated: sample.unrelated };
      };
    },
    clear() { active = undefined; },
  };
}
