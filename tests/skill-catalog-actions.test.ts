// The Skill catalog, settings and import actions (specs/skill-packs/contract-design.md §6–§8, C-2): the contract alone.
// Product runtime behaviour is covered separately; the provider here answers the contract fixtures. Every refusal is asserted as
// a refusal: the schema's own `actions.input_invalid` before the stand-in is reached, `actions.output_invalid` for an answer of the wrong
// shape, or `actions.forbidden` for a caller the action is not offered to. The behaviour behind the actions (the frozen list of named
// Skills, the checks of the installation and its generation, the digests) is the catalog slice's (08-7), with the rest of SKC-05 to SKC-09.
import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { actionEffect, ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { MAX_SKILL_BODY_CHARS, SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { KNOWLEDGE_TEXT_MAX_CHARS } from "@molis-ai/molis-work-contracts/services/knowledge";
import {
  SKILL_BODY_READ_MAX_REFS, SKILL_READ_REFUSALS, SKILL_SETTINGS_LOCKED_REASONS, SKILL_UNAVAILABLE_REASONS, SKILLS_MANAGE_PERMISSION, SKILLS_PROVIDER_ID,
  SKILLS_READ_PERMISSION, skillCatalogActions, skillErrors, skillImportActions, type SkillCatalogEntry,
} from "@molis-ai/molis-work-contracts/services/skills";

const declared = [...Object.values(skillCatalogActions), ...Object.values(skillImportActions)] as ActionDefinition[];
const context = (audience: ActionCallContext["audience"], permissions: string[] = [SKILLS_READ_PERMISSION, SKILLS_MANAGE_PERMISSION]): ActionCallContext =>
  ({ actor_id: `${audience}:someone`, project_id: "p", audience, permissions });
const person = context("user");
const agent = context("agent", [SKILLS_READ_PERMISSION]);

function serving(answer: (capabilityId: string, input: unknown) => unknown = () => ({})) {
  const service = new ActionService();
  const calls: string[] = [];
  service.registerProvider({ provider: { provider_id: SKILLS_PROVIDER_ID, title: "技能", kind: "system" }, definitions: declared,
    handlers: declared.map(definition => ({ capability_id: definition.capability_id, version: definition.version,
      handle: (_caller: ActionCallContext, input: unknown) => { calls.push(definition.capability_id); return answer(definition.capability_id, input); } })) });
  return { service, calls };
}
const reference = (definition: unknown) => { const { capability_id, version } = definition as ActionDefinition; return { capability_id, version }; };
const code = (expected: string) => (error: unknown) => (error as ActionError).code === expected;
const invalid = code("actions.input_invalid");
const badOutput = code("actions.output_invalid");

const ref: SkillRef = {
  source: { kind: "plugin", plugin_id: "io.molis.work.meeting-skills", plugin_version: "1.0.0", publisher_signature: "ed25519:sha256:abc" },
  skill_id: "meeting-notes", version: 2, install_id: "inst-1", installation_generation: "gen-1",
};
const refNo = (n: number): SkillRef => ({ ...ref, skill_id: `skill-${n}` });
const entry: SkillCatalogEntry = {
  ref, name: "会议纪要", description: "用户要整理会议时使用。", applies_to: "both", user_invocable: true, tools: ["find-capabilities"],
  resources: [{ path: "skills/meeting-notes/references/template.md", role: "reference", bytes: 30 }], connector_categories: ["calendar"],
  runs_scripts: false, excerpt: "# 会议纪要", pack: { plugin_id: ref.source.plugin_id, title: "会议技能", version: "1.0.0", publisher_label: "示例", trust: "pinned", scope: "project" },
  state: "auto", settings_revision: 3, enabled: { at: "2026-11-07T00:00:00.000Z", by: "user:someone", scope: "project" }, availability: { available: true },
};
const setInput = { scope: "project", install_id: "inst-1", skill_id: "meeting-notes", state: "manual", expected_revision: 3 };

test("the six declarations are complete, version 1, none waits for a model, and they are the ones the design names", () => {
  assert.deepEqual(inspectActionDeclarations(declared, undefined), []);
  assert.deepEqual(declared.map(definition => `${definition.capability_id}@${definition.version}:${definition.operation}:${actionEffect(definition.action, definition.capability_id)}`), [
    "skills.catalog.list@1:query:read",
    "skills.body.read@1:query:read",
    "skills.resource.read@1:query:read",
    "skills.settings.set@1:command:write",
    "skills.import.preview@1:command:write",
    "skills.import.confirm@1:command:write",
  ]);
  for (const definition of declared) assert.equal(definition.action.scheduling, undefined, definition.capability_id);
  assert.equal(SKILLS_PROVIDER_ID, "system.skills");
});

test("who may call each: the catalog and its reads are the person's, a plugin's and an Agent's; settings and import only the person's", () => {
  const { service } = serving();
  const offered = (caller: ActionCallContext) => service.discover(caller).map(view => view.capability_id).sort();
  assert.deepEqual(offered(person), declared.map(definition => definition.capability_id).sort());
  const reads = ["skills.body.read", "skills.catalog.list", "skills.resource.read"];
  assert.deepEqual(offered(context("plugin")), reads);
  assert.deepEqual(offered(agent), reads);
  assert.deepEqual(offered(context("mcp")), []);
  assert.deepEqual(offered(context("workflow")), []);
});

test("SKC-05: an Agent or a plugin cannot change a state or import, whatever permission it holds; the same input from the person reaches the provider", async () => {
  const { service, calls } = serving(capability => capability === "skills.settings.set" ? entry : { preview_id: "pv", package: { plugin_id: "x", version: "1.0.0", installed_version: null }, applies_to: "coding", candidates: [] });
  for (const caller of [context("agent"), context("plugin")]) {
    await assert.rejects(service.invoke(caller, reference(skillCatalogActions.setState), setInput), code("actions.forbidden"));
    await assert.rejects(service.invoke(caller, reference(skillImportActions.preview), { source: { kind: "runtime", runtime_id: "codex" } }), code("actions.forbidden"));
  }
  assert.deepEqual(calls, []);
  await service.invoke(person, reference(skillCatalogActions.setState), setInput);
  await service.invoke(person, reference(skillImportActions.preview), { source: { kind: "runtime", runtime_id: "codex" } });
  assert.deepEqual(calls, ["skills.settings.set", "skills.import.preview"]);
});

test("SKC-05: settings.set changes one Skill to one of three states from the revision read; the project and the actor never come from input", async () => {
  const { service, calls } = serving(() => entry);
  const refused: ReadonlyArray<readonly [string, unknown]> = [
    ["an unknown state", { ...setInput, state: "on" }],
    ["enabled as a boolean", { ...setInput, state: true }],
    ["no expected revision", { scope: setInput.scope, install_id: setInput.install_id, skill_id: setInput.skill_id, state: setInput.state }],
    ["a negative revision", { ...setInput, expected_revision: -1 }],
    ["an unknown scope", { ...setInput, scope: "everywhere" }],
    ["a project named in input", { ...setInput, project_id: "other" }],
    ["a scope reference named in input", { ...setInput, scope_ref: "other" }],
    ["an actor named in input", { ...setInput, actor_id: "someone-else" }],
    ["several Skills at once", { ...setInput, skill_id: undefined, skill_ids: ["a", "b"] }],
    ["an empty skill id", { ...setInput, skill_id: "" }],
  ];
  for (const [what, input] of refused) await assert.rejects(service.invoke(person, reference(skillCatalogActions.setState), input), invalid, `accepted ${what}`);
  assert.deepEqual(calls, []);
  for (const state of ["off", "auto", "manual"]) await service.invoke(person, reference(skillCatalogActions.setState), { ...setInput, state, scope: "home" });
  assert.equal(calls.length, 3);
});

test("SKC-05: installing and importing enable nothing: import.confirm takes no state, and a state is set only by settings.set", async () => {
  const { service, calls } = serving(() => ({ plugin_id: "io.molis.work.import.codex", version: "1.0.0", publisher_key_id: "ed25519:sha256:home" }));
  const confirm = { preview_id: "pv-1", skill_ids: ["meeting-notes"], scope: "project" };
  for (const extra of [{ state: "auto" }, { enable: true }, { states: { "meeting-notes": "auto" } }]) {
    await assert.rejects(service.invoke(person, reference(skillImportActions.confirm), { ...confirm, ...extra }), invalid, JSON.stringify(extra));
  }
  for (const input of [{ ...confirm, skill_ids: [] }, { ...confirm, skill_ids: ["a", "a"] }, { ...confirm, scope: "everywhere" },
    { ...confirm, skill_ids: Array.from({ length: SKILL_LIMITS.skillsPerPackage + 1 }, (_, n) => `s-${n}`) }]) {
    await assert.rejects(service.invoke(person, reference(skillImportActions.confirm), input), invalid);
  }
  assert.deepEqual(calls, []);
  await service.invoke(person, reference(skillImportActions.confirm), confirm);
  assert.deepEqual(calls, ["skills.import.confirm"]);
  // Under the three reasons that lock a state, settings.set refuses; the rest are reasons to show, not to lock.
  assert.deepEqual([...SKILL_SETTINGS_LOCKED_REASONS], ["plugin_disabled", "publisher_revoked", "resource_invalid"]);
  for (const reason of SKILL_SETTINGS_LOCKED_REASONS) assert.ok((SKILL_UNAVAILABLE_REASONS as readonly string[]).includes(reason));
});

test("import.preview reads from one source: a known local Runtime, or a directory granted to this project", async () => {
  const { service, calls } = serving(() => ({ preview_id: "pv", package: { plugin_id: "x", version: "1.0.0", installed_version: null }, applies_to: "coding", candidates: [] }));
  const refused = [
    { source: { kind: "runtime", runtime_id: "unknown-agent" } },
    { source: { kind: "path", path: "/Users/someone/.claude/skills" } },
    { source: { kind: "runtime", runtime_id: "codex", directory_id: "d1" } },
    { source: { kind: "project_directory", directory_id: "" } },
    { source: { kind: "project_directory", directory_id: "d1" }, project_id: "other" },
  ];
  for (const input of refused) await assert.rejects(service.invoke(person, reference(skillImportActions.preview), input), invalid, JSON.stringify(input));
  assert.deepEqual(calls, []);
  await service.invoke(person, reference(skillImportActions.preview), { source: { kind: "project_directory", directory_id: "d1" } });
  await service.invoke(person, reference(skillImportActions.preview), { source: { kind: "runtime", runtime_id: "claude-code" } });
  assert.equal(calls.length, 2);
});

test("SKC-06: what was named in this round is not an input: a body read carries references only, so no input can claim a manual Skill was named", async () => {
  const { service, calls } = serving((_, input) => ({ results: (input as { refs: SkillRef[] }).refs.map(item => ({ ref: item, ok: false, reason: "not_named" })) }));
  for (const extra of [{ named: true }, { frozen: [ref] }, { round_skills: [ref] }, { state: "auto" }]) {
    await assert.rejects(service.invoke(agent, reference(skillCatalogActions.readBodies), { refs: [ref], ...extra }), invalid, JSON.stringify(extra));
  }
  assert.deepEqual(calls, []);
  const answer = await service.invoke(agent, reference(skillCatalogActions.readBodies), { refs: [ref] }) as { results: Array<{ reason: string }> };
  assert.equal(answer.results[0]!.reason, "not_named");
});

// Leaving `off` Skills out for an Agent or a plugin is the Host's (08-7): the input shape lets anyone ask for a state, and grants nothing by it.
test("SKC-07: one catalog for the Assistant and Coding, filtered by who it applies to and by state, and naming no scope of its own", async () => {
  const { service, calls } = serving(() => ({ skills: [entry] }));
  for (const input of [{}, { applies_to: "assistant" }, { applies_to: "coding" }, { states: ["auto", "manual"] }, { applies_to: "coding", states: ["manual"] }]) {
    const answer = await service.invoke(agent, reference(skillCatalogActions.list), input) as { skills: SkillCatalogEntry[] };
    assert.deepEqual(answer.skills.map(item => item.ref), [ref]);
  }
  assert.equal(calls.length, 5);
  for (const input of [{ applies_to: "both" }, { applies_to: "designer" }, { states: [] }, { states: ["on"] }, { states: ["auto", "auto"] }, { project_id: "other" }, { scope: "home" }]) {
    await assert.rejects(service.invoke(agent, reference(skillCatalogActions.list), input), invalid, JSON.stringify(input));
  }
  assert.equal(calls.length, 5);
});

test("SKC-08: body.read takes 1 to SKILL_BODY_READ_MAX_REFS exact references at once and nothing a caller could use to move a reference", async () => {
  assert.equal(SKILL_BODY_READ_MAX_REFS * MAX_SKILL_BODY_CHARS, KNOWLEDGE_TEXT_MAX_CHARS);
  const { service, calls } = serving((_, input) => ({ results: (input as { refs: SkillRef[] }).refs.map(item => ({ ref: item, ok: true, name: "会议纪要", body: "# 正文" })) }));
  const { install_id: _install, ...noInstall } = ref;
  const { installation_generation: _generation, ...noGeneration } = ref;
  const refused: ReadonlyArray<readonly [string, unknown]> = [
    ["no references", { refs: [] }],
    ["one reference too many", { refs: Array.from({ length: SKILL_BODY_READ_MAX_REFS + 1 }, (_, n) => refNo(n)) }],
    ["the same reference twice", { refs: [ref, ref] }],
    ["a bare id", { refs: ["meeting-notes"] }],
    ["a reference with no installation", { refs: [noInstall] }],
    ["a reference with no generation", { refs: [noGeneration] }],
    ["a reference with version 0", { refs: [{ ...ref, version: 0 }] }],
    ["a reference asking for the latest version", { refs: [{ ...ref, version: "latest" }] }],
    ["a reference claiming a project", { refs: [{ ...ref, project_id: "other" }] }],
    ["a reference claiming an actor", { refs: [{ ...ref, actor_id: "someone-else" }] }],
    ["a source that is not a plugin", { refs: [{ ...ref, source: { ...ref.source, kind: "system" } }] }],
    ["a single reference instead of a list", { ref }],
  ];
  for (const [what, input] of refused) await assert.rejects(service.invoke(agent, reference(skillCatalogActions.readBodies), input), invalid, `accepted ${what}`);
  assert.deepEqual(calls, []);
  const most = Array.from({ length: SKILL_BODY_READ_MAX_REFS }, (_, n) => refNo(n));
  const answer = await service.invoke(agent, reference(skillCatalogActions.readBodies), { refs: most }) as { results: Array<{ ref: SkillRef }> };
  assert.deepEqual(answer.results.map(item => item.ref), most);
  assert.equal(calls.length, 1);
});

test("SKC-08: a reference not read is answered with its reason, item by item, never with another version's body", async () => {
  for (const reason of ["not_current", "plugin_disabled", "publisher_revoked", "off", "not_named", "not_applicable"]) {
    assert.ok((SKILL_READ_REFUSALS as readonly string[]).includes(reason), reason);
    const { service } = serving(() => ({ results: [{ ref, ok: false, reason }] }));
    await service.invoke(agent, reference(skillCatalogActions.readBodies), { refs: [ref] });
  }
  const answers: ReadonlyArray<readonly [string, unknown]> = [
    ["a refusal with a body", { results: [{ ref, ok: false, reason: "not_current", body: "# 另一个版本" }] }],
    ["a refusal with an unknown reason", { results: [{ ref, ok: false, reason: "moved" }] }],
    ["a body without its reference", { results: [{ ok: true, name: "会议纪要", body: "# 正文" }] }],
    ["a body with a notice that it is another version", { results: [{ ref, ok: true, name: "会议纪要", body: "# 正文", version: 3 }] }],
    ["a body over the limit", { results: [{ ref, ok: true, name: "会议纪要", body: "x".repeat(MAX_SKILL_BODY_CHARS + 1) }] }],
  ];
  for (const [what, answer] of answers) {
    const { service } = serving(() => answer);
    await assert.rejects(service.invoke(agent, reference(skillCatalogActions.readBodies), { refs: [ref] }), badOutput, `answered ${what}`);
  }
});

test("SKC-09: a resource is named by its reference and a path under the Skill's resource folders; the catalog entry never carries the body", async () => {
  const content = { ref, path: "skills/meeting-notes/references/template.md", role: "reference", media_type: "text/markdown", bytes: 30, sha256: "a".repeat(64), encoding: "utf8", content: "## 纪要模板" };
  const { service, calls } = serving(capability => capability === "skills.catalog.list" ? { skills: [entry] } : content);
  for (const path of ["skills/meeting-notes/SKILL.md", "/etc/passwd", "skills/meeting-notes/references/../../other/SKILL.md", "skills/meeting-notes/references/./a.md",
    "skills/meeting-notes/notes/a.md", "skills/meeting-notes/references/", "skills/meeting-notes\\references\\a.md", "skills/Meeting/references/a.md", "manifest.json",
    "skills/meeting-notes/references/a\u0000.md"]) {
    await assert.rejects(service.invoke(agent, reference(skillCatalogActions.readResource), { ref, path }), invalid, JSON.stringify(path));
  }
  await assert.rejects(service.invoke(agent, reference(skillCatalogActions.readResource), { ref, path: content.path, project_id: "other" }), invalid);
  assert.deepEqual(calls, []);
  for (const path of [content.path, "skills/meeting-notes/scripts/run.py", "skills/meeting-notes/assets/img/logo.png"]) {
    await service.invoke(agent, reference(skillCatalogActions.readResource), { ref, path });
  }
  for (const wrong of [{ ...content, sha256: "not-a-digest" }, { ...content, encoding: "gzip" }, { ...content, bytes: SKILL_LIMITS.fileBytes + 1 }]) {
    const { service: other } = serving(() => wrong);
    await assert.rejects(other.invoke(agent, reference(skillCatalogActions.readResource), { ref, path: content.path }), badOutput);
  }
  const { service: leaking } = serving(() => ({ skills: [{ ...entry, body: "# 正文" }] }));
  await assert.rejects(leaking.invoke(agent, reference(skillCatalogActions.list), {}), badOutput);
  const { service: offAsUnavailable } = serving(() => ({ skills: [{ ...entry, state: "off", availability: { available: false, reason: "off" } }] }));
  await assert.rejects(offAsUnavailable.invoke(person, reference(skillCatalogActions.list), {}), badOutput);
});

test("the refusals are declared once under the skills owner, with a kind each", () => {
  const raised = [skillErrors.not_found("x"), skillErrors.read_refused("x", { reason: "not_named" }), skillErrors.settings_conflict("x"), skillErrors.settings_locked("x"),
    skillErrors.resource_undeclared("x"), skillErrors.scope_mismatch("x"), skillErrors.import_preview_unknown("x"), skillErrors.import_skill_unknown("x"), skillErrors.import_source_unavailable("x")];
  for (const error of raised) assert.ok(error instanceof ActionError && error.code.startsWith("skills.") && error.kind, error.code);
  assert.equal(skillErrors.settings_conflict("x").kind, "conflict");
  assert.equal(skillErrors.read_refused("x").kind, "forbidden");
});
