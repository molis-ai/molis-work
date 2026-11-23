import assert from "node:assert/strict";
import test from "node:test";
import { codingNetChange } from "@molis-ai/molis-work-plugin-coding";
import type { CodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

type Write = { path: string; before: string | null; after: string; kind?: "added" | "modified" | "deleted"; decision?: string; execution?: string };
const change = (...writes: Write[]) => ({
  scope: "run-frozen", run_id: "r", applied: true, coverage: "text-reviews",
  files: writes.map((write, index) => ({ path: write.path, kind: write.kind ?? (write.before === null ? "added" : "modified"), added_lines: 0, removed_lines: 0, diff: "",
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

test("DEL-06: 含删除的多步变更区分文件已删除与空文件，且同轮新建后删除不拼矛盾净变更", () => {
  const modThenDel = codingNetChange(change(
    { path: "a.ts", before: "v0\n", after: "v1\n", kind: "modified" },
    { path: "a.ts", before: "v1\n", after: "", kind: "deleted" },
  ), "a.ts");
  assert.deepEqual(modThenDel, { available: true, indices: [0, 1], before_text: "v0\n", after_text: "" });

  const delThenAdd = codingNetChange(change(
    { path: "a.ts", before: "v0\n", after: "", kind: "deleted" },
    { path: "a.ts", before: null, after: "v2\n", kind: "added" },
  ), "a.ts");
  assert.deepEqual(delThenAdd, { available: true, indices: [0, 1], before_text: "v0\n", after_text: "v2\n" });

  // A deleted file is absent (null), not an existing empty file ("").
  const delThenModEmpty = codingNetChange(change(
    { path: "a.ts", before: "v0\n", after: "", kind: "deleted" },
    { path: "a.ts", before: "", after: "v2\n", kind: "modified" },
  ), "a.ts");
  assert.equal(delThenModEmpty.available, false);
  assert.match(delThenModEmpty.available ? "" : delThenModEmpty.reason, /被改过/);

  // Created and removed within the same round leaves no file change to merge without contradicting created/removed.
  const addThenDel = codingNetChange(change(
    { path: "a.ts", before: null, after: "temp\n", kind: "added" },
    { path: "a.ts", before: "temp\n", after: "", kind: "deleted" },
  ), "a.ts");
  assert.equal(addThenDel.available, false);
  assert.match(addThenDel.available ? "" : addThenDel.reason, /新建后又被删除/);
});
