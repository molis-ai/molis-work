import type { ProjectSelection as MolisWorkProjectSelection } from "./projects.js";
import type { RuntimeWorkContext, NormalizedRuntimeWorkContext, RuntimeProjectSuggestionClue } from "./private-work-context.js";

export type MolisWorkProjectBindingScope = "session" | "workspace_default";

export interface MolisWorkProjectSuggestion extends MolisWorkProjectSelection {
  /** Generic, user-safe explanation; never includes the host clue value. */
  reasons: string[];
}

export interface MolisWorkProjectConnection {
  project_id: string;
  board_id: string;
  database_path: string;
}

export interface MolisWorkRuntimeContextResolution {
  status: "bound" | "suggested" | "unbound";
  reason: "missing_stable_context" | "unknown_context" | null;
  next_action:
    | "continue"
    | "use_explicit_existing_selection_or_ask_user_to_confirm_suggestion"
    | "use_explicit_existing_selection_or_ask_user_to_select_or_create";
  context: NormalizedRuntimeWorkContext;
  project: MolisWorkProjectSelection | null;
  connection: MolisWorkProjectConnection | null;
  suggested_projects: MolisWorkProjectSuggestion[];
  available_projects: MolisWorkProjectSelection[];
}

export interface BindRuntimeWorkContextInput {
  context: RuntimeWorkContext;
  project_id: string;
  actor_id: string;
  /** The user selected this project in the current Runtime conversation. */
  user_confirmed: boolean;
  /** Required only when a previously bound entry switches to another project. */
  rebind_confirmed?: boolean;
  /** Omit to record a workspace candidate; `session` only affects the current native Session. */
  binding_scope?: MolisWorkProjectBindingScope;
}

export interface UnbindRuntimeWorkContextInput {
  context: RuntimeWorkContext;
  actor_id: string;
  /** The user explicitly asked to disconnect this current Runtime entry. */
  user_confirmed: boolean;
  /** Session override by default; workspace removes one long-lived membership. */
  binding_scope?: "session" | "workspace";
  project_id?: string;
}

export interface MolisWorkRuntimeContextUnbindResult {
  resolution: MolisWorkRuntimeContextResolution;
  unbound_project: MolisWorkProjectSelection | null;
  changed: boolean;
}

export interface RejectRuntimeContextSuggestionInput {
  context: RuntimeWorkContext;
  project_id: string;
  actor_id: string;
  /** The user explicitly rejected this candidate in the current conversation. */
  user_confirmed: boolean;
  /** Host-only ranking hints. The model never supplies them through MCP. */
  suggestion_clues: readonly RuntimeProjectSuggestionClue[];
}

export interface MolisWorkRuntimeContextSuggestionRejectionResult {
  resolution: MolisWorkRuntimeContextResolution;
  rejected_project: MolisWorkProjectSelection;
  changed: boolean;
}

export interface CreateAndBindRuntimeContextInput {
  context: RuntimeWorkContext;
  display_name: string;
  actor_id: string;
  user_confirmed: boolean;
  rebind_confirmed?: boolean;
  binding_scope?: MolisWorkProjectBindingScope;
  idempotency_key: string;
}
