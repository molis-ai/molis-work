import assert from "node:assert/strict";
import test from "node:test";

import {
  projectWriterChanges,
  projectWriters,
  type WriterSlot,
  type WriterWorktree,
} from "@molis-ai/molis-work-plugin-coding";

/** 并行写入：各占一个工作树，回收哪些文件由用户逐个挑。 */

const worktree = (id: string): WriterWorktree => ({
  worktree_id: id, branch: `coding/${id}`, base_commit: "abc123", directory: `.worktrees/${id}`,
});

const ready = (id: string, task: string): WriterSlot =>
  ({ slot_id: id, task, assignment: "ready", worktree: worktree(id) });

const base = { worktrees_supported: true, frozen: false, max_slots: 3 };

test("每个写入者都拿到工作树才能开始", () => {
  const ok = projectWriters({ ...base, slots: [ready("w1", "改连接"), ready("w2", "改文案")] });
  assert.equal(ok.can_start, true);
  assert.equal(ok.blocked_reason, undefined);

  const waiting = projectWriters({
    ...base,
    slots: [ready("w1", "改连接"), { slot_id: "w2", task: "改文案", assignment: "creating" }],
  });
  assert.equal(waiting.can_start, false, "有人没地方干活就开始，等于悄悄丢掉他的任务");
  assert.match(waiting.blocked_reason ?? "", /等工作树/);
});

test("宿主拒绝分配工作树时，说出是哪一步被拒", () => {
  const view = projectWriters({
    ...base,
    slots: [{ slot_id: "w1", task: "改连接", assignment: "denied", message: "这个项目没授权第二个目录" }],
  });
  assert.equal(view.can_start, false);
  assert.equal(view.blocked_reason, "这个项目没授权第二个目录");
});

test("开跑之后集合冻结，不能再加人", () => {
  const view = projectWriters({ ...base, frozen: true, slots: [ready("w1", "改连接")] });
  assert.equal(view.can_add, false);
  assert.equal(view.can_start, false);
  assert.match(view.blocked_reason ?? "", /不再变动/);
});

test("到上限就不能再加", () => {
  const slots = ["w1", "w2", "w3"].map((id) => ready(id, id));
  assert.equal(projectWriters({ ...base, slots }).can_add, false);
  assert.equal(projectWriters({ ...base, slots: slots.slice(0, 2) }).can_add, true);
});

test("没有工作树能力时，已建的写入者仍然列出并说明，而不是看起来丢了", () => {
  const view = projectWriters({
    ...base, worktrees_supported: false, slots: [ready("w1", "改连接")],
  });
  assert.equal(view.available, false);
  assert.match(view.unavailable_reason ?? "", /Git 工作树/);
  assert.equal(view.slots.length, 1, "用户建过的东西不该凭空消失");
  assert.equal(view.slots[0]?.assignment, "unavailable");
});

const files = [
  { path: ["src", "connect.ts"], target: "modified" as const },
  { path: ["src", "messages.ts"], target: "added" as const },
];

test("写入者还在跑时不能整合——清单可能还会变", () => {
  const view = projectWriterChanges({
    worktree: worktree("w1"), files,
    selected_paths: ["src/connect.ts"], conflicting_paths: [], writer_finished: false,
  });
  assert.equal(view.complete, false);
  assert.equal(view.can_prepare, false);
  assert.match(view.blocked_reason ?? "", /还在跑/);
});

test("与主工作区冲突的文件不可选，并说明为什么", () => {
  const view = projectWriterChanges({
    worktree: worktree("w1"), files,
    selected_paths: ["src/connect.ts", "src/messages.ts"],
    conflicting_paths: ["src/connect.ts"],
    writer_finished: true,
  });
  const conflicted = view.files.find((file) => file.path.join("/") === "src/connect.ts");
  assert.equal(conflicted?.selectable, false);
  assert.equal(conflicted?.selected, false, "冲突的文件不能因为之前选过就还算选中");
  assert.match(conflicted?.reason ?? "", /先处理冲突/);
  // 另一个仍然可选
  assert.equal(view.files.find((file) => file.path.join("/") === "src/messages.ts")?.selected, true);
  assert.equal(view.can_prepare, true);
});

test("一个文件都没选就不能整合", () => {
  const view = projectWriterChanges({
    worktree: worktree("w1"), files,
    selected_paths: [], conflicting_paths: [], writer_finished: true,
  });
  assert.equal(view.can_prepare, false);
  assert.match(view.blocked_reason ?? "", /还没有选中/);
});

test("整合视图带上分支与基线提交，回收的是哪一份说得清", () => {
  const view = projectWriterChanges({
    worktree: worktree("w1"), files,
    selected_paths: ["src/messages.ts"], conflicting_paths: [], writer_finished: true,
  });
  assert.equal(view.branch, "coding/w1");
  assert.equal(view.base_commit, "abc123");
});
