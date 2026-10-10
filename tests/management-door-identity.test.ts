import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { MolisWorkServer, withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, runV1Cli } from "@molis-ai/molis-work-app-local-host";
import { MCP_TOOLS } from "@molis-ai/molis-work-app-mcp";
import { goalTreeCapabilities, goalsActions, managementTreeAuthority } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostCapabilityDefinition, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { pluginDevelopmentCapability } from "@molis-ai/molis-work-contracts/platform/tooling";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";

/**
 * The management door (the CLI, the typed Host client, the management MCP) has no caller identity of its own: the Host records
 * the person on this machine and refuses an identity carried in the arguments (repository-anti-corruption §9.5 #6). The structure
 * decision and the plugin development run are two more entries of that door.
 */
const IDENTITY_FIELDS = [{ runtime_actor_id: "forged-runtime" }, { actor_id: "someone-else" }, { actor_kind: "runtime" }, { audit_actor_id: "runtime:forged:session" },
  { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }];

async function structureProject(name: string) {
  const home = await mkdtemp(join(tmpdir(), `management-door-${name}-`));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: name, actor_id: LOCAL_PERSON_ACTOR_ID }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id;
  const runtime = bindActionClient(host.actionClient(ref), () => ({ actor_id: "runtime:writer", audit_actor_id: "runtime:writer:session", actor_kind: "runtime",
    audience: "agent", project_id, permissions: ["goals:read", "goals:write"], runtime_session_id: "session" }));
  await runtime.invoke(goalsActions.create, { goal_id: "draft", title: "整理入口", outcome: "提案先保存，用户决定后生效", idempotency_key: "start" });
  const proposal = (await typed.invoke(goalTreeCapabilities.submitGoalTreeProposal, [{ project_id, summary: "拆一个子目标", idempotency_key: "propose", root_goal_id: "draft",
    items: [{ item_id: "child", kind: "goal", operation: "create", payload: { goal_id: "child", title: "子目标", outcome: "结果" }, source_refs: ["runtime"], reason: "需要", confidence: 0.9 }] }])).proposal;
  const decision = (key: string) => ({ project_id, proposal_id: proposal.proposal_id, decisions: [{ item_id: "child", decision: "confirm" as const }], reason: "确认", idempotency_key: key,
    authority: managementTreeAuthority(project_id, key, { conversation_ref: "conversation://identity", message_ref: "message://confirm" }) });
  const decisions = async () => (await typed.invoke(goalTreeCapabilities.listGoalTreeProposals, [{ project_id, proposal_id: proposal.proposal_id }])).proposals[0]!.decisions;
  return { home, ref, host, typed, project_id, proposal, decision, decisions, databasePath: project.database_path,
    done: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

test("a structure decision through the typed management entry is recorded as the person on this machine, and refuses an identity in its arguments", async () => {
  const { typed, decision, decisions, done } = await structureProject("typed");
  try {
    for (const identity of IDENTITY_FIELDS) {
      await assert.rejects(typed.invoke(goalTreeCapabilities.decideGoalTreeProposal, [{ ...decision("forged"), ...identity }] as never), { code: "actions.input_invalid" }, `refuses ${Object.keys(identity).join(" and ")}`);
    }
    // An identity named inside the authority is not accepted either: the Host fixes who decides.
    for (const authority of [{ actor_id: "someone-else" }, { authority_source: "web" }, { actor_kind: "runtime" }]) {
      await assert.rejects(typed.invoke(goalTreeCapabilities.decideGoalTreeProposal, [{ ...decision("forged-authority"), authority: { ...decision("forged-authority").authority, ...authority } }] as never),
        { code: "goal_tree_proposal.authority_source_invalid" }, `refuses ${Object.keys(authority).join(" and ")} in the authority`);
    }
    assert.deepEqual(await decisions(), [], "a refused call decides nothing");

    const decided = await typed.invoke(goalTreeCapabilities.decideGoalTreeProposal, [decision("decide")]);
    assert.deepEqual(decided.applied_item_ids, ["child"]);
    const recorded = await decisions();
    assert.deepEqual(recorded.map(item => [item.actor_id, item.authority_source, item.runtime_actor_id]), [[LOCAL_PERSON_ACTOR_ID, "management", null]],
      "the person on this machine decided through the management door, and no Runtime relayed it");
    assert.equal((await typed.invoke(goalTreeCapabilities.decideGoalTreeProposal, [decision("decide")])).replayed, true, "the same key replays");
  } finally { await done(); }
});

test("the CLI's goal-tree-decide and the management MCP's goal_tree_decide refuse a runtime_actor_id or any other identity, and decide nothing", async () => {
  const { host, typed, decision, decisions, project_id, proposal, databasePath, done } = await structureProject("doors");
  const management = new MolisWorkServer("management", null, null, host);
  try {
    const payload = decision("door");
    const { authority, ...business } = payload;
    const evidence = { conversation_ref: authority.conversation_ref, message_ref: authority.message_ref };
    for (const identity of IDENTITY_FIELDS) {
      await assert.rejects(() => runV1Cli(["goal-tree-decide", "--db", databasePath, "--json", JSON.stringify({ ...business, authority: evidence, ...identity })], { localHost: host }),
        (error: unknown) => (error as { code?: string }).code === "actions.input_invalid", `the CLI refuses ${Object.keys(identity).join(" and ")}`);
      await assert.rejects(() => management.callTool("molis_work_v1_goal_tree_decide", { ...business, database_path: databasePath, authority: evidence, ...identity }),
        (error: unknown) => (error as { code?: string }).code === "actions.input_invalid", `the management MCP refuses ${Object.keys(identity).join(" and ")}`);
    }
    assert.deepEqual(await decisions(), [], "no refused call decided anything");

    const decided = JSON.parse(await management.callTool("molis_work_v1_goal_tree_decide", { ...business, database_path: databasePath, authority: evidence })) as { applied_item_ids: string[] };
    assert.deepEqual(decided.applied_item_ids, ["child"]);
    assert.deepEqual((await decisions()).map(item => [item.actor_id, item.runtime_actor_id]), [[LOCAL_PERSON_ACTOR_ID, null]]);
    assert.equal(proposal.project_id, project_id);
    assert.equal((await typed.invoke(goalTreeCapabilities.listGoalTreeProposals, [{ project_id, proposal_id: proposal.proposal_id }])).proposals[0]!.decisions.length, 1);
  } finally { await management.close(); await done(); }
});

test("the management MCP's goal_tree_decide schema names no identity", () => {
  const tool = MCP_TOOLS.find(item => item.name === "molis_work_v1_goal_tree_decide");
  assert.ok(tool, "the management tool is listed");
  const properties = Object.keys((tool.inputSchema as { properties: Record<string, unknown> }).properties);
  assert.deepEqual(properties.filter(name => ["actor_id", "actor_kind", "audit_actor_id", "runtime_actor_id"].includes(name)), []);
  const authority = (tool.inputSchema as { properties: Record<string, { properties: Record<string, unknown> }> }).properties.authority!.properties;
  assert.deepEqual(Object.keys(authority).sort(), ["conversation_ref", "message_ref", "prompted_proposal_id", "whole_confirmation_prompted"], "the authority points at the conversation; it does not name who decides");
});

/** A plugin that lists these entries under capabilities.consumes would otherwise be recorded as the person, or run unsigned code with the grants it names. */
test("a plugin that lists the structure decision or the plugin development run under consumes is refused", async () => {
  const { typed, decision, decisions, project_id, done } = await structureProject("plugin");
  const asPlugin = (actor_id: string): HostCapabilityCallOptions => ({ consumer: "plugin", before_effect: async () => {},
    plugin_caller: { plugin_id: "io.molis.work.test.door-writer", install_id: "install-1", actor_id, project_id,
      declaration: { manifest: {} as HostPluginCaller["declaration"]["manifest"] }, assertActive: () => {} } });
  try {
    const entries = [
      { name: "decide structure proposal", capability: goalTreeCapabilities.decideGoalTreeProposal as HostCapabilityDefinition<unknown, unknown>, input: [decision("plugin-decide")] as unknown },
      { name: "run plugin development", capability: pluginDevelopmentCapability as HostCapabilityDefinition<unknown, unknown>,
        input: { directory: "/nonexistent", project_id, grants: [], allow_unsigned_development: true } as unknown },
    ];
    assert.deepEqual(entries.filter(entry => entry.capability.host_only !== true).map(entry => entry.name), [], "every one of them is flagged host_only");
    const manifest = { ...filesManifest, plugin_id: "io.molis.work.test.door-writer", capabilities: { provides: [], consumes: entries.map(entry => entry.capability.capability_id) } };
    const sdk = createPluginCapabilityClient(manifest, typed);
    for (const { name, capability, input } of entries) {
      const available = sdk.availability(capability);
      assert.equal(available.available, false, `${name} is not available to a plugin`);
      assert.equal(!available.available && available.code, "actions.host_only", name);
      await assert.rejects(sdk.invoke(capability, input), { code: "actions.host_only" }, `${name}: through the plugin client`);
      await assert.rejects(sdk.invoke({ ...capability, host_only: false }, input), { code: "actions.host_only" }, `${name}: through an unflagged copy`);
      await assert.rejects(typed.invoke(capability, input, asPlugin("plugin-person")), { code: "actions.host_only" }, `${name}: with the plugin's own call context`);
    }
    assert.deepEqual(await decisions(), [], "nothing was decided");
  } finally { await done(); }
});

test("the plugin development run takes no actor: one named in its arguments is refused, and the Host records its own", async () => {
  const { typed, project_id, done } = await structureProject("development");
  try {
    for (const identity of [{ actor_id: "someone-else" }, { actor_id: LOCAL_PERSON_ACTOR_ID }, { actor_kind: "user" }, { audit_actor_id: "runtime:forged:session" }]) {
      await assert.rejects(typed.invoke(pluginDevelopmentCapability, { directory: "/nonexistent", project_id, grants: [], allow_unsigned_development: true, ...identity } as never),
        { code: "actions.input_invalid" }, `refuses ${Object.keys(identity).join(" and ")}`);
    }
    // The project is the one the client opened: another project in the arguments is a scope mismatch, checked before the identity.
    await assert.rejects(typed.invoke(pluginDevelopmentCapability, { directory: "/nonexistent", project_id: "foreign", grants: [], allow_unsigned_development: true, actor_id: "someone-else" } as never),
      { code: "actions.scope_mismatch" });
    // Without an identity the call gets as far as the directory it was asked to load: the refusal above came first.
    await assert.rejects(typed.invoke(pluginDevelopmentCapability, { directory: "/nonexistent", project_id, grants: [], allow_unsigned_development: true }),
      (error: unknown) => (error as { code?: string }).code !== "actions.input_invalid");
  } finally { await done(); }
});

/** Type errors a small caller gets from the built declarations. The test runner strips types, so the types are checked here. */
function typeErrors(source: string): string[] {
  const file = fileURLToPath(new URL("./management-door-types.virtual.ts", import.meta.url));
  const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["node"],
    typeRoots: [fileURLToPath(new URL("../node_modules/@types", import.meta.url))] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => name === file ? ts.createSourceFile(file, source, rest[0], true) : read(name, ...rest);
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .filter(diagnostic => !diagnostic.file || diagnostic.file.fileName === file)
    .map(diagnostic => `line ${diagnostic.file ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start ?? 0).line + 1 : 0}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
}

test("the structure decision and plugin development entries are typed without an identity, so a caller that follows the types is not refused", { timeout: 180_000 }, () => {
  const source = `
import type { HostCapabilityInput } from "@molis-ai/molis-work-contracts/platform/app-host";
import { pluginDevelopmentCapability } from "@molis-ai/molis-work-contracts/platform/tooling";
import { goalTreeCapabilities } from "@molis-ai/molis-work-plugin-goals";
type Identity = "actor_id" | "actor_kind" | "audit_actor_id" | "runtime_actor_id";
type KeysOf<Input> = Input extends readonly [infer First, ...unknown[]] ? keyof First : keyof Input;
type Free<Input> = [Extract<KeysOf<Input>, Identity>] extends [never] ? true : false;
export const decideFree: Free<HostCapabilityInput<typeof goalTreeCapabilities.decideGoalTreeProposal>> = true;
export const developmentFree: Free<HostCapabilityInput<typeof pluginDevelopmentCapability>> = true;
`;
  assert.deepEqual(typeErrors(source), []);
});
