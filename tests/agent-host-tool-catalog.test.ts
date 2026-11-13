import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { AGENT_TOOLS, AgentHost, emptyCapabilityMatrix, isAgentTool, RUNTIME_TOOLS_NOT_OFFERED } from "@molis-ai/molis-work-service-agent-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { KIT_TOOL_ORIGINS } from "@molis-ai/molis-work-contracts/platform/kit-report";
import { BUSINESS_HOST_TOOLS, SKILL_TOOLS, type AgentManifest } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";

// CPK-07 (specs/capability-pack/contract-design.md §5): every Agent tool is in one set in the Agent Host, aligned with the vendored SDK's own
// tools, and a role naming a tool outside it is not available — shown when the plugin is assembled, and refused before a round starts.

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { OFFICIAL_CODING_PACK, SYSTEM_TOOL_NAMES } = await import(requireSdk.resolve("@prologue/sdk")) as {
  SYSTEM_TOOL_NAMES: readonly string[];
  OFFICIAL_CODING_PACK: { readonly tools: readonly { readonly registration: { readonly name: string } }[] };
};
// The official coding pack contributes tools too (`coding.find-symbol`), provided by the round's pack rather than the SDK's
// system closed set; the set may name either, and nothing else.
const PACK_TOOLS = OFFICIAL_CODING_PACK.tools.map(tool => tool.registration.name);

test("CPK-07: the tool set matches the SDK's tools — each runtime tool exists there, and each SDK tool is offered or says why not", () => {
  const names = AGENT_TOOLS.map(tool => tool.name);
  assert.equal(new Set(names).size, names.length, "one entry per name");
  assert.ok(AGENT_TOOLS.every(tool => (KIT_TOOL_ORIGINS as readonly string[]).includes(tool.origin) && tool.description.length > 0));
  const mapped = AGENT_TOOLS.flatMap(tool => tool.runtime_name ? [tool.runtime_name] : []);
  assert.ok(AGENT_TOOLS.filter(tool => tool.origin === "runtime").every(tool => tool.runtime_name), "a runtime tool names the SDK's tool");
  assert.deepEqual(mapped.filter(name => !SYSTEM_TOOL_NAMES.includes(name) && !PACK_TOOLS.includes(name)), [], "renamed or removed in the SDK: update the set");
  const notOffered = RUNTIME_TOOLS_NOT_OFFERED.map(row => row.runtime_name);
  assert.deepEqual(notOffered.filter(name => !SYSTEM_TOOL_NAMES.includes(name)), [], "a reason for a tool the SDK no longer has");
  assert.deepEqual(notOffered.filter(name => mapped.includes(name)), [], "a tool is offered or not, never both");
  assert.deepEqual(SYSTEM_TOOL_NAMES.filter(name => !mapped.includes(name) && !notOffered.includes(name)), [], "new in the SDK: offer it or say why not");
  assert.ok(RUNTIME_TOOLS_NOT_OFFERED.every(row => row.why.length > 0));
  assert.ok(AGENT_TOOLS.filter(tool => tool.unasked).every(tool => tool.runtime_name), "only a runtime tool can run without asking");
});

test("CPK-07: the contract's two tool lists, and every role of the built-in plugins, name only tools in the set", () => {
  assert.deepEqual([...BUSINESS_HOST_TOOLS, ...SKILL_TOOLS].filter(name => !isAgentTool(name)), []);
  const host = new AgentHost(); host.register(probe());
  for (const { manifest } of BUILTIN_PLUGIN_CATALOG) {
    if (!manifest.agent) continue;
    const named = [...manifest.agent.roles, ...manifest.agent.subagents?.roles ?? []].flatMap(role => role.host_tools ?? []);
    assert.deepEqual(named.filter(name => !isAgentTool(name)), [], manifest.id);
    assert.deepEqual(host.availableRoles("probe", manifest.agent).filter(role => role.reason?.includes("工具全集")), [], manifest.id);
  }
});

test("CPK-07: a role or a child role naming a tool outside the set is not available, and its round is refused before the runtime starts", async () => {
  const starts: unknown[] = [];
  const host = new AgentHost(); host.register(probe(() => { starts.push(1); }));
  const manifest: AgentManifest = { directory_input_port: "project", prompts: [], roles: [
    { role_id: "reader", version: 1, name: "Reader", host_tools: ["read-file", "web-search"] },
    { role_id: "lead", version: 1, name: "Lead", host_tools: ["read-file"] },
    { role_id: "fine", version: 1, name: "Fine", host_tools: ["read-file", "search"] }],
    subagents: { parent_role_ids: ["lead"], roles: [{ role_id: "child", version: 1, name: "Child", parent_role_ids: ["lead"], host_tools: ["read"] }] } };
  const roles = host.availableRoles("probe", manifest);
  assert.deepEqual(roles.map(role => [role.role_id, role.available]), [["reader", false], ["lead", false], ["fine", true]]);
  assert.match(roles[0]!.reason!, /web-search/, "the reason names the tool");
  assert.match(roles[1]!.reason!, /\bread\b/, "the SDK's own name is not a role's name for it");
  await assert.rejects(host.start("probe", { session: { session_id: "s", runtime_id: "probe" }, project_id: "p", plugin_id: "io.example", install_id: "i",
    actor_id: "tester", task: "读", role_id: "reader", directory: { canonical_path: "/tmp/x", realpath_verified: true } },
  { manifest, authorizedDirectories: ["/tmp/x"] }), { code: "agent.role_tool_unknown" });
  assert.equal(starts.length, 0);
});

function probe(started: () => void = () => undefined): AgentRuntimeAdapter {
  const capabilities = emptyCapabilityMatrix();
  const unused = () => { throw new Error("Not used by this fixture"); };
  return { descriptor: { runtime_id: "probe", display_name: "probe", provider_version: "1.0.0", capabilities },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    createSession: unused, read: unused, observe: unused, control: unused, readCommandOutput: unused, readSession: unused,
    async start() { started(); return unused(); } };
}
