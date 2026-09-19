import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_DRAFT,
  GitStatusError,
  conflictKey,
  draftIsEmpty,
  gitManifest,
  headLabel,
  mayHaveChangedFiles,
  parseGitFileChanged,
  parseGitResult,
  parsePorcelainStatus,
  parseStoredDrafts,
  projectAcceptance,
  projectGit,
  serializeStoredDrafts,
} from "@molis-ai/molis-work-plugin-git";

const NUL = String.fromCharCode(0);

function porcelain(...records: string[]): string {
  return records.join(NUL) + NUL;
}

test("重命名是两条记录，读错就会把后面所有条目都错开", () => {
  const status = parsePorcelainStatus({
    stdout: porcelain("## main...origin/main", "R  new/name.ts", "old/name.ts", "M  after.ts"),
  });
  assert.equal(status.staged.length, 2);
  assert.deepEqual(status.staged[0]?.path, ["new", "name.ts"]);
  assert.deepEqual(status.staged[0]?.orig_path, ["old", "name.ts"]);
  assert.deepEqual(status.staged[1]?.path, ["after.ts"], "原路径那条不能被当成下一个条目");
});

test("同时有暂存与未暂存改动的文件两边都出现", () => {
  const status = parsePorcelainStatus({ stdout: porcelain("## main", "MM both.ts") });
  assert.deepEqual(status.staged[0]?.path, ["both.ts"]);
  assert.deepEqual(status.unstaged[0]?.path, ["both.ts"]);
});

test("每种未合并状态都算冲突，而不是只认 UU", () => {
  for (const code of ["UU", "AA", "DD", "AU", "UD", "DU", "UA"]) {
    const status = parsePorcelainStatus({ stdout: porcelain("## main", `${code} c.ts`) });
    assert.equal(status.conflicted.length, 1, `${code} 应当算冲突`);
    assert.equal(status.staged.length, 0, `${code} 不该同时进暂存列表`);
  }
});

test("未跟踪与被忽略分得清，忽略的不进任何列表", () => {
  const status = parsePorcelainStatus({ stdout: porcelain("## main", "?? new.ts", "!! ignored.ts") });
  assert.deepEqual(status.untracked[0]?.path, ["new.ts"]);
  assert.equal(status.staged.length + status.unstaged.length + status.conflicted.length, 0);
});

test("分支行读出 HEAD 与领先/落后", () => {
  const ahead = parsePorcelainStatus({ stdout: porcelain("## main...origin/main [ahead 2, behind 1]") });
  assert.deepEqual(ahead.upstream, { name: "origin/main", ahead: 2, behind: 1 });
  assert.equal(headLabel(ahead.head), "main");

  const behind = parsePorcelainStatus({ stdout: porcelain("## main...origin/main [behind 3]") });
  assert.deepEqual(behind.upstream, { name: "origin/main", ahead: 0, behind: 3 });

  const detached = parsePorcelainStatus({ stdout: porcelain("## HEAD (no branch)") });
  assert.equal(detached.head.kind, "detached");

  const unborn = parsePorcelainStatus({ stdout: porcelain("## No commits yet on main") });
  assert.equal(unborn.head.kind, "unborn");
  assert.match(headLabel(unborn.head), /还没有提交/);
});

test("越界或含控制字符的路径被拒，而不是照单全收", () => {
  assert.throws(
    () => parsePorcelainStatus({ stdout: porcelain("## main", "M  ../outside.ts") }),
    (error: unknown) => error instanceof GitStatusError && error.code === "git.path_unsafe",
  );
  assert.throws(
    () => parsePorcelainStatus({ stdout: porcelain("## main", `M  a${String.fromCharCode(7)}b.ts`) }),
    GitStatusError,
  );
});

test("重命名缺了原路径时报错，而不是安静地少一条", () => {
  assert.throws(
    () => parsePorcelainStatus({ stdout: "## main" + NUL + "R  new.ts" + NUL }),
    (error: unknown) => error instanceof GitStatusError && error.code === "git.status_unreadable",
  );
});

test("有冲突时不能提交，干净时也不能", () => {
  const conflicted = projectGit({
    phase: "ready",
    status: parsePorcelainStatus({ stdout: porcelain("## main", "M  a.ts", "UU b.ts") }),
  });
  assert.equal(conflicted.conflicts.length, 1);
  assert.equal(conflicted.committable, false, "冲突没解决就提交，等于记下一次没人做过的合并");

  const clean = projectGit({ phase: "ready", status: parsePorcelainStatus({ stdout: porcelain("## main") }) });
  assert.equal(clean.committable, false);
  assert.match(clean.message, /干净/);

  const staged = projectGit({
    phase: "ready",
    status: parsePorcelainStatus({ stdout: porcelain("## main", "M  a.ts") }),
  });
  assert.equal(staged.committable, true);
});

test("每种起不来的情况各有各的下一步", () => {
  const phases = ["waiting", "not-a-repository", "unavailable", "error"] as const;
  const recoveries = phases.map((phase) => projectGit({ phase, status: null }).recovery);
  assert.equal(new Set(recoveries).size, phases.length, "四种麻烦不该给同一句建议");
  assert.equal(recoveries.every((text) => text !== undefined), true);
});

test("刷新后选中的行没了就不再报告它被选中", () => {
  const status = parsePorcelainStatus({ stdout: porcelain("## main", "M  a.ts") });
  assert.equal(projectGit({ phase: "ready", status, selected: ["a.ts"] }).selected?.label, "a.ts");
  assert.equal(projectGit({ phase: "ready", status, selected: ["gone.ts"] }).selected, undefined);
});

test("草稿坏了就当没有，不会把 Git 挡在外面", () => {
  assert.deepEqual(parseStoredDrafts("not json").drafts.size, 0);
  assert.deepEqual(parseStoredDrafts(null).conflicts.size, 0);
  const stored = {
    drafts: new Map([["ws-1", { ...EMPTY_DRAFT, commit_message: "还没提交的话" }]]),
    conflicts: new Map([[conflictKey("ws-1", ["a.ts"]), "手改的结果"]]),
  };
  const round = parseStoredDrafts(serializeStoredDrafts(stored));
  assert.equal(round.drafts.get("ws-1")?.commit_message, "还没提交的话");
  assert.equal(round.conflicts.get(conflictKey("ws-1", ["a.ts"])), "手改的结果");
  assert.equal(draftIsEmpty(EMPTY_DRAFT), true);
});

function runChange(paths: string[], applied = false) {
  return {
    scope: "run-frozen" as const,
    run_id: "run-1",
    applied,
    files: paths.map((path) => ({
      path, kind: "modified" as const, added_lines: 1, removed_lines: 0, diff: "@@ -1 +1,2 @@\n a\n+b\n",
    })),
  };
}

test("这轮改动之后文件又动过，就不给接受", () => {
  const view = projectAcceptance({
    change: runChange(["a.ts", "b.ts"]),
    dirty: [["b.ts"]],
    conflicted: [],
    same_workspace: true,
  });
  assert.equal(view.offerable, false);
  assert.equal(view.blocked?.kind, "stale");
  assert.match(view.message, /又改过/);
});

test("已经写进工作区的改动不会被再接受一次", () => {
  const view = projectAcceptance({
    change: runChange(["a.ts"], true),
    dirty: [],
    conflicted: [],
    same_workspace: true,
  });
  assert.equal(view.offerable, false);
  assert.equal(view.blocked?.kind, "already-applied");
});

test("冲突优先于“又改过”，因为它才是得先做的事", () => {
  const view = projectAcceptance({
    change: runChange(["a.ts"]),
    dirty: [["a.ts"]],
    conflicted: [["a.ts"]],
    same_workspace: true,
  });
  assert.equal(view.blocked?.kind, "conflicted");
});

test("别的工作目录的变更不会被接受进来", () => {
  const view = projectAcceptance({
    change: runChange(["a.ts"]),
    dirty: [],
    conflicted: [],
    same_workspace: false,
  });
  assert.equal(view.blocked?.kind, "other-workspace");
});

test("干净时才给接受，并说清要放几个文件", () => {
  const view = projectAcceptance({
    change: runChange(["a.ts", "b.ts"]),
    dirty: [],
    conflicted: [],
    same_workspace: true,
  });
  assert.equal(view.offerable, true);
  assert.match(view.message, /2 个文件/);
});

test("回执里只有 reconcile / conflict / succeeded 说明文件可能动了", () => {
  assert.equal(mayHaveChangedFiles("succeeded"), true);
  assert.equal(mayHaveChangedFiles("reconcile"), true, "说不清有没有落地，就得当成可能落地了");
  assert.equal(mayHaveChangedFiles("conflict"), true);
  assert.equal(mayHaveChangedFiles("denied"), false);
  assert.equal(mayHaveChangedFiles("expired"), false);
  assert.throws(
    () => parseGitResult({ workspace_id: "ws", operation_id: "op", outcome: "maybe", summary: "x" }),
    /outcome 无效/,
  );
});

test("空 paths 表示“动得太多列不过来”，仍然是合法事件", () => {
  const event = parseGitFileChanged({ workspace_id: "ws-1", operation_id: "op-1", paths: [] });
  assert.deepEqual(event.paths, []);
  assert.throws(
    () => parseGitFileChanged({ workspace_id: "ws-1", operation_id: "op-1", paths: [[".."]] }),
    /无效/,
  );
});

test("Run 变更集是可选输入：没有 Coding 的项目里 Git 照样起得来", () => {
  const runPort = gitManifest.ports?.inputs.find((port) => port.port === "run_changeset");
  assert.equal(runPort?.optional, true);
  const workspacePort = gitManifest.ports?.inputs.find((port) => port.port === "workspace");
  assert.equal(workspacePort?.optional, undefined, "工作目录是必需的");
});
