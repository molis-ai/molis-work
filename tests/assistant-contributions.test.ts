import assert from "node:assert/strict";
import test from "node:test";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE } from "@molis-ai/molis-work-contracts/platform/actions";
import { assistantContributions } from "../apps/local-host/src/assistant/assistant-contributions.js";

const view = (provider: string, capability: string, action: Partial<ActionView["action"]>, operation: "query" | "command" = "query"): ActionView => ({
  capability_id: capability, version: 1, operation, provider: { provider_id: provider, kind: "plugin", title: provider === "p.good" ? "好插件" : "缺贡献插件" },
  availability: { available: true },
  action: { title: capability, description: capability + " 的用途说明", kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "agent"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: {} }, ...action } as ActionView["action"] });

test("a plugin that follows the conventions has no gaps; one that does not is told exactly what is missing", () => {
  const good = [
    view("p.good", "notes.subject.read", { input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE, subject_kinds: ["note"] }),
    view("p.good", "notes.update", { subject_kinds: ["note"], input_schema: { type: "object", properties: { text: { type: "string", title: "内容" } } } }, "command"),
  ];
  const poor = [
    view("p.poor", "cards.list", { subject_kinds: ["card"] }),
    view("p.poor", "cards.bulk", { title: "批量处理", description: "批量处理", input_schema: { type: "object", properties: { ids: { type: "array" } } } }, "command"),
    view("p.poor", "cards.user-only", { audiences: ["user"] }),
  ];
  const [poorReport, goodReport] = assistantContributions([...good, ...poor]);
  assert.equal(goodReport!.title, "好插件");
  assert.deepEqual(goodReport!.readable_kinds, ["note"]);
  assert.equal(goodReport!.linked_changes, 1);
  assert.deepEqual(goodReport!.gaps, []);
  assert.equal(poorReport!.actions, 2, "only what agents can see counts");
  assert.deepEqual(poorReport!.gaps.map(gap => gap.area).sort(), ["capabilities", "capabilities", "context", "results"]);
  assert.match(poorReport!.gaps.find(gap => gap.area === "context")!.text, /card.*没有读取动作/);
  assert.match(poorReport!.gaps.find(gap => gap.area === "results")!.text, /批量处理/);
});

test("a change counts as linkable only when its one result kind can be read back, by its own provider or another", () => {
  const reader = (provider: string, kind: string) => view(provider, `${kind}.subject.read`, { input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_CONTEXT_TYPE, subject_kinds: [kind] });
  const rows = [
    reader("p.good", "item"),
    view("p.good", "items.create", { subject_kinds: ["item"], result_subject: { id: "item.id", revision: "item.updated_at" } }, "command"),
    // Declared on a kind nobody reads (a whole workspace): the result could only sit in the work as an identifier.
    view("p.good", "workspace.tidy", { title: "整理工作区", subject_kinds: ["workspace"] }, "command"),
    view("p.good", "items.move_many", { title: "批量移动", subject_kinds: ["workspace"], result_subject: { id: "workspace.id" } }, "command"),
    // result_subject names the object, but with two kinds the result's kind is unknown.
    view("p.good", "items.link", { title: "关联两种对象", subject_kinds: ["item", "note"], result_subject: { id: "item.id" } }, "command"),
    // Another provider reads the kind this one changes.
    view("p.poor", "goal.attach", { subject_kinds: ["goal"] }, "command"),
    reader("p.reader", "goal"),
  ];
  const reports = assistantContributions(rows);
  const good = reports.find(row => row.provider_id === "p.good")!, poor = reports.find(row => row.provider_id === "p.poor")!;
  assert.equal(good.changes, 4);
  assert.equal(good.linked_changes, 1);
  const results = good.gaps.filter(gap => gap.area === "results").map(gap => gap.text);
  assert.equal(results.length, 2);
  assert.match(results.find(text => text.includes("workspace"))!, /^2 个修改动作的结果对象（workspace）没有读取动作.*整理工作区、批量移动/);
  assert.match(results.find(text => !text.includes("workspace"))!, /^1 个修改动作没有说明结果是哪个对象.*关联两种对象/);
  assert.equal(poor.linked_changes, 1, "a kind read by another provider still links");
  assert.deepEqual(poor.gaps.filter(gap => gap.area === "results" || gap.area === "context"), [], "nor is that kind reported as unreadable");
});
