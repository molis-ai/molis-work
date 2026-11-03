import type { ContractDescriptor } from "../platform/package.js";
export * from "./runtime-project-context.js";

export const modulesPrivateWorkContextContract = {
  contractId: "io.molis.work.module.private-work-context.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/private-work-context.md",
} as const satisfies ContractDescriptor;

export interface RuntimeWorkContext {
  runtime_id: string;
  stable_work_context_id: string | null;
  host_declares_stable: boolean;
  /** Canonical host workspace, independent from the optional Session ID. */
  workspace?: RuntimeWorkspaceContext | null;
}

export interface NormalizedRuntimeWorkContext {
  runtime_id: string;
  stable_work_context_id: string | null;
  workspace?: NormalizedRuntimeWorkspaceContext;
}

export interface RuntimeWorkspaceContext {
  canonical_path: string;
  realpath_verified: boolean;
}

export interface NormalizedRuntimeWorkspaceContext extends RuntimeWorkspaceContext {
  workspace_id: string;
  display_name: string;
}

export interface RuntimeProjectSuggestionClue {
  kind: RuntimeProjectSuggestionClueKind;
  value: string;
}

export type RuntimeProjectSuggestionClueKind =
  | "workspace"
  | "path"
  | "directory"
  | "repository"
  | "session_title"
  | "runtime"
  | "recent_project"
  | "project_name";

export interface RuntimeSessionHostSignals {
  runtime_id: string;
  molis_work_session_id: string | null;
  native_runtime_session_id: string | null;
  surface_id: string | null;
  /** What the host's terminal works on (`MOLIS_WORK_FOCUS_ID`, the subject a plugin gave its terminal): a hint for the resume view. */
  focus_id: string | null;
  runtime_context: RuntimeWorkContext;
  project_suggestion_clues: RuntimeProjectSuggestionClue[];
}

export interface RuntimeContextBindingRecord {
  binding_id: string;
  runtime_id: string;
  stable_work_context_id: string;
  project_id: string;
  bound_by: string;
  created_at: string;
  updated_at: string;
}

export interface RuntimeContextBindingEventRecord {
  event_id: string;
  binding_id: string;
  runtime_id: string;
  stable_work_context_id: string;
  type: "context.bound" | "context.rebound" | "context.unbound";
  previous_project_id: string | null;
  project_id: string;
  actor_id: string;
  created_at: string;
}
