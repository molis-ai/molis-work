import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineKitReportAction, KIT_REPORT_INPUT_TYPE, KIT_REPORT_OUTPUT_TYPE, type KitReport, type KitReportedEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { PromptOverridesFile } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { KitCatalog } from "@molis-ai/molis-work-contracts/services/kit";
import { agentMcpKitEntries, molisWorkHostProjectReference, pluginPackageExport, promptOverrideActions } from "@molis-ai/molis-work-app-local-host";
import { gatherKit } from "@molis-ai/molis-work-service-kit";
import { CONTENT_PLUGIN_ID } from "./fixtures/content-package.js";
import { grantHomeProbe, homeProbe, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { kitHost } from "./fixtures/kit-host.js";

// S-kit-catalog (specs/capability-pack/contract-design.md §4.11): the AI kit is the person's own; owners' reports are checked and stamped
// by the gatherer, never believed; listing it connects nothing; export and bringing prompt edits back are the person's, through guarded doors.

const FAKE = defineKitReportAction("fake.kit.report", 1, "假上报者", []);
const NONE = { tools: [], permissions: [], connector_categories: [] };
const rejects = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
const refused = (error: unknown) => typeof (error as { code?: unknown }).code === "string";

/** A prompt entry a plugin's reporter might send, claiming whatever the case needs. */
const prompt = (entry_id: string, extra: Partial<KitReportedEntry> & Record<string, unknown> = {}): KitReportedEntry => ({ kind: "prompt", entry_id, name: entry_id, description: "",
  version: { label: "1" }, declares: NONE, scope: "project", where: [], availability: { available: true }, usage: { kind: "none" }, export: "none",
  ref: { owner_id: CONTENT_PLUGIN_ID, prompt_id: entry_id }, prompt: { use: "agent", edited: false, roles: [] }, ...extra } as KitReportedEntry);

/** The content package installed, and a reporter registered as that installation's own (as the Plugin Runtime registers a plugin's actions). */
async function withPluginReporter(t: TestContext, answer: () => unknown, audiences?: readonly string[]) {
  const h = await kitHost(t);
  await h.install();
  const installId = (await h.kit()).packs.find(pack => pack.source?.plugin_id === CONTENT_PLUGIN_ID)!.source!.install_id;
  const reference = molisWorkHostProjectReference({ databasePath: h.f.project.database_path, projectId: h.f.project.project_id });
  const definition = audiences ? { ...FAKE, action: { ...FAKE.action, audiences } } as typeof FAKE : FAKE;
  let calls = 0;
  h.f.host.actionRegistry(reference).registerProvider({ provider: { provider_id: "fake.reporter", title: "假上报者", kind: "plugin", plugin_id: CONTENT_PLUGIN_ID,
    plugin_install_id: installId, project_id: h.f.project.project_id }, definitions: [definition],
    handlers: [{ capability_id: definition.capability_id, version: definition.version, handle: async () => { calls++; return answer(); } }] });
  return { h, installId, calls: () => calls };
}
const fakeIssues = (kit: KitCatalog) => kit.issues.filter(row => row.provider_id === "fake.reporter");
const fakeEntries = (kit: KitCatalog) => kit.entries.filter(row => row.reporter.provider_id === "fake.reporter");

test("S-kit-catalog 1: an Agent, a plugin and an MCP client cannot list the kit", { timeout: 120_000 }, async t => {
  const h = await kitHost(t);
  for (const audience of ["agent", "plugin", "mcp"] as const) await assert.rejects(h.kit({ ...h.person, audience }), refused, audience);
});

test("S-kit-catalog 2: a reporter the person cannot see is not called", { timeout: 120_000 }, async t => {
  const { h, calls } = await withPluginReporter(t, () => ({ entries: [] }), ["plugin"]);
  await h.kit();
  assert.equal(calls(), 0);
});

test("S-kit-catalog 3: an answer with a body is dropped whole and listed among the issues", { timeout: 120_000 }, async t => {
  const { h } = await withPluginReporter(t, () => ({ entries: [prompt("p1"), { ...prompt("p2"), body: "提示词正文" }] }));
  const kit = await h.kit();
  assert.deepEqual(fakeEntries(kit), []);
  assert.equal(fakeIssues(kit).length, 1);
});

test("S-kit-catalog 4: a plugin's entry claiming the system or Molis Work's pack is stamped as its own installation", { timeout: 120_000 }, async t => {
  const { h, installId } = await withPluginReporter(t, () => ({ entries: [prompt("p1", { source: { kind: "system", module: "agent-host", title: "Molis Work" }, pack: "system:builtin" })] }));
  const kit = await h.kit(), [entry] = fakeEntries(kit);
  assert.equal(entry!.pack, `plugin:${installId}`);
  assert.deepEqual([entry!.source.kind, entry!.source.kind === "plugin" && entry!.source.install_id], ["plugin", installId]);
});

test("S-kit-catalog 5: a plugin cannot report a Skill, a tool or a pack header; the tool stays the Agent Host's one", { timeout: 120_000 }, async t => {
  const tool = { ...prompt("run-command"), kind: "tool", ref: { tool: "run-command" }, tool: { origin: "runtime", writes: true } };
  const { h, installId } = await withPluginReporter(t, () => ({ entries: [tool], packs: [{ source: { kind: "plugin", plugin_id: CONTENT_PLUGIN_ID, title: "x", version: "1", install_id: installId, publisher_label: "x", trust: "pinned" }, description: "", status: "enabled" }] }));
  const kit = await h.kit();
  assert.deepEqual(fakeEntries(kit), []);
  assert.ok(fakeIssues(kit).length >= 1);
  assert.equal(kit.entries.filter(row => row.kind === "tool" && row.ref.tool === "run-command").length <= 1, true);
  assert.ok(kit.entries.filter(row => row.kind === "tool").every(row => row.reporter.provider_id === "system.agent-tools"));
});

test("S-kit-catalog 6: a plugin's prompt hung under another plugin's role is dropped", { timeout: 120_000 }, async t => {
  const { h } = await withPluginReporter(t, () => ({ entries: [prompt("p1", { prompt: { use: "agent", edited: false, roles: [{ kind: "plugin", owner_id: "io.molis.work.coding", role_id: "coder" }] } })] }));
  const kit = await h.kit();
  assert.deepEqual(fakeEntries(kit), []);
  assert.equal(fakeIssues(kit).length, 1);
});

test("S-kit-catalog 8: a plugin's 「去处」 into another plugin, the Host's settings or elsewhere is taken off", { timeout: 120_000 }, async t => {
  const { h } = await withPluginReporter(t, () => ({ entries: [
    prompt("own", { manage: { href: `/plugins/${CONTENT_PLUGIN_ID}?tab=prompts`, label: "x" } }),
    prompt("other", { manage: { href: "/plugins/io.molis.work.coding", label: "x" } }),
    prompt("host", { manage: { href: "/settings/prompts", label: "x" } }),
  ] }));
  const kit = await h.kit(), manage = Object.fromEntries(fakeEntries(kit).map(row => [row.name, row.manage?.href ?? null]));
  assert.deepEqual(manage, { own: `/plugins/${CONTENT_PLUGIN_ID}?tab=prompts`, other: null, host: null });
});

test("S-kit-catalog 13: a plugin reporter that does not answer leaves its own pack unknown with the issue; the others are as they were", { timeout: 120_000 }, async t => {
  const { h, installId } = await withPluginReporter(t, () => new Promise(resolve => setTimeout(() => resolve({ entries: [] }), 8_000)));
  const kit = await h.kit(), pack = kit.packs.find(row => row.pack_id === `plugin:${installId}`)!;
  assert.equal(pack.state.kind, "unknown");
  assert.equal(pack.state.kind === "unknown" && pack.state.issues.some(index => kit.issues[index]!.provider_id === "fake.reporter"), true);
  assert.notEqual(kit.packs.find(row => row.pack_id === "system:builtin")!.state.kind, "unknown");
});

// The gatherer alone, over a directory of named system providers, so each one may be made to overstep (§4.11 #7).
const PLUGIN_SOURCE = { kind: "plugin", plugin_id: "io.example.one", title: "One", version: "1.0.0", install_id: "i1", publisher_label: "One", trust: "pinned" } as const;
const view = (provider_id: string): ActionView => ({ capability_id: `${provider_id}.kit.report`, version: 1, provider: { provider_id, title: provider_id, kind: "system" },
  action: { input_type: KIT_REPORT_INPUT_TYPE, output_type: KIT_REPORT_OUTPUT_TYPE }, availability: { available: true } }) as never;
async function gather(answers: Record<string, KitReport>): Promise<KitCatalog> {
  const all: Record<string, KitReport> = { "plugin-install": { entries: [], packs: [{ source: PLUGIN_SOURCE, description: "", status: "enabled" }] }, ...answers };
  const client = { discover: async () => Object.keys(all).map(view), invoke: async (_caller: ActionCallContext, ref: { provider_id?: string }) => all[ref.provider_id!] } as never;
  return gatherKit({ actor_id: "web-user", project_id: "p", audience: "user", permissions: [] }, client);
}

test("S-kit-catalog 7: a named system provider that gives a source or pack outside its row, or a pack no header has, is dropped and listed", async () => {
  const skill = (pack: string, source: KitReportedEntry["source"] = PLUGIN_SOURCE) => ({ ...prompt("s"), kind: "skill", skill: {}, source, pack }) as never;
  const role = (pack: string, source: KitReportedEntry["source"] = PLUGIN_SOURCE) => ({ ...prompt("r"), kind: "role", ref: { kind: "plugin", owner_id: "io.example.one", role_id: "r" }, role: { subagent: false, host_tools: [] }, source, pack }) as never;
  const mcp = (pack: string) => ({ ...prompt("m"), kind: "mcp", ref: { part: "server", owner: "project", server_id: "m", configuration_version: 1 }, mcp: {}, source: { kind: "mcp_server", owner: "project", server_id: "m", label: "m" }, pack }) as never;
  const cases: Array<[string, KitReportedEntry]> = [
    ["system.skills", skill("plugin:missing")], ["system.skills", skill("plugin:i1", { ...PLUGIN_SOURCE, plugin_id: "io.example.other" })],
    ["system.skills", skill("plugin:i1", { kind: "runtime", package: "x", version: "1" })],
    ["system.agent-definitions", role("plugin:missing")], ["system.agent-definitions", role("plugin:i1", { ...PLUGIN_SOURCE, plugin_id: "io.example.other" })],
    ["system.agent-mcp", mcp("plugin:missing")], ["system.connectors", mcp("plugin:missing")],
    ["system.agent-tools", { ...prompt("t"), kind: "tool", source: { kind: "outbound", title: "x" }, pack: "system:builtin" } as never],
    ["system.mcp-access", mcp("system:characters")],
  ];
  for (const [provider, entry] of cases) {
    const kit = await gather({ [provider]: { entries: [entry] } });
    assert.deepEqual(kit.entries, [], `${provider} ${entry.pack}`);
    assert.equal(kit.issues.filter(row => row.provider_id === provider).length, 1, `${provider} ${entry.pack}`);
  }
});

test("S-kit-catalog 9: listing the project's MCP reads the library's safe view and never connects, lists, controls or calls", async () => {
  const counted: string[] = [];
  const never = (name: string) => async () => { counted.push(name); throw new Error(`${name} must not run`); };
  const library = { catalog: async () => [{ owner: { project_id: "p", plugin_id: "io.molis.work.coding" }, server: { id: "srv", version: 2, label: "Docs", enabled: true, transport: "http", timeout_ms: 1000,
    credential: "none", health: "connected", tools: [{ server: "srv", tool: "search", version: "1", configuration_version: 2, server_label: "Docs", description: "找文档" }], resources: [] } }],
  list: never("list"), save: never("save"), control: never("control"), validate: never("validate"), validateSources: never("validateSources"), tools: never("tools"), call: never("call"),
  live: () => true } as never;
  const installations = async () => [{ record: { plugin_id: "io.molis.work.coding", install_id: "i9" }, manifest: { name: "Coding" }, scope: "project" }] as never;
  const report = await agentMcpKitEntries(library, installations, { actor_id: "web-user", project_id: "p", audience: "user", permissions: [] });
  assert.deepEqual(report.entries.map(entry => [entry.kind === "mcp" && entry.ref.part, entry.pack]), [["server", "plugin:i9"], ["tool", "plugin:i9"]]);
  assert.deepEqual(counted, []);
});

test("S-kit-catalog 9: listing the kit in a real Host makes no network request", { timeout: 120_000 }, async t => {
  const h = await kitHost(t), original = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => { fetched++; return original(...args); }) as typeof fetch;
  try { await h.kit(); } finally { globalThis.fetch = original; }
  assert.equal(fetched, 0);
});

test("S-kit-catalog 10: an Agent cannot export a package or move prompt edits; a confirmation needs the person's own act", { timeout: 120_000 }, async t => {
  const h = await kitHost(t), agent = { ...h.person, audience: "agent" as const };
  const file: PromptOverridesFile = { format: "molis.prompt-overrides", format_version: 1, exported_at: new Date().toISOString(), overrides: [] };
  await assert.rejects(h.invoke(pluginPackageExport, { install_id: "any" }, agent), refused);
  await assert.rejects(h.invoke(promptOverrideActions.export, {}, agent), refused);
  await assert.rejects(h.invoke(promptOverrideActions.preview, { file }, agent), refused);
  await assert.rejects(h.invoke(promptOverrideActions.confirm, { preview_id: "x", row_ids: ["y"] }, agent), refused);
  const { preview_id } = await h.invoke<{ preview_id: string }>(promptOverrideActions.preview, { file });
  const { user_action: _drop, ...noAct } = h.person;
  await assert.rejects(h.invoke(promptOverrideActions.confirm, { preview_id, row_ids: ["y"] }, noAct), rejects("actions.forbidden"));
});

test("S-kit-catalog 10: a plugin's page cannot reach the package download", { timeout: 60_000 }, async t => {
  const a = homeProbe("kitexport");
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [a.definition] } });
  await grantHomeProbe(f.host, a);
  const opened = await f.request("/api/host/plugin-pages", { method: "POST", body: { plugin_id: a.id } });
  const { page_id } = await opened.json() as { page_id: string };
  const response = await f.request("/projects/any/api/plugin-trust/packages/any/export", { headers: { "x-molis-plugin-page": page_id } });
  assert.equal(response.status, 403, await response.text());
});

test("S-kit-catalog 12: a prompt edits preview is the maker's, in their project, once; a stale row is not applied; a file over the limit is refused", { timeout: 120_000 }, async t => {
  const h = await kitHost(t);
  const target = (await h.kit()).entries.find(entry => entry.kind === "prompt")!;
  if (target.kind !== "prompt") throw new Error("no prompt");
  const fileOf = (rows: number, base_version = 9999): PromptOverridesFile => ({ format: "molis.prompt-overrides", format_version: 1, exported_at: new Date().toISOString(),
    overrides: Array.from({ length: rows }, () => ({ ...target.ref, title: "x", base_version, body: "改过" })) });
  type Preview = { preview_id: string; rows: Array<{ row_id: string; status: string; default_version: number | null }> };
  const stale = await h.invoke<Preview>(promptOverrideActions.preview, { file: fileOf(1) });
  await assert.rejects(h.invoke(promptOverrideActions.confirm, { preview_id: stale.preview_id, row_ids: [stale.rows[0]!.row_id] }), rejects("agent_definitions.overrides_row_not_applicable"));
  const fresh = await h.invoke<Preview>(promptOverrideActions.preview, { file: fileOf(1, stale.rows[0]!.default_version!) });
  const confirm = (caller: ActionCallContext) => h.invoke(promptOverrideActions.confirm, { preview_id: fresh.preview_id, row_ids: [fresh.rows[0]!.row_id] }, caller);
  await assert.rejects(confirm({ ...h.person, actor_id: "someone-else" }), rejects("agent_definitions.overrides_preview_unknown"));
  await assert.rejects(confirm({ ...h.person, project_id: h.f.other.project_id }), error => rejects("agent_definitions.overrides_preview_unknown")(error) || refused(error) || rejects("actions.scope_mismatch")(error));
  await confirm(h.person);
  await assert.rejects(confirm(h.person), rejects("agent_definitions.overrides_preview_unknown"), "used once");
  await assert.rejects(h.invoke(promptOverrideActions.preview, { file: fileOf(201) }), rejects("actions.input_invalid"));
});

test("S-content-package: installing a content package changes no prompt's effective body or edit record", { timeout: 120_000 }, async t => {
  const h = await kitHost(t);
  const before = await h.invoke<PromptOverridesFile>(promptOverrideActions.export, {});
  const bodies = async () => (await h.kit()).entries.filter(entry => entry.kind === "prompt").map(entry => [entry.key, entry.kind === "prompt" && entry.prompt.edited, entry.version.label]);
  const was = await bodies();
  await h.install();
  assert.deepEqual((await h.invoke<PromptOverridesFile>(promptOverrideActions.export, {})).overrides, before.overrides);
  assert.deepEqual((await bodies()).filter(row => was.some(old => old[0] === row[0])), was);
});
