import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors, purgeProjectMemories, previewProjectMemoryPurge, applyProjectMemoryPurge, type MemoryBackendPort } from "@molis-ai/molis-work-service-memory";
import type { AgentMemoryExecutionControl, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueProjectDeletion } from "@molis-ai/molis-work-service-agent-host";
import type { ProjectDeletionRecovery } from "../project-deletion-recovery.js";
import { projectDeletionPending } from "../project-deletion-recovery.js";
import { assistantProjectSessions } from "../assistant/assistant-project-purge.js";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import { ProjectDeletedDeferred, projectDeletedHooksFor } from "../project-deleted-hooks.js";
import { MEMORY_OWNER, memoryOwnerWithoutService } from "../project-deleted-owners.js";

/** The existing project-deletion receipt owns this exception to a project's normal live-owner check. */
export function registerMemoryProjectDeletion(ports: {
  homeDirectory: string; backend: MemoryBackendPort; ledger: MemoryLedgerPort;
  projectDeletion?(): PrologueProjectDeletion;
  withEffect?: AgentRuntimeAdapter["withEffect"];
  controlledBackend?(control: AgentMemoryExecutionControl): MemoryBackendPort;
  alive(): boolean; executes(): boolean; ready(): Promise<void>; started?(): Promise<void>;
  projectExists?(projectId: string): Promise<boolean | null>;
}) {
  type Frame = { project: string; active: boolean; sessions: Set<string>; plan?: ProjectDeletionRecovery; purge?: () => Promise<void> };
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
          if (!input.original && sessions.sessions.some(item => item.state === "purged"))
            throw memoryErrors.conflict("项目已有先前清除的会话但没有当时固定的记忆计划，不能用空列表证明已清空");
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
                memory: await previewProjectMemoryPurge({ backend: controlledBackend(control), ledger: ports.ledger, caller }, input.project_id, true) };
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
      return !!frame?.active && frame.plan?.kind === "runtime" && frame.plan.memory.scopes.some(item => item.scope === scope && item.owner === owner);
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
