import { createHash } from "node:crypto";
import { isPrologueError, type Runtime } from "@prologue/sdk";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentWriteChecker, AgentWriteCheckerList, AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";

const KIND = "molis-write-checkers";
/** One record per project and workspace. */
const recordId = (projectId: string, workspaceId: string) => createHash("sha256").update(JSON.stringify([projectId, workspaceId])).digest("hex");
const stale = () => new ActionError("actions.conflict", "写后检查器在你读取之后改过了：请重新读取再保存");

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
/** A kept checker has exactly these fields, the defaults filled in; anything else is not the current shape. */
const KEPT_FIELDS = ["applies_to", "args", "checker_id", "cwd", "display_name", "executable", "timeout_ms"].join();
function keptChecker(value: unknown): value is Required<AgentWriteChecker> {
  if (typeof value !== "object" || value === null) return false;
  const row: Record<string, unknown> = { ...value };
  return Object.keys(row).sort().join() === KEPT_FIELDS && ["checker_id", "display_name", "executable", "cwd"].every(key => typeof row[key] === "string")
    && typeof row.timeout_ms === "number" && strings(row.args) && strings(row.applies_to);
}

/**
 * The person's after-write checkers, kept in the SDK's store beside the MCP configuration (specs/prologue-adoption §6.0p.2).
 * The store's own version is the list's version: it counts saves from 1, and a save against any other version is refused.
 */
export function createPrologueWriteCheckers(runtime: Pick<Runtime, "store">): AgentWriteCheckerStore {
  const read = async (projectId: string, workspaceId: string): Promise<AgentWriteCheckerList> => {
    const record = await runtime.store.get({ kind: KIND, id: recordId(projectId, workspaceId) });
    if (!record || record.tombstoned) return { workspace_id: workspaceId, version: record?.version ?? 0, checkers: [] };
    const { project_id, workspace_id, checkers } = record.metadata;
    if (project_id !== projectId || workspace_id !== workspaceId || !Array.isArray(checkers) || !checkers.every(keptChecker)) {
      throw agentErrors.write_checker_unreadable("写后检查器的记录不是现行形状，读不了");
    }
    return { workspace_id: workspaceId, version: record.version, checkers: structuredClone(checkers) };
  };
  return {
    read,
    async save(projectId, workspaceId, expectedVersion, checkers) {
      if ((await read(projectId, workspaceId)).version !== expectedVersion) throw stale();
      try {
        const committed = await runtime.store.commit({ kind: KIND, id: recordId(projectId, workspaceId), expectedVersion,
          metadata: { project_id: projectId, workspace_id: workspaceId, checkers: structuredClone(checkers) } });
        return { workspace_id: workspaceId, version: committed.version, checkers: structuredClone(checkers) };
      } catch (error) {
        // Another save got in between the read and this one.
        if (isPrologueError(error) && error.code === "STORAGE_CONFLICT") throw stale();
        throw error;
      }
    },
  };
}
