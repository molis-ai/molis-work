import assert from "node:assert/strict";
import test from "node:test";
import { AgentHost, emptyCapabilityMatrix, subagentExecution, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentFrozenCharacter, AgentStartRequest, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

function fixture() {
  // The person's original as Characters resolves it now (role-service-design §5): the caller names a stable choice, never a version.
  const character: AgentFrozenCharacter = { version: { kind: "personal", character_id: "profile", version: 2 }, character_id: "profile", title: "Verifier",
    instructions: "Verify results. Mark unknowns explicitly.", host_tools: ["read-file"], project_id: null, owner_actor_id: "user", saved_at: "2026-09-22T00:00:00Z" };
  const authority: AgentStartAuthority = { authorizedDirectories: ["/tmp/ws"],
    manifest: { roles: [{ role_id: "reader", version: 1, name: "Reader", prompts: ["base", "reader"], host_tools: ["read-file", "search"] }],
      prompts: [{ prompt_id: "base", version: 1, layer: "base" }, { prompt_id: "reader", version: 1, layer: "role" }],
      characters: { selection: "optional-role", scope: "owner", role_ids: ["reader"] } },
    prompts: [{ prompt_id: "base", version: 1, layer: "base", body: "base" }, { prompt_id: "reader", version: 1, layer: "role", body: "reader" }],
    project_prompts: [{ prompt_id: "project", version: 1, body: "project" }], resolveCharacter: () => character, characterVersion: () => character };
  const request: AgentStartRequest = { session: { runtime_id: "probe", session_id: "s" }, project_id: "board", plugin_id: "caller", install_id: "i", actor_id: "user",
    task: "Read the repository.", role_id: "reader", directory: { canonical_path: "/tmp/ws", realpath_verified: true }, character: { kind: "personal", character_id: "profile" } };
  const captured: AgentStartRequest[] = []; let cancelled = 0, widen = false, previous: AgentFrozenCharacter | null = null;
  const host = new AgentHost();
  host.register({ descriptor: { runtime_id: "probe", display_name: "Probe", provider_version: "1", supports_action_tools: true, capabilities: { ...emptyCapabilityMatrix(), "run.start": "supported", skills: "supported" } },
    async readSession(session) { return { session, owner: { project_id: "board", plugin_id: "caller", install_id: "i", actor_id: "user" }, title: "Read", runs: [], latest_run: previous ? { ref: { run_id: "r0", session_id: "s" }, frozen: { character: previous } } : null } as never; },
    async start(input) {
      captured.push(input); const role = input.role!;
      return { ref: { run_id: "r", session_id: "s" }, frozen: { role_id: role.role_id, role_version: role.version, execution: role.execution, model_id: "fixture",
        ...(role.reply_locale === undefined ? {} : { reply_locale: role.reply_locale }),
        ...(input.action_tools === undefined ? {} : { action_tools: structuredClone(input.action_tools) }),
        ...(role.character ? { character: structuredClone(role.character) } : {}), ...(role.character_skill_ids === undefined ? {} : {character_skill_ids: [...role.character_skill_ids]}), prompts: role.prompts.map(p => ({ prompt_id: p.prompt_id, version: p.version, layer: promptLayerOf(p) })),
        host_tools: widen ? ["read-file", "run-command"] : [...role.host_tools], skills: [], mcp_tools: [], mcp_sources: [], text_materials: [], budget: null,
        ...(input.workspace === "none" ? { workspace: "none" as const } : { directory: input.directory }) } };
    }, async control() { cancelled++; },
  } as AgentRuntimeAdapter);
  return { host, authority, request, character, captured, cancelled: () => cancelled, widen: () => { widen = true; }, previous: (character: AgentFrozenCharacter) => { previous = character; } };
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

test("S-character-role-scope ROLE-11 ROLE-16: undeclared, disallowed, wrong-owner, wrong-project, mismatched, versioned, disabled and wider-tool Character selections never start", async () => {
  const cases = [
    (f: ReturnType<typeof fixture>) => { delete f.authority.manifest.characters; },
    (f: ReturnType<typeof fixture>) => { f.authority.manifest.characters!.role_ids = ["builder"]; },
    (f: ReturnType<typeof fixture>) => { delete f.authority.characterVersion; },
    (f: ReturnType<typeof fixture>) => { f.character.owner_actor_id = "other"; },
    // An original belongs to no project; a member belongs to the round's own project only.
    (f: ReturnType<typeof fixture>) => { f.character.project_id = "other"; },
    (f: ReturnType<typeof fixture>) => { f.request.character = { kind: "project", member_id: "m" }; f.character.version = { kind: "project", member_id: "m", member_version: 1, original: { kind: "personal", character_id: "profile", version: 2 } }; f.character.project_id = "other"; },
    // What Characters resolved is not what was chosen.
    (f: ReturnType<typeof fixture>) => { f.character.version = { ...f.character.version, character_id: "another" } as typeof f.character.version; },
    // The caller cannot pin a version: a choice carrying one is refused before anything is resolved.
    (f: ReturnType<typeof fixture>) => { f.request.character = { kind: "personal", character_id: "profile", version: 1 } as never; },
    (f: ReturnType<typeof fixture>) => { f.character.host_tools = ["run-command"]; },
    // A role turned off is refused for a new choice.
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
  const f = fixture(); assert.equal(manifestProblems(declarationManifest({ agent: f.authority.manifest })), "");
  f.authority.manifest.characters!.role_ids = ["missing"];
  assert.match(manifestProblems(declarationManifest({ agent: f.authority.manifest })), /Character/);
  f.authority.manifest.characters = { selection: "latest" as never, scope: "owner", role_ids: ["reader"] };
  assert.match(manifestProblems(declarationManifest({ agent: f.authority.manifest })), /Character/);
});

test("a selected method cannot restore a tool removed by the Character", async () => {
  const f = fixture(), method = { skill_id: "needs-search", version: 1, name: "Search method", tools: ["search"] };
  f.authority.manifest.skills = [method]; f.authority.skills = [{ ...method, body: "Search the repository." }];
  const source = { source: { kind: "plugin" as const, plugin_id: "caller", plugin_version: "1.0.0", publisher_signature: "fixture" }, install_id: "i", installation_generation: "g1" };
  f.authority.skill_source = source; f.request.skills = [{ ...source, skill_id: method.skill_id, version: 1 }];
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
    await assert.rejects(f.host.start("probe", f.request, f.authority), /内置 AI|项目范围/);
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
  assert.deepEqual(result.frozen.character!.version,f.character.version);
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

test("ROLE-07 ROLE-08: the frozen version's guard is carried to dispatch; turning the role off later does not stop the round, removing its version does, and history never changes", async () => {
  const f = fixture(); f.request.action_tools = [actionRef]; let dispatchGuard: (() => void | Promise<void>) | undefined;
  f.authority.reply_language = { locale: "en", prompt: { prompt_id: "reply-language", version: 1, body: "Use English." } };
  f.authority.prompts = f.authority.prompts?.map(prompt => prompt.prompt_id === "reader" ? { ...prompt, body_by_locale: { en: "Read only." } } : prompt);
  f.authority.actions = async (_runtime, validate) => { dispatchGuard = validate; return { discover: async () => [actionView], invoke: async () => ({}) }; };
  const result = await f.host.start("probe", f.request, f.authority), history = structuredClone(result.frozen);
  assert.equal(f.captured[0]!.role!.prompts.find(prompt => prompt.prompt_id === "reader")?.body, "Read only.");
  assert.ok(dispatchGuard); await dispatchGuard();
  f.authority.resolveCharacter = () => { throw new Error("Character disabled"); };
  await f.captured[0]!.role!.actions!.client.invoke(actionRef, {});
  await dispatchGuard();
  f.authority.characterVersion = () => { throw new Error("Character version removed"); };
  await assert.rejects(f.captured[0]!.role!.actions!.client.invoke(actionRef, {}), /角色版本已移出或删除/);
  assert.throws(() => dispatchGuard!(), /角色版本已移出或删除/);
  assert.deepEqual(result.frozen, history);
});

test("ROLE-07 ROLE-16: the same choice in a session keeps the version its last round froze; another choice resolves the current one", async () => {
  const f = fixture(), pinned = structuredClone(f.character), newer = { ...structuredClone(f.character), version: { kind: "personal" as const, character_id: "profile", version: 3 }, instructions: "Newer" };
  const read: unknown[] = [];
  f.authority.resolveCharacter = () => newer;
  f.authority.characterVersion = version => { read.push(structuredClone(version)); return version.version === 2 ? pinned : newer; };
  // A first round takes what Characters resolves now.
  assert.deepEqual((await f.host.start("probe", f.request, f.authority)).frozen.character!.version, newer.version);
  // The session's last round froze v2: the same choice keeps it, even though v3 is current now.
  f.previous(pinned);
  assert.deepEqual((await f.host.start("probe", f.request, f.authority)).frozen.character!.version, pinned.version);
  assert.ok(read.some(version => (version as { version: number }).version === 2));
  // Another choice than the last round's resolves the current one.
  f.previous({ ...structuredClone(pinned), version: { kind: "personal", character_id: "other", version: 1 }, character_id: "other" });
  assert.deepEqual((await f.host.start("probe", f.request, f.authority)).frozen.character!.version, newer.version);
});

test("SAI-08 SAI-10 ROLE-08: child continuation checks the original parent's frozen project role", async () => {
  const f = fixture();
  f.request.character = { kind: "project", member_id: "board-member" };
  f.character.version = { kind: "project", member_id: "board-member", member_version: 1,
    original: { kind: "personal", character_id: "profile", version: 2 } };
  f.character.project_id = f.request.project_id;
  const child = { role_id: "child", version: 1, name: "Child", execution: "read-only" as const, host_tools: [] };
  const { frozen } = await f.host.start("probe", f.request, f.authority);

  f.authority.manifest.subagents = { parent_role_ids: ["reader"], roles: [child] };
  f.authority.resolveCharacter = () => { throw new Error("Stopped offering this role for new choices"); };
  const reads: Array<{ version: AgentFrozenCharacter["version"]; actor: string }> = [];
  let current = structuredClone(f.character);
  f.authority.characterVersion = (version, actor) => { reads.push({ version, actor }); return current; };
  const execution = subagentExecution(f.authority, "probe", frozen, { actor_id: f.request.actor_id, project_id: f.request.project_id });
  execution.assertSubagent!(child);
  assert.deepEqual(reads, [{ version: f.character.version, actor: f.request.actor_id }]);

  current = { ...current, project_id: "another-project" };
  assert.throws(() => execution.assertSubagent!(child), /原角色已不可用/);
  f.authority.characterVersion = () => { throw new Error("The original project member was removed"); };
  await assert.rejects(execution.beforeStart!(), /original project member was removed/);
});

