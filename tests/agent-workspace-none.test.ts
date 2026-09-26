import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, type AgentStartAuthority } from "../horizontal/agent-host/src/index.js";
import { PrologueAgentAdapter, type PrologueRuntimePort, type PrologueStartInput, type PrologueRestoredSession } from "../horizontal/agent-host/src/adapters/prologue.js";
import { CliAgentAdapter } from "../horizontal/agent-host/src/adapters/cli-runtime.js";
import { inspectAgentDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentStartRequest, AgentFrozenCharacter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { importedCharacterInstructions } from "../horizontal/agent-host/src/character-import.js";

const owner = { board_id: "board", plugin_id: "unknown.inference", install_id: "installation", actor_id: "user" };
const directory = { canonical_path: "/authorized", realpath_verified: true };
const authority: AgentStartAuthority = { authorizedDirectories: [directory.canonical_path], manifest: {
  roles: [{ role_id: "analyst", version: 1, name: "Analyst", execution: "read-only", workspace: "none", host_tools: [], prompts: ["analyst"] },
    { role_id: "reader", version: 1, name: "Reader", execution: "read-only", prompts: ["analyst"] }],
  prompts: [{ prompt_id: "analyst", version: 1 }],
}, prompts: [{ prompt_id: "analyst", version: 1, body: "Analyze only the supplied text." }] };

function fixture(workspaceNone = true, selectModel?: () => Promise<void>) {
  const stored = new Map<string, PrologueRestoredSession>(), starts: PrologueStartInput[] = [];
  const runtime: PrologueRuntimePort = { workspaceNone, sessions: {
    async create(input) { const id = `s${stored.size + 1}`; stored.set(id, { title: input.title, owner: { ...owner, actor_id: input.actor_id }, workspace: input.workspace ?? "required", runs: [] }); return { ref: { id } }; },
    async restore(id) { return stored.get(id); },
  }, async startAgentRun(input) {
    await input.beforeDispatch?.();
    starts.push(input); const ref = { session_id: input.session_id, run_id: `r${starts.length}` };
    stored.get(input.session_id)!.runs.push({ ref, frozen: input.provenance.frozen, started_at: input.provenance.started_at, task: input.task,
      events: [{ type: "text-delta", text: "A grounded finding" }, { type: "completed" }] });
    return { run: { ref: { id: ref.run_id }, subscribe(fn) { fn({ type: "text-delta", text: "A grounded finding" }); fn({ type: "completed" }); return () => {}; }, async cancel() {} },
      control: { state: "completed", stop() {}, pause() {}, resume() {}, steer() {}, subscribe() { return () => {}; } } };
  }, async shutdown() {} };
  const make = () => { const adapter = new PrologueAgentAdapter({ runtime, async modelConfiguration() { await selectModel?.(); return { protocol: "anthropic-compatible", endpoint: "https://model.example/messages", model: "fixture", credential_ref: "fixture" }; } }); const host = new AgentHost(); host.register(adapter); return { host, adapter }; };
  return { ...make(), make, starts, stored };
}

test("an explicitly declared inference role runs and restores its original session without any workspace grant", async () => {
  const f = fixture();
  const session = await f.host.createSession("prologue", { ...owner, workspace: "none", role_id: "analyst", title: "Analysis" }, authority);
  const request: AgentStartRequest = { ...owner, workspace: "none", session, role_id: "analyst", task: "Find the change",
    text_materials: [{ material_id: "material", title: "Evidence", text: "A verified update", source_artifact_id: "original", source_version: 1 }] };
  const run = await f.host.start("prologue", request, authority);
  assert.equal(run.frozen.workspace, "none"); assert.equal(run.frozen.directory, undefined);
  assert.equal(f.starts[0]!.root_path, undefined); assert.deepEqual(f.starts[0]!.character.tools, []);
  assert.equal(f.starts[0]!.text_materials![0]!.text, "A verified update");
  const restarted = f.make();
  const restored = await restarted.adapter.readSession(session);
  assert.equal(restored.workspace, "none"); assert.deepEqual(restored.owner, owner);
  assert.equal(restored.latest_run!.phase, "completed"); assert.match(restored.latest_run!.turns.at(-1)!.text, /grounded finding/);
  await restarted.host.start("prologue", request, authority); assert.equal(f.starts.length, 2);
});

function deferred() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
function characterAuthority() {
  let active = true;
  const character: AgentFrozenCharacter = { reference: { artifact_id: "character:original", version: 2 }, character_id: "original", title: "Analyst",
    instructions: "Use only the supplied evidence.", host_tools: [], board_id: owner.board_id, content_digest: "original-content",
    source: { owner_actor_id: owner.actor_id, draft_revision: 3 }, published_at: "2026-09-26T00:00:00Z",
    producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.0.0", binding_signature: "original-binding" } };
  const granted: AgentStartAuthority = { ...authority, manifest: { ...authority.manifest,
    characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["analyst", "reader"] } },
    resolveCharacter() { if (!active) throw new Error("Character disabled"); return character; } };
  return { granted, character, activate(value: boolean) { active = value; } };
}

for (const workspace of ["none", "required"] as const) test(`${workspace} Character revoked during model selection cannot dispatch without action tools`, async () => {
  const entered = deferred(), release = deferred(), c = characterAuthority();
  const f = fixture(true, async () => { entered.resolve(); await release.promise; });
  const scope = workspace === "none" ? { workspace, role_id: "analyst" } : { directory, role_id: "reader" };
  const session = await f.host.createSession("prologue", { ...owner, ...scope, title: "Analysis" }, c.granted);
  const request: AgentStartRequest = { ...owner, ...scope, session, task: "Analyze", character: c.character.reference };
  const pending = f.host.start("prologue", request, c.granted);
  const rejected = assert.rejects(pending, /Character disabled/);
  await entered.promise; c.activate(false); release.resolve(); await rejected;
  assert.equal(f.starts.length, 0);
  assert.deepEqual((await f.adapter.readSession(session)).runs, []);
  c.activate(true); await f.host.start("prologue", request, c.granted);
  assert.equal(f.starts.length, 1, "the original Character can run after explicit reactivation");
});

test("none Character remains guarded after startup and is rechecked after awaited dispatch authority", async () => {
  const f = fixture(), c = characterAuthority(), entered = deferred(), release = deferred();
  let starting = true, delay = false;
  c.granted.beforeStart = () => { assert.ok(starting, "startup authority must not be reused for later dispatch"); };
  c.granted.beforeDispatch = async () => { if (delay) { entered.resolve(); await release.promise; } };
  const session = await f.host.createSession("prologue", { ...owner, workspace: "none", role_id: "analyst", title: "Analysis" }, c.granted);
  await f.host.start("prologue", { ...owner, workspace: "none", role_id: "analyst", session, task: "Analyze", character: c.character.reference }, c.granted);
  starting = false; delay = true;
  const dispatch = f.starts[0]!.beforeDispatch!;
  const rejected = assert.rejects(async () => dispatch(), /Character disabled/);
  await entered.promise; c.activate(false); release.resolve(); await rejected;
  c.activate(true); await dispatch();
  const original = structuredClone(c.character);
  for (const change of [
    () => { c.character.reference.artifact_id = "replacement"; },
    () => { c.character.reference.version = 3; },
    () => { c.character.content_digest = "changed"; },
    () => { c.character.board_id = "another-board"; },
    () => { c.character.source.owner_actor_id = "another-owner"; },
  ]) {
    change(); await assert.rejects(async () => dispatch(), /原 Character 版本已变化/);
    Object.assign(c.character, structuredClone(original));
  }
  await dispatch();
});

test("no workspace is an immutable declared role and session contract, never a caller bypass", async () => {
  const f = fixture();
  await assert.rejects(f.host.createSession("prologue", { ...owner, workspace: "none", role_id: "reader", title: "Bad" }, authority), /没有声明/);
  await assert.rejects(f.host.createSession("prologue", { ...owner, workspace: "none", role_id: "analyst", directory, title: "Bad" } as never, authority), /不能携带目录/);
  const session = await f.host.createSession("prologue", { ...owner, workspace: "none", role_id: "analyst", title: "Analysis" }, authority);
  const request: AgentStartRequest = { ...owner, workspace: "none", session, role_id: "analyst", task: "Analyze" };
  for (const extra of [{ directory }, { action_tools: [{ capability_id: "a", version: 1, provider_id: "p" }] }, { mcp_sources: [{}] }, { skills: [{}] }, { subagent_workspaces: [{}] }]) {
    await assert.rejects(f.host.start("prologue", { ...request, ...extra } as never, authority), /不能选择/);
  }
  for (const field of ["board_id", "plugin_id", "install_id", "actor_id"] as const) await assert.rejects(f.host.start("prologue", { ...request, [field]: "foreign" }, authority), /原会话/);
  await assert.rejects(f.host.start("prologue", { ...request, workspace: "required", role_id: "reader", directory }, authority), /原会话/);
  const required = await f.host.createSession("prologue", { ...owner, directory, title: "Workspace" }, authority);
  await assert.rejects(f.host.start("prologue", { ...request, session: required }, authority), /原会话/);
  assert.equal(f.starts.length, 0);
  const unavailable = fixture(false); assert.equal(unavailable.host.availableRoles("prologue", authority.manifest)[0]!.available, false);
  await assert.rejects(unavailable.host.createSession("prologue", { ...owner, workspace: "none", role_id: "analyst", title: "Bad" }, authority), /尚未接通/);
  const invalid = structuredClone(authority.manifest); invalid.roles[0]!.host_tools = ["read-file"];
  assert.ok(inspectAgentDeclaration(invalid, []).some(reason => reason.includes("无工作区")));
  await assert.rejects(f.host.start("prologue", request, { ...authority, manifest: invalid }), /没有声明/);
});

test("CLI refuses an omitted directory and project-scoped imported Character text cannot escape its root", async () => {
  let spawns = 0;
  const cli = new CliAgentAdapter({ runtime_id: "cli", display_name: "CLI", command: "fixture", async model() { return "fixture"; },
    process: { async version() { return "1"; }, spawn() { spawns++; throw new Error("Unexpected spawn"); } } });
  await assert.rejects(cli.createSession({ ...owner, workspace: "none", role_id: "analyst", title: "Bad" }), /工作目录/);
  await assert.rejects(cli.start({ ...owner, workspace: "none", role_id: "analyst", task: "Bad", session: { session_id: "any", runtime_id: "cli" } }), /工作目录/);
  assert.equal(spawns, 0);
  const character = { instructions: "Keep references", import_snapshot: { project_root: "/original", rules: [], skills: [] } } as never;
  assert.throws(() => importedCharacterInstructions(character, undefined, []), /原项目目录/);
  assert.match(importedCharacterInstructions({ ...character as object, import_snapshot: { rules: [], skills: [] } } as never, undefined, []), /Keep references/);
});
