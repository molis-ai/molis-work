import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_PROMPT_LAYERS,
  inspectAgentDeclaration,
  orderPromptsByLayer,
  promptLayerOf,
  type AgentManifest,
  type AgentPromptText,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { AgentHost, emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { codingAgentManifest, codingPrompts, projectCodingIdentity, renderCodingIdentity } from "@molis-ai/molis-work-plugin-coding";
import { scheduleAgentManifest } from "@molis-ai/molis-work-plugin-schedule";

/**
 * 一轮执行的指令来自四个不同的主人：产品、角色、项目、用户。
 *
 * 以前四段塞在一个拼接字符串里，顺序是唯一的区分——于是哪一段都换不掉、看不见、测不了。
 * 这里立的是：分层、顺序、谁不能声明成谁，以及用户看得见但改不了。
 */

test("层级顺序是固定的：后面的那层在前面那层搭好的场景里说话", () => {
  assert.deepEqual([...AGENT_PROMPT_LAYERS], ["base", "role", "project", "task"]);
});

test("没写层级就是 role —— 插件自己的 prompt 绝大多数就是这个", () => {
  assert.equal(promptLayerOf({}), "role");
  assert.equal(promptLayerOf({ layer: "base" }), "base");
});

test("排序只决定哪一组在前，不打乱组内顺序", () => {
  const ordered = orderPromptsByLayer([
    { prompt_id: "r1" },
    { prompt_id: "p1", layer: "project" as const },
    { prompt_id: "b1", layer: "base" as const },
    { prompt_id: "r2" },
  ]);
  assert.deepEqual(ordered.map((entry) => entry.prompt_id), ["b1", "r1", "r2", "p1"],
    "角色点名 prompt 的顺序是它有意排的，分层不该洗牌");
});

test("包里不能声明 task 层的 prompt：任务是用户这一次写的", () => {
  const manifest: AgentManifest = {
    roles: [{ role_id: "r", version: 1, name: "r", prompts: ["p"] }],
    prompts: [{ prompt_id: "p", version: 1, layer: "task" }],
  };
  const problems = inspectAgentDeclaration(manifest, []);
  assert.equal(problems.some((text) => /不能声明为 task 层/.test(text)), true);
});

test("不认识的层级被拒，而不是当成默认值收下", () => {
  const manifest = {
    roles: [{ role_id: "r", version: 1, name: "r", prompts: ["p"] }],
    prompts: [{ prompt_id: "p", version: 1, layer: "whatever" }],
  } as unknown as AgentManifest;
  assert.equal(inspectAgentDeclaration(manifest, []).some((text) => /层级不合法/.test(text)), true);
});

test("Coding 自己的声明是合法的，且 base 那一段独立成层", () => {
  assert.deepEqual(inspectAgentDeclaration(codingAgentManifest, []), []);
  assert.deepEqual(inspectAgentDeclaration(scheduleAgentManifest, []), []);
  const base = codingPrompts.find((prompt) => prompt.prompt_id === "coding-base");
  assert.equal(base?.layer, "base", "产品约束不能被角色的措辞悄悄顶替");
  const roleOnly = codingPrompts.filter((prompt) => prompt.prompt_id !== "coding-base");
  assert.equal(roleOnly.every((prompt) => promptLayerOf(prompt) === "role"), true);
});

function hostFor(projectPrompts?: readonly AgentPromptText[]) {
  const host = new AgentHost();
  const authority = {
    manifest: codingAgentManifest,
    authorizedDirectories: ["/tmp/ws"],
    prompts: codingPrompts,
    ...(projectPrompts === undefined ? {} : { project_prompts: projectPrompts }),
  };
  return { host, authority };
}

test("项目那一层由宿主补，而且被强制标成 project —— 不管来的人管它叫什么", async () => {
  const { host, authority } = hostFor([
    { prompt_id: "project-guidance", version: 3, layer: "role", body: "这个仓库先跑 typecheck" },
  ]);
  const captured: Array<{ prompt_id: string; layer?: string }> = [];
  const capabilities = Object.fromEntries(
    ["session.create", "session.read", "run.start", "run.observe", "run.control"]
      .map((key) => [key, "supported"]),
  );
  host.register({
    descriptor: {
      runtime_id: "probe",
      display_name: "probe",
      provider_version: "1.0.0",
      capabilities: { ...emptyCapabilityMatrix(), ...capabilities },
    },
    async health() {
      return { ok: true, status: "ready", message: "就绪" };
    },
    async createSession() {
      return { session_id: "session-1", runtime_id: "probe" };
    },
    async start(request) {
      for (const prompt of request.role.prompts) {
        captured.push({ prompt_id: prompt.prompt_id, layer: prompt.layer });
      }
      return {
        ref: { runtime_id: "probe", session_id: "session-1", run_id: "run-1" },
        frozen: {
          role_id: request.role.role_id,
          role_version: request.role.version,
          execution: request.role.execution,
          model_id: "m",
          prompts: request.role.prompts.map((prompt) => ({
            prompt_id: prompt.prompt_id, version: prompt.version, layer: promptLayerOf(prompt),
          })),
          skills: [], mcp_tools: [], host_tools: [...request.role.host_tools],
          text_materials: [], budget: null,
          directory: { canonical_path: "/tmp/ws", realpath_verified: true },
        },
      };
    },
  } as never);

  await host.start("probe", {
    session: { session_id: "session-1", runtime_id: "probe" },
    board_id: "board-1",
    plugin_id: "io.molis.work.coding",
    install_id: "install-1",
    actor_id: "tester",
    task: "看看这个仓库",
    role_id: "reader",
    directory: { canonical_path: "/tmp/ws", realpath_verified: true },
  } as never, authority as never);

  assert.deepEqual(captured.map((entry) => entry.prompt_id),
    ["coding-base", "coding-reader", "project-guidance"],
    "顺序应当是 base → role → project");
  assert.equal(captured[2]?.layer, "project",
    "从项目通道来的东西就是项目层，来的人怎么标都不算数");
});

test("项目没确认过指引时，这一层是空的而不是塞一句「没有指引」", async () => {
  const { host, authority } = hostFor();
  assert.equal("project_prompts" in authority, false);
  // 组合的结果只有包自己那两段——空的项目层不会变成一条指令。
  const layers = projectCodingIdentity({
    frozen: {
      role_id: "reader", role_version: 1, execution: "read-only", model_id: "m",
      prompts: [
        { prompt_id: "coding-base", version: 1, layer: "base" },
        { prompt_id: "coding-reader", version: 1, layer: "role" },
      ],
      skills: [], mcp_tools: [], host_tools: ["read-file"], text_materials: [], budget: null,
      directory: { canonical_path: "/tmp/ws", realpath_verified: true },
    },
    role_name: "阅读者",
    task: "看看这个仓库",
  }).layers;
  const project = layers.find((layer) => layer.layer === "project");
  assert.deepEqual(project?.entries, []);
  assert.match(project?.absent_reason ?? "", /还没有确认过项目指引/,
    "空着要说清为什么空，不然读起来像「这里没东西可看」");
  void host;
});

test("四层都出现，任务排在最后，而且任务不是包里带的", () => {
  const view = projectCodingIdentity({
    frozen: {
      role_id: "reader", role_version: 1, execution: "read-only", model_id: "m",
      prompts: [{ prompt_id: "coding-base", version: 1, layer: "base" }],
      skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null,
      directory: { canonical_path: "/tmp/ws", realpath_verified: true },
    },
    role_name: "阅读者",
    task: "  看看这个仓库  ",
  });
  assert.deepEqual(view.layers.map((layer) => layer.layer), ["base", "role", "project", "task"]);
  assert.equal(view.layers[3]?.entries[0]?.body, "看看这个仓库");
  assert.equal(view.layers[3]?.owner, "你");
});

test("这一轮不能调工具时，说出来而不是画一个空列表", () => {
  const view = projectCodingIdentity({
    frozen: {
      role_id: "reader", role_version: 1, execution: "read-only", model_id: "m",
      prompts: [], skills: [], mcp_tools: [], host_tools: [], text_materials: [], budget: null,
      directory: { canonical_path: "/tmp/ws", realpath_verified: true },
    },
    role_name: "阅读者",
    task: "",
  });
  const html = renderCodingIdentity({
    identity: view,
    primitives: {
      escape: (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
      icon: (name) => `<i data-icon="${name}"></i>`,
      text: (value) => value,
      formatDate: (value) => value,
    },
  });
  assert.match(html, /不能调用任何工具/);
  assert.match(html, /这一轮没有带任务文本/);
});

test("身份面是只读的：渲染出来不含任何控件", () => {
  const view = projectCodingIdentity({
    frozen: {
      role_id: "writer", role_version: 1, execution: "text-edit", model_id: "m",
      prompts: [{ prompt_id: "coding-writer", version: 1, layer: "role" }],
      skills: [], mcp_tools: [], host_tools: ["edit-file"], text_materials: [], budget: null,
      directory: { canonical_path: "/tmp/ws", realpath_verified: true },
    },
    role_name: "改写者",
    task: "改一下",
    bodies: new Map([["coding-writer", "这一轮你可以改文件"]]),
  });
  assert.equal(view.editable, false);
  const html = renderCodingIdentity({
    identity: view,
    primitives: {
      escape: (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
      icon: (name) => `<i data-icon="${name}"></i>`,
      text: (value) => value,
      formatDate: (value) => value,
    },
  });
  for (const control of ["<button", "<input", "<textarea", "<select", "contenteditable"]) {
    assert.equal(html.includes(control), false,
      `身份面上不该有 ${control}：能改就等于绕过了冻结`);
  }
  assert.match(html, /data-editable="false"/);
});
