import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readMemoryOwnerCoverage } from "./memory-owner-coverage.js";
import { verifyMemoryCoverage, verifyProjectMemoryEmpty } from "./memory-project-coverage.js";
import { hasStorageBusinessFiles } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors, purgeProjectMemories, previewProjectMemoryPurge, applyProjectMemoryPurge, projectMemoryPurgeLedger, readProjectMemoryPurgeLedgerFacts, type MemoryBackendPort } from "@molis-ai/molis-work-service-memory";
import type { AgentMemoryExecutionControl, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueProjectDeletion } from "@molis-ai/molis-work-service-agent-host";
import type { ProjectDeletionRecovery, WithProjectRecreation } from "../project-deletion-recovery.js";
import { projectDeletionPending } from "../project-deletion-recovery.js";
import { assistantProjectSessions } from "../assistant/assistant-project-purge.js";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import { ProjectDeletedDeferred, projectDeletedHooksFor } from "../project-deleted-hooks.js";
import { MEMORY_OWNER, memoryOwnerWithoutService } from "../project-deleted-owners.js";
import type { MemoryRuntimePolicyOwner } from "./memory-runtime-policy.js";

interface MemoryProjectDeletionPorts {
  homeDirectory: string; backend: MemoryBackendPort; ledger: MemoryLedgerPort;
  projectDeletion?(): PrologueProjectDeletion;
  withEffect?: AgentRuntimeAdapter["withEffect"];
  controlledBackend?(control: AgentMemoryExecutionControl): MemoryBackendPort;
  alive(): boolean; executes(): boolean; ready(): Promise<void>; started?(): Promise<void>;
  projectExists?(projectId: string): Promise<boolean | null>;
}
type Frame = { project: string; active: boolean; sessions: Set<string>; operation_id?: string; plan?: ProjectDeletionRecovery; purge?: () => Promise<void>;
  scopes?: Array<{ scope: "project" | "character"; owner: string }>; empty?: () => void; purging?: boolean;
  coverage?: { operation: string; projection: ReturnType<typeof readMemoryOwnerCoverage>; current(): void } };

/** The existing project-deletion receipt owns this exception to a project's normal live-owner check. */
export function registerMemoryProjectDeletion(ports: MemoryProjectDeletionPorts): Required<Pick<MemoryRuntimePolicyOwner,
  "deletingProject" | "deletingScope" | "deletingPersonal" | "deletingSessionPurge" | "deletingCoverage" | "deletionPending">> {
  const deleting = new AsyncLocalStorage<Frame>();
  const held = new Map<string, Set<string>>();
  let runtimeHere = false;
  void ports.started?.().then(() => { runtimeHere = true; }).catch(() => undefined);
  const executes = () => ports.executes() || runtimeHere;
  const runtimeExists = () => hasStorageBusinessFiles(agentRuntimeDirectory(ports.homeDirectory));
  const elsewhere = memoryOwnerWithoutService(ports.homeDirectory);
  const whileRuntimeIsOurs = async <T>(work: () => Promise<T>): Promise<T> => {
    try { return await work(); }
    catch (error) {
      if ((error as { code?: unknown }).code === "agent.storage_busy") throw new ProjectDeletedDeferred("记忆放在 Agent 执行服务里，而它正由另一个 Molis Work 进程使用；那个进程会接着清理，或关闭它后重试");
      throw error;
    }
  };
  projectDeletedHooksFor(ports.homeDirectory).register({ ...MEMORY_OWNER, alive: ports.alive,
    check: () => executes() ? (runtimeExists() ? whileRuntimeIsOurs(() => ports.ready()) : undefined) : elsewhere.check?.(),
    withRecreation: (input, work) => executes() ? recreateWithEmptyMemory(ports, deleting, held, input, work)
      : elsewhere.withRecreation!(input, work),
    withRecovery: async (input, work) => {
      if (input.original?.kind === "absent" && !runtimeExists()) return elsewhere.withRecovery!(input, work);
      if (!executes()) return elsewhere.withRecovery!(input, work);
      const controlledBackend = ports.controlledBackend, withEffect = ports.withEffect;
      if (!ports.projectDeletion || !controlledBackend || !withEffect) throw memoryErrors.unavailable("当前运行时缺少项目原计划清理能力");
      if (held.has(input.project_id)) throw memoryErrors.conflict("项目删除已在准备或清理中");
      const sessionIds = new Set<string>();
      held.set(input.project_id, sessionIds);
      try {
        await whileRuntimeIsOurs(() => ports.ready());
        const projectDeletion = ports.projectDeletion();
        const associated = input.original?.kind === "runtime"
          ? input.original.sessions.sessions.filter(item => item.indexed && item.owner.project_id !== input.project_id).map(({ session, owner }) => ({ session, owner }))
          : input.original ? [] : assistantProjectSessions(ports.homeDirectory, input.project_id);
        return await projectDeletion.withHold({ project_id: input.project_id, associated_sessions: associated }, async active => {
          const sessions = input.original?.kind === "runtime" ? input.original.sessions : await active.preview(input.operation_id);
          for (const item of sessions.sessions) sessionIds.add(item.session.session_id);
          const frame: Frame = { project: input.project_id, active: true, sessions: sessionIds, operation_id: input.operation_id };
          const projection = readMemoryOwnerCoverage({ ...ports, projectId: input.project_id });
          frame.scopes = projection.scopes;
          const current = () => {
            if (!frame.active || !ports.alive()) throw memoryErrors.unavailable("原项目删除主人已关闭");
            if (!isDeepStrictEqual(readMemoryOwnerCoverage({ ...ports, projectId: input.project_id }), projection))
              throw memoryErrors.conflict("原删除归属已变化，须从首页重新核验且不能扩大原计划");
          };
          frame.coverage = { operation: input.operation_id, projection, current };
          const control: AgentMemoryExecutionControl = { beforeEffect: async () => { current(); }, assert_current: current };
          const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: input.project_id, consumer: "ui" as const, person: true,
            current_scene: "common" as const, purpose: "management" as const, operation_id: input.operation_id };
          try {
            return await deleting.run(frame, async () => {
              frame.plan = input.original;
              const backend = controlledBackend(control).withCaller(caller);
              const covered = () => verifyMemoryCoverage(backend, { operation_id: input.operation_id, known_scopes: projection.knownScopes }, current);
              await covered();
              if (input.original?.kind === "absent" && sessions.sessions.length) throw memoryErrors.conflict("原空计划之外出现会话，不能扩大原删除决定");
              if (input.original?.kind === "runtime") {
                const planned = input.original.memory.scopes.filter(item => item.scope !== "personal").map(({ scope, owner }) => ({ scope, owner }));
                if (projection.scopes.some(item => !planned.some(scope => scope.scope === item.scope && scope.owner === item.owner)))
                  throw memoryErrors.conflict("当前归属超出原固定清单，不能追加删除");
              }
              const plan: ProjectDeletionRecovery = input.original ?? { version: 1, kind: "runtime", project_id: input.project_id,
                operation_id: input.operation_id, sessions,
                memory: await previewProjectMemoryPurge({ backend, caller, current,
                  readLedgerFacts: query => readProjectMemoryPurgeLedgerFacts(ports.ledger, query) }, input.project_id,
                  { sessions: sessions.sessions.map(item => ({ kind: "session", id: item.session.session_id, revision: 1 })), scopes: projection.scopes }) };
              frame.plan = plan;
              const verifyMemory = async () => {
                await verifyProjectMemoryEmpty(backend, { scopes: projection.scopes, actor: caller.actor_id,
                  sessions: plan.kind === "runtime" ? plan.sessions.sessions.map(item => item.session.session_id) : [] }, current);
                await covered(); current();
              };
              frame.purge = async () => {
                if (plan.kind === "absent") { await verifyMemory(); return; }
                frame.purging = true;
                try {
                  await applyProjectMemoryPurge({ backend: { purgeMemory: request => backend.remove(request), purgeCandidate: request => backend.candidates.purge(request) },
                    ledger: projectMemoryPurgeLedger(ports.ledger, caller.actor_id), caller, control, verifyScopeCleanup: verifyMemory }, plan.memory);
                  current();
                  await withEffect(control, () => active.purge(plan.sessions));
                } finally { frame.purging = false; }
              };
              current(); return await work(structuredClone(plan), { verifyMemory, assertCurrent: current });
            });
          } finally { frame.active = false; }
        });
      } finally { held.delete(input.project_id); }
    },
    clear: async (projectId, receipt) => {
      const recreation = deleting.getStore();
      if (!receipt && recreation?.empty && recreation.project === projectId) { recreation.empty(); return; }
      if (receipt) {
        if (receipt.recovery.kind === "absent" && !deleting.getStore()?.active) return elsewhere.clear(projectId, receipt);
        const frame = deleting.getStore();
        if (!frame?.active || frame.project !== projectId || frame.plan?.operation_id !== receipt.deletion_id || !frame.purge)
          throw memoryErrors.forbidden("项目清理必须在原持久计划的持有区间执行");
        await frame.purge(); return;
      }
      if (!executes()) return elsewhere.clear(projectId);
      if (!runtimeExists()) { await purgeProjectMemories({ backend: null, ledger: ports.ledger }, projectId); return; }
      await whileRuntimeIsOurs(async () => {
        await ports.ready();
        const key = `memory-project-delete:${projectId}`;
        const marker = ports.ledger.marker(LOCAL_PERSON_ACTOR_ID, key)?.body as { operation_id?: string; complete?: boolean } | undefined;
        if (await ports.projectExists?.(projectId) !== true) throw memoryErrors.forbidden("没有当前项目删除回执，不能清理记忆");
        const operation = marker?.complete === false && marker.operation_id ? marker.operation_id : `memory-project-delete:${randomUUID()}`;
        ports.ledger.setMarker(LOCAL_PERSON_ACTOR_ID, key, { operation_id: operation, complete: false }, new Date().toISOString());
        const frame: Frame = { project: projectId, active: true, sessions: new Set() };
        try {
          await deleting.run(frame, () => purgeProjectMemories({ backend: ports.backend, ledger: ports.ledger,
            caller: { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, consumer: "ui", person: true,
              current_scene: "common", purpose: "management", operation_id: operation } }, projectId));
          ports.ledger.setMarker(LOCAL_PERSON_ACTOR_ID, key, { operation_id: operation, complete: true }, new Date().toISOString());
        } finally { frame.active = false; }
      });
    } });
  return {
    deletingCoverage: (operation: string, scopes: readonly { scope: string; owner: string }[]) => {
      const frame = deleting.getStore();
      if (!frame?.active || frame.coverage?.operation !== operation || !isDeepStrictEqual(scopes, frame.coverage.projection.knownScopes)) return false;
      frame.coverage.current(); return true;
    },
    deletingProject: () => { const frame = deleting.getStore(); return frame?.active ? frame.project : undefined; },
    deletingScope: (scope: string, owner: string) => {
      const frame = deleting.getStore();
      return !!(frame?.active && (frame.scopes?.some(item => item.scope === scope && item.owner === owner)
        || frame.plan?.kind === "runtime" && frame.plan.memory.scopes.some(item => item.scope === scope && item.owner === owner)));
    },
    deletingPersonal: (target: { ref: { kind: string; id: string }; sessionRef?: { id: string } }) => {
      const frame = deleting.getStore();
      if (!frame?.active) return false;
      if (target.sessionRef && frame.sessions.has(target.sessionRef.id)) return true;
      return !!(frame.plan?.kind === "runtime" && frame.plan.memory.scopes.some(item => item.scope === "personal"
        && (target.ref.kind === "memory" ? item.memories.some(entry => entry.memory_id === target.ref.id) : item.candidates.some(entry => entry.candidate_id === target.ref.id))));
    },
    deletingSessionPurge: (...args: Parameters<NonNullable<MemoryRuntimePolicyOwner["deletingSessionPurge"]>>) =>
      ports.alive() && retainedSessionPurge(deleting.getStore(), ...args),
    deletionPending: (projectId: string | null, sessionId?: string) => [...held].some(([project, sessions]) => project === projectId || !!sessionId && sessions.has(sessionId))
      || projectDeletionPending(ports.homeDirectory, projectId ?? "", sessionId),
  };
}

/** Only the actual metadata preview or an original fixed item may pass a retained Session's normal Memory fence. */
function retainedSessionPurge(frame: Frame | undefined, ...[sessionId, requests, call]: Parameters<NonNullable<MemoryRuntimePolicyOwner["deletingSessionPurge"]>>): boolean {
  if (!frame?.active || !frame.operation_id || !frame.sessions.has(sessionId) || !requests.length) return false;
  const related = requests.filter(request => request.target.sessionRef?.id === sessionId);
  return related.length > 0 && related.every(request => {
    const target = request.target;
    if (target.sessionRef?.id !== sessionId || target.sessionRef.revision !== 1 || request.context.sessionRef) return false;
    // SDK previews use delete eligibility too; only the adapter's actual metadata-only entry distinguishes this read.
    if (call.kind === "preview") return !request.before && request.action === "delete" && call.query.scope === target.scope
      && call.query.owner === target.owner && call.query.kind === target.ref.kind
      && (!call.query.session_ref || call.query.session_ref.id === sessionId && call.query.session_ref.revision === 1);
    const plan = frame.plan;
    if (!frame.purging || request.action !== "delete" || plan?.kind !== "runtime" || plan.operation_id !== frame.operation_id
      || plan.project_id !== frame.project || call.scope !== target.scope || call.owner !== target.owner
      || call.ref.kind !== target.ref.kind || call.ref.id !== target.ref.id || call.ref.revision !== target.ref.revision
      || call.operation_id !== `${plan.operation_id}:${target.ref.kind === "memory" ? "memory" : "candidate"}:${target.ref.id}`) return false;
    // Formal purge's existing SDK mutation first writes N+1's tombstone; its original input remains N even on replay.
    if (target.ref.kind === "memory") {
      if (target.version !== call.version && !(target.tombstoned && target.version === call.version + 1)) return false;
      const before = request.before;
      if (before && (before.version !== call.version || before.scope !== target.scope || before.owner !== target.owner
        || !isDeepStrictEqual(before.ref, target.ref) || !isDeepStrictEqual(before.sessionRef, target.sessionRef))) return false;
    } else if (target.version !== call.version || request.before && !isDeepStrictEqual(request.before, target)) return false;
    const selected = plan.memory.scopes.find(item => item.scope === (target.scope === "user" ? "personal" : target.scope) && item.owner === target.owner);
    return target.ref.kind === "memory" ? selected?.memories.some(item => item.memory_id === target.ref.id && item.version === call.version) === true
      : selected?.candidates.some(item => item.candidate_id === target.ref.id && item.version === call.version) === true;
  });
}

/** A completed deletion supplies identity, while the online Runtime supplies today's empty proof. Never purges. */
async function recreateWithEmptyMemory<T>(ports: MemoryProjectDeletionPorts, deleting: AsyncLocalStorage<Frame>, held: Map<string, Set<string>>,
  input: Parameters<WithProjectRecreation>[0], work: (assertCurrent: () => void) => Promise<T>): Promise<T> {
  if (!ports.projectDeletion || !ports.controlledBackend) throw memoryErrors.unavailable("当前运行时无法核验示例记忆空态");
  if (!input.deletions.length || input.deletions.some(item => item.project_id !== input.project_id || item.cleanup_state !== "complete"
    || item.owner_steps.some(step => step.state !== "complete") || item.recovery.project_id !== input.project_id
    || item.recovery.operation_id !== item.deletion_id)) throw memoryErrors.forbidden("示例重建缺少完整原删除事实");
  if (held.has(input.project_id)) throw memoryErrors.conflict("项目已在清理或重建中");
  const plans = input.deletions.flatMap(item => item.recovery.kind === "runtime" ? [item.recovery] : []);
  const sessions = plans.flatMap(plan => plan.sessions.sessions);
  const sessionIds = new Set(sessions.map(item => item.session.session_id));
  const projection = readMemoryOwnerCoverage({ ...ports, projectId: input.project_id });
  const frame: Frame = { project: input.project_id, active: true, sessions: sessionIds, scopes: projection.scopes, operation_id: input.deletions[0]!.deletion_id };
  const current = () => {
    if (!frame.active || !ports.alive()) throw memoryErrors.unavailable("示例记忆空态证明已结束，请重试");
    if (!isDeepStrictEqual(readMemoryOwnerCoverage({ ...ports, projectId: input.project_id }), projection)) throw memoryErrors.conflict("示例归属已变化，请重新核验");
  };
  frame.coverage = { operation: input.deletions[0]!.deletion_id, projection, current };
  const control: AgentMemoryExecutionControl = { beforeEffect: current, assert_current: current };
  held.set(input.project_id, sessionIds);
  try {
    await ports.ready(); current();
    return await ports.projectDeletion().withHold({ project_id: input.project_id,
      associated_sessions: sessions.map(({ session, owner }) => ({ session, owner })) }, async () => deleting.run(frame, async () => {
      const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: input.project_id, person: true, consumer: "ui" as const,
        current_scene: "common" as const, purpose: "management" as const, operation_id: input.deletions[0]!.deletion_id };
      const backend = ports.controlledBackend!(control).withCaller(caller);
      await verifyProjectMemoryEmpty(backend, { scopes: projection.scopes, actor: caller.actor_id, sessions: [...sessionIds] }, current);
      await verifyMemoryCoverage(backend, { operation_id: caller.operation_id, known_scopes: projection.knownScopes }, current);
      current();
      frame.empty = current;
      return work(current);
    }));
  } finally { frame.active = false; held.delete(input.project_id); }
}
