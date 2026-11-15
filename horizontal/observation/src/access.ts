import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ObservationUse } from "@molis-ai/molis-work-contracts/services/observation";
import { observationErrors } from "./errors.js";
import { usesViewOf, type StoredObservationSettings } from "./management-state.js";
import type { ObservationEnvironment } from "./records.js";

/** Assert the caller is the local person themselves (never delegated, never a runtime audience). */
export function assertPersonCaller(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.delegated_by) {
    throw observationErrors.forbidden("只有本人能管理工作记录设置与清理");
  }
}

/**
 * Resolve and check `use` against the person's switches (OCL-11, contract-design §16.3.2).
 * Non-`user` audiences default to `"assistant"` and may never claim `"lookback"`; a disabled use is immediately refused.
 */
export function authorizeObservationUse(caller: ActionCallContext, requested: ObservationUse | undefined, stored: StoredObservationSettings): ObservationUse {
  const isPerson = caller.audience === "user" && caller.actor_id === LOCAL_PERSON_ACTOR_ID && !caller.delegated_by;
  const effective: ObservationUse = requested ?? (isPerson ? "lookback" : "assistant");
  if (!isPerson && effective === "lookback") {
    throw observationErrors.forbidden("只有本人能以本机回看用途读取工作记录");
  }
  const uses = usesViewOf(stored);
  if (!uses[effective]) {
    throw observationErrors.use_disabled(`工作记录用途「${effective}」当前未开启`);
  }
  return effective;
}

export type AuthorizedProjectScope =
  | { readonly kind: "home_only" }
  | { readonly kind: "single"; readonly project_id: string }
  | { readonly kind: "projects_and_home"; readonly project_ids: readonly string[] }
  | { readonly kind: "unrestricted_all" };

export async function resolveLiveReadableProjects(env: ObservationEnvironment): Promise<ReadonlySet<string> | undefined> {
  if (!env.readableProjects) return undefined;
  const ids = await env.readableProjects();
  return ids ? new Set(ids) : undefined;
}

/**
 * Enforce S-74 cross-project boundaries on `records.query@1` and `coverage.get@1` (contract-design §16.3.1, §16.3.6):
 * - Non-person callers never get `all_projects`; in a project they read only `caller.project_id`; in Home context (`project_id === null`)
 *   they cannot ask for any project and see Home-only (`project_id IS NULL`) rows at most.
 * - The local person may read a single live project, Home-only (`project_id: null`), or across live projects (`all_projects: true`).
 */
export async function authorizeObservationScope(
  env: ObservationEnvironment,
  caller: ActionCallContext,
  input: { readonly project_id?: string | null; readonly all_projects?: boolean },
): Promise<AuthorizedProjectScope> {
  const isPerson = caller.audience === "user" && caller.actor_id === LOCAL_PERSON_ACTOR_ID && !caller.delegated_by;
  const readable = await resolveLiveReadableProjects(env);

  if (!isPerson) {
    if (input.all_projects === true) {
      throw observationErrors.forbidden("只有本人能跨项目读取工作记录");
    }
    if (caller.project_id === null) {
      throw observationErrors.forbidden("非项目上下文的调用不能读取工作记录");
    }
    if (input.project_id !== undefined && input.project_id !== caller.project_id) {
      throw observationErrors.forbidden("不能读取当前项目以外的工作记录");
    }
    if (readable && !readable.has(caller.project_id)) {
      throw observationErrors.forbidden("当前项目正在关闭或已不可读");
    }
    return { kind: "single", project_id: caller.project_id };
  }

  // Local person:
  if (input.project_id === null) {
    return { kind: "home_only" };
  }
  if (typeof input.project_id === "string") {
    if (readable && !readable.has(input.project_id)) {
      throw observationErrors.forbidden("所选项目不存在、已删除或正在关闭");
    }
    return { kind: "single", project_id: input.project_id };
  }
  if (input.all_projects === true || caller.project_id === null) {
    return readable ? { kind: "projects_and_home", project_ids: [...readable] } : { kind: "unrestricted_all" };
  }
  if (readable && !readable.has(caller.project_id)) {
    throw observationErrors.forbidden("当前项目正在关闭或已不可读");
  }
  return { kind: "single", project_id: caller.project_id };
}

/**
 * Enforce S-74 on `observation.evidence.get@1` after looking up the target record's `project_id` (reviewer P2 #1 & #2).
 */
export async function authorizeRecordProject(
  env: ObservationEnvironment,
  caller: ActionCallContext,
  recordProjectId: string | null,
): Promise<void> {
  const isPerson = caller.audience === "user" && caller.actor_id === LOCAL_PERSON_ACTOR_ID && !caller.delegated_by;
  const readable = await resolveLiveReadableProjects(env);
  if (!isPerson) {
    if (caller.project_id === null || recordProjectId === null || recordProjectId !== caller.project_id) {
      throw observationErrors.forbidden("不能读取当前项目以外的工作记录证据");
    }
    if (readable && !readable.has(caller.project_id)) {
      throw observationErrors.forbidden("当前项目正在关闭或已不可读");
    }
    return;
  }
  if (recordProjectId !== null && readable && !readable.has(recordProjectId)) {
    throw observationErrors.forbidden("该记录所属项目已删除或正在关闭");
  }
}

/** Build SQL predicate over `records.project_id` (nullable) for an authorized scope. */
export function recordsProjectFilter(scope: AuthorizedProjectScope): { readonly sql: string; readonly params: readonly (string | number)[] } {
  switch (scope.kind) {
    case "home_only":
      return { sql: "project_id IS NULL", params: [] };
    case "single":
      return { sql: "project_id = ?", params: [scope.project_id] };
    case "unrestricted_all":
      return { sql: "", params: [] };
    case "projects_and_home":
      if (scope.project_ids.length === 0) return { sql: "project_id IS NULL", params: [] };
      return {
        sql: `(project_id IS NULL OR project_id IN (${scope.project_ids.map(() => "?").join(", ")}))`,
        params: scope.project_ids,
      };
  }
}

/** Build SQL predicate over `coverage.project_id` / `coverage_gaps.project_id` (where Home-level is stored as `""`). */
export function coverageProjectFilter(scope: AuthorizedProjectScope): { readonly sql: string; readonly params: readonly (string | number)[] } {
  switch (scope.kind) {
    case "home_only":
      return { sql: "project_id = ''", params: [] };
    case "single":
      return { sql: "(project_id = ? OR project_id = '')", params: [scope.project_id] };
    case "unrestricted_all":
      return { sql: "", params: [] };
    case "projects_and_home":
      if (scope.project_ids.length === 0) return { sql: "project_id = ''", params: [] };
      return {
        sql: `(project_id = '' OR project_id IN (${scope.project_ids.map(() => "?").join(", ")}))`,
        params: scope.project_ids,
      };
  }
}
