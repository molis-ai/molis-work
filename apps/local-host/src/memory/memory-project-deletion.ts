import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors, purgeProjectMemories, type MemoryBackendPort } from "@molis-ai/molis-work-service-memory";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";
import { ProjectDeletedDeferred, projectDeletedHooksFor } from "../project-deleted-hooks.js";
import { MEMORY_OWNER, memoryOwnerWithoutService } from "../project-deleted-owners.js";

/** The existing project-deletion receipt owns this exception to a project's normal live-owner check. */
export function registerMemoryProjectDeletion(ports: {
  homeDirectory: string; backend: MemoryBackendPort; ledger: MemoryLedgerPort;
  alive(): boolean; executes(): boolean; ready(): Promise<void>; started?(): Promise<void>;
  projectExists?(projectId: string): Promise<boolean | null>;
}): { deletingProject(): string | undefined } {
  const deleting = new AsyncLocalStorage<{ project: string; active: boolean }>();
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
    clear: async (projectId, receipt) => {
      if (receipt && (receipt.project_id !== projectId || !receipt.deletion_id.trim())) throw memoryErrors.forbidden("项目删除回执不属于当前清理范围");
      if (!executes()) return elsewhere.clear(projectId);
      if (!runtimeExists()) { await purgeProjectMemories({ backend: null, ledger: ports.ledger }, projectId); return; }
      await whileRuntimeIsOurs(async () => {
        await ports.ready();
        const key = `memory-project-delete:${projectId}`;
        const marker = ports.ledger.marker(LOCAL_PERSON_ACTOR_ID, key)?.body as { operation_id?: string; complete?: boolean } | undefined;
        if (!receipt && await ports.projectExists?.(projectId) !== true) throw memoryErrors.forbidden("没有当前项目删除回执，不能清理记忆");
        const operation = receipt?.deletion_id ?? (marker?.complete === false && marker.operation_id ? marker.operation_id : `memory-project-delete:${randomUUID()}`);
        if (!receipt) ports.ledger.setMarker(LOCAL_PERSON_ACTOR_ID, key, { operation_id: operation, complete: false }, new Date().toISOString());
        const frame = { project: projectId, active: true };
        try {
          await deleting.run(frame, () => purgeProjectMemories({ backend: ports.backend, ledger: ports.ledger,
            caller: { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, consumer: "ui", person: true,
              current_scene: "common", purpose: "management", operation_id: operation } }, projectId));
          if (!receipt) ports.ledger.setMarker(LOCAL_PERSON_ACTOR_ID, key, { operation_id: operation, complete: true }, new Date().toISOString());
        } finally { frame.active = false; }
      });
    } });
  return { deletingProject: () => { const frame = deleting.getStore(); return frame?.active ? frame.project : undefined; } };
}
