import { actionEffect, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { isRecord } from "./json-value.js";

// The shape of a Manifest's `read_groups` (specs/proactive-assistant/schedule-task-reads.md §3.2): the switches a person sees when
// letting another plugin's background task read this plugin's data. A group may hold only what such a task can be given: the
// plugin's own actions, offered to agents, that only read (a query whose effect is `read`, the same test as the Home's aggregates).
// Which groups a task may read is the Host's to decide while it runs; `parsePluginManifest` is the one caller.

const GROUP_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const FIELDS = new Set(["group_id", "title", "description", "actions"]);

export function readGroupDeclarationProblems(groups: unknown, actions: readonly ActionDefinition[] | undefined): string[] {
  if (groups === undefined) return [];
  if (!Array.isArray(groups) || groups.length === 0) return ["read_groups 至少要声明一组，不分组就不要写这一项"];
  const declared = new Map<string, ActionDefinition[]>();
  // A malformed action is the action checks' to report (they run in the same pass); here it is simply not one a group can name.
  const entries: readonly unknown[] = Array.isArray(actions) ? actions : [];
  for (const action of entries) if (namedAction(action)) declared.set(action.capability_id, [...declared.get(action.capability_id) ?? [], action]);
  const problems: string[] = [], ids = new Set<string>(), grouped = new Set<string>();
  for (const [index, group] of groups.entries()) {
    if (!isRecord(group)) { problems.push("read_groups 的每一项都必须是对象"); continue; }
    const extra = Object.keys(group).filter(field => !FIELDS.has(field));
    if (extra.length > 0) problems.push(`read_groups 不认这些字段：${extra.join("、")}`);
    const valid = typeof group.group_id === "string" && GROUP_ID.test(group.group_id);
    // The later messages name the group; one without a usable id is named by its place in the list.
    const name = valid ? String(group.group_id) : `第 ${index + 1} 组`;
    if (!valid) problems.push("read_groups 的 group_id 只能用小写字母、数字和 -，以字母开头，至多 64 个字符");
    else if (ids.has(name)) problems.push(`read_groups 的 group_id 重复：${name}`);
    else ids.add(name);
    if (!words(group.title, 80)) problems.push(`读取分组 ${name} 要有标题（至多 80 个字符）`);
    if (!words(group.description, 200)) problems.push(`读取分组 ${name} 要有一句说明包含什么（至多 200 个字符）`);
    problems.push(...memberProblems(name, group.actions, declared, grouped));
  }
  return problems;
}

/** Each member is one of this Manifest's own actions that a task can be given, and in no other group. */
function memberProblems(group: string, members: unknown, declared: ReadonlyMap<string, readonly ActionDefinition[]>, grouped: Set<string>): string[] {
  if (!Array.isArray(members) || members.length === 0) return [`读取分组 ${group} 至少要列一个动作`];
  const problems: string[] = [], listed = new Set<string>();
  for (const member of members) {
    if (typeof member !== "string" || !declared.has(member)) { problems.push(`读取分组 ${group} 只能列本插件声明的动作：${String(member)}`); continue; }
    if (listed.has(member)) { problems.push(`读取分组 ${group} 重复列了动作 ${member}`); continue; }
    listed.add(member);
    if (grouped.has(member)) { problems.push(`动作 ${member} 只能在一个读取分组里`); continue; }
    grouped.add(member);
    for (const action of declared.get(member) ?? []) {
      const metadata = isRecord(action.action) ? action.action : undefined;
      if (!Array.isArray(metadata?.audiences) || !metadata.audiences.includes("agent")) problems.push(`读取分组 ${group} 的动作 ${member}@${action.version} 要对 agent 开放`);
      if (action.operation !== "query" || !metadata || actionEffect(metadata, member) !== "read") problems.push(`读取分组 ${group} 只能放只读的查询，${member}@${action.version} 不是`);
    }
  }
  return problems;
}

/** Enough of an action to be named by a group; whether the rest of it is well formed is for the action checks. */
function namedAction(value: unknown): value is ActionDefinition {
  return isRecord(value) && typeof value.capability_id === "string";
}

function words(value: unknown, max: number): boolean {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
