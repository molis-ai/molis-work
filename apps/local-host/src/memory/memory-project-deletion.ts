import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors, purgeProjectMemories, previewProjectMemoryPurge, applyProjectMemoryPurge, type MemoryBackendPort } from "@molis-ai/molis-work-service-memory";
import type { AgentMemoryExecutionControl, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueProjectDeletion } from "@molis-ai/molis-work-service-agent-host";
import type { ProjectDeletionRecovery, WithProjectRecreation } from "../project-deletion-recovery.js";
import { projectDeletionPending } from "../project-deletion-recovery.js";
import { assistantProjectSessions } from "../assistant/assistant-project-purge.js";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import { ProjectDeletedDeferred, projectDeletedHooksFor } from "../project-deleted-hooks.js";
import { MEMORY_OWNER, memoryOwnerWithoutService } from "../project-deleted-owners.js";

interface MemoryProjectDeletionPorts {
  homeDirectory: string; backend: MemoryBackendPort; ledger: MemoryLedgerPort;
  projectDeletion?(): PrologueProjectDeletion;
  withEffect?: AgentRuntimeAdapter["withEffect"];
  controlledBackend?(control: AgentMemoryExecutionControl): MemoryBackendPort;
  alive(): boolean; executes(): boolean; ready(): Promise<void>; started?(): Promise<void>;
  projectExists?(projectId: string): Promise<boolean | null>;
}
type Frame = { project: string; active: boolean; sessions: Set<string>; plan?: ProjectDeletionRecovery; purge?: () => Promise<void>;
  scopes?: Array<{ scope: "project" | "character"; owner: string }>; empty?: () => void };

/** The existing project-deletion receipt owns this exception to a project's normal live-owner check. */
export function registerMemoryProjectDeletion(ports: MemoryProjectDeletionPorts) {
  const deleting = new AsyncLocalStorage<Frame>();
  const held = new Map<string, Set<string>>();
  let runtimeHere = false;
  void ports.started?.().then(() => { runtimeHere = true; }).catch(() => undefined);
  const executes = () => ports.executes() || runtimeHere;
  const runtimeExists = () => existsSync(agentRuntimeDirectory(ports.homeDirectory));
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
      if (input.original?.kind === "absent") return elsewhere.withRecovery!(input, work);
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
          : assistantProjectSessions(ports.homeDirectory, input.project_id);
        return await projectDeletion.withHold({ project_id: input.project_id, associated_sessions: associated }, async active => {
          const sessions = input.original?.kind === "runtime" ? input.original.sessions : await active.preview(input.operation_id);
          for (const item of sessions.sessions) sessionIds.add(item.session.session_id);
          const frame: Frame = { project: input.project_id, active: true, sessions: sessionIds };
          const current = () => { if (!frame.active || !ports.alive()) throw memoryErrors.unavailable("原项目删除主人已关闭"); };
          const control: AgentMemoryExecutionControl = { beforeEffect: async () => { current(); }, assert_current: current };
          const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: input.project_id, consumer: "ui" as const, person: true,
            current_scene: "common" as const, purpose: "management" as const, operation_id: input.operation_id };
          try {
            return await deleting.run(frame, async () => {
              frame.plan = input.original;
              const plan: ProjectDeletionRecovery = input.original ?? { version: 1, kind: "runtime", project_id: input.project_id,
                operation_id: input.operation_id, sessions,
                memory: await previewProjectMemoryPurge({ backend: controlledBackend(control), ledger: ports.ledger, caller }, input.project_id,
                  { sessions: sessions.sessions.map(item => ({ kind: "session", id: item.session.session_id, revision: 1 })) }) };
              frame.plan = plan;
              frame.purge = async () => {
                if (plan.kind !== "runtime") throw memoryErrors.conflict("缺少原运行时清理计划");
                await applyProjectMemoryPurge({ backend: controlledBackend(control), ledger: ports.ledger, caller, control }, plan.memory);
                current();
                await withEffect(control, () => active.purge(plan.sessions));
              };
              current(); return await work(structuredClone(plan));
            });
          } finally { frame.active = false; }
        });
      } finally { held.delete(input.project_id); }
    },
    clear: async (projectId, receipt) => {
      const recreation = deleting.getStore();
      if (!receipt && recreation?.empty && recreation.project === projectId) { recreation.empty(); return; }
      if (receipt) {
        if (receipt.recovery.kind === "absent") return elsewhere.clear(projectId, receipt);
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
    deletionPending: (projectId: string | null, sessionId?: string) => [...held].some(([project, sessions]) => project === projectId || !!sessionId && sessions.has(sessionId))
      || projectDeletionPending(ports.homeDirectory, projectId ?? "", sessionId),
  };
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
  const scopes = plans.flatMap(plan => plan.memory.scopes.filter(item => item.scope !== "personal")
    .map(item => ({ scope: item.scope as "project" | "character", owner: item.owner })));
  const frame: Frame = { project: input.project_id, active: true, sessions: sessionIds, scopes };
  const current = () => { if (!frame.active || !ports.alive()) throw memoryErrors.unavailable("示例记忆空态证明已结束，请重试"); };
  const control: AgentMemoryExecutionControl = { beforeEffect: current, assert_current: current };
  held.set(input.project_id, sessionIds);
  try {
    await ports.ready(); current();
    return await ports.projectDeletion().withHold({ project_id: input.project_id,
      associated_sessions: sessions.map(({ session, owner }) => ({ session, owner })) }, async () => deleting.run(frame, async () => {
      const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: input.project_id, person: true, consumer: "ui" as const,
        current_scene: "common" as const, purpose: "management" as const, operation_id: input.deletions[0]!.deletion_id };
      const preview = await previewProjectMemoryPurge({ backend: ports.controlledBackend!(control), ledger: ports.ledger, caller }, input.project_id,
        { sessions: [...sessionIds].map(id => ({ kind: "session", id, revision: 1 })), scopes });
      current();
      if (preview.scopes.some(scope => scope.memories.length || scope.candidates.length)) throw memoryErrors.conflict("示例项目仍有当前记忆原件，不能用历史删除收据清理或覆盖");
      frame.empty = current;
      return work(current);
    }));
  } finally { frame.active = false; held.delete(input.project_id); }
}
