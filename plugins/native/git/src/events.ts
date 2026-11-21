import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginEventType } from "@molis-ai/molis-work-contracts/platform/plugin-events";
import { parseFilePath } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

/** Event ids owned by Git, living in this Plugin's own namespace (enforced by the Host). */
export const GIT_OPERATION_UPDATED_EVENT = "io.molis.work.git.operation-updated";
export const GIT_FILE_CHANGED_EVENT = "io.molis.work.git.file-changed";

export interface GitOperationUpdate {
  workspace_id: string;
  operation_id: string;
  outcome: "succeeded" | "failed" | "unknown";
}

/**
 * What Git tells the rest of the project.
 *
 * One event, published after an operation that moved files on disk. Files and
 * Coding both need it: neither can tell a checkout from a file they wrote
 * themselves, and both would otherwise keep showing what used to be there.
 */

export interface GitFileChanged {
  workspace_id: string;
  /** The operation that changed them, so a consumer can ignore its own echo. */
  operation_id: string;
  /**
   * Which paths changed. Empty means "more than we are willing to list" — a
   * whole-tree operation like a branch switch — and a consumer should re-read
   * everything rather than assume nothing moved.
   */
  paths: readonly (readonly string[])[];
}

const MAX_PATHS = 256;

export function parseGitFileChanged(payload: unknown): GitFileChanged {
  if (!isRecord(payload)) throw new Error("file-changed 不是对象");
  const workspace_id = requireText(payload.workspace_id, "workspace_id");
  const operation_id = requireText(payload.operation_id, "operation_id");
  if (!Array.isArray(payload.paths)) throw new Error("paths 必须是数组");
  if (payload.paths.length > MAX_PATHS) throw new Error("paths 超出上限");
  return {
    workspace_id,
    operation_id,
    paths: payload.paths.map((path) => parseFilePath(path)),
  };
}

export const gitEventTypes: readonly PluginEventType[] = [
  {
    event_type_id: GIT_OPERATION_UPDATED_EVENT,
    type_version: /* @version event.io.molis.work.git.operation-updated */ 1,
    validate(payload: unknown): GitOperationUpdate {
      if (!isRecord(payload) || typeof payload.outcome !== "string" || !["succeeded", "failed", "unknown"].includes(payload.outcome)) throw new Error("operation-updated 无效");
      return { workspace_id: requireText(payload.workspace_id, "workspace_id"), operation_id: requireText(payload.operation_id, "operation_id"), outcome: payload.outcome as GitOperationUpdate["outcome"] };
    },
  },
  {
    event_type_id: GIT_FILE_CHANGED_EVENT,
    type_version: /* @version event.io.molis.work.git.file-changed */ 1,
    validate: (payload: unknown) => parseGitFileChanged(payload),
  },
];

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} 无效`);
  if (value.length > 256) throw new Error(`${field} 超出上限`);
  return value;
}
