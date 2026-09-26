import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, emptyCapabilityMatrix, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentFrozenCharacter, AgentStartRequest, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { inspectAgentDeclaration, promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";

function fixture() {
  const character: AgentFrozenCharacter = { reference: { artifact_id: "character:board:profile", version: 2 }, character_id: "profile", title: "Verifier",
    instructions: "Verify results. Mark unknowns explicitly.", host_tools: ["read-file"], source: { owner_actor_id: "user", draft_revision: 3 },
    board_id: "board", content_digest: "fixed-digest", producer: { plugin_id: "io.molis.work.characters", plugin_version: "1.0.0", binding_signature: "official-characters-binding" }, published_at: "2026-09-22T00:00:00Z" };
  const authority: AgentStartAuthority = { authorizedDirectories: ["/tmp/ws"],
    manifest: { roles: [{ role_id: "reader", version: 1, name: "Reader", prompts: ["base", "reader"], host_tools: ["read-file", "search"] }],
      prompts: [{ prompt_id: "base", version: 1, layer: "base" }, { prompt_id: "reader", version: 1, layer: "role" }],
      characters: { selection: "optional-exact-artifact", scope: "project-owner", role_ids: ["reader"] } },
    prompts: [{ prompt_id: "base", version: 1, layer: "base", body: "base" }, { prompt_id: "reader", version: 1, layer: "role", body: "reader" }],
    project_prompts: [{ prompt_id: "project", version: 1, body: "project" }], resolveCharacter: () => character };
  const request: AgentStartRequest = { session: { runtime_id: "probe", session_id: "s" }, board_id: "board", plugin_id: "caller", install_id: "i", actor_id: "user",
    task: "Read the repository.", role_id: "reader", directory: { canonical_path: "/tmp/ws", realpath_verified: true }, character: character.reference };
  const captured: AgentStartRequest[] = []; let cancelled = 0, widen = false;
  const host = new AgentHost();
  host.register({ descriptor: { runtime_id: "probe", display_name: "Probe", provider_version: "1", supports_action_tools: true, capabilities: { ...emptyCapabilityMatrix(), "run.start": "supported", skills: "supported" } },
    async readSession(session) { return { session, owner: { board_id: "board", plugin_id: "caller", install_id: "i", actor_id: "user" }, title: "Read", runs: [], latest_run: null }; },
    async start(input) {
      captured.push(input); const role = input.role!;
      return { ref: { run_id: "r", session_id: "s" }, frozen: { role_id: role.role_id, role_version: role.version, execution: role.execution, model_id: "fixture",
        ...(input.action_tools === undefined ? {} : { action_tools: structuredClone(input.action_tools) }),
        ...(role.character ? { character: structuredClone(role.character) } : {}), ...(role.character_skill_ids === undefined ? {} : {character_skill_ids: [...role.character_skill_ids]}), prompts: role.prompts.map(p => ({ prompt_id: p.prompt_id, version: p.version, layer: promptLayerOf(p) })),
        host_tools: widen ? ["read-file", "run-command"] : [...role.host_tools], skills: [], mcp_tools: [], mcp_sources: [], text_materials: [], budget: null,
        ...(input.workspace === "none" ? { workspace: "none" as const } : { directory: input.directory }) } };
    }, async control() { cancelled++; },
  } as AgentRuntimeAdapter);
  return { host, authority, request, character, captured, cancelled: () => cancelled, widen: () => { widen = true; } };
}

test("Host freezes authoritative Character after built-in role and before project, narrows tools, ignores supplied role body", async () => {
  const f = fixture();
  f.request.role = { role_id: "forged", version: 99, execution: "workspace-write", prompts: [{ prompt_id: "forged", version: 99, body: "forged" }], host_tools: ["run-command"] };
  const result = await f.host.start("probe", f.request, f.authority);
  assert.deepEqual(f.captured[0]!.role!.prompts.map(p => p.body), ["base", "reader", f.character.instructions, "project"]);
  assert.equal(f.captured[0]!.task, f.request.task); assert.deepEqual(result.frozen.host_tools, ["read-file"]);
  assert.equal(result.frozen.execution, "read-only"); assert.deepEqual(result.frozen.character, f.character);
  f.character.instructions = "later edit"; f.character.host_tools!.push("search");
  assert.notEqual(result.frozen.character!.instructions, f.character.instructions);
  assert.deepEqual(f.captured[0]!.role!.host_tools, ["read-file"]);
});

test("no Character preserves ordinary execution and never calls the source resolver", async () => {
  const f = fixture(); f.request.character = null;
  f.authority.resolveCharacter = () => { throw new Error("should not resolve"); };
  const result = await f.host.start("probe", f.request, f.authority);
  assert.equal(result.frozen.character, undefined); assert.deepEqual(result.frozen.host_tools, ["read-file", "search"]);
  assert.deepEqual(f.captured[0]!.role!.prompts.map(p => p.body), ["base", "reader", "project"]);
});

test("undeclared, disallowed, wrong-owner, wrong-project, wrong-version and wider-tool Character selections never start", async () => {
  const cases = [
    (f: ReturnType<typeof fixture>) => { delete f.authority.manifest.characters; },
    (f: ReturnType<typeof fixture>) => { f.authority.manifest.characters!.role_ids = ["builder"]; },
    (f: ReturnType<typeof fixture>) => { f.character.source.owner_actor_id = "other"; },
    (f: ReturnType<typeof fixture>) => { f.character.board_id = "other"; },
    (f: ReturnType<typeof fixture>) => { f.character.reference = { ...f.character.reference, version: 9 }; },
    (f: ReturnType<typeof fixture>) => { f.character.host_tools = ["run-command"]; },
    (f: ReturnType<typeof fixture>) => { f.authority.resolveCharacter = () => { throw new Error("disabled"); }; },
  ];
  for (const change of cases) { const f = fixture(); change(f); await assert.rejects(f.host.start("probe", f.request, f.authority)); assert.equal(f.captured.length, 0); }
});

test("Character none-tools and inherit-tools stay distinct; adapter expansion is cancelled", async () => {
  const none = fixture(); none.character.host_tools = [];
  assert.deepEqual((await none.host.start("probe", none.request, none.authority)).frozen.host_tools, []);
  const inherit = fixture(); inherit.character.host_tools = null;
  assert.deepEqual((await inherit.host.start("probe", inherit.request, inherit.authority)).frozen.host_tools, ["read-file", "search"]);
  const liar = fixture(); liar.widen(); await assert.rejects(liar.host.start("probe", liar.request, liar.authority), /不一致/); assert.equal(liar.cancelled(), 1);
});

test("Character declaration cannot name undeclared roles or imply latest-version selection", () => {
  const f = fixture(); assert.deepEqual(inspectAgentDeclaration(f.authority.manifest, []), []);
  f.authority.manifest.characters!.role_ids = ["missing"];
  assert.ok(inspectAgentDeclaration(f.authority.manifest, []).some(message => message.includes("Character")));
  f.authority.manifest.characters = { selection: "latest" as never, scope: "project-owner", role_ids: ["reader"] };
  assert.ok(inspectAgentDeclaration(f.authority.manifest, []).some(message => message.includes("Character")));
});

test("a selected method cannot restore a tool removed by the Character", async () => {
  const f = fixture(), method = { skill_id: "needs-search", version: 1, name: "Search method", tools: ["search"] };
  f.authority.manifest.skills = [method]; f.authority.skills = [{ ...method, body: "Search the repository." }];
  f.request.skills = [{ skill_id: method.skill_id, version: 1 }];
  await assert.rejects(f.host.start("probe", f.request, f.authority), /未开放的工具/);
  assert.equal(f.captured.length, 0);
});

test("imported Character rules and text Skill attachments reach the adapter as frozen scoped instructions", async () => {
  const f = fixture();
  f.character.import_snapshot = { runtime_id: "codex", config_root: "/tmp/config", project_root: "/tmp/ws", captured_at: "2026-09-23T00:00:00Z",
    rules: [{ path: "/tmp/ws/AGENTS.md", scope: "project", condition: "only *.ts", content: "RULE_CONTENT" }],
    skills: [{ id: "skill", name: "Verifier", description: "Verify evidence", path: "/tmp/config/skills/verify", compatibility: "portable",
      files: [{ path: "SKILL.md", encoding: "utf8", content: "Use references/check.md" }, { path: "references/check.md", encoding: "utf8", content: "ATTACHMENT_CONTENT" }] }] };
  const result = await f.host.start("probe", f.request, f.authority);
  const body = f.captured[0]!.role!.prompts.map(p => p.body).join("\n");
  assert.match(body, /RULE_CONTENT/); assert.match(body, /only \*\.ts/); assert.match(body, /ATTACHMENT_CONTENT/);
  assert.match(body, /references\/check.md/); assert.match(body, /Verify results/);
  f.character.import_snapshot.skills[0]!.files[1]!.content = "LATER_EDIT";
  assert.equal(result.frozen.character!.import_snapshot!.skills[0]!.files[1]!.content, "ATTACHMENT_CONTENT");
});

test("incompatible imported skills, oversize content and other project scopes fail before a Run starts", async () => {
  for (const issue of ["native", "project", "size"]) {
    const f = fixture();
    f.character.import_snapshot = { runtime_id: "codex", config_root: "/tmp/config", project_root: issue === "project" ? "/tmp/ws-other" : "/tmp/ws", captured_at: "2026-09-23T00:00:00Z", rules: [],
      skills: [{ id: "s", name: "special", description: "", path: "/tmp/config/s", compatibility: issue === "native" ? "native-only" : "portable",
        files: [{ path: "SKILL.md", encoding: "utf8", content: issue === "size" ? "x".repeat(61_000) : "skill" }] }] };
    await assert.rejects(f.host.start("probe", f.request, f.authority), /内置引擎|项目范围/);
    assert.equal(f.captured.length, 0);
  }
});

test("per-run Character Skill selection excludes unused native packages while preserving the published source", async () => {
  const f = fixture();
  f.character.import_snapshot = { runtime_id:"codex",config_root:"/tmp/config",captured_at:"2026-09-23T00:00:00Z",rules:[],skills:[
    {id:"text",name:"Portable",description:"",path:"/tmp/config/text",compatibility:"portable",files:[{path:"SKILL.md",encoding:"utf8",content:"SELECTED_TEXT"}]},
    {id:"native",name:"Native",description:"",path:"/tmp/config/native",compatibility:"native-only",files:[{path:"SKILL.md",encoding:"utf8",content:"DO_NOT_LOAD"}]},
  ]};
  f.request.character_skill_ids=["text"];
  const result=await f.host.start("probe",f.request,f.authority);
  assert.deepEqual(result.frozen.character_skill_ids,["text"]);
  assert.deepEqual(result.frozen.character!.reference,f.character.reference);
  assert.equal(result.frozen.character!.import_snapshot!.skills.length,1);
  assert.equal(f.character.import_snapshot.skills.length,2);
  const body=f.captured[0]!.role!.prompts.map(p=>p.body).join("\n");assert.match(body,/SELECTED_TEXT/);assert.doesNotMatch(body,/DO_NOT_LOAD/);
});

const actionView: ActionView = { capability_id: "unknown.read", version: 1, operation: "query", provider: { provider_id: "unknown", kind: "plugin", title: "Unknown" },
  availability: { available: true }, action: { title: "Read", description: "Read the original record", kind: "query", scope: "project", audiences: ["agent"],
    permissions: [], subject_kinds: [], input_schema: { type: "object" } } };
const actionRef = { capability_id: actionView.capability_id, version: 1, provider_id: actionView.provider.provider_id };

test("Character only narrows explicit action selection; omitted, null and empty preserve their meaning", async () => {
  for (const scope of [undefined, null, [actionRef], []]) {
    const f = fixture(); f.character.action_tools = scope;
    let calls = 0;
    f.authority.actions = async () => { calls++; return { discover: async () => [actionView], invoke: async () => ({}) }; };
    assert.deepEqual((await f.host.start("probe", f.request, f.authority)).frozen.action_tools ?? [], []);
    assert.equal(calls, 0, "selecting a Character never selects or authorizes actions");
    f.request.action_tools = [actionRef];
    if (scope?.length === 0) await assert.rejects(f.host.start("probe", f.request, f.authority), /Character/);
    else assert.deepEqual((await f.host.start("probe", f.request, f.authority)).frozen.action_tools, [actionRef]);
  }
});

test("Host rejects wrong source, missing grant, non-Agent audience, duplicate selection and commands in a read-only role", async () => {
  for (const modify of [
    (view: ActionView) => { view.provider = { ...view.provider, provider_id: "replacement" }; },
    (view: ActionView) => { view.availability = { available: false, code: "actions.revoked", reason: "revoked" }; },
    (view: ActionView) => { view.action = { ...view.action, audiences: ["user"] }; },
    (view: ActionView) => { view.operation = "command"; },
  ]) {
    const f = fixture(), view = structuredClone(actionView); modify(view); f.request.action_tools = [actionRef];
    f.authority.actions = async () => ({ discover: async () => [view], invoke: async () => ({}) });
    await assert.rejects(f.host.start("probe", f.request, f.authority)); assert.equal(f.captured.length, 0);
  }
  const f = fixture(); f.request.action_tools = [actionRef, actionRef];
  await assert.rejects(f.host.start("probe", f.request, f.authority)); assert.equal(f.captured.length, 0);
});

test("original Character guard is carried to dispatch and rejects late disable without changing frozen history", async () => {
  const f = fixture(); f.request.action_tools = [actionRef]; let dispatchGuard: (() => void | Promise<void>) | undefined;
  f.authority.actions = async (_runtime, validate) => { dispatchGuard = validate; return { discover: async () => [actionView], invoke: async () => ({}) }; };
  const result = await f.host.start("probe", f.request, f.authority), history = structuredClone(result.frozen);
  assert.ok(dispatchGuard); await dispatchGuard();
  f.authority.resolveCharacter = () => { throw new Error("Character disabled"); };
  await assert.rejects(f.captured[0]!.role!.actions!.client.invoke(actionRef, {}), /Character disabled/);
  assert.throws(() => dispatchGuard!(), /Character disabled/);
  assert.deepEqual(result.frozen, history);
});
