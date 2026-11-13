import type { ExactActionReference } from "../platform/actions.js";

export type AgentDelegationMode = "read-only" | "confirm" | "automatic";

/** Resolved by the work/installation owner, never copied from an action's business input. */
export interface AgentDelegationExecutor {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly installation_generation: string;
  readonly role_id: string;
}

/** A stable work identity. Its owner verifies the original Session on every Run; a work may precede its first Session. */
export type AgentDelegationSubject = {
  readonly actor_id: string;
  readonly project_id: string | null;
  readonly executor: AgentDelegationExecutor;
} & (
  | { readonly kind: "work"; readonly work: { readonly owner_id: string; readonly id: string } }
  | { readonly kind: "ongoing" }
);

export interface AgentDelegationTargetOwner {
  readonly provider_id: string;
  readonly installation_generation: string;
  readonly kind: string;
}

export interface AgentDelegationOperationScope {
  readonly key: string;
  /** All targets in one row are required together. Several rows never combine their columns. */
  readonly targets: Readonly<Record<string, {
    /** null is only the declaration's explicit empty-string constant, not an unknown owner. */
    readonly owner: AgentDelegationTargetOwner | null;
    readonly ids: readonly string[];
  }>>;
}

export interface AgentActionDelegationScope {
  readonly kind: "action-objects";
  readonly action: ExactActionReference;
  readonly declaration_digest: string;
  readonly provider_installation_generation: string;
  readonly operations: readonly AgentDelegationOperationScope[];
}

/** The original owner supplies every identity and canonical JSON field; display names cannot form an identity. */
export type AgentExactDelegationScope = {
  readonly input_json: string;
} & (
  | { readonly kind: "action-exact"; readonly action: ExactActionReference; readonly declaration_digest: string; readonly provider_installation_generation: string }
  | { readonly kind: "mcp-exact"; readonly source_id: string; readonly connection_identity: string; readonly tool: string; readonly tool_digest: string }
  | { readonly kind: "command-exact"; readonly workspace_id: string; readonly workspace_path: string }
);

export type AgentDelegationScope = AgentActionDelegationScope | AgentExactDelegationScope;

/** A single current choice per subject; retained predecessors explain history and never add permissions. */
export interface AgentDelegationSelection {
  readonly id: string;
  readonly revision: number;
  readonly mode: AgentDelegationMode;
  readonly scopes: readonly AgentDelegationScope[];
  readonly expires_at: string | null;
  readonly granted_by: string;
  readonly granted_at: string;
  readonly revoked_at: string | null;
  readonly supersedes: string | null;
}

/** Owner snapshot. Storage revision is not a work epoch or a delegation revision. Detail reads may expose scopes. */
export interface AgentDelegationState {
  readonly subject: AgentDelegationSubject;
  readonly storage_version: number;
  readonly epoch: string;
  readonly lifecycle: "open" | "ending" | "ended";
  readonly ended_at: string | null;
  readonly ended_reason: string | null;
  readonly selection_id: string | null;
  readonly selections: readonly AgentDelegationSelection[];
}
