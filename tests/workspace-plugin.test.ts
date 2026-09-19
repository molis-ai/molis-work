import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkspaceArtifactError,
  parseWorkspaceRef,
  parseWorkspaceSelected,
  projectWorkspace,
  workspaceManifest,
  workspaceScopeKey,
} from "@molis-ai/molis-work-plugin-workspace";

/** 工作目录引用要能走出插件边界，所以在边界上验，而不是信来的人。 */

test("目录句柄必须是不透明 token，路径进不来", () => {
  for (const handle of ["/Users/me/code", "../escape", "a/b", "c\\d"]) {
    assert.throws(
      () => parseWorkspaceRef({ workspace_id: handle, name: "项目", handle }),
      (error: unknown) => error instanceof WorkspaceArtifactError,
      `${handle} 不该被接受`,
    );
  }
});

test("一个目录只能有一个身份", () => {
  assert.throws(
    () => parseWorkspaceRef({ workspace_id: "ws-1", name: "项目", handle: "ws-2" }),
    /必须等于目录句柄/,
  );
  const ref = parseWorkspaceRef({ workspace_id: "ws-1", name: " 项目 ", handle: "ws-1" });
  assert.equal(ref.name, "项目");
  assert.equal(workspaceScopeKey(ref), "workspace.ref.v1:ws-1");
});

test("没绑目录和目录打不开是两回事，各有各的下一步", () => {
  const unbound = projectWorkspace({ current: null, resolvable: false, candidates: [] });
  assert.equal(unbound.phase, "unbound");
  assert.equal(unbound.publishable, false);
  assert.match(unbound.recovery ?? "", /选一个目录/);

  const broken = projectWorkspace({
    current: { workspace_id: "ws-1", name: "项目", handle: "ws-1" },
    resolvable: false,
    candidates: [],
  });
  assert.equal(broken.phase, "unavailable");
  assert.equal(broken.publishable, false);
  assert.match(broken.recovery ?? "", /重新选一次/);
  assert.notEqual(unbound.recovery, broken.recovery, "两种麻烦的解决办法不一样");
});

test("打不开的目录不会作为端口值发出去", () => {
  const ready = projectWorkspace({
    current: { workspace_id: "ws-1", name: "项目", handle: "ws-1" },
    resolvable: true,
    candidates: [{ workspace_id: "ws-1", name: "项目", resolvable: true }],
  });
  assert.equal(ready.publishable, true);
  assert.deepEqual(ready.candidates, [], "当前这个不该出现在“切到哪去”里");
});

test("切换列表里不列打不开的目录", () => {
  const view = projectWorkspace({
    current: null,
    resolvable: false,
    candidates: [
      { workspace_id: "ws-2", name: "还在", resolvable: true },
      { workspace_id: "ws-3", name: "没了", resolvable: false },
    ],
  });
  assert.deepEqual(view.candidates.map((candidate) => candidate.workspace_id), ["ws-2"]);
});

test("“切到自己”不是切换，会被拒", () => {
  assert.throws(
    () => parseWorkspaceSelected({ workspace_id: "ws-1", previous_workspace_id: "ws-1" }),
    /不能和 workspace_id 相同/,
  );
  assert.deepEqual(parseWorkspaceSelected({ workspace_id: "ws-1" }), { workspace_id: "ws-1" });
});

test("Manifest 只发不收：它是这张图的源头", () => {
  assert.deepEqual(workspaceManifest.ports?.inputs, []);
  assert.equal(workspaceManifest.ports?.outputs.length, 1);
  assert.equal(workspaceManifest.events?.subscribes.length, 0);
});
