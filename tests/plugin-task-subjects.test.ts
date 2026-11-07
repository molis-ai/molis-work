// TGA-20 (batch 18 P3-0b): a Manifest's `task_subjects` (specs/proactive-assistant/task-grants-platform-area.md §5.1, D3 decided
// 2026-11-06). It says which of the plugin's own object kinds its task grant subjects are, so the page where a person reviews grants
// can show a task's title instead of "插件名 · 一个任务"; the title is read through this Manifest's own search source for that kind,
// as the person. TGA-20 is a Manifest contract check, not one of the design's security invariants. Every rule has a Manifest that
// passes and one that breaks only that rule, with what the author is told written out.
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, defineSearchEntriesAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

const source = defineSearchEntriesAction("notes.search.entries", 1, [{ kind: "notes_task", title: "任务", surface: "notes" }], "任务", []);
const problems = (subjects: unknown, actions: unknown[] = [source]) => manifestProblems(declarationManifest({ actions, task_subjects: subjects }));

test("TGA-20: task_subjects naming a kind the plugin's own search source lists, open to the person, parses; a Manifest without it is unchanged", () => {
  assert.equal(problems({ kind: "notes_task" }), "");
  assert.equal(manifestProblems(declarationManifest({ actions: [source] })), "");
  const parsed = parsePluginManifest(declarationManifest({ actions: [source], task_subjects: { kind: "notes_task" } }));
  assert.deepEqual(parsed.task_subjects, { kind: "notes_task" });
});

test("TGA-20: task_subjects is an object with kind alone", () => {
  assert.equal(problems({ kind: "notes_task", title_from: "notes.search.entries" }), "task_subjects 不认这些字段：title_from");
  assert.equal(problems({ kind: "notes_task", group_id: "a", actions: [] }), "task_subjects 不认这些字段：group_id、actions");
});

test("TGA-20: the kind is one this Manifest's own search source lists", () => {
  assert.equal(problems({ kind: "schedule_task" }), "task_subjects 的 kind schedule_task 要是本插件某个搜索来源列出的对象种类");
  // Naming the kind only as an action's subject is not enough: the title comes from a search source.
  const subjectOnly = { capability_id: "notes.task.get", version: 1, operation: "query", action: { title: "读任务", description: "读一个任务", kind: "query",
    scope: "project", permissions: [], subject_kinds: ["notes_task"], audiences: ["user"], input_schema: { type: "object" } } };
  assert.equal(problems({ kind: "notes_task" }, [subjectOnly]), "task_subjects 的 kind notes_task 要是本插件某个搜索来源列出的对象种类");
  assert.equal(problems({ kind: "notes_task" }, []), "task_subjects 的 kind notes_task 要是本插件某个搜索来源列出的对象种类");
});

test("TGA-20: the search source listing the kind is open to user, since the title is read as the person", () => {
  const closed = defineSearchEntriesAction("notes.search.entries", 1, [{ kind: "notes_task", title: "任务", surface: "notes" }], "任务", [], "project", ["agent"]);
  // A search source closed to `user` breaks the search source protocol as well (the index is built as the person), so the
  // action checks report it too; the task_subjects rule names the declaration that depends on it.
  assert.equal(problems({ kind: "notes_task" }, [closed]),
    "能力 notes.search.entries@1 没有兑现搜索来源协议 v1：需要规范输入输出、查询类型、对本机用户开放与对应对象种类的打开位置；task_subjects 的 kind notes_task 所在的搜索来源要对 user 开放（以本人身份取标题）");
  // One source open to the person is enough when another listing the same kind is not.
  const other = defineSearchEntriesAction("notes.search.archive", 1, [{ kind: "notes_task", title: "任务", surface: "notes" }], "任务", []);
  assert.ok(!problems({ kind: "notes_task" }, [closed, other]).includes("task_subjects"));
});

test("TGA-20: a malformed declaration or action is refused as a Manifest, never by a TypeError from the task subject checks", () => {
  for (const malformed of [null, "notes_task", ["notes_task"], 7]) assert.equal(problems(malformed), "task_subjects 必须是对象，只写 kind 一项");
  for (const kind of [undefined, "", " ", 7, null]) assert.equal(problems({ kind }), "task_subjects 的 kind 要写本插件的一种对象");
  assert.equal(problems({ kind: 7, extra: true }), "task_subjects 不认这些字段：extra；task_subjects 的 kind 要写本插件的一种对象");
  // Actions the action checks refuse (not an object, no metadata, a search source of the wrong shape) list no kind here.
  const malformedActions = [null, { capability_id: "notes.a", version: 1, operation: "query" },
    { capability_id: "notes.b", version: 1, operation: "query", action: { search_source: { kinds: [null, { kind: 7 }] } } },
    { capability_id: "notes.c", version: 1, operation: "query", action: { search_source: "notes_task", audiences: "user" } }];
  // The refusal is the Manifest's own (`plugin.declaration_invalid`), and it names the task_subjects problem among the action checks'.
  assert.throws(() => parsePluginManifest(declarationManifest({ actions: malformedActions, task_subjects: { kind: "notes_task" } })), (error: unknown) => {
    assert.ok(error instanceof ActionError, String(error));
    assert.equal(error.code, "plugin.declaration_invalid");
    assert.equal(error.kind, "invalid");
    assert.ok(error.message.includes("task_subjects 的 kind notes_task 要是本插件某个搜索来源列出的对象种类"), error.message);
    return true;
  });
  for (const malformed of [null, { kind: 7 }]) {
    assert.throws(() => parsePluginManifest(declarationManifest({ actions: [source], task_subjects: malformed })),
      (error: unknown) => error instanceof ActionError && error.code === "plugin.declaration_invalid");
  }
});
