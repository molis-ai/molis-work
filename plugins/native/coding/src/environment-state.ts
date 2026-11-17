/** One current inspection, shared by the route and its UI; unread facts are never zero-valued facts. */
interface EnvironmentIdentity {
  readonly workspace_id: string;
  readonly canonical_path?: string;
  readonly checked_at: string;
}

export interface CodingEnvironmentFacts extends EnvironmentIdentity {
  readonly status: "ready" | "attention";
  readonly branch: string | null;
  readonly head_commit: string | null;
  readonly dirty_count: number;
  readonly git_conflicted_count: number;
  readonly git_merging: boolean;
  readonly is_git_repo: boolean;
  readonly deps_manager: string | null;
  readonly deps_installed: boolean;
  readonly script_names: readonly string[];
  readonly ports: readonly number[];
  readonly package_json_invalid?: boolean;
  readonly env_template: string | null;
  readonly env_keys: readonly string[];
  readonly has_local_env: boolean;
  readonly worktrees: { readonly active: number; readonly problem_count: number; readonly cleanup_count: number };
}

export type CodingEnvironmentReadiness = CodingEnvironmentFacts | (EnvironmentIdentity & { readonly status: "unavailable" });
