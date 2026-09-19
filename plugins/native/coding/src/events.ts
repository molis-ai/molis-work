import type { PluginEventType } from "@molis-ai/molis-work-contracts/platform/plugin-events";

import { CODING_ROLE_IDS } from "./roles.js";

/**
 * What Coding tells the rest of the project.
 *
 * Both payloads carry a path or a reference other Plugins will act on, so both
 * are validated here rather than trusted. The Host stores only what these accept.
 */

/**
 * Event ids live in this Plugin's own namespace; the Host enforces that. They
 * are declared in Contracts so Files and Git can name what they subscribe to
 * without importing Coding, while the validators below stay here — only the
 * publisher knows what its payload means.
 */
export {
  CODING_FILE_CHANGED_EVENT,
  CODING_PREFERENCE_EVENT,
  CODING_WORKSPACE_INVALIDATED_EVENT,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

import {
  CODING_FILE_CHANGED_EVENT,
  CODING_PREFERENCE_EVENT,
  CODING_WORKSPACE_INVALIDATED_EVENT,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

export interface CodingFileChanged {
  project_id: string;
  /** Workspace-relative segments. Never a joined string, never absolute. */
  path: readonly string[];
}

const MAX_SEGMENTS = 64;
const MAX_SEGMENT_LENGTH = 255;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} 无效`);
  return value;
}

/** Any control character in a path segment is refused, not just the null byte. */
function hasControlCharacter(segment: string): boolean {
  for (let index = 0; index < segment.length; index += 1) {
    if (segment.charCodeAt(index) < 32) return true;
  }
  return false;
}

export function parseCodingFileChanged(payload: unknown): CodingFileChanged {
  if (!isRecord(payload)) throw new Error("file-changed 不是对象");
  const project_id = requireText(payload.project_id, "project_id");
  if (!Array.isArray(payload.path) || payload.path.length === 0) throw new Error("path 无效");
  if (payload.path.length > MAX_SEGMENTS) throw new Error("path 超出上限");
  const path = payload.path.map((segment, index) => {
    if (typeof segment !== "string") throw new Error(`path[${index}] 必须是字符串`);
    // `..` and separators are refused rather than normalised: a payload trying
    // to climb out of the workspace is a bad payload, and quietly rewriting it
    // would hide that from whoever sent it.
    if (
      segment === ""
      || segment === "."
      || segment === ".."
      || segment.includes("/")
      || segment.includes("\\")
      || hasControlCharacter(segment)
      || segment.length > MAX_SEGMENT_LENGTH
    ) {
      throw new Error("path 路径片段无效");
    }
    return segment;
  });
  return { project_id, path };
}

export const codingFileChangedType: PluginEventType<CodingFileChanged> = {
  event_type_id: CODING_FILE_CHANGED_EVENT,
  type_version: 1,
  validate: parseCodingFileChanged,
};

export interface CodingWorkspaceInvalidated {
  project_id: string;
  run_id: string;
  /**
   * The review whose change set no longer matches the workspace.
   *
   * `content_version` is what the review was prepared against, so a consumer
   * compares it instead of assuming the review is still current.
   */
  review: { review_id: string; content_version: number };
}

export function parseCodingWorkspaceInvalidated(payload: unknown): CodingWorkspaceInvalidated {
  if (!isRecord(payload)) throw new Error("workspace-invalidated 不是对象");
  const project_id = requireText(payload.project_id, "project_id");
  const run_id = requireText(payload.run_id, "run_id");
  if (!isRecord(payload.review)) throw new Error("review 无效");
  const review_id = requireText(payload.review.review_id, "review.review_id");
  const content_version = payload.review.content_version;
  if (typeof content_version !== "number" || !Number.isInteger(content_version)) {
    throw new Error("review.content_version 无效");
  }
  return { project_id, run_id, review: { review_id, content_version } };
}

export const codingWorkspaceInvalidatedType: PluginEventType<CodingWorkspaceInvalidated> = {
  event_type_id: CODING_WORKSPACE_INVALIDATED_EVENT,
  type_version: 1,
  validate: parseCodingWorkspaceInvalidated,
};

/**
 * Which role the user wants next, and whether they trust this project.
 *
 * `project_trusted` is deliberately separate from the role: a trusted project
 * does not widen what a role may do — the Host still freezes execution and
 * still requires approval. It records the user's stance so a surface can stop
 * asking the same question, never so a Run can skip a gate.
 */
export interface CodingPreference {
  role_id: string;
  project_trusted: boolean;
}

export function parseCodingPreference(payload: unknown): CodingPreference {
  if (!isRecord(payload)) throw new Error("偏好不是对象");
  const role_id = requireText(payload.role_id, "role_id");
  if (!CODING_ROLE_IDS.includes(role_id as (typeof CODING_ROLE_IDS)[number])) {
    throw new Error(`role_id 不是这个插件声明过的角色：${role_id}`);
  }
  if (typeof payload.project_trusted !== "boolean") {
    throw new Error("project_trusted 必须是布尔值");
  }
  return { role_id, project_trusted: payload.project_trusted };
}

export const codingPreferenceType: PluginEventType<CodingPreference> = {
  event_type_id: CODING_PREFERENCE_EVENT,
  type_version: 1,
  validate: parseCodingPreference,
};

export const codingEventTypes = [
  codingFileChangedType,
  codingWorkspaceInvalidatedType,
  codingPreferenceType,
] as const;
