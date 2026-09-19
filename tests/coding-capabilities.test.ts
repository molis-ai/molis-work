import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";

/**
 * C1 的验收：Coding 够得到工作区目录这份事实，而且够不到它不该够到的东西。
 * 见 specs/coding-plugin/implementation.md 的 C1。
 */

const WORKSPACE: ProjectWorkspaceRef = {
  workspace_id: "ws-1",
  canonical_path: "/Users/someone/code/goalboard",
  realpath_verified: true,
  display_name: "goalboard",
};

async function fixture(workspaceFor?: (projectId: string) => ProjectWorkspaceRef | null) {
  const directory = await mkdtemp(join(tmpdir(), "coding-capabilities-"));
  const host = new MolisWorkLocalHost(workspaceFor === undefined ? {} : { workspaceFor });
  const reference = molisWorkHostProjectReference({
    databasePath: join(directory, "project.db"),
    boardId: "board-a",
    projectId: "project-a",
  });
  return { directory, host, reference, client: host.client(reference) };
}

test("工作区能力只回答本运行时那个项目，答案里没有可写句柄", async () => {
  const asked: string[] = [];
  const item = await fixture((projectId) => {
    asked.push(projectId);
    return projectId === "project-a" ? WORKSPACE : null;
  });
  try {
    const workspace = await item.client.invoke(projectsCapabilities.readWorkspace, []);
    // 能力不收 project id 参数，所以插件没法问别的项目
    assert.deepEqual(asked, ["project-a"]);
    assert.equal(workspace?.canonical_path, WORKSPACE.canonical_path);
    assert.equal(workspace?.realpath_verified, true);
    // 只有已核过的路径，没有句柄、没有写入面
    assert.deepEqual(Object.keys(workspace ?? {}).sort(), [
      "canonical_path", "display_name", "realpath_verified", "workspace_id",
    ]);
  } finally {
    await item.host.closeProject(item.reference);
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("项目没有绑定工作区时如实回答 null，不编一个路径", async () => {
  const item = await fixture(() => null);
  try {
    assert.equal(await item.client.invoke(projectsCapabilities.readWorkspace, []), null);
  } finally {
    await item.host.closeProject(item.reference);
    await rm(item.directory, { recursive: true, force: true });
  }
});

test("没有接上目录来源时，这个能力根本没注册——插件看到的是不可用，不是「没有工作区」", async () => {
  const item = await fixture();
  try {
    await assert.rejects(
      () => item.client.invoke(projectsCapabilities.readWorkspace, []),
      (error: unknown) => {
        // 拒绝的理由必须是「这个能力不在」，而不是返回一个 null 冒充答案
        assert.notEqual(error, null);
        return true;
      },
    );
  } finally {
    await item.host.closeProject(item.reference);
    await rm(item.directory, { recursive: true, force: true });
  }
});
