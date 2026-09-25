import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginManifest, PluginManifestError } from "@molis-ai/molis-work-contracts/platform/plugin";

const PLUGIN_ID = "io.molis.work.coding";

function v2Manifest(): Record<string, unknown> {
  return {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: PLUGIN_ID,
    version: "0.1.0",
    name: "Coding",
    kind: "app",
    publisher: { publisher_id: "molis", signature: "official-coding-binding" },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [
      { permission: "artifact:write", required: true, reason: "保存修改集与报告" },
      { permission: "artifact:read", required: true, reason: "读取项目与文件输入" },
      { permission: "agent:run", required: true, reason: "执行编码任务" },
    ],
    capabilities: { provides: [], consumes: ["projects.read.v1"] },
    artifacts: {
      produces: [{ artifact_type_id: "coding.change-set", schema_version: 1 }],
      consumes: [
        { artifact_type_id: "projects.project", schema_version: 1 },
        { artifact_type_id: "files.selection", schema_version: 1 },
      ],
    },
    ui: {
      contributions: [`${PLUGIN_ID}.session`],
      views: [{ view_id: "session", slot: "stage", title: "Coding", accepts_objects: true }],
      commands: [
        { command_id: "open-report", title: "打开已保存报告", input_kinds: ["current", "artifacts"], opens_view_id: "session" },
      ],
    },
    ports: {
      inputs: [
        { port: "project", artifact_type_id: "projects.project", schema_version: 1 },
        { port: "files", artifact_type_id: "files.selection", schema_version: 1, optional: true },
      ],
      outputs: [{ port: "change-set", artifact_type_id: "coding.change-set", schema_version: 1 }],
      input_groups: [{ group_id: "project-only", title: "只用项目", ports: ["project"] }],
    },
    events: {
      publishes: [{ event_type_id: `${PLUGIN_ID}.file-changed`, type_version: 1 }],
      subscribes: [
        { event_type_id: "io.molis.work.files.refreshed", type_version: 1, from_plugin_ids: ["io.molis.work.files"] },
      ],
    },
    routes: [
      { route_id: "coding.sessions", method: "GET", path: "/sessions" },
      { route_id: "coding.submit", method: "POST", path: "/sessions/:session_id/submit", permission: "agent:run" },
    ],
    requires: [{ capability_id: "projects.read.v1", version: 1, reason: "读取当前项目身份" }],
    agent: {
      directory_input_port: "project",
      roles: [
        { role_id: "reader", version: 1, name: "Reader" },
        { role_id: "writers", version: 1, name: "Writers", subagent_workspaces: "required" },
      ],
      prompts: [
        { prompt_id: "reader", version: 1 },
        { prompt_id: "writers", version: 1 },
        { prompt_id: "subagent-writer", version: 1 },
      ],
      subagents: {
        parent_role_ids: ["writers"],
        roles: [
          { role_id: "subagent-writer", version: 1, name: "Writer", execution: "workspace-write", parent_role_ids: ["writers"] },
        ],
      },
    },
  };
}

function rejects(mutate: (manifest: Record<string, unknown>) => void, needle: string): void {
  const input = v2Manifest();
  mutate(input);
  assert.throws(
    () => parsePluginManifest(input),
    (error: unknown) =>
      error instanceof PluginManifestError
      && error.code === "plugin_declaration_invalid"
      && error.message.includes(needle),
    `期望因为 ${needle} 被拒绝`,
  );
}

test("v2 Manifest keeps author declarations for ports, events, views, routes and agent", () => {
  const input = v2Manifest();
  assert.deepEqual(parsePluginManifest(input), input);
});

test("malformed action permissions fail as manifest errors instead of escaping validation", () => {
  rejects(m => { m.actions = [{ capability_id: "test.read", version: 1, action: { permissions: 42 } }]; }, "不完整");
  rejects(m => { m.action_scenes = [{ scene_id: "test.received", version: 1, permissions: 42 }]; }, "不完整");
});

test("v1 Manifest cannot silently carry v2 declarations", () => {
  const v1 = {
    schema_version: 1,
    host_api_version: 1,
    plugin_id: PLUGIN_ID,
    version: "0.1.0",
    name: "Coding",
    kind: "native",
    publisher: { publisher_id: "molis", signature: "official-coding-binding" },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    ports: { inputs: [], outputs: [] },
  };
  assert.throws(
    () => parsePluginManifest(v1),
    (error: unknown) => error instanceof PluginManifestError
      && error.code === "plugin_declaration_invalid" && error.message.includes("ports"),
  );
  assert.throws(
    () => parsePluginManifest({ ...v1, ports: undefined, kind: "app" }),
    (error: unknown) => error instanceof PluginManifestError && error.code === "plugin_manifest_invalid",
  );
});

test("port declarations reject duplicates and groups that name an undeclared port", () => {
  rejects((manifest) => {
    const ports = manifest.ports as { inputs: unknown[] };
    ports.inputs.push({ port: "project", artifact_type_id: "projects.project", schema_version: 1 });
  }, "输入端口重复");
  rejects((manifest) => {
    const ports = manifest.ports as { input_groups: Array<{ ports: string[] }> };
    ports.input_groups[0]!.ports = ["nowhere"];
  }, "未声明的输入端口");
});

test("events stay inside the Plugin namespace and subscriptions must name their sources", () => {
  rejects((manifest) => {
    const events = manifest.events as { publishes: Array<{ event_type_id: string }> };
    events.publishes[0]!.event_type_id = "io.molis.work.files.refreshed";
  }, "命名空间");
  rejects((manifest) => {
    const events = manifest.events as { publishes: Array<{ event_type_id: string }> };
    events.publishes[0]!.event_type_id = "host.shutdown";
  }, "保留事件");
  rejects((manifest) => {
    const events = manifest.events as { subscribes: Array<{ from_plugin_ids: string[] }> };
    events.subscribes[0]!.from_plugin_ids = [];
  }, "显式限定来源");
  rejects((manifest) => {
    const events = manifest.events as { subscribes: Array<{ from_plugin_ids: string[] }> };
    events.subscribes[0]!.from_plugin_ids = ["*"];
  }, "来源声明无效");
});

test("views and commands must resolve to declared contributions and views", () => {
  rejects((manifest) => {
    const ui = manifest.ui as { views: Array<{ slot: string }> };
    ui.views[0]!.slot = "floating";
  }, "slot 不合法");
  rejects((manifest) => {
    const ui = manifest.ui as { contributions: string[] };
    ui.contributions = [];
  }, "未在 ui.contributions 声明");
  rejects((manifest) => {
    const ui = manifest.ui as { commands: Array<{ opens_view_id: string }> };
    ui.commands[0]!.opens_view_id = "missing";
  }, "打开的视图");
});

test("routes reject duplicate paths and permissions the Manifest never declared", () => {
  rejects((manifest) => {
    const routes = manifest.routes as Array<{ route_id: string; method: string; path: string }>;
    routes.push({ route_id: "coding.sessions-again", method: "GET", path: "/sessions" });
  }, "路由路径重复");
  rejects((manifest) => {
    const routes = manifest.routes as Array<{ permission?: string }>;
    routes[1]!.permission = "storage:private";
  }, "未声明的权限");
});

test("capability requirements must also appear in capabilities.consumes", () => {
  rejects((manifest) => {
    manifest.capabilities = { provides: [], consumes: [] };
  }, "未列入 capabilities.consumes");
});

test("agent block is checked against the Plugin's own ports, prompts and subagent parents", () => {
  rejects((manifest) => {
    const agent = manifest.agent as { directory_input_port: string };
    agent.directory_input_port = "files-elsewhere";
  }, "directory_input_port");
  // A role that names no prompts and has no prompt sharing its id runs with no
  // instructions at all, so it is still rejected — only the wording moved once
  // roles were allowed to name their own prompts.
  rejects((manifest) => {
    const agent = manifest.agent as { prompts: unknown[] };
    agent.prompts = [{ prompt_id: "writers", version: 1 }, { prompt_id: "subagent-writer", version: 1 }];
  }, "既没有声明 prompts，也没有同名 Prompt");
  // Naming a prompt the Manifest never declared is its own error.
  rejects((manifest) => {
    const agent = manifest.agent as { roles: Array<{ prompts?: string[] }> };
    agent.roles[0]!.prompts = ["nowhere"];
  }, "引用了未声明的 Prompt");
  rejects((manifest) => {
    const agent = manifest.agent as {
      roles: Array<{ role_id: string; subagent_workspaces?: string }>;
    };
    delete agent.roles[1]!.subagent_workspaces;
  }, "只能属于要求独立子目录的父角色");
});

test("ports must agree with the Artifact permissions and declarations they rely on", () => {
  rejects((manifest) => {
    manifest.permissions = [
      { permission: "agent:run", required: true, reason: "执行编码任务" },
      { permission: "artifact:read", required: true, reason: "读取输入" },
    ];
  }, "必须声明 artifact:write 权限");

  rejects((manifest) => {
    manifest.permissions = [
      { permission: "agent:run", required: true, reason: "执行编码任务" },
      { permission: "artifact:write", required: true, reason: "保存成果" },
    ];
  }, "必须声明 artifact:read 权限");

  rejects((manifest) => {
    const artifacts = manifest.artifacts as { produces: unknown[] };
    artifacts.produces = [];
  }, "没有列入 artifacts.produces");

  rejects((manifest) => {
    const artifacts = manifest.artifacts as { consumes: unknown[] };
    artifacts.consumes = [];
  }, "没有列入 artifacts.consumes");
});

test("mcp_exports stay on schema 2 and cannot register switches, public names or identity fields", () => {
  const input = v2Manifest();
  const exports = [{
    tool_id: "list",
    description: "列出判断函数",
    input_schema: { type: "object", properties: {}, required: [] },
    effect: "read",
    audience: "runtime",
    scope: "home",
  }];
  input.mcp_exports = exports;
  const parsed = parsePluginManifest(input);
  assert.deepEqual(parsed.mcp_exports, exports);

  const withAgentMcp = v2Manifest();
  (withAgentMcp.agent as { mcp?: boolean }).mcp = true;
  withAgentMcp.mcp_exports = exports;
  const both = parsePluginManifest(withAgentMcp);
  assert.equal(both.agent?.mcp, true);
  assert.equal(both.mcp_exports?.length, 1);

  rejects((manifest) => {
    manifest.mcp_exports = [{
      tool_id: "list",
      description: "列出判断函数",
      input_schema: { type: "object", properties: { board_id: { type: "string" } } },
      effect: "read",
    }];
  }, "不能声明身份字段 board_id");
  rejects((manifest) => {
    manifest.mcp_exports = [{
      tool_id: "list",
      description: "列出判断函数",
      input_schema: { type: "object" },
      effect: "read",
      enabled: true,
    }];
  }, "不能登记开关");
  rejects((manifest) => {
    manifest.mcp_exports = [{
      tool_id: "list",
      description: "列出判断函数",
      input_schema: { type: "object" },
      effect: "read",
      name: "molis_work_v1_coding_list",
    }];
  }, "不能登记对外正式名");
  rejects((manifest) => {
    manifest.mcp_exports = [
      { tool_id: "list", description: "a", input_schema: { type: "object" }, effect: "read" },
      { tool_id: "list", description: "b", input_schema: { type: "object" }, effect: "read" },
    ];
  }, "mcp_exports 重复");
});

test("behaviors, function_scenes and judgment_subjects are inspected on schema 2", () => {
  const input = v2Manifest();
  input.behaviors = [{
    behavior_id: "open",
    title: "打开",
    effect: "read",
    subject_kinds: ["feed_item"],
  }];
  input.function_scenes = [{
    scene_id: "home.dock",
    title: "首页卡底",
    subject_kinds: ["home_event"],
  }];
  input.judgment_subjects = [{ subject_kind: "feed_item", title: "Feed 消息" }];
  const parsed = parsePluginManifest(input);
  assert.equal(parsed.behaviors?.[0]?.behavior_id, "open");
  assert.equal(parsed.function_scenes?.[0]?.scene_id, "home.dock");
  rejects((manifest) => {
    manifest.behaviors = [{ behavior_id: "Open", title: "打开", effect: "read", subject_kinds: ["feed_item"] }];
  }, "behavior_id 不合法");
});

test("v1 Manifest cannot carry mcp_exports", () => {
  const v1 = {
    schema_version: 1,
    host_api_version: 1,
    plugin_id: PLUGIN_ID,
    version: "0.1.0",
    name: "Coding",
    kind: "native",
    publisher: { publisher_id: "molis", signature: "official-coding-binding" },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    mcp_exports: [{
      tool_id: "list",
      description: "列出判断函数",
      input_schema: { type: "object" },
      effect: "read",
    }],
  };
  assert.throws(
    () => parsePluginManifest(v1),
    (error: unknown) => error instanceof PluginManifestError
      && error.code === "plugin_declaration_invalid"
      && error.message.includes("mcp_exports"),
  );
});


test("embedded plugin dependencies are explicit v2 IDs, not implicit grants or self links", () => {
  const input = v2Manifest();
  const ui = input.ui as Record<string, unknown>;
  ui.embedded_plugins = ["io.molis.work.example.reader"];
  assert.deepEqual(parsePluginManifest(input).ui.embedded_plugins, ["io.molis.work.example.reader"]);
  for (const invalid of [[PLUGIN_ID], ["io.molis.work.example.reader", "io.molis.work.example.reader"], [" padded"], "io.molis.work.example.reader", [null]]) {
    ui.embedded_plugins = invalid;
    assert.throws(() => parsePluginManifest(input), PluginManifestError);
  }
});
