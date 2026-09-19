import assert from "node:assert/strict";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  MolisWorkLocalHost,
  composeAgentHost,
  molisWorkHostProjectReference,
} from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";

/** 产品装配真的构造了 Agent Host，插件经 Capability 够得到它。 */

const CODING = "io.molis.work.coding";

async function fixture(workspace: ProjectWorkspaceRef | null) {
  const directory = await mkdtemp(join(tmpdir(), "agent-composition-"));
  const localHost = new MolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({
    databasePath: join(directory, "project.db"),
    boardId: "board-a",
    projectId: "project-a",
  });
  const composition = composeAgentHost({
    localHost,
    workspaceFor: () => workspace,
    cliRuntimes: [{ runtime_id: "claude-code", display_name: "Claude Code", command: "claude" }],
  });
  return { directory, localHost, reference, composition, client: localHost.client(reference) };
}

async function close(item: Awaited<ReturnType<typeof fixture>>) {
  item.composition.dispose();
  await item.localHost.closeProject(item.reference);
  await item.localHost.close();
  await rm(item.directory, { recursive: true, force: true });
}

test("装配之后，运行时列表经 Capability 就能拿到", async () => {
  const item = await fixture(null);
  try {
    const runtimes = await item.client.invoke(agentHostCapabilities.listRuntimes, []);
    assert.deepEqual(runtimes.map((entry) => entry.runtime_id), ["claude-code"]);
    // CLI 只读：写入与命令如实报不支持
    assert.equal(runtimes[0]?.capabilities["text-edit"], "unsupported");
    assert.equal(runtimes[0]?.capabilities.command, "unsupported");
  } finally {
    await close(item);
  }
});

test("Coding 的角色从它自己的 Manifest 解析；只读的可用，会写的不可用", async () => {
  const item = await fixture(null);
  try {
    const roles = await item.client.invoke(agentHostCapabilities.availableRoles,
      ["claude-code", CODING]);
    const reader = roles.find((role) => role.role_id === "reader");
    const writer = roles.find((role) => role.role_id === "writer");
    assert.equal(reader?.available, true);
    assert.equal(writer?.available, false, "CLI 没接宿主审批，会写的角色就该不可用");
    assert.match(writer?.reason ?? "", /text-edit/);
  } finally {
    await close(item);
  }
});

test("没有声明 Agent 的插件，一个角色都拿不到", async () => {
  const item = await fixture(null);
  try {
    assert.deepEqual(
      await item.client.invoke(agentHostCapabilities.availableRoles, ["claude-code", "io.molis.work.feed"]),
      [], "没声明就是没有，不是给个默认角色");
  } finally {
    await close(item);
  }
});

test("项目没绑定工作区时，起跑被目录那道闸拦住", async () => {
  const item = await fixture(null);
  try {
    await assert.rejects(
      () => item.client.invoke(agentHostCapabilities.startRun, ["claude-code", {
        plugin_id: CODING,
        session: { session_id: "s", runtime_id: "claude-code" },
        task: "看看代码",
        role_id: "reader",
        directory: { canonical_path: "/tmp/anywhere", realpath_verified: true },
      }]),
      (error: unknown) => (error as { code?: string }).code === "agent.directory_unauthorized",
    );
  } finally {
    await close(item);
  }
});

test("插件不能拿一个宿主没授权的目录起跑", async () => {
  const real = await realpath(await mkdtemp(join(tmpdir(), "ws-")));
  const item = await fixture({
    workspace_id: "w", canonical_path: real, realpath_verified: true, display_name: "ws",
  });
  try {
    await assert.rejects(
      () => item.client.invoke(agentHostCapabilities.startRun, ["claude-code", {
        plugin_id: CODING,
        session: { session_id: "s", runtime_id: "claude-code" },
        task: "看看代码",
        role_id: "reader",
        directory: { canonical_path: "/somewhere/else", realpath_verified: true },
      }]),
      (error: unknown) => (error as { code?: string }).code === "agent.directory_unauthorized",
      "授权的是这个项目绑定的目录，不是插件报上来的那个",
    );
  } finally {
    await close(item);
    await rm(real, { recursive: true, force: true });
  }
});
