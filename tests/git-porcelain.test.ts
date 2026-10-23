import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, parsePorcelainStatus } from "@molis-ai/molis-work-plugin-sdk";

// The porcelain parse the Host's workspace Git service and the Git plugin share (packages/plugin-sdk/src/git-porcelain.ts), read through
// the SDK's public entry as a plugin gets it.

const NUL = String.fromCharCode(0);

function porcelain(...records: string[]): string {
  return records.join(NUL) + NUL;
}

function refusedWith(code: string) {
  return (error: unknown) => error instanceof ActionError && error.code === code && error.kind === "invalid";
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
  assert.deepEqual(ahead.head, { kind: "branch", name: "main", commit: "" });

  const behind = parsePorcelainStatus({ stdout: porcelain("## main...origin/main [behind 3]") });
  assert.deepEqual(behind.upstream, { name: "origin/main", ahead: 0, behind: 3 });

  const detached = parsePorcelainStatus({ stdout: porcelain("## HEAD (no branch)") });
  assert.equal(detached.head.kind, "detached");

  const unborn = parsePorcelainStatus({ stdout: porcelain("## No commits yet on main") });
  assert.deepEqual(unborn.head, { kind: "unborn", name: "main" });
});

test("越界或含控制字符的路径被拒，而不是照单全收", () => {
  assert.throws(() => parsePorcelainStatus({ stdout: porcelain("## main", "M  ../outside.ts") }), refusedWith("git.path_unsafe"));
  assert.throws(
    () => parsePorcelainStatus({ stdout: porcelain("## main", `M  a${String.fromCharCode(7)}b.ts`) }),
    refusedWith("git.path_unsafe"),
  );
});

test("重命名缺了原路径时报错，而不是安静地少一条", () => {
  assert.throws(() => parsePorcelainStatus({ stdout: "## main" + NUL + "R  new.ts" + NUL }), refusedWith("git.status_unreadable"));
});

test("只读到一半的状态照实标出来", () => {
  assert.equal(parsePorcelainStatus({ stdout: porcelain("## main"), truncated: true }).truncated, true);
  assert.equal(parsePorcelainStatus({ stdout: porcelain("## main") }).truncated, false);
});
