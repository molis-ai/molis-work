import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AgentHost, emptyCapabilityMatrix, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { homeAgentDefinitions, molisWorkHostProjectReference, pluginInstallActions, PLUGIN_INSTALL_PERMISSIONS, SkillCatalog, type CatalogSkill } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionSkillRound, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentManifest } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { AgentRunHandle, AgentRuntimeAdapter, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { SKILLS_PERMISSIONS, SKILLS_PROVIDER_ID, SKILLS_READ_PERMISSION, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { signedContentPackage } from "./fixtures/content-package.js";
import { newPublisher } from "./fixtures/sandbox-package.js";

// SKP-10 (specs/skill-packs/spec.md §7, specs/capability-pack/contract-design.md §2.3/§3.1): a Coding round lists the Skills set to 「自动」 that
// apply to Coding, the model reads one through that round's own `skills.body.read@1` tool — where the Host writes `skill_round` — and an
// unnamed `manual` Skill stays `not_named`. SKP-03: a plugin that is no round lists only directory metadata, never a body.

const CODING = "io.molis.work.coding";
const action = (value: { capability_id: string; version: number }) => ({ capability_id: value.capability_id, version: value.version });
const READ_LABEL = "技能 · 读取 · 读取技能正文";

/** One Skill of the catalog as the projection builds it; only what a list/read test needs. */
const catalogSkill = (id: string, appliesTo: "assistant" | "coding" | "both", body: string): CatalogSkill => ({
  ref: { source: { kind: "plugin", plugin_id: "io.example.notes", plugin_version: "1.0.0", publisher_signature: "signature" }, install_id: "notes-install",
    installation_generation: "g1", skill_id: id, version: 1 },
  declaration: { skill_id: id, version: 1, name: id, summary: `${id} summary`, description: `${id} description`, applies_to: appliesTo, tools: [] },
  body, pack: { plugin_id: "io.example.notes", title: "Notes", version: "1.0.0", publisher_label: "Example", trust: "pinned", scope: "project" },
  availability: { available: true }, assertCurrent: () => undefined, assertPublisher: () => undefined });

test("SKP-03 SKP-10: a plugin that is no round lists the class it asks for; bodies still need the Host's frozen round", async () => {
  const home = await mkdtemp(join(tmpdir(), "coding-auto-catalog-"));
  try {
    const definitions = homeAgentDefinitions(home);
    const codingAuto = catalogSkill("coding-auto", "coding", "coding auto body"), bothAuto = catalogSkill("both-auto", "both", "both auto body");
    const codingManual = catalogSkill("coding-manual", "coding", "coding manual body"), assistantAuto = catalogSkill("assistant-auto", "assistant", "assistant auto body");
    const offCoding = catalogSkill("off-coding", "coding", "off body");
    const catalog = new SkillCatalog({ definitions, withSkills: async (_caller, use) => use([codingAuto, bothAuto, codingManual, assistantAuto, offCoding]),
      resource: () => new Uint8Array(), publishers: () => new Map() });
    for (const skill of [codingAuto, bothAuto, assistantAuto]) definitions.skills.set("project-a", "notes-install", skill.ref.skill_id, "auto", 0, "person");
    definitions.skills.set("project-a", "notes-install", "coding-manual", "manual", 0, "person");
    const plugin: ActionCallContext = { actor_id: "plugin:coding", project_id: "project-a", audience: "plugin", permissions: [SKILLS_READ_PERMISSION] };
    const ids = (skills: readonly SkillCatalogEntry[]) => skills.map(skill => skill.ref.skill_id);

    // The page's own menu read: the class it asked for, including coding-only Skills (before SKP-03 the second filter dropped them).
    assert.deepEqual(ids((await catalog.list(plugin, { applies_to: "coding", states: ["auto", "manual"] })).skills), ["coding-auto", "both-auto", "coding-manual"]);
    // Without a class named it keeps the round's rule: a plugin that is no round sees "both" only.
    assert.deepEqual(ids((await catalog.list(plugin, {})).skills), ["both-auto"]);
    // Directory metadata alone: a body read without the Host's round is still refused for the round's reason.
    assert.deepEqual((await catalog.readBodies(plugin, [codingAuto.ref])).results.map(row => row.ok ? "ok" : row.reason), ["not_applicable"]);

    // The Host's round carries the consumer and the frozen named list; only these make a body readable.
    const round: ActionCallContext = { ...plugin, skill_round: { consumer: "coding", named: [] } };
    assert.deepEqual(ids((await catalog.list(round, { applies_to: "coding", states: ["auto"] })).skills), ["coding-auto", "both-auto"]);
    const read = async (caller: ActionCallContext, refs: readonly SkillRef[]) => (await catalog.readBodies(caller, refs)).results.map(row => row.ok ? "ok" : row.reason);
    assert.deepEqual(await read(round, [codingAuto.ref, codingManual.ref]), ["ok", "not_named"], "an automatic Skill reads; an unnamed manual one does not");
    assert.deepEqual(await read({ ...plugin, skill_round: { consumer: "coding", named: [codingManual.ref] } }, [codingManual.ref]), ["ok"], "named manual Skill opens in its round");
    // What the list showed is no grant: the assistant-only Skill still does not apply to a Coding round.
    assert.deepEqual(await read(round, [assistantAuto.ref, offCoding.ref]), ["not_applicable", "off"]);
  } finally { await rm(home, { recursive: true, force: true }); }
});

const DIRECTORY = "/Users/tester/code/project";
const manifest: AgentManifest = { directory_input_port: "project", roles: [{ role_id: "reader", version: 1, name: "Reader", host_tools: ["read-file"] }], prompts: [] };
const skillRef = (id: string): SkillRef => ({ source: { kind: "plugin", plugin_id: "io.example.notes", plugin_version: "1.0.0", publisher_signature: "signature" },
  install_id: "notes-install", installation_generation: "g1", skill_id: id, version: 1 });
const view = (ref: SkillRef): ActionView => ({ capability_id: "skills.body.read", version: 1, operation: "query",
  provider: { provider_id: "system.skills", title: "技能", kind: "system" }, availability: { available: true },
  action: { title: "读取技能正文", description: "按精确引用读技能正文", kind: "query", scope: "project", audiences: ["agent"], permissions: [SKILLS_READ_PERMISSION], subject_kinds: [], input_schema: { type: "object" } } });
const entry = (ref: SkillRef): SkillCatalogEntry => ({ ref, name: ref.skill_id, description: "d", applies_to: "coding", user_invocable: true, tools: [], resources: [],
  connector_categories: [], runs_scripts: false, excerpt: "", state: "auto", settings_revision: 1,
  pack: { plugin_id: ref.source.plugin_id, title: "Notes", version: "1.0.0", publisher_label: "Example", trust: "pinned", scope: "project" }, availability: { available: true } });

test("SKP-10: the round hands its consumer and frozen named list to the action client its tool calls go through", async () => {
  const seen: Array<ActionSkillRound | undefined> = [];
  const named = skillRef("coding-auto"), viewUnderTest = view(named);
  const capabilities = emptyCapabilityMatrix(); capabilities.skills = "supported";
  const adapter: AgentRuntimeAdapter = {
    descriptor: { runtime_id: "probe", display_name: "probe", provider_version: "1.0.0", capabilities, supports_action_tools: true },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    createSession: () => { throw new Error("not used"); }, read: () => { throw new Error("not used"); }, observe: () => { throw new Error("not used"); },
    control: () => { throw new Error("not used"); }, readCommandOutput: () => { throw new Error("not used"); },
    async readSession(session) { return { session, owner: { project_id: "project", plugin_id: CODING, install_id: "install-1", actor_id: "tester" }, title: "读", runs: [], latest_run: null }; },
    async start(request: AgentStartRequest): Promise<AgentRunHandle> {
      return { ref: { run_id: "run-1", session_id: request.session.session_id }, frozen: { role_id: "reader", role_version: 1, execution: "read-only", model_id: "m",
        prompts: [], skills: (request.role?.skills ?? []).map(({ body: _body, ...skill }) => skill), mcp_tools: [], host_tools: [...(request.role?.host_tools ?? [])],
        text_materials: [], budget: null, directory: { canonical_path: DIRECTORY, realpath_verified: true },
        ...(request.action_tools?.length ? { action_tools: [...request.action_tools] } : {}) } };
    },
  };
  const host = new AgentHost(); host.register(adapter);
  const authority: AgentStartAuthority = { manifest, authorizedDirectories: [DIRECTORY],
    skillCatalog: { named: [named], list: async (_consumer, refs) => refs.map(entry), readBodies: async (_consumer, refs) => refs.map(ref => ({ ref, ok: true as const, name: ref.skill_id, body: "做法" })) },
    actions: async (_runtime, _validate, _session, skillRound) => { seen.push(skillRound); return { discover: async () => [viewUnderTest], invoke: async () => ({ results: [] }) }; } };
  const request: AgentStartRequest = { session: { session_id: "session-1", runtime_id: "probe" }, project_id: "project", plugin_id: CODING, install_id: "install-1",
    actor_id: "tester", task: "读一下", role_id: "reader", directory: { canonical_path: DIRECTORY, realpath_verified: true }, skills: [named],
    action_tools: [{ capability_id: "skills.body.read", version: 1, provider_id: "system.skills" }] };
  await host.start("probe", request, authority);
  assert.deepEqual(seen, [{ consumer: "coding", named: [named] }], "a workspace role's round is Coding's, with its frozen named list and nothing else");
});

/** The round requests the model actually received: those offering tools (the ending review and drafts carry none). */
const roundTools = (request: unknown): Array<{ name: string; description: string }> => ((request as { tools?: Array<{ name: string; description: string }> }).tools) ?? [];
/** Tool results already returned to the model, parsed from whatever shape this protocol puts them in. */
const toolResults = (request: unknown): string[] => {
  const messages = (request as { messages?: Array<{ content: unknown }> }).messages ?? [];
  return messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .filter((part): part is { type: string; content?: unknown } => Boolean(part) && typeof part === "object" && (part as { type?: unknown }).type === "tool_result")
    .flatMap(part => typeof part.content === "string" ? [part.content] : Array.isArray(part.content)
      ? part.content.flatMap((piece: unknown) => piece && typeof piece === "object" && typeof (piece as { text?: unknown }).text === "string" ? [(piece as { text: string }).text] : [])
      : []);
};

test("SKP-10: Coding's round lists the automatic Skills for Coding and offers the round's read tool only while some exist", { timeout: 120_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("好的。"));
  const projectId = f.project.project_id;
  const client = f.host.actionClient(molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId }));
  const person: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user",
    user_action: { source: "management", conversation_ref: "coding-auto-skills", message_ref: "confirm" },
    permissions: ["artifact:read", "artifact:write", "storage:private", ...PLUGIN_INSTALL_PERMISSIONS, ...SKILLS_PERMISSIONS] };
  const preview = await client.invoke(person, action(pluginInstallActions.preview), { bundle: signedContentPackage(newPublisher(), { skills: [
    { id: "auto-coding", name: "自动纪要", applies_to: "coding", body: "# 会议纪要自动\n\n先读模板，再整理。" },
    { id: "manual-coding", name: "手动纪要", applies_to: "coding", body: "# 会议纪要手动\n\n只按点名使用。" },
    { id: "auto-both", name: "通用纪要", applies_to: "both", body: "# 通用自动\n\n两边都能自己用。" },
    { id: "auto-assistant", name: "助理纪要", applies_to: "assistant", body: "# 助理自动\n\n只给助理。" },
    { id: "off-coding", name: "关着的纪要", applies_to: "coding", body: "# 关着的\n\n不该出现。" },
  ] }) }) as { preview_id: string };
  await client.invoke(person, action(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Example" });
  const listed = await client.invoke(person, action(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] };
  const refOf = (id: string) => { const found = listed.skills.find(row => row.ref.skill_id === id); assert.ok(found, `${id} is listed`); return found.ref; };
  const codingAuto = refOf("auto-coding"), codingManual = refOf("manual-coding"), bothAuto = refOf("auto-both");
  const setState = (ref: SkillRef, state: "auto" | "manual" | "off", expected = 0) => client.invoke(person, action(skillCatalogActions.setState),
    { scope: "project", install_id: ref.install_id, skill_id: ref.skill_id, state, expected_revision: expected });
  await setState(codingAuto, "auto"); await setState(bothAuto, "auto");
  await setState(codingManual, "manual"); await setState(refOf("auto-assistant"), "auto"); // off-coding stays off.

  const startRound = async (task: string, locale?: "en" | "zh") => {
    const session = await f.call<{ session: { session_id: string } }>(projectId, `/api/plugins/${CODING}/sessions`, {});
    assert.equal(session.status, 200, JSON.stringify(session.body));
    const started = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(projectId,
      `/api/plugins/${CODING}/sessions/${session.body.session.session_id}/runs`,
      { task, intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" }, locale);
    assert.equal(started.status, 200, JSON.stringify(started.body));
    return f.ended(started.body.run.ref);
  };
  const mark = () => f.requests.length;
  const roundRequests = (from: number) => f.requests.slice(from).filter(request => roundTools(request).length);

  // a. The automatic Skills that apply to Coding reach the round as one material; manual (unnamed), assistant-only and off ones do not; and the
  // round carries `skills.body.read@1` for the model to read one (the Host writes that call's `skill_round`, §2.3; the round's own tool calls
  // are covered below by the catalog and authority tests, the coding fixture has no scripted model tool call here).
  let from = mark();
  const first = await startRound("整理这次会议纪要");
  assert.ok(first.frozen.text_materials.some(item => item.material_id === "coding-auto-skills"), "the round carries 「可自动使用的技能」");
  assert.ok(first.frozen.action_tools?.some(tool => tool.capability_id === skillCatalogActions.readBodies.capability_id && tool.provider_id === SKILLS_PROVIDER_ID),
    "the round carries the read tool beside the person's own choices");
  const firstRequests = roundRequests(from);
  assert.equal(firstRequests.length, 1);
  const firstTools = roundTools(firstRequests[0]!), firstPack = JSON.stringify(firstRequests[0]!.messages);
  assert.ok(firstTools.some(tool => tool.description.startsWith(READ_LABEL)), "the model is offered the round's Skill read tool");
  assert.ok(firstPack.includes("可自动使用的技能") && firstPack.includes("自动纪要") && firstPack.includes("通用纪要"), "the material names the automatic coding Skills");
  assert.ok(!firstPack.includes("手动纪要") && !firstPack.includes("助理纪要") && !firstPack.includes("关着的纪要"), "manual, assistant-only and off Skills are not offered");
  assert.ok(firstPack.includes(codingAuto.installation_generation), "each entry carries the complete exact reference");
  assert.match(firstPack, /技能 · 读取 · 读取技能正文/, "and says which round tool reads a body");

  from = mark();
  await startRound("Summarize the meeting", "en");
  const english = JSON.stringify(roundRequests(from)[0]?.messages);
  assert.match(english, /Skills available automatically/u);
  assert.match(english, /自动纪要/u, "a Skill author’s own name stays as authored");
  assert.doesNotMatch(english, /可自动使用的技能/u);

  // d. With nothing set to 「自动」 there is no material and no Skill tool on the round.
  const revised = (await client.invoke(person, action(skillCatalogActions.list), {})) as { skills: SkillCatalogEntry[] };
  for (const id of ["auto-coding", "auto-both"]) {
    const found = revised.skills.find(row => row.ref.skill_id === id)!;
    await setState(found.ref, "off", found.settings_revision);
  }
  const plain = await startRound("普通一轮");
  assert.ok(!plain.frozen.text_materials.some(item => item.material_id === "coding-auto-skills"), "no automatic Skills, no material");
  assert.ok(!plain.frozen.action_tools?.some(tool => tool.capability_id === skillCatalogActions.readBodies.capability_id), "and no Skill read tool");
});

test("SKP-10: the model reads an automatic Skill through the round's own tool; an unnamed manual Skill is refused", { timeout: 120_000 }, async t => {
  const seen: { tool?: string } = {};
  let autoRef: SkillRef | undefined, manualRef: SkillRef | undefined;
  // The provider answers the round's first request with a tool_use for the round's own Skill read tool, then the tool result goes back to it.
  const f = await codingProductHost(t, request => {
    const body: typeof request & { tools?: Array<{ name: string; description?: string }> } = request;
    const hasToolResult = JSON.stringify(body.messages ?? "").includes("tool_result");
    const read = (body.tools ?? []).find(tool => (tool.description ?? "").startsWith(READ_LABEL));
    if (!hasToolResult && read && autoRef && manualRef) {
      seen.tool = read.name;
      return cogniaScriptedResponse({ name: read.name, input: { refs: [autoRef, manualRef] } }, "好的。");
    }
    return cogniaModelResponse("好的。");
  });
  const projectId = f.project.project_id;
  const client = f.host.actionClient(molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId }));
  const person: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user",
    user_action: { source: "management", conversation_ref: "coding-auto-read", message_ref: "confirm" },
    permissions: ["artifact:read", "artifact:write", "storage:private", ...PLUGIN_INSTALL_PERMISSIONS, ...SKILLS_PERMISSIONS] };
  const preview = await client.invoke(person, action(pluginInstallActions.preview), { bundle: signedContentPackage(newPublisher(), { skills: [
    { id: "auto-coding-read", name: "自动读取", applies_to: "coding", body: "# 自动读取\n\n先读模板，再整理。" },
    { id: "manual-coding-read", name: "手动读取", applies_to: "coding", body: "# 手动读取\n\n只按点名使用。" },
  ] }) }) as { preview_id: string };
  await client.invoke(person, action(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Example" });
  const listed = await client.invoke(person, action(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] };
  const refOf = (id: string) => { const found = listed.skills.find(row => row.ref.skill_id === id); assert.ok(found, `${id} is listed`); return found.ref; };
  autoRef = refOf("auto-coding-read"); manualRef = refOf("manual-coding-read");
  await client.invoke(person, action(skillCatalogActions.setState), { scope: "project", install_id: autoRef.install_id, skill_id: autoRef.skill_id, state: "auto", expected_revision: 0 });
  await client.invoke(person, action(skillCatalogActions.setState), { scope: "project", install_id: manualRef.install_id, skill_id: manualRef.skill_id, state: "manual", expected_revision: 0 });
  const session = await f.call<{ session: { session_id: string } }>(projectId, `/api/plugins/${CODING}/sessions`, {});
  assert.equal(session.status, 200, JSON.stringify(session.body));
  const started = await f.call<{ run: { ref: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRunRef } }>(projectId,
    `/api/plugins/${CODING}/sessions/${session.body.session.session_id}/runs`,
    { task: "按自动技能整理这次会议纪要", intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  await f.ended(started.body.run.ref);
  assert.ok(seen.tool, "the model was offered and used the round's Skill read tool");
  const withResult = f.requests.find(request => JSON.stringify(request.messages).includes("tool_result"));
  assert.ok(withResult, "the tool result came back to the model in the same round");
  const results = JSON.stringify(withResult!.messages);
  assert.match(results, /先读模板/, "the automatic Skill body was read through the round's tool");
  assert.match(results, /not_named/, "the unnamed manual Skill was refused, as in the Host's round");
});
