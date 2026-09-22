import assert from "node:assert/strict";
import test from "node:test";

import {
  CODING_ARTIFACT_TYPES,
  CODING_CHANGESET_TYPE,
  codingManifest,
  inspectDiagram,
  type CodingChangeSet,
  type CodingDiagram,
} from "@molis-ai/molis-work-plugin-coding";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";
import { shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
import { gitManifest } from "@molis-ai/molis-work-plugin-git";
import { CHARACTER_ARTIFACT_TYPE } from "@molis-ai/molis-work-contracts/modules/characters";

/** C2 的验收：三个 Artifact 类型的形状、声明一致性，以及图的结构校验。 */

test("Manifest 通过 v2 解析，且端口与产出类型逐项对应", () => {
  const parsed = parsePluginManifest(JSON.parse(JSON.stringify(codingManifest)));
  assert.equal(parsed.plugin_id, "io.molis.work.coding");
  assert.equal(parsed.schema_version, 2);
  assert.ok(parsed.artifacts.consumes.some(entry => entry.artifact_type_id === CHARACTER_ARTIFACT_TYPE && entry.schema_version === 1));
  assert.deepEqual(parsed.agent?.characters, { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["reader", "reviewer", "writer", "builder"] });

  const produced = parsed.artifacts.produces.map((entry) => entry.artifact_type_id).sort();
  assert.deepEqual(produced, [...CODING_ARTIFACT_TYPES].sort());

  const outputs = (parsed.ports?.outputs ?? []).map((port) => port.artifact_type_id).sort();
  assert.deepEqual(outputs, produced.filter(type => type !== "coding.goal-context.v1"), "成果端口对应公开输出；目标输入快照只保留本轮来源");

  const inputs = parsed.ports?.inputs ?? [];
  assert.deepEqual(inputs.map(input => input.port).sort(), ["after", "before", "git-changeset", "git-result", "materials", "selection"]);
  for (const input of inputs) {
    assert.equal(input.optional, true, "没有材料也能直接执行任务");
    const producer = input.port === "materials" ? shelfManifest : input.port.startsWith("git-") ? gitManifest : filesManifest;
    const sourcePort = input.port === "materials" ? "material" : input.port.replace(/^git-/, "");
    assert.ok(producer.ports?.outputs?.some(output => output.port === sourcePort
      && output.artifact_type_id === input.artifact_type_id && output.schema_version === input.schema_version),
    "每个材料输入必须有兼容的 Files、Git 或 Shelf 生产端口");
  }
});

test("图是结构不是标记：负载里没有任何可执行的地方", () => {
  const diagram: CodingDiagram = {
    title: "三种失败路径",
    run_id: "run-1",
    nodes: [
      { node_id: "probe", label: "probe 失败", column: 0, row: 0 },
      { node_id: "missing", label: "没装", detail: "给安装命令", column: 1, row: 0, tone: "accent" },
    ],
    edges: [{ from: "probe", to: "missing", kind: "solid" }],
  };
  assert.deepEqual(inspectDiagram(diagram), []);
  // 负载里只有文本与数字，没有 svg / html / script 这类字段
  const keys = new Set(Object.keys(diagram.nodes[0]!));
  for (const forbidden of ["svg", "html", "markup", "script", "href"]) {
    assert.equal(keys.has(forbidden), false, `节点不该有 ${forbidden} 字段`);
  }
});

test("连线指向不存在的节点会被指出来，而不是画出一张不是那个意思的图", () => {
  const broken: CodingDiagram = {
    title: "坏掉的图",
    run_id: "run-2",
    nodes: [{ node_id: "a", label: "A", column: 0, row: 0 }],
    edges: [{ from: "a", to: "ghost", kind: "dashed" }],
  };
  const problems = inspectDiagram(broken);
  assert.equal(problems.length, 1);
  assert.equal(problems[0]?.code, "diagram.unknown_node");
});

test("节点 id 重复会被指出来", () => {
  const dup: CodingDiagram = {
    title: "重复",
    run_id: "run-3",
    nodes: [
      { node_id: "a", label: "A", column: 0, row: 0 },
      { node_id: "a", label: "又一个 A", column: 1, row: 0 },
    ],
    edges: [],
  };
  assert.deepEqual(inspectDiagram(dup).map((problem) => problem.code), ["diagram.duplicate_node"]);
});

test("变更集默认没有落盘：批准与写入是两件事", () => {
  const changeset: CodingChangeSet = {
    scope: "run-frozen",
    run_id: "run-4",
    applied: false,
    files: [{ path: "apps/local-host/src/connect.ts", kind: "modified", added_lines: 12, removed_lines: 3, diff: "@@ -41,3 +41,12 @@\n" }],
  };
  assert.equal(changeset.applied, false);
  assert.equal(changeset.scope, "run-frozen");
  // 路径是工作区相对的，不暴露授权根以外的事实
  assert.equal(changeset.files[0]!.path.startsWith("/"), false);
  assert.equal(CODING_CHANGESET_TYPE, "coding.changeset.v1");
});

test("只读角色拿不到改写者的 Prompt——角色各自声明自己的", async () => {
  const { codingAgentManifest, codingPrompts } = await import("@molis-ai/molis-work-plugin-coding");
  const { AgentHost } = await import("@molis-ai/molis-work-service-agent-host");
  const { emptyCapabilityMatrix } = await import("@molis-ai/molis-work-service-agent-host");

  const seen: string[][] = [];
  const capabilities = emptyCapabilityMatrix();
  const host = new AgentHost();
  host.register({
    descriptor: { runtime_id: "probe", display_name: "probe", provider_version: "1", capabilities },
    async health() { return { ok: true, status: "ready", message: "ok" }; },
    async createSession() { return { session_id: "s", runtime_id: "probe" }; },
    async readSession() { throw new Error("未使用"); },
    async start(request: { role?: { prompts: Array<{ prompt_id: string }>; role_id: string; version: number; execution: string } }) {
      seen.push(request.role!.prompts.map((prompt) => prompt.prompt_id));
      return { ref: { run_id: "r", session_id: "s" }, frozen: { ...request.role!, model_id: "m", skills: [], mcp_tools: [], text_materials: [], budget: null, directory: { canonical_path: "/tmp/ws", realpath_verified: true }, role_version: request.role!.version } };
    },
    async read() { throw new Error("未使用"); },
    observe() { return () => {}; },
    async control() {},
    async readCommandOutput() { throw new Error("未使用"); },
  } as never);

  const authority = {
    manifest: codingAgentManifest,
    authorizedDirectories: ["/tmp/ws"],
    prompts: codingPrompts,
  };
  const base = {
    plugin_id: "io.molis.work.coding",
    session: { session_id: "s", runtime_id: "probe" },
    task: "看看这段代码",
    directory: { canonical_path: "/tmp/ws", realpath_verified: true },
  };
  await host.start("probe", { ...base, role_id: "reader" } as never, authority as never);
  assert.deepEqual(seen[0], ["coding-base", "coding-reader"]);
  assert.equal(seen[0]?.includes("coding-writer"), false, "只读角色绝不能拿到「你可以改文件」那段");
});
