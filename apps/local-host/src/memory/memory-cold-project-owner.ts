import { isDeepStrictEqual } from "node:util";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectSessionDeletionPlan, PrologueMemoryAdoptionScope } from "@molis-ai/molis-work-service-agent-host";
import { applyProjectMemoryPurge, memoryErrors, previewProjectMemoryPurge, type MemoryCaller, type ProjectMemoryPurgePlan } from "@molis-ai/molis-work-service-memory";
import { createMemoryLedgerProjectRetention, type MemoryLedgerAdoptionSnapshot } from "@molis-ai/molis-work-storage";
import type { ProjectDeletedOwner } from "../project-deleted-hooks.js";
import type { ProjectDeletionPreparation, ProjectDeletionRecovery } from "../project-deletion-recovery.js";
import { MEMORY_OWNER } from "../project-deleted-owners.js";
import { createColdProjectMemoryFacts } from "./memory-cold-project-facts.js";
import { coldProjectMemoryReads, inspectColdProjectMemoryTargets, type ColdProjectMemoryInspection,
  type ColdProjectMemoryWriter, type ColdProjectMemoryPurgeTarget } from "./memory-cold-project-sdk.js";
import { verifyMemoryCoverage, verifyProjectMemoryEmpty } from "./memory-project-coverage.js";

export interface ColdMemoryProjectPreparation {
  knownScopes: readonly PrologueMemoryAdoptionScope[];
  scopes: readonly { scope: "project" | "character"; owner: string }[];
  sessions: ProjectSessionDeletionPlan;
}
/** All callbacks belong to the same retained parent Home owner. No Runtime or general Ledger is accepted. */
export interface ColdMemoryProjectOwnerInput {
  homeDirectory: string;
  assertCurrent(): void;
  ledgerExpected(): MemoryLedgerAdoptionSnapshot;
  /** Compare cached before, advance to this committed post, then allow ordinary current checks. */
  ledgerCommitted(change: { before: MemoryLedgerAdoptionSnapshot; after: MemoryLedgerAdoptionSnapshot }): void;
  prepareProject(input: ProjectDeletionPreparation): Promise<ColdMemoryProjectPreparation>;
  withInspection<T>(work: (reader: ColdProjectMemoryInspection) => Promise<T>): Promise<T>;
  /** Only called by clear after the Catalog's original prepared receipt matched the active frame. */
  withWriter<T>(selection: { memoryPurges: readonly ColdProjectMemoryPurgeTarget[]; sessionPlan: ProjectSessionDeletionPlan },
    work: (writer: ColdProjectMemoryWriter) => Promise<T>): Promise<T>;
}
type Frame = { active: boolean; current(): void; plan?: ProjectDeletionRecovery; purge?: () => Promise<void>; purging: boolean; control?: ProjectDeletionControl };
const refused = () => memoryErrors.conflict("冷记忆项目清理不属于当前原决定，保留收据待核对");
function synchronous(result: unknown): void {
  if (result === undefined) return;
  if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result)
    void Promise.resolve(result).catch(() => undefined);
  throw refused();
}
const callerFor = (input: ProjectDeletionPreparation): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: input.project_id,
  operation_id: input.operation_id, consumer: "ui", person: true, purpose: "management", current_scene: "common" });
const memoryPlan = (plan: ProjectDeletionRecovery): ProjectMemoryPurgePlan => plan.kind === "runtime" ? plan.memory
  : { project_id: plan.project_id, operation_id: plan.operation_id, actor_id: LOCAL_PERSON_ACTOR_ID, scopes: [] };
const scopesFor = (projection: ColdMemoryProjectPreparation) => [...projection.scopes, { scope: "user" as const, owner: LOCAL_PERSON_ACTOR_ID }];

async function verifyOriginal(input: ColdMemoryProjectOwnerInput, plan: ProjectDeletionRecovery, current: () => void) {
  current();
  if (plan.kind === "runtime") {
    await input.withInspection(async reader => {
      current(); await inspectColdProjectMemoryTargets(reader, plan.memory, plan.sessions, current, true); current();
      await reader.verifyProjectSessionPurge({ plan: structuredClone(plan.sessions) }); current();
    }); current();
  }
  const retention = createMemoryLedgerProjectRetention({ homeDirectory: input.homeDirectory, plan: memoryPlan(plan), mode: "original", assertCurrent: current });
  retention.verifyOriginal({ snapshot: input.ledgerExpected() }); current();
}

async function executePlan(input: ColdMemoryProjectOwnerInput, plan: Extract<ProjectDeletionRecovery, { kind: "runtime" }>,
  projection: ColdMemoryProjectPreparation, current: () => void, committed: ColdMemoryProjectOwnerInput["ledgerCommitted"]) {
  current();
  const inspected = await input.withInspection(reader => inspectColdProjectMemoryTargets(reader, plan.memory, plan.sessions, current)); current();
  await input.withWriter({ memoryPurges: inspected.targets, sessionPlan: structuredClone(plan.sessions) }, async writer => {
    current();
    const retention = createMemoryLedgerProjectRetention({ homeDirectory: input.homeDirectory, plan: plan.memory, mode: "cleanup", assertCurrent: current });
    const change = (run: (snapshot: MemoryLedgerAdoptionSnapshot) => MemoryLedgerAdoptionSnapshot) => {
      current(); const before = input.ledgerExpected(), after = run(before);
      committed({ before, after }); current();
    };
    const purge = async (kind: "memory" | "memory-candidate", id: string) => {
      current();
      if (!inspected.cleared.has(`${kind}:${id}`)) { await writer.purgeMemoryTarget({ ref: { kind, id, revision: 1 } }); current(); }
    };
    const reads = coldProjectMemoryReads(writer, { operationId: plan.operation_id, scopes: scopesFor(projection), current });
    await applyProjectMemoryPurge({ caller: callerFor(plan), control: { beforeEffect: async () => current(), assert_current: current },
      backend: { purgeMemory: request => purge("memory", request.memory_id), purgeCandidate: request => purge("memory-candidate", request.candidate_id) },
      ledger: {
        suppressSources: (scope, owner, sources) => change(snapshot => retention.suppressSources({ snapshot, scope, owner, sources })),
        dropCandidate: candidate_id => change(snapshot => retention.dropCandidate({ snapshot, candidate_id })),
        forget: memory_id => change(snapshot => retention.forget({ snapshot, memory_id })),
        forgetScopes: () => change(snapshot => retention.forgetScopes({ snapshot })),
      }, verifyScopeCleanup: async () => {
        await verifyProjectMemoryEmpty(reads, { scopes: projection.scopes, actor: plan.memory.actor_id,
          sessions: plan.sessions.sessions.map(item => item.session.session_id) }, current); current();
        await verifyMemoryCoverage(reads, { operation_id: plan.operation_id, known_scopes: projection.knownScopes }, current); current();
      } }, plan.memory); current();
    for (const item of plan.sessions.sessions) { await writer.purgeSessionTarget({ session: { ...item.session } }); current(); }
    await writer.verifyProjectSessionPurge({ plan: structuredClone(plan.sessions) }); current();
  }); current();
}

/** A local instance for the cold Catalog interval, never a replacement Runtime or a globally registered service. */
export function createColdMemoryProjectOwner(input: ColdMemoryProjectOwnerInput): ProjectDeletedOwner & { close(): Promise<void> } {
  let frame: Frame | undefined, closed = false, invalid = false;
  const facts = createColdProjectMemoryFacts({ homeDirectory: input.homeDirectory, current: () => { if (!frame) throw refused(); frame.current(); } });
  const committed: ColdMemoryProjectOwnerInput["ledgerCommitted"] = change => {
    try { synchronous(input.ledgerCommitted(change)); }
    catch (error) { invalid = true; throw error; }
  };
  return {
    ...MEMORY_OWNER, survivesRebuild: true, alive: () => !closed && !invalid,
    async withRecovery(request, work) {
      if (frame || closed || invalid || !facts.isIdle()) throw refused();
      const fixed = structuredClone(request);
      const active: Frame = { active: true, purging: false, current() {
        if (!active.active || closed || invalid) throw refused();
        synchronous(input.assertCurrent()); synchronous(active.control?.assertCurrent());
      } };
      frame = active; const current = active.current;
      try {
        current();
        if (fixed.original && (fixed.original.project_id !== fixed.project_id || fixed.original.operation_id !== fixed.operation_id)) throw refused();
        if (fixed.verification === "original") {
          if (!fixed.original) throw refused();
          active.plan = fixed.original;
          const proof = () => verifyOriginal(input, fixed.original!, current);
          await proof(); current();
          const result = await work(structuredClone(fixed.original), { verifyMemory: async () => { await proof(); current(); return current; }, verifyOriginal: proof, assertCurrent: current }); current(); return result;
        }
        const prepared = await input.prepareProject(fixed); current();
        const projection = structuredClone(prepared);
        if (projection.sessions.project_id !== fixed.project_id || projection.sessions.operation_id !== fixed.operation_id) throw refused();
        if (fixed.original?.kind === "absent" && projection.sessions.sessions.length) throw refused();
        const original = fixed.original;
        if (original?.kind === "runtime" && (!isDeepStrictEqual(projection.sessions, original.sessions)
          || projection.scopes.some(scope => !original.memory.scopes.some(target => target.scope === scope.scope && target.owner === scope.owner)))) throw refused();
        const plan = fixed.original ?? await input.withInspection(async reader => {
          current();
          const reads = coldProjectMemoryReads(reader, { operationId: fixed.operation_id, scopes: scopesFor(projection), current });
          await verifyMemoryCoverage(reads, { operation_id: fixed.operation_id, known_scopes: projection.knownScopes }, current); current();
          const memory = await previewProjectMemoryPurge({ backend: reads, caller: callerFor(fixed), current, readLedgerFacts: facts.read }, fixed.project_id,
            { scopes: projection.scopes, sessions: projection.sessions.sessions.map(item => ({ kind: "session", id: item.session.session_id, revision: 1 })) }); current();
          return { version: 1 as const, kind: "runtime" as const, project_id: fixed.project_id, operation_id: fixed.operation_id, sessions: projection.sessions, memory };
        }); current(); active.plan = plan;
        if (plan.kind === "runtime") projection.scopes = plan.memory.scopes.flatMap(target => target.scope === "personal" ? [] : [{ scope: target.scope, owner: target.owner }]);
        const verifyMemory = async () => {
          current();
          await input.withInspection(async reader => {
            current(); const reads = coldProjectMemoryReads(reader, { operationId: plan.operation_id, scopes: scopesFor(projection), current });
            await verifyProjectMemoryEmpty(reads, { scopes: projection.scopes, actor: LOCAL_PERSON_ACTOR_ID,
              sessions: plan.kind === "runtime" ? plan.sessions.sessions.map(item => item.session.session_id) : [] }, current); current();
            await verifyMemoryCoverage(reads, { operation_id: plan.operation_id, known_scopes: projection.knownScopes }, current); current();
          }); current();
          return current;
        };
        active.purge = async () => { if (plan.kind === "absent") await verifyMemory(); else await executePlan(input, plan, projection, current, committed); };
        const result = await work(structuredClone(plan), { verifyMemory, verifyOriginal: () => verifyOriginal(input, plan, current), assertCurrent: current }); current();
        return result;
      } finally { active.active = false; frame = undefined; }
    },
    async clear(projectId, deletion, control) {
      const active = frame;
      if (!active?.plan || !active.purge || active.purging || !deletion || deletion.project_id !== projectId
        || active.plan.project_id !== projectId || deletion.deletion_id !== active.plan.operation_id || !isDeepStrictEqual(deletion.recovery, active.plan)) throw refused();
      active.current(); synchronous(control?.assertCurrent()); active.purging = true; active.control = control;
      try { await active.purge(); active.current(); }
      finally { active.purging = false; active.control = undefined; }
    },
    async close() { closed = true; if (frame) frame.active = false; facts.close(); },
  };
}
