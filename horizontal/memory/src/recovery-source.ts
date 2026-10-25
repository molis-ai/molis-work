import type { MemoryLedgerRecoveryFact as Fact, MemoryLedgerRecoveryIdentity as Identity,
  MemoryLedgerRecoveryPage } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "./errors.js";
import { interpretMemoryLedgerRecoveryFact, resolveForgottenMemoryIdentity, type MemoryRecoveryObservation } from "./recovery-facts.js";

/** A fresh reader from one original source snapshot. Its owner retains close and all resource cleanup. */
export interface MemoryRecoverySourceReader {
  next(): MemoryLedgerRecoveryPage;
  rewind(): void;
}
export interface MemoryRecoverySourceObservation {
  readonly fact: Fact;
  readonly observation: Extract<MemoryRecoveryObservation, { kind: "inspect-target" | "event-barrier" }>;
}
type Relation = Extract<Fact, { kind: "owner" | "candidate" }>;
type Purge = Extract<Fact, { kind: "operation" }>;
type Retained = readonly (Identity & { readonly memory_id: string })[];
interface Selection {
  intents: Fact[];
  relations: Relation[];
  purges: Purge[];
  forgotten: string[];
  plans: Set<string>;
  projects: Set<string>;
  homes: Set<string>;
}
const conflict = () => memoryErrors.conflict("来源记忆事实、身份或原决定尚未完整确认，保留原件待核对");
const planKey = (fact: Extract<Fact, { kind: "plan" | "plan-target" }>) => JSON.stringify([fact.actor_id, fact.family, fact.plan_id]);
const operationKey = (actor: string, operation: string) => JSON.stringify([actor, operation]);
const refused = (observation: MemoryRecoveryObservation) => { if (observation.kind === "unresolved") throw conflict(); };

function scan(reader: MemoryRecoverySourceReader, current: () => void, accept: (fact: Fact) => void): void {
  while (true) {
    current(); const page = reader.next(); current();
    if (page.issues.length || !page.exhausted && !page.facts.length) throw conflict();
    for (const fact of page.facts) accept(fact);
    if (page.exhausted) return;
  }
}

/** One actual owner and candidate per identity suffice for the interpreter's global relation invariant. */
function rememberRelation(fact: Relation, relations: Map<string, { owner?: Relation; candidate?: Relation }>): void {
  const where = fact.kind === "owner" ? fact.relation : fact, key = JSON.stringify([where.scope, where.owner]);
  const previous = relations.get(key), witness = previous?.owner ?? previous?.candidate;
  if (witness) refused(interpretMemoryLedgerRecoveryFact(fact, [witness]));
  const pair = previous ?? {};
  pair[fact.kind] ??= fact;
  relations.set(key, pair);
}

function selectIntents(reader: MemoryRecoverySourceReader, current: () => void): Selection {
  const intents: Fact[] = [], relations = new Map<string, { owner?: Relation; candidate?: Relation }>();
  const selected: Selection = { intents, relations: [], purges: [], forgotten: [], plans: new Set(), projects: new Set(), homes: new Set() };
  scan(reader, current, fact => {
    if (fact.kind === "owner" || fact.kind === "candidate") rememberRelation(fact, relations);
    if (fact.kind === "forgotten") { intents.push(fact); selected.forgotten.push(fact.memory_id); }
    else if (fact.kind === "source-forgotten" || fact.kind === "upkeep" && fact.action === "merge") intents.push(fact);
    else if (fact.kind === "operation" && fact.action === "purge") { intents.push(fact); selected.purges.push(fact); }
    else if (fact.kind === "home-recovery-target") { intents.push(fact); selected.homes.add(operationKey(fact.actor_id, fact.operation_id)); }
    else if (fact.kind === "plan-target" || fact.kind === "plan" && fact.family === "scope-clear" && fact.started !== undefined) {
      intents.push(fact); selected.plans.add(planKey(fact));
      if (fact.family === "project-clear") selected.projects.add(operationKey(fact.actor_id, fact.plan_id));
    }
  });
  selected.relations = [...relations.values()].flatMap(pair => [...(pair.owner ? [pair.owner] : []), ...(pair.candidate ? [pair.candidate] : [])]);
  return selected;
}

/** The original resolver, not a second field decoder, decides whether this source fact witnesses a bare ID. */
function rememberIdentities(fact: Fact, ids: readonly string[], retained: Retained, witnesses: Map<string, Fact>): void {
  for (const id of ids) {
    const resolved = resolveForgottenMemoryIdentity(id, [fact]);
    if (resolved.kind === "unresolved") { if (resolved.reason === "identity-conflict") throw conflict(); continue; }
    const previous = witnesses.get(id);
    const joined = resolveForgottenMemoryIdentity(id, previous ? [previous, fact] : [fact], retained);
    if (joined.kind === "unresolved") throw conflict();
    if (!previous) witnesses.set(id, fact);
  }
}

function linkEvidence(reader: MemoryRecoverySourceReader, selected: Selection, retained: Retained, current: () => void): Fact[] {
  const evidence: Fact[] = [...selected.relations, ...selected.purges];
  const identities = new Map<string, Fact>(), decisions = new Map<Purge, Fact>();
  scan(reader, current, fact => {
    if (fact.kind === "plan" && selected.plans.has(planKey(fact))
      || fact.kind === "project-delete" && selected.projects.has(operationKey(fact.actor_id, fact.operation_id))
      || fact.kind === "home-recovery" && selected.homes.has(operationKey(fact.actor_id, fact.operation_id))) evidence.push(fact);
    if (fact.kind === "operation") for (const purge of selected.purges) {
      if (!decisions.has(purge) && interpretMemoryLedgerRecoveryFact(purge, [fact]).kind === "inspect-target") decisions.set(purge, fact);
    }
    rememberIdentities(fact, selected.forgotten, retained, identities);
  });
  return [...evidence, ...new Set([...identities.values(), ...decisions.values()])];
}

/** Only complete source observations leave this call; it grants no target write, version or completion. */
export function collectMemoryLedgerRecoveryObservations(input: {
  readonly reader: MemoryRecoverySourceReader;
  readonly assertCurrent: () => void;
  /** Already validated identities from the original source owner, never inferred from the current target. */
  readonly retained?: Retained;
}): readonly MemoryRecoverySourceObservation[] {
  const reader = { next: input.reader.next.bind(input.reader), rewind: input.reader.rewind.bind(input.reader) };
  const assertCurrent = input.assertCurrent, retained = structuredClone(input.retained ?? []);
  const current = () => {
    const result: unknown = assertCurrent();
    if (result !== undefined) { void Promise.resolve(result).catch(() => undefined); throw conflict(); }
  };
  current();
  const selected = selectIntents(reader, current);
  current(); reader.rewind(); current();
  const evidence = linkEvidence(reader, selected, retained, current);
  const result: MemoryRecoverySourceObservation[] = [];
  for (const fact of selected.intents) {
    const observation = interpretMemoryLedgerRecoveryFact(fact, evidence, retained);
    refused(observation);
    if (observation.kind === "inspect-target" || observation.kind === "event-barrier") result.push({ fact, observation });
  }
  current(); return structuredClone(result);
}
