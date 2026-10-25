import assert from "node:assert/strict";
import test from "node:test";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { SHELF_LOCAL_TOOLS } from "@molis-ai/molis-work-plugin-shelf";

// specs/repository-anti-corruption/slices/platform-local-tools-home-scope.md, PG-112: the command-line tools a plugin looks for on this
// machine are declared in its Manifest (`local_tools`) and nowhere else.

const TOOLS = { tools: [{ tool_id: "alpha", binaries: ["alpha-cli", "alpha"] }], directories: ["~/.alpha/bin", "/opt/tools/bin"], custom_executables: true };
const manifest = (local_tools: unknown, permissions = ["storage:private", "local-tools:read"]) => ({
  schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.tools-probe", version: "0.1.0", name: "Tools", kind: "native",
  publisher: { publisher_id: "example", signature: "publisher-a" }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
  permissions: permissions.map(permission => ({ permission, required: true, reason: "找工具" })),
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
  ...(local_tools === undefined ? {} : { local_tools }),
});

test("RAC-731 the Manifest's local_tools declare named tools with bare file names, plain directories, and the permission the Manifest holds", () => {
  assert.deepEqual(parsePluginManifest(manifest(TOOLS)).local_tools, TOOLS);
  assert.equal(parsePluginManifest(manifest(undefined)).local_tools, undefined);
  const many = (count: number) => Array.from({ length: count }, (_, index) => ({ tool_id: `tool-${index}`, binaries: ["x"] }));
  for (const [declared, mentions, permissions] of [
    [[], /local_tools 必须为对象/u],
    [{ ...TOOLS, spawn: true }, /local_tools 不认这些字段：spawn/u],
    [{ ...TOOLS, tools: [] }, /local_tools\.tools 必须是 1 到 32 个工具/u],
    [{ ...TOOLS, tools: many(33) }, /local_tools\.tools 必须是 1 到 32 个工具/u],
    [{ ...TOOLS, tools: [{ tool_id: "Alpha", binaries: ["a"] }] }, /tool_id 必须是小写字母开头/u],
    [{ ...TOOLS, tools: [{ tool_id: "a", binaries: ["x"] }, { tool_id: "a", binaries: ["y"] }] }, /a 重复/u],
    [{ ...TOOLS, tools: [{ tool_id: "a", binaries: [] }] }, /binaries 必须是 1 到 4 个不含路径的文件名/u],
    [{ ...TOOLS, tools: [{ tool_id: "a", binaries: ["bin/a"] }] }, /binaries 必须是 1 到 4 个不含路径的文件名/u],
    [{ ...TOOLS, tools: [{ tool_id: "a", binaries: ["../a"] }] }, /binaries 必须是 1 到 4 个不含路径的文件名/u],
    [{ ...TOOLS, tools: [{ tool_id: "a", binaries: ["a", "b", "c", "d", "e"] }] }, /binaries 必须是 1 到 4 个不含路径的文件名/u],
    [{ ...TOOLS, tools: [{ tool_id: "a", binaries: ["a"], args: ["--help"] }] }, /只能写 tool_id 和 binaries/u],
    [{ ...TOOLS, directories: ["relative/bin"] }, /local_tools\.directories 至多 24 个/u],
    [{ ...TOOLS, directories: ["~/../etc"] }, /local_tools\.directories 至多 24 个/u],
    [{ ...TOOLS, directories: ["/opt/$(id)/bin"] }, /local_tools\.directories 至多 24 个/u],
    [{ ...TOOLS, directories: Array.from({ length: 25 }, (_, index) => `/opt/${index}`) }, /local_tools\.directories 至多 24 个/u],
    [{ ...TOOLS, custom_executables: false }, /custom_executables 只能写 true/u],
    [TOOLS, /需要这份 Manifest 在 permissions 里声明 local-tools:read/u, ["storage:private"]],
  ] as const) assert.throws(() => parsePluginManifest(manifest(declared, permissions as string[] | undefined)), mentions, JSON.stringify(declared));
});

test("RAC-731 Shelf's terminal Agents are its Manifest's local_tools: one tool per engine, the permission is required, and no other shipped plugin declares any", () => {
  const shelf = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === "io.molis.work.shelf")!;
  assert.equal(shelf.manifest.local_tools, SHELF_LOCAL_TOOLS);
  assert.equal(shelf.manifest.permissions.find(entry => entry.permission === "local-tools:read")?.required, true, "a dual-instance Manifest's permissions are all required");
  assert.deepEqual(SHELF_LOCAL_TOOLS.tools.map(tool => tool.tool_id), ["grok", "claude", "gemini", "opencode", "cursor", "codex", "kimi", "codebuddy", "qwen"]);
  assert.deepEqual(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.local_tools).map(entry => entry.manifest.plugin_id), ["io.molis.work.shelf"]);
  assert.doesNotThrow(() => parsePluginManifest(JSON.parse(JSON.stringify(shelf.manifest))), "the declaration Shelf ships passes the same check as any plugin's");
});
