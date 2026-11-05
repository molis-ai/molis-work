// PWA-148 (batch 18 P0): a Manifest's `read_groups` (specs/proactive-assistant/schedule-task-reads.md §3.2, decided 2026-11-05). A group is
// one switch a person turns on to let another plugin's background task read this plugin's data, so it may hold only what such a task
// can be given: the plugin's own actions, offered to agents, read-only (a query whose effect is `read`), each in one group. Every rule
// has a Manifest that passes and one that breaks only that rule, with what the author is told written out.
import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

type Part = Record<string, unknown>;

function action(id: string, operation: "query" | "command", over: Part = {}, version = 1): Part {
  return {
    capability_id: id, version, operation,
    action: { title: id, description: id, kind: operation === "query" ? "query" : "operation", scope: "project", permissions: [], subject_kinds: [],
      audiences: ["user", "agent"], input_schema: { type: "object" }, ...over },
  };
}

const calendar = action("notes.calendar.list", "query");
const search = action("notes.search", "query");
const group = (over: Part = {}): Part => ({ group_id: "calendar", title: "日历", description: "日历事项与进展", actions: ["notes.calendar.list"], ...over });
const problems = (groups: unknown, actions: unknown[] = [calendar, search]) => manifestProblems(declarationManifest({ actions, read_groups: groups }));

test("read groups of the plugin's own read-only agent queries parse, and a Manifest without groups is unchanged", () => {
  assert.equal(problems([group(), group({ group_id: "notes", title: "笔记", description: "笔记全文", actions: ["notes.search"] })]), "");
  assert.equal(manifestProblems(declarationManifest({ actions: [calendar] })), "");
  const parsed = parsePluginManifest(declarationManifest({ actions: [calendar], read_groups: [group()] }));
  assert.deepEqual(parsed.read_groups, [group()]);
});

test("read_groups is a non-empty list of objects with only the four fields", () => {
  assert.equal(problems([]), "read_groups 至少要声明一组，不分组就不要写这一项");
  assert.equal(problems({ calendar: group() }), "read_groups 至少要声明一组，不分组就不要写这一项");
  assert.equal(problems(["calendar"]), "read_groups 的每一项都必须是对象");
  assert.equal(problems([group({ default_on: true })]), "read_groups 不认这些字段：default_on");
});

test("a group has a stable id of its own, a title and a line saying what it contains", () => {
  assert.equal(problems([group({ group_id: "Calendar" })]), "read_groups 的 group_id 只能用小写字母、数字和 -，以字母开头，至多 64 个字符");
  assert.equal(problems([group({ group_id: "1st" })]), "read_groups 的 group_id 只能用小写字母、数字和 -，以字母开头，至多 64 个字符");
  // A group without a usable id is named by its place in the list, so its other problems still say which one.
  assert.equal(problems([group(), group({ group_id: 7, title: "", actions: ["notes.search"] })]),
    "read_groups 的 group_id 只能用小写字母、数字和 -，以字母开头，至多 64 个字符；读取分组 第 2 组 要有标题（至多 80 个字符）");
  assert.equal(problems([group(), group({ actions: ["notes.search"] })]), "read_groups 的 group_id 重复：calendar");
  assert.equal(problems([group({ title: " " })]), "读取分组 calendar 要有标题（至多 80 个字符）");
  assert.equal(problems([group({ description: "" })]), "读取分组 calendar 要有一句说明包含什么（至多 200 个字符）");
  assert.equal(problems([group({ description: "长".repeat(201) })]), "读取分组 calendar 要有一句说明包含什么（至多 200 个字符）");
});

test("a group lists at least one of the plugin's own declared actions, and an action is in one group only", () => {
  assert.equal(problems([group({ actions: [] })]), "读取分组 calendar 至少要列一个动作");
  assert.equal(problems([group({ actions: ["todo.items.list"] })]), "读取分组 calendar 只能列本插件声明的动作：todo.items.list");
  assert.equal(problems([group(), group({ group_id: "notes", actions: ["notes.calendar.list"] })]), "动作 notes.calendar.list 只能在一个读取分组里");
  assert.equal(problems([group({ actions: ["notes.calendar.list", "notes.calendar.list"] })]), "读取分组 calendar 重复列了动作 notes.calendar.list");
});

test("only a read-only query offered to agents may be in a group, judged on every declared version", () => {
  assert.equal(problems([group()], [action("notes.calendar.list", "query", { audiences: ["user"] })]),
    "读取分组 calendar 的动作 notes.calendar.list@1 要对 agent 开放");
  assert.equal(problems([group({ actions: ["notes.add"] })], [action("notes.add", "command")]),
    "读取分组 calendar 只能放只读的查询，notes.add@1 不是");
  // A query that declares a write effect (the Home's aggregate test, S-49) is not read-only either.
  assert.equal(problems([group()], [action("notes.calendar.list", "query", { effect: "write" })]),
    "读取分组 calendar 只能放只读的查询，notes.calendar.list@1 不是");
  assert.equal(problems([group()], [calendar, action("notes.calendar.list", "query", { audiences: ["user"] }, 2)]),
    "读取分组 calendar 的动作 notes.calendar.list@2 要对 agent 开放");
});


test("a malformed Manifest is refused as a Manifest, never by a TypeError from the read group checks", () => {
  // An action that is not an object, and one with no metadata: the action checks report them; a group naming them is refused too.
  const told = problems([group({ actions: ["notes.calendar.list", "notes.search"] })], [null, { capability_id: "notes.calendar.list", version: 1, operation: "query" }, search]);
  assert.ok(told.includes("读取分组 calendar 的动作 notes.calendar.list@1 要对 agent 开放"), told);
  assert.ok(told.includes("读取分组 calendar 只能放只读的查询，notes.calendar.list@1 不是"), told);
  assert.ok(!told.includes("notes.search"), told);
});
