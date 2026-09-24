import assert from "node:assert/strict";
import test from "node:test";
import { codingNetChange } from "@molis-ai/molis-work-plugin-coding";
import type { CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

type Write = { path: string; before: string | null; after: string; decision?: string; execution?: string };
const change = (...writes: Write[]) => ({
  scope: "run-frozen", run_id: "r", applied: true, coverage: "text-reviews",
  files: writes.map((write, index) => ({ path: write.path, kind: write.before === null ? "added" : "modified", added_lines: 0, removed_lines: 0, diff: "",
    review: { review_id: `v${index}`, before_text: write.before, after_text: write.after, decision: write.decision ?? "approved", execution: write.execution ?? "applied" } })),
}) as unknown as CodingChangeSet;

test("同一文件连续写入且都已执行时，净变更是第一次写入前对最后一次写入后", () => {
  const net = codingNetChange(change(
    { path: "a.ts", before: null, after: "one\n" },
    { path: "b.ts", before: "x\n", after: "y\n" },
    { path: "a.ts", before: "one\n", after: "one\ntwo\n" },
  ), "a.ts");
  assert.deepEqual(net, { available: true, indices: [0, 2], before_text: null, after_text: "one\ntwo\n" });
});

test("写入未执行、结果不确定或中间被改过时，不拼出一个看似合理的净变更", () => {
  assert.equal(codingNetChange(change({ path: "a.ts", before: "a\n", after: "b\n" }), "a.ts").available, false, "只写一次没有净变更可言");
  const uncertain = codingNetChange(change({ path: "a.ts", before: "a\n", after: "b\n", execution: "unknown" }, { path: "a.ts", before: "b\n", after: "c\n" }), "a.ts");
  assert.equal(uncertain.available, false); assert.match(uncertain.available ? "" : uncertain.reason, /不确定/);
  const rejected = codingNetChange(change({ path: "a.ts", before: "a\n", after: "b\n" }, { path: "a.ts", before: "b\n", after: "c\n", decision: "rejected", execution: "not-applied" }), "a.ts");
  assert.equal(rejected.available, false);
  const edited = codingNetChange(change({ path: "a.ts", before: "a\n", after: "b\n" }, { path: "a.ts", before: "b2\n", after: "c\n" }), "a.ts");
  assert.equal(edited.available, false); assert.match(edited.available ? "" : edited.reason, /被改过/);
  assert.deepEqual(edited.indices, [0, 1], "不可用时仍说明涉及哪几次写入");
});
