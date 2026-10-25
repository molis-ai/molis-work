import type { MemoryLedgerRecoveryFact as Fact, MemoryLedgerRecoveryIdentity as Identity } from "@molis-ai/molis-work-contracts/services/memory";

/** Source meaning only: none of these observations authorizes a target write or declares recovery complete. */
export type MemoryRecoveryObservation =
  | { kind: "none" }
  | { kind: "unresolved"; reason: "identity-missing" | "identity-conflict" | "decision-missing" }
  | { kind: "event-barrier"; actor_id: string; identity: Identity; event_id: string }
  | { kind: "inspect-target"; identity: Identity; target: "memory" | "memory-candidate"; id: string;
      intent: "forgotten" | "original-purge" | "merge-drop" | "confirmed-plan"; operation_id?: string; source_expected_version?: number; ref_revision?: number };
const same = (a: Identity, b: Identity) => a.scope === b.scope && a.owner === b.owner;

/** The bare forgotten ID can only join exact retained identities, including ones supplied by another original owner. */
export function resolveForgottenMemoryIdentity(memoryId: string, facts: Iterable<Fact>, retained: Iterable<Identity & { memory_id: string }> = []):
  { kind: "resolved"; identity: Identity } | Extract<MemoryRecoveryObservation, { kind: "unresolved" }> {
  let found: Identity | undefined, conflict = false;
  const add = (id: string | null | undefined, where: Identity) => {
    if (id !== memoryId) return;
    if (found && !same(found, where)) conflict = true;
    found = { scope: where.scope, owner: where.owner };
  };
  for (const fact of facts) {
    if (fact.kind === "operation" || fact.kind === "promotion" || fact.kind === "upkeep") {
      add(fact.memory_id, fact); add(fact.result?.memory_id, fact);
      if (fact.kind === "upkeep") add(fact.drop?.memory_id, fact);
    } else if (fact.kind === "candidate" || fact.kind === "change") add(fact.memory_id, fact);
    else if (fact.kind === "plan-target" && fact.target === "memory") add(fact.id, fact.identity);
  }
  for (const entry of retained) add(entry.memory_id, entry);
  return conflict ? { kind: "unresolved", reason: "identity-conflict" }
    : found ? { kind: "resolved", identity: found } : { kind: "unresolved", reason: "identity-missing" };
}

function purgeDecision(purge: Extract<Fact, { kind: "operation" }>, evidence: Iterable<Fact>): boolean {
  if (!purge.memory_id || !purge.expected_version || !purge.operation_id.endsWith(`:purge:${purge.memory_id}`)) return false;
  const parent = purge.operation_id.slice(0, -`:purge:${purge.memory_id}`.length);
  for (const decision of evidence) {
    if (decision.kind !== "operation" || decision.actor_id !== purge.actor_id || !same(decision, purge)
      || decision.memory_id !== purge.memory_id || decision.expected_version !== purge.expected_version) continue;
    if (["remove", "move"].includes(decision.action) && decision.operation_id === `${parent}:change:${purge.memory_id}`) return true;
    if (decision.action === "undo" && decision.operation_id.startsWith(`${parent}:undo:`)) return true;
  }
  return false;
}

/** Scope clear retains its original parts after cleanup removes the owner rows. */
function scopeClearDecision(headers: readonly Extract<Fact, { kind: "plan" }>[], evidence: readonly Fact[]):
  "confirmed" | "identity-conflict" | "decision-missing" {
  const parent = headers.find(header => header.started !== undefined);
  if (!parent?.identity) return "decision-missing";
  const where = parent.identity, parts = headers.filter(header => header.started === undefined);
  const seen = new Set<string>();
  let includesParent = false;
  for (const part of parts) {
    if (!part.identity) return "identity-conflict";
    const child = part.identity, own = same(where, child), key = JSON.stringify([child.scope, child.owner]);
    if (seen.has(key) || !own && !(where.scope === "project" && child.scope === "character")) return "identity-conflict";
    seen.add(key); includesParent ||= own;
    if (where.scope === "project" && child.scope === "character" && evidence.some(entry => {
      if (entry.kind !== "owner" && entry.kind !== "candidate") return false;
      const relation = entry.kind === "owner" ? entry.relation : entry;
      return same(relation, child) && relation.project_id !== where.owner;
    })) return "identity-conflict";
  }
  if (!includesParent) return "identity-conflict";
  return parent.started ? "confirmed" : "decision-missing";
}

/** Pass the complete, issue-aware source set when linking; an exhausted page alone is never completeness evidence. */
export function interpretMemoryLedgerRecoveryFact(fact: Fact, evidence: readonly Fact[] = []): MemoryRecoveryObservation {
  if (fact.kind === "owner" || fact.kind === "candidate") {
    const where = fact.kind === "owner" ? fact.relation : fact;
    const conflict = evidence.some(entry => {
      if (entry.kind !== "owner" && entry.kind !== "candidate") return false;
      const other = entry.kind === "owner" ? entry.relation : entry;
      return same(where, other) && where.project_id !== other.project_id;
    });
    return conflict ? { kind: "unresolved", reason: "identity-conflict" } : { kind: "none" };
  }
  if (fact.kind === "operation" && fact.action === "purge" && fact.candidate_id)
    return { kind: "unresolved", reason: "decision-missing" };
  if (fact.kind === "source-forgotten") return { kind: "event-barrier", actor_id: fact.actor_id,
    identity: { scope: fact.scope, owner: fact.owner }, event_id: fact.event_id };
  if (fact.kind === "forgotten") {
    const resolved = resolveForgottenMemoryIdentity(fact.memory_id, evidence);
    return resolved.kind === "unresolved" ? resolved : { kind: "inspect-target", identity: resolved.identity,
      target: "memory", id: fact.memory_id, intent: "forgotten" };
  }
  if (fact.kind === "upkeep" && fact.action === "merge" && fact.drop) return { kind: "inspect-target",
    identity: { scope: fact.scope, owner: fact.owner }, target: "memory", id: fact.drop.memory_id, intent: "merge-drop",
    operation_id: fact.drop.operation_id, source_expected_version: fact.drop.expected_version };
  if (fact.kind === "operation" && fact.action === "purge" && fact.memory_id) {
    return purgeDecision(fact, evidence) ? { kind: "inspect-target", identity: { scope: fact.scope, owner: fact.owner },
      target: "memory", id: fact.memory_id, intent: "original-purge", operation_id: fact.operation_id,
      source_expected_version: fact.expected_version } : { kind: "unresolved", reason: "decision-missing" };
  }
  if (fact.kind !== "plan-target") return { kind: "none" };
  const headers = evidence.filter((entry): entry is Extract<Fact, { kind: "plan" }> => entry.kind === "plan"
    && entry.actor_id === fact.actor_id && entry.family === fact.family && entry.plan_id === fact.plan_id);
  let confirmed = fact.family === "adoption-cleanup" && headers.some(header => header.phase !== undefined);
  if (fact.family === "scope-clear") {
    const decision = scopeClearDecision(headers, evidence);
    if (decision !== "confirmed") return { kind: "unresolved", reason: decision };
    confirmed = true;
  }
  if (fact.family === "selection") {
    if (!headers.some(header => header.action === "remove")) return { kind: "none" };
    const purge = evidence.find((entry): entry is Extract<Fact, { kind: "operation" }> => entry.kind === "operation"
      && entry.actor_id === fact.actor_id && entry.action === "purge" && entry.memory_id === fact.id
      && same(entry, fact.identity) && entry.expected_version === fact.expected_version
      && entry.operation_id === `${fact.operation_id}:purge:${fact.id}`);
    confirmed = purge !== undefined && purgeDecision(purge, evidence);
  }
  if (fact.family === "project-clear") confirmed = evidence.some(parent => parent.kind === "project-delete"
    && parent.actor_id === fact.actor_id && parent.operation_id === fact.plan_id
    && (fact.identity.scope === "project" && fact.identity.owner === parent.project_id
      || fact.identity.scope === "character" && evidence.some(owner => owner.kind === "owner"
        && same(owner.relation, fact.identity) && owner.relation.project_id === parent.project_id)));
  if (!confirmed) return { kind: "unresolved", reason: "decision-missing" };
  return { kind: "inspect-target", identity: fact.identity, target: fact.target, id: fact.id, intent: "confirmed-plan",
    operation_id: fact.operation_id, source_expected_version: fact.expected_version,
    ...(fact.ref_revision === undefined ? {} : { ref_revision: fact.ref_revision }) };
}
