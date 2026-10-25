import type { MemoryLedgerRecoveryFact as Fact, MemoryLedgerRecoveryIssue as Issue, MemoryLedgerRecoveryLocation as Location,
  MemoryLedgerRecoveryIdentity as Identity, MemoryLedgerRecoveryOperation as Operation, MemoryLedgerRecoveryFamily as Family } from "@molis-ai/molis-work-contracts/services/memory";
import { decodeMemoryLedgerCleanupDecision } from "./memory-ledger-adoption-cleanup.js";
import { decodeMemoryCandidateRelation, decodeMemoryOwnerRelation } from "./memory-ledger-relations.js";

type Body = Record<string, unknown>;
type Base = { location: Location; actor_id: string; at?: string };
export type RecoveryEntry = { fact: Fact } | { issue: Issue };
function invalid(): never { throw new Error("invalid-fact"); }
const object = (v: unknown): Body => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Body : invalid();
const text = (v: unknown): string => typeof v === "string" && v.trim() ? v : invalid();
const nullable = (v: unknown): string | null => v === null ? null : text(v);
const version = (v: unknown, zero = false): number => typeof v === "number" && Number.isSafeInteger(v) && v >= (zero ? 0 : 1) ? v : invalid();
const bool = (v: unknown): boolean => typeof v === "boolean" ? v : invalid();
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : invalid();
const choice = <T extends string>(v: unknown, choices: readonly T[]): T => typeof v === "string" && choices.includes(v as T) ? v as T : invalid();
const phase = (v: unknown) => choice(v, ["pending", "committed", "closed"] as const);
function identity(b: Body, actor?: string): Identity {
  const scope = choice(b.scope, ["personal", "project", "character"] as const), owner = text(b.owner);
  if (actor !== undefined && scope === "personal" && owner !== actor) invalid();
  return { scope, owner };
}
function operation(b: Body, actor: string): Operation {
  if (["remove", "move", "undo"].includes(String(b.kind))) { text(b.memory_id); version(b.expected_version); }
  if (b.kind === "purge") {
    if ((b.memory_id === undefined) === (b.candidate_id === undefined)) invalid();
    version(b.expected_version);
  }
  const result = b.result === undefined ? undefined : object(b.result);
  return { ...identity(b, actor), operation_id: text(b.operation_id), action: text(b.kind), phase: phase(b.phase),
    ...(b.memory_id === undefined ? {} : { memory_id: text(b.memory_id) }),
    ...(b.candidate_id === undefined ? {} : { candidate_id: text(b.candidate_id) }),
    ...(b.expected_version === undefined ? {} : { expected_version: version(b.expected_version, b.kind === "propose") }),
    ...(b.candidate_expected_version === undefined ? {} : { candidate_expected_version: version(b.candidate_expected_version) }),
    ...(result === undefined ? {} : { result: {
      ...(result.memory_id === undefined ? {} : { memory_id: text(result.memory_id) }),
      ...(result.candidate_id === undefined ? {} : { candidate_id: text(result.candidate_id) }),
      ...(result.version === undefined ? {} : { version: version(result.version) }),
      ...(result.outcome === undefined ? {} : { outcome: choice(result.outcome, ["duplicate", "candidate"] as const) }),
    } }),
  };
}
function* sources(base: Base, refs: unknown, subject: { memory_id?: string; candidate_id?: string; operation_id?: string }): Generator<Fact> {
  for (const raw of list(refs)) {
    const ref = object(raw);
    yield { ...base, kind: "source-link", ...subject, event_id: text(ref.event_id), version: text(ref.version) };
  }
}
const operationKinds = new Set(["write", "commit", "append", "accept", "promote", "propose", "form", "import", "import-package",
  "renew", "reclassify", "update", "disable", "enable", "remove", "restore", "move", "replace", "undo", "purge", "settleInto", "facts",
  "active", "paused", "disabled", "resume", "discarded", "expired", "cancelled", "move-paused", "move-disabled", "import-adopt", "import-skip"]);
for (const source of ["said", "accepted", "auto", "imported", "manual", "plugin"]) {
  operationKinds.add(`candidate-hold:${source}`);
  for (const suffix of ["adopt", "skip", "unverified"]) operationKinds.add(`${source}-${suffix}`);
}

/** Fixed scope previews are checked against their original SDK decision; this is not a live SDK row decoder. */
function* preview(base: Base, raw: unknown, where: Identity, family: Family, planId: string): Generator<Fact> {
  const b = object(raw), items = list(b.items), d = object(b.decision), decisions = list(d.items);
  const operationId = text(b.operation_id);
  text(b.fingerprint); text(d.binding);
  if (version(b.count, true) !== items.length || d.version !== 1 || decisions.length !== items.length
    || d.scope !== (where.scope === "personal" ? "user" : where.scope) || d.owner !== where.owner) invalid();
  for (let i = 0; i < items.length; i++) {
    const item = object(items[i]), entry = object(decisions[i]), ref = object(entry.ref);
    const id = text(item.memory_id), expected = version(item.version);
    if (ref.kind !== "memory" || ref.id !== id || ref.revision !== 1 || entry.expectedVersion !== expected || object(entry.mutation).kind !== "purge") invalid();
    if (entry.operationId !== `${operationId}:${id}`) invalid();
    yield { ...base, kind: "plan-target", family, plan_id: planId, identity: where, target: "memory", id,
      expected_version: expected, ref_revision: 1, operation_id: entry.operationId as string };
  }
  // The header preserves the enclosing operation even for an empty preview.
  yield { ...base, kind: "plan", family, plan_id: planId, identity: where, operation_id: operationId };
}

function* marker(base: Base, key: string, b: Body): Generator<Fact> {
  const actor = base.actor_id;
  if (key.startsWith("memory-forgotten:")) {
    if (actor !== "" || b.state !== "forgotten" || key !== `memory-forgotten:${text(b.memory_id)}`) invalid();
    yield { ...base, kind: "forgotten", memory_id: text(b.memory_id) }; return;
  }
  text(actor);
  if (key.startsWith("memory-source-forgotten:")) {
    const bits: unknown = JSON.parse(key.slice("memory-source-forgotten:".length));
    if (!Array.isArray(bits) || bits.length !== 3) invalid();
    const where = identity({ scope: bits[0], owner: bits[1] }, actor), event = text(bits[2]);
    if (b.event_id !== event || key !== `memory-source-forgotten:${JSON.stringify([where.scope, where.owner, event])}`) invalid();
    yield { ...base, kind: "source-forgotten", ...where, event_id: event }; return;
  }
  if (key.startsWith("memory-source-links:")) {
    yield* sources(base, b.sources, { memory_id: text(key.slice("memory-source-links:".length)) }); return;
  }
  if (key === "memory-operation:upkeep-pending") {
    for (const id of list(b.plans)) yield { ...base, kind: "upkeep-pending", operation_id: text(id) };
    return;
  }
  if (key.startsWith("memory-operation:")) {
    if (b.parent_operation_id !== undefined) {
      const parent = text(b.parent_operation_id), step = text(b.step), id = text(b.operation_id);
      if (key !== `memory-operation:${parent}:step:${step}`) invalid();
      yield { ...base, kind: "step", parent_operation_id: parent, step, operation_id: id }; return;
    }
    if (b.at !== base.at) invalid();
    const op = operation(b, actor);
    if (key === `memory-operation:${op.operation_id}:promotion-journal`) {
      const c = object(b.candidate);
      if (b.kind !== "promotion") invalid();
      text(b.memory_id); version(b.expected_version);
      yield { ...base, ...op, kind: "promotion", candidate_id: text(c.candidate_id), candidate_version: version(c.version),
        policy: text(b.policy), policy_version: version(b.version), change_id: text(b.change_id),
        ...(b.before_version === undefined ? {} : { before_version: version(b.before_version) }) };
      yield* sources(base, b.sources, { memory_id: text(b.memory_id), operation_id: op.operation_id }); return;
    }
    if (key === `memory-operation:${op.operation_id}:upkeep`) {
      choice(b.kind, ["pause", "disable", "resume", "merge"]); text(b.memory_id); version(b.expected_version);
      if (object(b.authority).actor_id !== actor) invalid();
      const drop = b.drop === undefined ? undefined : object(b.drop);
      if ((b.kind === "merge") !== (drop !== undefined) || drop?.memory_id === b.memory_id) invalid();
      yield { ...base, ...op, kind: "upkeep", change_id: text(b.change_id), ...(drop ? { drop: {
        memory_id: text(drop.memory_id), expected_version: version(drop.expected_version), operation_id: text(drop.operation_id),
      } } : {}) }; return;
    }
    if (key !== `memory-operation:${op.operation_id}`) invalid();
    if (!operationKinds.has(op.action)) throw new Error("unknown-kind");
    yield { ...base, ...op, kind: "operation" }; return;
  }
  if (key.startsWith("memory-clear:")) {
    const where = identity(b, actor), started = bool(b.started), planId = text(key.slice("memory-clear:".length));
    yield { ...base, kind: "plan", family: "scope-clear", plan_id: planId, identity: where, started };
    for (const raw of list(b.parts)) { const part = object(raw); yield* preview(base, part, identity(part, actor), "scope-clear", planId); }
    return;
  }
  if (key.startsWith("memory-selection:")) {
    const planId = text(key.slice("memory-selection:".length)), action = choice(b.action, ["remove", "disable"] as const);
    const items = list(b.items), children = list(b.children), project = nullable(b.project_id);
    if (!items.length || items.length > 100 || children.length !== items.length) invalid();
    yield { ...base, kind: "plan", family: "selection", plan_id: planId, action, project_id: project };
    for (let i = 0; i < items.length; i++) {
      const item = object(items[i]);
      yield { ...base, kind: "plan-target", family: "selection", plan_id: planId, identity: identity(item, actor), target: "memory",
        id: text(item.memory_id), expected_version: version(item.expected_version), operation_id: text(children[i]) };
    }
    return;
  }
  if (key.startsWith("memory-project-clear:")) {
    const p = object(b.preview), d = object(p.decision), scope = d.scope === "user" ? "personal" : d.scope;
    const where = identity({ scope, owner: d.owner }, actor), suffix = `:${where.scope}:${where.owner}`;
    if (!key.endsWith(suffix)) invalid();
    const planId = text(key.slice("memory-project-clear:".length, -suffix.length));
    yield* preview(base, p, where, "project-clear", planId);
    for (const raw of list(b.candidates)) {
      const c = object(raw), id = text(c.candidate_id);
      yield { ...base, kind: "plan-target", family: "project-clear", plan_id: planId, identity: where,
        target: "memory-candidate", id, expected_version: version(c.version), operation_id: `${text(p.operation_id)}:candidate:${id}` };
    }
    return;
  }
  if (key.startsWith("memory-project-delete:")) {
    yield { ...base, kind: "project-delete", project_id: text(key.slice("memory-project-delete:".length)),
      operation_id: text(b.operation_id), complete: bool(b.complete) }; return;
  }
  throw new Error("unknown-kind");
}

/** One persisted boundary, one whitelist projection; content fields are never spread into a returned fact. */
export function* projectMemoryLedgerRecoveryRow(location: Location, row: Body): Generator<RecoveryEntry> {
  try {
    if (location.table === "owners") {
      yield { fact: { location, actor_id: "", kind: "owner", relation: decodeMemoryOwnerRelation(row) } }; return;
    }
    let value: unknown;
    try { value = JSON.parse(text(row.body)); } catch { yield { issue: { location, reason: "invalid-json" } }; return; }
    const b = object(value), actor = typeof row.actor_id === "string" ? row.actor_id : invalid();
    const base: Base = { location, actor_id: actor, ...(row.at === undefined ? {} : { at: text(row.at) }) };
    if (location.table === "markers") {
      const key = text(row.key);
      // Cleanup's existing decoder remains the only owner of this decision's shape.
      if (key.startsWith("memory-operation:") && key.endsWith(":adoption-cleanup")) {
        if (actor !== "") invalid();
        const id = text(key.slice("memory-operation:".length, -":adoption-cleanup".length));
        const decision = decodeMemoryLedgerCleanupDecision(b, id);
        yield { fact: { ...base, kind: "plan", family: "adoption-cleanup", plan_id: id, operation_id: id, phase: decision.phase } };
        for (const item of decision.items) {
          const t = item.target, where: Identity = { scope: t.identity.scope === "user" ? "personal" : t.identity.scope, owner: t.identity.owner };
          yield { fact: { ...base, kind: "plan-target", family: "adoption-cleanup", plan_id: id, identity: where,
            target: t.ref.kind, id: t.ref.id, ref_revision: t.ref.revision, expected_version: t.expectedVersion, operation_id: item.operation_id, completed: item.completed,
            session_id: t.sessionRef.id, session_revision: t.sessionRef.revision, state: t.state } };
          for (const source of t.sources) yield { fact: { ...base, actor_id: source.actor_id, kind: "source-link",
            ...(t.ref.kind === "memory" ? { memory_id: t.ref.id } : { candidate_id: t.ref.id }),
            operation_id: item.operation_id, event_id: source.event_id, version: source.version } };
        }
      } else for (const fact of marker(base, key, b)) yield { fact };
      return;
    }
    text(actor);
    if (location.table === "candidates") {
      const relation = decodeMemoryCandidateRelation(row, b), id = text(b.candidate_id);
      yield { fact: { ...base, kind: "candidate", scope: relation.scope, owner: relation.owner, project_id: relation.project_id,
        candidate_id: id, memory_id: nullable(b.memory_id), state: text(b.state), version: version(b.version),
        supersedes: nullable(b.supersedes), sources_known: b.source_refs !== undefined } };
      if (b.source_refs !== undefined) for (const fact of sources(base, b.source_refs, { candidate_id: id })) yield { fact };
      return;
    }
    if (b.change_id !== row.change_id || b.actor_id !== actor || b.memory_id !== row.memory_id || b.at !== row.at) invalid();
    const action = choice(b.kind, ["kept", "auto_kept", "replaced", "auto_replaced", "merged", "edited", "restored", "moved", "disabled",
      "auto_disabled", "enabled", "paused", "resumed", "removed", "accepted", "imported", "cleared"]);
    yield { fact: { ...base, kind: "change", ...identity(b, actor), change_id: text(b.change_id), memory_id: nullable(b.memory_id),
      project_id: nullable(b.project_id), action, undone: choice(b.state, ["active", "undone"]) === "undone",
      ...(b.operation_id === undefined ? {} : { operation_id: text(b.operation_id) }),
      ...(b.applied_version === undefined ? {} : { applied_version: version(b.applied_version) }) } };
  } catch (error) {
    yield { issue: { location, reason: error instanceof Error && error.message === "unknown-kind" ? "unknown-kind" : "invalid-fact" } };
  }
}
