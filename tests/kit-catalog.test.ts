import assert from "node:assert/strict";
import test from "node:test";
import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitCatalog, KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { pluginAgentRegistration, pluginControlActions, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { AGENT_TOOLS } from "@molis-ai/molis-work-service-agent-host";
import { CONTENT_PLUGIN_ID, signedContentPackage } from "./fixtures/content-package.js";
import { kitHost } from "./fixtures/kit-host.js";
import { newPublisher } from "./fixtures/sandbox-package.js";

// The AI kit (specs/capability-pack/contract-design.md §4, §7): `kit.catalog.list@1` over a real Host, real owners and a real content
// package; packs are gathered on every call from the owners' reports, nothing is stored.

const CODING = "io.molis.work.coding";

const packOf = (kit: KitCatalog, pluginId: string) => kit.packs.find(pack => pack.source?.plugin_id === pluginId)!;
const entry = (kit: KitCatalog, key: string) => kit.entries.find(row => row.key === key)!;
const entriesOf = (kit: KitCatalog, pack: KitPack, keys: readonly string[]) => keys.map(key => entry(kit, key));

test("CPK-01 CPK-02 CPK-13: plugin packs, Molis Work's own and your characters; each with roles and their prompts, Skills and tools, stamped by owner", { timeout: 120_000 }, async t => {
  const h = await kitHost(t);
  await h.install();
  const kit = await h.kit();
  assert.deepEqual(kit.issues, []);
  assert.ok(kit.packs.some(pack => pack.pack_id === "system:builtin") && kit.packs.some(pack => pack.pack_id === "system:characters"));
  // Molis Work's own pack: the personal assistant with its prompts, and every Agent tool once.
  const builtin = kit.packs.find(pack => pack.pack_id === "system:builtin")!;
  const assistant = kit.entries.find(row => row.kind === "role" && row.ref.kind === "assistant")!;
  assert.equal(assistant.pack, "system:builtin");
  const assistantRow = builtin.roles.find(row => row.role === assistant.key)!;
  assert.ok(assistantRow.prompts.length > 0, "the assistant's own prompts hang under it");
  assert.deepEqual(entriesOf(kit, builtin, builtin.tools).map(tool => tool.kind === "tool" && tool.ref.tool).sort(), AGENT_TOOLS.map(tool => tool.name).sort());
  assert.ok(entriesOf(kit, builtin, builtin.tools).every(tool => tool.pack === "system:builtin" && tool.usage.kind === "not_counted"));
  // Coding's pack: its roles, each with the prompts it names, and the tools its roles name; stamped from its install record.
  const coding = packOf(kit, CODING);
  assert.equal(coding.kind, "plugin");
  assert.ok(coding.roles.length > 0);
  for (const row of coding.roles) {
    const role = entry(kit, row.role);
    if (role.kind !== "role" || role.ref.kind !== "plugin") continue;
    assert.equal(role.source.kind === "plugin" && role.source.install_id, coding.source!.install_id);
    for (const key of row.prompts) {
      const prompt = entry(kit, key);
      assert.ok(prompt.kind === "prompt" && (prompt.prompt.roles.length === 0 || prompt.prompt.roles.some(ref => ref.kind === "plugin" && ref.role_id === role.ref.role_id)));
    }
  }
  // The personal assistant's row refers to Molis Work's own pack: its tools are not Coding's.
  const named = new Set(coding.roles.flatMap(row => { const role = entry(kit, row.role); return role.kind === "role" && role.pack === coding.pack_id ? role.role.host_tools : []; }));
  assert.deepEqual(entriesOf(kit, coding, coding.tools).map(tool => tool.kind === "tool" ? tool.ref.tool : "").sort(), [...named].filter(name => AGENT_TOOLS.some(tool => tool.name === name)).sort());
  // The content package's pack: its Skill entries are the catalog's own, field by field (CPK-01), with the same ref and pack version (CPK-02).
  const content = packOf(kit, CONTENT_PLUGIN_ID);
  const { skills } = await h.invoke<{ skills: SkillCatalogEntry[] }>(skillCatalogActions.list, {});
  const fromCatalog = skills.filter(skill => skill.pack.plugin_id === CONTENT_PLUGIN_ID);
  assert.deepEqual(entriesOf(kit, content, content.skills).map(row => row.kind === "skill" && row.skill), fromCatalog);
  assert.ok(entriesOf(kit, content, content.skills).every(row => row.source.kind === "plugin" && row.source.install_id === fromCatalog[0]!.ref.install_id && row.reporter.provider_id === "system.skills"));
});

test("CPK-03 CPK-14: a pack has no switch; its state is read from its plugin and what it holds", { timeout: 120_000 }, async t => {
  const h = await kitHost(t);
  await h.install();
  const before = packOf(await h.kit(), CONTENT_PLUGIN_ID);
  assert.ok(["active", "attention"].includes(before.state.kind));
  assert.equal(Object.keys(before).some(key => /^(?:enabled|switch|on|active)$/u.test(key)), false, "no switch field on a pack");
  await h.invoke(pluginControlActions.disable, { plugin_id: CONTENT_PLUGIN_ID });
  assert.deepEqual(packOf(await h.kit(), CONTENT_PLUGIN_ID).state, { kind: "disabled" });
  // Taken off at the project settings door, naming the row's installation (S-94, BL-915).
  const rows = await h.invoke<{ plugins: Array<{ plugin_id: string; uninstall_target?: unknown }> }>(pluginInstallActions.installed, {});
  const target = rows.plugins.find(row => row.plugin_id === CONTENT_PLUGIN_ID)!.uninstall_target;
  const removed = await h.f.call(h.f.project.project_id, "/api/plugin-trust/installed/uninstall", { plugin_id: CONTENT_PLUGIN_ID, keep_data: true, target });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const gone = await h.kit(), header = packOf(gone, CONTENT_PLUGIN_ID);
  assert.deepEqual(header.state, { kind: "uninstalled" });
  assert.deepEqual([header.roles, header.skills, header.mcp, header.tools], [[], [], [], []], "only the header is left");
  assert.equal(gone.entries.some((row: KitEntry) => row.pack === header.pack_id), false);
});

test("CPK-04: prompts count their recent uses with the rows kept per key; tools are never counted; characters say their last run", { timeout: 120_000 }, async t => {
  const h = await kitHost(t);
  const kit = await h.kit();
  for (const row of kit.entries) {
    if (row.kind === "prompt") assert.ok(row.usage.kind === "none" || row.usage.kind === "recent" && "rows_per_key" in row.usage.kept && row.usage.kept.rows_per_key === 200, row.key);
    if (row.kind === "tool") assert.equal(row.usage.kind, "not_counted", row.key);
    if (row.kind === "role" && row.source.kind === "character") assert.ok(["last_only", "none"].includes(row.usage.kind), row.key);
  }
});

test("CPK-13: an instruction naming a role its owner does not declare refuses the owner's registration", () => {
  const instruction = { owner_id: "io.example.brief", prompt_id: "brief", version: 1, title: "简报", purpose: "写简报", used_by: [], body: "写一份简报。", role_id: "ghost" };
  assert.throws(() => pluginAgentRegistration({ manifest: { plugin_id: "io.example.brief" }, instructions: [instruction] } as never,
    { kind: "plugin", plugin_id: "io.example.brief", plugin_version: "1.0.0", title: "Brief" } as never),
  (error: { code?: string; details?: Record<string, unknown> }) => error.code === "agent_definitions.instruction_role_unknown" && error.details?.role_id === "ghost");
});

test("CPK-14: a Skill whose requirement is not met puts its pack in attention pointing at it; a tool two packs' roles name is one entry in both", { timeout: 120_000 }, async t => {
  const h = await kitHost(t);
  await h.install(signedContentPackage(newPublisher(), { requires: [{ capability_id: "nowhere.connection", version: 1, optional: false, reason: "需要一个连接" }] }));
  const kit = await h.kit(), content = packOf(kit, CONTENT_PLUGIN_ID);
  assert.equal(content.state.kind, "attention");
  assert.deepEqual(content.state.kind === "attention" && content.state.items.map(item => item.entry), content.skills);
  const coding = packOf(kit, CODING), shared = coding.tools.find(key => kit.packs.find(pack => pack.pack_id === "system:builtin")!.tools.includes(key))!;
  const tool = entry(kit, shared);
  assert.equal(kit.entries.filter(row => row.key === shared).length, 1);
  assert.ok(tool.kind === "tool" && tool.in_packs?.includes("system:builtin") && tool.in_packs.includes(coding.pack_id));
});
