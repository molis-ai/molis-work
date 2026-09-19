import type { PluginEventType } from "@molis-ai/molis-work-contracts/platform/plugin-events";

import {
  WORKSPACE_HANDLE_MAX_LENGTH,
  WORKSPACE_SELECTED_EVENT,
  isOpaqueHandle,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

export { WORKSPACE_SELECTED_EVENT };

/**
 * Which workspace the user moved to.
 *
 * Consumers that keep per-workspace state need to know the moment it changes,
 * and a port value alone does not tell them: a port carries the new value but
 * not the fact that the old one stopped applying.
 */
export interface WorkspaceSelected {
  workspace_id: string;
  /** Present when the user left a workspace rather than arriving from nothing. */
  previous_workspace_id?: string;
}

export function parseWorkspaceSelected(payload: unknown): WorkspaceSelected {
  if (!isRecord(payload)) throw new Error("selected 不是对象");
  const workspace_id = requireHandle(payload.workspace_id, "workspace_id");
  if (payload.previous_workspace_id === undefined) return { workspace_id };
  const previous_workspace_id = requireHandle(payload.previous_workspace_id, "previous_workspace_id");
  if (previous_workspace_id === workspace_id) {
    // "Changed to what it already was" is not a change, and a consumer that
    // dropped its state on it would lose work for nothing.
    throw new Error("previous_workspace_id 不能和 workspace_id 相同");
  }
  return { workspace_id, previous_workspace_id };
}

export const workspaceEventTypes: readonly PluginEventType[] = [
  {
    event_type_id: WORKSPACE_SELECTED_EVENT,
    type_version: 1,
    validate: (payload: unknown) => parseWorkspaceSelected(payload),
  },
];

function requireHandle(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} 无效`);
  if (value.length > WORKSPACE_HANDLE_MAX_LENGTH) throw new Error(`${field} 超出上限`);
  if (!isOpaqueHandle(value)) throw new Error(`${field} 不能包含路径`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
