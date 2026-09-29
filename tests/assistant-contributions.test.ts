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
