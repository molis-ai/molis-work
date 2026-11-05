import type { ContractDescriptor } from "../platform/package.js";
import type { ActionDefinition } from "../platform/actions.js";

/**
 * What one background task of a plugin may read (specs/proactive-assistant/schedule-task-reads.md §3.2–§3.4). A task grant subject
 * is a client of the action catalog of its own: the Host composes it from the call's project and installation and the plugin's key,
 * so the same key in another installation or project is another subject. It has nothing open by default; it reads only the
 * actions the person allowed it, kept as action grants beside the MCP clients' and checked again on every call.
 *
 * The person turns read categories on and off; a category is one provider's read group (`read_groups` in its Manifest), or a whole
 * provider that declares none. Turning one on records the category's read-only actions as they are at that moment: what a provider
 * adds or changes later is not granted until the person allows it again, and `list` says so.
 */
export const servicesAgentTaskGrantsContract = {
  contractId: "io.molis.work.service.agent-task-grants.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "specs/proactive-assistant/schedule-task-reads.md",
} as const satisfies ContractDescriptor;

/** A plugin's key for one of its tasks. No `:`, so the Host's composed subject cannot be confused with another's. */
export const TASK_GRANT_SUBJECT_KEY_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$";

/** One read category: a provider's read group, or (`group_id` left out) a whole provider that declares no groups. */
export interface TaskGrantCategoryReference {
  provider_id: string;
  group_id?: string;
}

/** A category this project offers now, as the person's switches show it. */
export interface TaskGrantCategory extends TaskGrantCategoryReference {
  plugin_id?: string;
  /** The group's title, or the provider's for a whole provider. */
  title: string;
  /** What it contains: the group's own line, or the provider's description. */
  description: string;
}

/**
 * A category a subject was granted. `granted`: every recorded action still matches and nothing in the category is unconfirmed.
 * `needs_confirmation`: the provider added an action to it, or changed the version or permissions of one, since the person allowed it;
 * what changed is not readable until they allow the category again. `unavailable`: the provider is off or gone; the grant is kept
 * and reads again when it is back unchanged.
 */
export interface TaskGrantCategoryState extends TaskGrantCategoryReference {
  plugin_id?: string;
  title: string;
  description: string;
  status: "granted" | "needs_confirmation" | "unavailable";
}

export interface TaskGrantSubject {
  plugin_install_id: string;
  key: string;
  /** Opaque, derived from the subject's grant records; `set` takes it back. A subject without records has revision `""`. */
  revision: string;
  categories: TaskGrantCategoryState[];
}

/** Replaces the subject's categories with exactly these (an empty list removes them all); `actions.conflict` when `expected_revision` is stale. */
export interface TaskGrantSetRequest {
  plugin_install_id: string;
  key: string;
  categories: TaskGrantCategoryReference[];
  expected_revision: string;
}

/** A plugin may leave out `plugin_install_id` (it is always its own); naming another installation is refused. */
export interface TaskGrantClearRequest {
  plugin_install_id?: string;
  key: string;
}

export interface TaskGrantClearResult {
  cleared: boolean;
}

/** A plugin always lists its own installation's subjects; naming another is refused. The person may list one installation or all. */
export interface TaskGrantListRequest {
  plugin_install_id?: string;
}

export interface TaskGrantListResult {
  /** What this project offers now; only the person's call gets it, a plugin's gets `[]`. */
  categories: TaskGrantCategory[];
  /** Every subject with records in this project (for a plugin, in its own installation), in one answer. */
  subjects: TaskGrantSubject[];
}

const id = { type: "string", minLength: 1, maxLength: 256 } as const;
const words = { type: "string", maxLength: 2000 } as const;
const key = { type: "string", pattern: TASK_GRANT_SUBJECT_KEY_PATTERN } as const;
const categoryReference = { type: "object", required: ["provider_id"], additionalProperties: false, properties: { provider_id: id, group_id: id } } as const;
const category = { type: "object", required: ["provider_id", "title", "description"], additionalProperties: false, properties: {
  provider_id: id, group_id: id, plugin_id: id, title: words, description: words } } as const;
const categoryState = { type: "object", required: ["provider_id", "title", "description", "status"], additionalProperties: false, properties: {
  ...category.properties, status: { enum: ["granted", "needs_confirmation", "unavailable"] } } } as const;
const subject = { type: "object", required: ["plugin_install_id", "key", "revision", "categories"], additionalProperties: false, properties: {
  plugin_install_id: id, key, revision: { type: "string", maxLength: 256 }, categories: { type: "array", items: categoryState } } } as const;

/**
 * Registered once by the Host as a system provider. Only the person writes: `set` is offered to the `user` audience alone, from the
 * platform's own area on a task (never the plugin's page code). `clear` and `list` are also offered to plugins, for their own
 * installation only: clearing only takes away, so a plugin may do it when its task ends.
 */
export const agentTaskGrantActions = {
  set: {
    capability_id: "agent.task_grants.set", version: 1, operation: "command",
    action: { title: "设置任务能读的数据", description: "把一个后台任务能读的类别换成这些：按此刻目录里每一类的只读动作记下授权；空列表就是全部撤回。只有本人能设。", kind: "operation", scope: "project", effect: "write",
      audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", required: ["plugin_install_id", "key", "categories", "expected_revision"], additionalProperties: false, properties: {
        plugin_install_id: id, key, categories: { type: "array", maxItems: 200, items: categoryReference }, expected_revision: { type: "string", maxLength: 256 } } },
      output_schema: subject },
  } as ActionDefinition<TaskGrantSetRequest, TaskGrantSubject>,
  clear: {
    capability_id: "agent.task_grants.clear", version: 1, operation: "command",
    action: { title: "清除任务的读取授权", description: "撤回一个后台任务能读的全部类别。插件只能清自己安装下的任务。", kind: "operation", scope: "project", effect: "write",
      audiences: ["user", "plugin"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", required: ["key"], additionalProperties: false, properties: { plugin_install_id: id, key } },
      output_schema: { type: "object", required: ["cleared"], additionalProperties: false, properties: { cleared: { type: "boolean" } } } },
  } as ActionDefinition<TaskGrantClearRequest, TaskGrantClearResult>,
  list: {
    capability_id: "agent.task_grants.list", version: 1, operation: "query",
    action: { title: "列出任务的读取授权", description: "一次列出本项目里各后台任务能读的类别和状态（已授权、需要重新确认、暂时读不到）。插件只看到自己安装下的任务。", kind: "query", scope: "project",
      audiences: ["user", "plugin"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", additionalProperties: false, properties: { plugin_install_id: id } },
      output_schema: { type: "object", required: ["categories", "subjects"], additionalProperties: false, properties: {
        categories: { type: "array", items: category }, subjects: { type: "array", items: subject } } } },
  } as ActionDefinition<TaskGrantListRequest, TaskGrantListResult>,
} as const;
