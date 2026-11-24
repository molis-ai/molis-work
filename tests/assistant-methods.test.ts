import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, resolveSkillHandleInput, withRoundSkillHandles } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILLS_PERMISSIONS, SKILLS_PROVIDER_ID, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantMaterial } from "@molis-ai/molis-work-contracts/services/assistant";
import { AssistantService, AssistantStore, assistantAuthority, assistantServiceFor, homeAgentDefinitions, homeStores } from "@molis-ai/molis-work-app-local-host";
import { registerPluginAgentDefinitions } from "../apps/local-host/dist/plugin-instructions.js";
import { createPagesPlugin } from "@molis-ai/molis-work-plugin-pages";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";
import { answeringEndingReviews } from "./fixtures/ending-review.js";
import { installedPackageHost } from "./fixtures/signed-package-host.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { CONTENT_PLUGIN_ID, MEETING_NOTES, signedContentPackage } from "./fixtures/content-package.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error(`Expected ${what} not reached`);
}

function reply(text = "好的。"): Response {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
}

/** Parse all listed method rows out of a raw Anthropic model request JSON body. */
function methodsMaterial(raw: string): { text: string; rows: Array<Record<string, unknown>> } {
  const parsed = JSON.parse(raw) as { messages?: Array<{ role?: string; content?: unknown }> };
  const texts: string[] = [], rows: Array<Record<string, unknown>> = [];
  for (const message of parsed.messages ?? []) {
    const content = typeof message.content === "string" ? message.content
      : Array.isArray(message.content) ? message.content.map(part => (part as { text?: string }).text ?? "").join("\n") : "";
    if (!content.startsWith("Untrusted context data.")) continue;
    const data = JSON.parse(content.slice(content.indexOf("{"))) as { text?: string };
    const split = data.text?.indexOf("\n\n") ?? -1;
    if (split < 0) continue;
    const meta = JSON.parse(data.text!.slice(0, split)) as { title?: string };
    if (!meta.title?.startsWith("可用角色资料与方法")) continue;
    const body = data.text!.slice(split + 2);
    texts.push(body);
    const jsonLine = body.split("\n").at(-1) ?? "[]";
    rows.push(...(JSON.parse(jsonLine) as Array<Record<string, unknown>>));
  }
  return { text: texts.join("\n"), rows };
}

const PAGES_ID = "io.molis.work.pages";

test("a method a Plugin offers for business work is declared with business tools only and registered with the Host by id and version while it runs", async () => {
  const declared = (methods: unknown[]) => manifestProblems(declarationManifest({ methods }));
  const when = { description: "用户要整理时使用。", applies_to: "assistant" };
  assert.equal(declared([{ skill_id: "notes", version: 1, name: "纪要", summary: "整理纪要", tools: ["read-capability"], ...when }]), "");
  // RAC-1757: the same refusal after the T-111 renames (SKILL_TOOLS, inspectSkillDeclarations).
  assert.match(declared([{ skill_id: "edit", version: 1, name: "改代码", summary: "改文件", tools: ["edit-file"], ...when }]), /只能使用业务工具/);
  assert.match(declared([{ skill_id: "x", version: 1, name: "无说明", summary: "", tools: ["read-capability"], ...when }]), /适用说明/);
  const home = await mkdtemp(join(tmpdir(), "assistant-methods-registry-"));
  try {
    const registry = homeAgentDefinitions(home);
    assert.equal(registry.methods().find(method => method.owner_id === PAGES_ID), undefined, "nothing of Pages' until it runs (PG-051)");
    registerPluginAgentDefinitions({ directory: home, completeText: () => undefined, stores: homeStores() }, createPagesPlugin(), "pages-install");
    const listed = registry.methods().find(method => method.key === `${PAGES_ID}/meeting-notes`);
    assert.ok(listed, "Pages' method is registered with the Host, from its running definition");
    assert.equal(listed.source.kind, "plugin");
    assert.deepEqual([listed.name, listed.version], ["会议纪要整理", 2]);
    // ADH-14: whether writing the page asks first is the Host's, by the action's effect; the method no longer stops for it.
    assert.equal(listed.summary, "把一段会议记录或一篇会议文档整理成结论、待办（谁、做什么、何时）和待定问题，每条注明依据；用户要时写成 Pages 文档。");
    // The body the shared catalog reads is the one this installation registered, at its declared version.
    const method = registry.installation(PAGES_ID, "pages-install")?.methods?.find(item => item.skill_id === "meeting-notes");
    assert.ok(method);
    assert.equal(method.version, 2);
    assert.match(method.body, /待定问题/);
    assert.match(method.body, /\n5\. 用户要写成 Pages 文档时，新建文档写入；不覆盖已有文档，除非用户明确要求。$/);
    assert.doesNotMatch(method.body, /确认/);
    assert.equal(registry.diagnostics().owners.find(owner => owner.owner_id === PAGES_ID)?.methods, 1);
  } finally { await rm(home, { recursive: true, force: true }); }
});

// SKP-02 SKP-04 SKC-07: the Assistant reads the shared catalog. A package that only carries content (no action) is offered once the person
// turns its Skill on; before 9-2 it was offered only when its plugin had an available action here (expected change, not a looser check).
test("SKP-02 SKP-04 SKC-07 a round lists the catalog's Skills for the Assistant; one the person chose goes with that round only, by its SkillRef, and its use is recorded", { timeout: 120_000 }, async t => {
  const h = await installedPackageHost();
  const requests: string[] = [];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async (url: unknown, init: RequestInit) => {
    if (!String(url).startsWith("https://1.1.1.1/")) throw new Error("unexpected network request in fixture: " + String(url));
    requests.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array));
    return reply();
  }));
  const queue = new AgentReviewQueue(), agentHost = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "system.assistant-methods-test", appVersion: "1.0.0" }, storageRoot: join(h.home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  agentHost.register(adapter);
  const { service } = assistantServiceFor({ localHost: h.host, homeDirectory: h.home, agentHost, agentReady: async () => {}, projectTitle: async () => "方法实操", pages: async () => [] });
  const offered = async () => (await service.reads.methods(null, { project_ref: h.reference })).flatMap(item => item.kind === "skill" && item.skill.ref.source.plugin_id === CONTENT_PLUGIN_ID ? [item.skill] : []);
  try {
    await h.install(signedContentPackage(newPublisher()));
    assert.deepEqual(await offered(), [], "installed and off: the person has not turned it on");
    const person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] }, ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
    const [off] = ((await h.client.invoke(person, ref(skillCatalogActions.list), {})) as { skills: SkillCatalogEntry[] }).skills.filter(row => row.ref.source.plugin_id === CONTENT_PLUGIN_ID);
    assert.ok(off);
    await h.client.invoke(person, ref(skillCatalogActions.setState), { install_id: off.ref.install_id, skill_id: off.ref.skill_id, scope: "project", expected_revision: 0, state: "auto" });
    const [skill] = await offered();
    assert.ok(skill, "a content-only package's Skill is offered to the Assistant");
    assert.deepEqual(skill.ref, off.ref, "the same SkillRef as the catalog's, no second reference");

    // Chosen with “/”: its body goes with this round, said as the person's choice; it is recorded once the round accepted it.
    const sent = await service.send({ text: "整理一下：周三定了双周会", request_id: "method-send-1",
      materials: [{ material_id: "method-1", kind: "method", title: "方法：会议纪要", explicit: true, method: { kind: "skill", ref: skill.ref } }] }, { project_ref: h.reference });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "first round");
    const first = requests.at(-1)!;
    assert.ok(first.includes(`用户为这一轮选定的方法「${MEETING_NOTES.id}」`), "the chosen method reaches the model as the person's choice");
    assert.ok(first.includes("先读 references/template.md"), "with its body from the catalog");
    const round = (await service.read(sent.work.work_id)).rounds[0]!;
    assert.deepEqual(round.materials.map(item => [item.kind, item.method?.kind === "skill" && item.method.ref]), [["method", skill.ref]]);
    // SKL-11, SKL-01: the round's own record says which Skills it used and who chose each; the person's is 「named」.
    assert.deepEqual(round.skills, [{ ref: skill.ref, name: skill.name, picked: "named" }]);
    const uses = homeAgentDefinitions(h.home).skills.uses(skill.ref.install_id, skill.ref.skill_id);
    assert.deepEqual(uses.map(use => [use.caller, use.ref]), [["assistant", skill.ref]]);

    // The next round does not carry it; the Skill is listed with a compact per-round handle (sN) instead of its verbose SkillRef.
    await service.send({ text: "再补一条：李四负责预算", request_id: "method-send-2", work_id: sent.work.work_id }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "second round");
    const second = requests.at(-1)!;
    assert.ok(!second.includes("用户为这一轮选定的方法"), "a chosen method is for its own round only");
    const secondMethods = methodsMaterial(second);
    const listedSkill = secondMethods.rows.find(row => row.kind === "skill" && row.name === skill.name);
    assert.ok(listedSkill && typeof listedSkill.handle === "string" && /^s[1-9]\d*$/u.test(listedSkill.handle), `expected compact handle for ${skill.name}, got ${JSON.stringify(listedSkill)}`);
    assert.equal("ref" in listedSkill, false, "verbose SkillRef is omitted from methods catalog rows");
    assert.ok(!second.includes(skill.ref.installation_generation), "verbose SkillRef internals do not bloat the methods catalog");
    assert.ok(secondMethods.text.includes(`${SKILLS_PROVIDER_ID} / ${skillCatalogActions.readBodies.capability_id}@${skillCatalogActions.readBodies.version}`),
      "and points to the shared catalog read capability");
    assert.equal(homeAgentDefinitions(h.home).skills.uses(skill.ref.install_id, skill.ref.skill_id).length, 1, "a listed Skill is not a use");
    assert.deepEqual((await service.read(sent.work.work_id)).rounds[1]!.skills, [], "a round that read none used none");

    // SKL-11 「这次不用技能」: the round is not offered the Skills it could pick by itself, so it has none to read.
    await service.send({ text: "这次直接写", request_id: "method-send-plain", work_id: sent.work.work_id, auto_skills: false }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 3 && view.work.state === "completed"; }, "third round");
    assert.equal(methodsMaterial(requests.at(-1)!).rows.filter(row => row.kind === "skill").length, 0, "a round told not to pick Skills is not shown any skill handles");

    // A choice that is no longer current is refused, never swapped for another version.
    const stale: SkillRef = { ...skill.ref, installation_generation: "old" };
    await assert.rejects(service.send({ text: "用旧的", request_id: "method-send-3", work_id: sent.work.work_id,
      materials: [{ material_id: "method-2", kind: "method", title: "方法", explicit: true, method: { kind: "skill", ref: stale } }] }, {}), /not_current/);
  } finally {
    service.continuations.close(); await adapter.close(); await h.close();
  }
});

/** A catalog entry for the counting fixture: only what the Assistant reads. */
const entry = (index: number): SkillCatalogEntry => ({ ref: { source: { kind: "plugin", plugin_id: `p${index}`, plugin_version: "1.0.0", publisher_signature: "sig" }, skill_id: `s${index}`, version: 1,
  install_id: `i${index}`, installation_generation: "g" }, name: `技能 ${index}`, description: "d", applies_to: "assistant", user_invocable: true, tools: [], resources: [],
  connector_categories: [], runs_scripts: false, excerpt: "", pack: { plugin_id: `p${index}`, title: `包 ${index}`, version: "1.0.0", publisher_label: "x", trust: "pinned", scope: "project" },
  state: "auto", settings_revision: 1, availability: { available: true } });

// 09 §3.4: before, `methods()` bound each signed entry on its own (one read of the project's install records each, 20 for 20) after one full
// action discovery; now one catalog read and one binding read, and a round's chosen Skills are read in one `skills.body.read`.
test("SKC-07 reading 20 offered roles and Skills reads the install records once and the catalog once; 20 chosen Skills are one body read", async () => {
  const counts = { bind: 0, bound: 0, skills: 0, readSkills: 0, refs: 0 };
  const skills = Array.from({ length: 20 }, (_, index) => entry(index));
  const roles = Array.from({ length: 20 }, (_, index) => ({ install_id: `r${index}`, owner_id: `o${index}`, source: { kind: "plugin" as const, plugin_id: `o${index}`, plugin_version: "1.0.0", title: "包", publisher_signature: "sig" },
    role_id: `role-${index}`, version: 1, name: `角色 ${index}`, purpose: "p", default_ref: { kind: "role" as const, entry_id: `role-${index}`, source: { kind: "plugin" as const, plugin_id: `o${index}`, plugin_version: "1.0.0", publisher_signature: "sig" } } }));
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const service = new AssistantService(store, { pages: async () => [], host: async () => { throw new Error("no round"); }, authority: async () => { throw new Error("no round"); },
    methods: {
      roles: () => roles,
      bindSigned: async (_project, installs) => { counts.bind++; counts.bound += installs.length;
        return new Map(installs.map(item => [item.install_id, { installation: { install_id: item.install_id, installation_generation: "g", project_id: null }, assertCurrent: () => {} }])); },
      readSigned: () => { throw new Error("not read"); }, recordSignedUse: () => {}, recordSkillUse: () => {},
      skills: async () => { counts.skills++; return skills; },
      readSkills: async (_project, refs) => { counts.readSkills++; counts.refs += refs.length; return refs.map(ref => ({ ref, ok: true as const, name: ref.skill_id, body: "做法" })); },
    } }, "web-user");
  const offered = await service.reads.methods(null);
  assert.equal(offered.length, 40);
  assert.deepEqual([counts.bind, counts.bound, counts.skills], [1, 20, 1], "one binding read for all 20 roles, one catalog read");
  const work = store.create({ actor_id: "web-user", title: "计数", scope: { kind: "personal" }, origin: null });
  const { chosen } = await service.materials.chosenMethods(work, skills.map((skill, index) => ({ material_id: `m${index}`, kind: "method" as const, title: "方法", explicit: true, method: { kind: "skill" as const, ref: skill.ref } })));
  assert.equal(chosen.length, 20);
  assert.deepEqual([counts.readSkills, counts.refs], [1, 20], "20 chosen Skills are one body read");
});

// B1 + B3 (round-2 review, fixed): the round's tool calls carry the Assistant's `skill_round`, so the model can read an `auto`,
// assistant-only Skill's body through the catalog; a `manual` one is refused `not_named` unless the person named it. Before the fix
// the auto read was refused `not_applicable`, although the materials told the model to read it.
test("B1 B3 SKP-10: an Assistant round reads an auto assistant-only Skill through its action port, and a manual one only when named", { timeout: 120_000 }, async () => {
  const h = await installedPackageHost();
  try {
    await h.install(signedContentPackage(newPublisher(), { skills: [{ ...MEETING_NOTES, applies_to: "assistant" }] }));
    const person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] }, ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
    const [offer] = ((await h.client.invoke(person, ref(skillCatalogActions.list), {})) as { skills: SkillCatalogEntry[] }).skills.filter(row => row.ref.source.plugin_id === CONTENT_PLUGIN_ID);
    assert.ok(offer, "the content package's Skill is in the catalog");
    const setState = (state: "auto" | "manual", expected_revision: number) => h.client.invoke(person, ref(skillCatalogActions.setState),
      { install_id: offer.ref.install_id, skill_id: offer.ref.skill_id, scope: "project", expected_revision, state });
    await setState("auto", 0);
    const work = { work_id: "work-b1", session_id: null, project_ref: h.reference } as never;
    const readBody = async (named: readonly typeof offer.ref[]) => {
      const ports = await assistantAuthority(h.host, work, () => new Set(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, named).actions?.("prologue");
      assert.ok(ports);
      const read = await ports.invoke({ capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version, provider_id: SKILLS_PROVIDER_ID },
        { refs: [offer.ref] }) as { results: Array<{ ok: boolean; reason?: string; body?: string }> };
      return read.results[0]!;
    };
    const auto = await readBody([]);
    assert.deepEqual([auto.ok, auto.body?.includes("先读 references/template.md")], [true, true], "the round reads its own auto Skill's body");
    await setState("manual", 1);
    assert.equal((await readBody([])).reason, "not_named", "a manual Skill nobody named is not readable");
    assert.equal((await readBody([offer.ref])).ok, true, "the person's named list makes it readable");
  } finally { await h.close(); }
});

test("M3: per-round skill handle translation, 37/37 visibility, cold-to-hot ordering, minute timestamp, and pinned situation", async () => {
  const skills = Array.from({ length: 37 }, (_, index) => ({
    ...entry(index),
    ref: { ...entry(index).ref, skill_id: index >= 30 ? `work-skill-${index}` : index >= 24 ? `overlay-skill-${index}` : `domain-skill-${index}` },
    name: index >= 30 ? `工作方法 ${index}` : index >= 24 ? `叠加方法 ${index}` : `领域方法 ${index}`,
  }));
  const manualSkill: SkillCatalogEntry = { ...entry(99), ref: { ...entry(99).ref, skill_id: "manual-only" }, name: "手动专属", state: "manual" };
  let clock = new Date("2026-11-23T09:15:12.345Z");
  const store = new AssistantStore(new DatabaseSync(":memory:"), () => clock);
  const service = new AssistantService(store, {
    pages: async () => [],
    host: async () => { throw new Error("no round"); },
    authority: async () => { throw new Error("no round"); },
    timeZone: "Asia/Shanghai",
    methods: {
      roles: () => [],
      bindSigned: async () => new Map(),
      readSigned: () => { throw new Error("not read"); },
      recordSignedUse: () => {},
      recordSkillUse: () => {},
      skills: async () => [...skills, manualSkill],
      readSkills: async () => [],
    },
  }, "web-user", () => clock);
  const work = store.create({ actor_id: "web-user", title: "37 项技能可见性与缓存顺序", scope: { kind: "personal" }, origin: null });
  const offered: ActionView[] = [{
    capability_id: "skills.body.read", version: 1, operation: "query",
    provider: { provider_id: SKILLS_PROVIDER_ID, title: "技能", kind: "system" }, availability: { available: true },
    action: { title: "读取技能正文", description: "按精确引用读技能正文", kind: "query", scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [], input_schema: { type: "object" } },
  }];
  const roundMaterials = async (
    materials: AssistantMaterial[],
  ): Promise<{ materials: AgentTextMaterial[]; skillHandles?: ReadonlyMap<string, SkillRef> }> =>
    service["materials"].roundMaterials(work, materials, null, offered, [], false, true);
  const first = await roundMaterials([]);
  // All 37 auto skills appear (no .slice(0, 20) truncation); manual skill never gets a handle.
  assert.equal(first.skillHandles?.size, 37, "every auto skill gets a compact handle");
  assert.ok([...first.skillHandles!.values()].every(ref => ref.skill_id !== "manual-only"), "manual skills never get a handle");
  const methodsText = first.materials.filter(m => m.material_id === "methods" || m.material_id.startsWith("methods.")).map(m => m.text).join("\n");
  for (const id of ["domain-skill-0", "overlay-skill-24", "work-skill-36"]) {
    const idx = skills.findIndex(s => s.ref.skill_id === id);
    assert.ok(methodsText.includes(`"handle":"s${idx + 1}"`), `${id} has handle s${idx + 1}`);
  }
  assert.ok(!methodsText.includes("manual-only"), "manual skills are omitted from the auto methods list");
  // Cold-to-hot ordering: capabilities & methods appear before `situation`.
  const capIndex = first.materials.findIndex(m => m.material_id === "capabilities");
  const methodsIndex = first.materials.findIndex(m => m.material_id === "methods" || m.material_id.startsWith("methods."));
  const sitIndex = first.materials.findIndex(m => m.material_id === "situation");
  assert.ok(capIndex >= 0 && methodsIndex > capIndex && sitIndex > methodsIndex, `expected capabilities < methods < situation, got ${[capIndex, methodsIndex, sitIndex].join(",")}`);
  // Minute-level local timestamp: advancing seconds within the same minute keeps `situation` byte-identical.
  const firstSituation = first.materials[sitIndex]!.text;
  assert.doesNotMatch(firstSituation, /2026-11-23T09:15:12/, "no ISO second/ms timestamp in situation");
  clock = new Date("2026-11-23T09:15:58.999Z");
  const second = await roundMaterials([]);
  assert.equal(second.materials.find(m => m.material_id === "situation")!.text, firstSituation, "situation stays cache-identical within the same minute");
  // Decision 58: 35 dynamic materials still never truncate pinned `situation` under the 30-item cap.
  const flood = Array.from({ length: 35 }, (_, i) => ({ material_id: `extra-${i}`, kind: "text" as const, title: `材料 ${i}`, explicit: true, text: `正文 ${i}` }));
  const capped = await roundMaterials(flood);
  assert.equal(capped.materials.length, 30, "total materials stay within the 30-item cap");
  assert.ok(capped.materials.some(m => m.material_id === "situation"), "situation is pinned and never truncated");

  // Gateway handle translation boundary: translates sN on check & invoke, passes full SkillRef through, rejects unknown handles, never wraps offer.
  const handles = first.skillHandles!;
  const readBodiesRef = { capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version, provider_id: SKILLS_PROVIDER_ID };
  const readResourceRef = { capability_id: skillCatalogActions.readResource.capability_id, version: skillCatalogActions.readResource.version, provider_id: SKILLS_PROVIDER_ID };
  const fullRef = skills[36]!.ref;
  assert.deepEqual(resolveSkillHandleInput(readBodiesRef, { refs: ["s1", fullRef] }, handles), { refs: [skills[0]!.ref, fullRef] });
  assert.deepEqual(resolveSkillHandleInput(readResourceRef, { ref: "s37", path: "references/a.md" }, handles), { ref: fullRef, path: "references/a.md" });
  assert.deepEqual(resolveSkillHandleInput({ ...readBodiesRef, version: readBodiesRef.version + 1 }, { refs: ["s1"] }, handles), { refs: ["s1"] }, "version mismatch is not translated");
  assert.deepEqual(resolveSkillHandleInput({ ...readResourceRef, version: readResourceRef.version + 1 }, { ref: "s37", path: "a.md" }, handles), { ref: "s37", path: "a.md" }, "resource version mismatch is not translated");
  assert.throws(() => resolveSkillHandleInput(readBodiesRef, { refs: ["s999"] }, handles), (e: unknown) => e instanceof ActionError && e.code === "actions.input_invalid");
  assert.throws(() => resolveSkillHandleInput(readResourceRef, { ref: "manual-only", path: "a.md" }, handles), (e: unknown) => e instanceof ActionError && e.code === "actions.input_invalid");
  const seen: { checked?: unknown; invoked?: unknown; offered?: unknown } = {};
  const wrapped = withRoundSkillHandles({
    discover: async () => offered,
    check: async (_ref, input) => { seen.checked = input; },
    invoke: async (_ref, input) => { seen.invoked = input; return { results: [] }; },
    offer: async offer => { seen.offered = offer.input; return { offer_id: "o1" }; },
  }, handles);
  await wrapped.check!(readBodiesRef, { refs: ["s1"] });
  await wrapped.invoke(readBodiesRef, { refs: ["s37"] });
  await wrapped.offer!({ title: "t", summary: "s", reference: readBodiesRef, input: { refs: ["s1"] } });
  assert.deepEqual(seen.checked, { refs: [skills[0]!.ref] }, "check resolves handle to exact frozen SkillRef");
  assert.deepEqual(seen.invoked, { refs: [fullRef] }, "invoke resolves handle to exact frozen SkillRef");
  assert.deepEqual(seen.offered, { refs: ["s1"] }, "offer never resolves ephemeral handles");
});

test("M3: end-to-end Assistant round reads an auto Skill via compact handle and records canonical SkillRef", { timeout: 120_000 }, async t => {
  const h = await installedPackageHost();
  let toolStep = 0;
  let pickedHandle: string | undefined;
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async (_url: unknown, init: RequestInit) => {
    const body = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const listed = methodsMaterial(body).rows.find(row => row.kind === "skill" && row.name === MEETING_NOTES.id);
    if (toolStep === 0 && typeof listed?.handle === "string") {
      toolStep++;
      pickedHandle = listed.handle;
      const events: string[] = [];
      const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
      emit("message_start", { message: { id: "m1", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
      emit("content_block_start", { index: 0, content_block: { type: "tool_use", id: "call-read-skill", name: "read-capability", input: {} } });
      emit("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({
        capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version, provider_id: SKILLS_PROVIDER_ID, input: { refs: [pickedHandle] },
      }) } });
      emit("content_block_stop", { index: 0 });
      emit("message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 10 } });
      emit("message_stop", {});
      return new Response(events.join(""), { headers: { "content-type": "text/event-stream" } });
    }
    return reply("已按会议纪要方法整理完成。");
  }));
  const queue = new AgentReviewQueue(), agentHost = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-handle-e2e", appVersion: "1.0.0" }, storageRoot: join(h.home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  agentHost.register(adapter);
  const { service } = assistantServiceFor({ localHost: h.host, homeDirectory: h.home, agentHost, agentReady: async () => {}, projectTitle: async () => "句柄实测", pages: async () => [] });
  try {
    await h.install(signedContentPackage(newPublisher()));
    const person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] }, ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
    const [off] = ((await h.client.invoke(person, ref(skillCatalogActions.list), {})) as { skills: SkillCatalogEntry[] }).skills.filter(row => row.ref.source.plugin_id === CONTENT_PLUGIN_ID);
    assert.ok(off);
    await h.client.invoke(person, ref(skillCatalogActions.setState), { install_id: off.ref.install_id, skill_id: off.ref.skill_id, scope: "project", expected_revision: 0, state: "auto" });
    const sent = await service.send({ text: "帮我整理会议纪要", request_id: "handle-e2e-1" }, { project_ref: h.reference });
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "handle round");
    assert.equal(toolStep, 1, "model read the Skill via compact handle s1");
    const round = (await service.read(sent.work.work_id)).rounds[0]!;
    assert.deepEqual(round.skills, [{ ref: off.ref, name: off.name, picked: "auto" }], "round.skills records the canonical 8-field SkillRef");
  } finally {
    service.continuations.close(); await adapter.close(); await h.close();
  }
});

test("M3 S-skill-delegation: assistant-dispatch isolates per-round skill handles to the exact parent session, never child subagent sessions", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "assistant-handle-child-iso-"));
  const autoSkill = entry(0);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const invokedInputs: Array<{ session: string; input: unknown }> = [];
  const readBodiesRef = { capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version, provider_id: SKILLS_PROVIDER_ID };
  const offered: ActionView[] = [{
    capability_id: skillCatalogActions.readBodies.capability_id, version: skillCatalogActions.readBodies.version, operation: "query",
    provider: { provider_id: SKILLS_PROVIDER_ID, title: "技能", kind: "system" }, availability: { available: true },
    action: { title: "读取技能正文", description: "按精确引用读技能正文", kind: "query", scope: "project", audiences: ["agent"], permissions: [], subject_kinds: [], input_schema: { type: "object" } },
  }];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async () => reply("好的。")));
  const queue = new AgentReviewQueue(), agentHost = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-handle-child-iso", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "fixture-only" });
  agentHost.register(adapter);
  let capturedAuthority: import("@molis-ai/molis-work-service-agent-host").AgentStartAuthority | undefined;
  let capturedSessionId: string | undefined;
  const realStart = agentHost.start.bind(agentHost);
  agentHost.start = (async (runtimeId, request, authority) => {
    capturedAuthority = authority;
    capturedSessionId = request.session.session_id;
    return realStart(runtimeId, request, authority);
  }) as typeof agentHost.start;
  const service = new AssistantService(store, {
    pages: async () => [],
    host: async () => agentHost,
    authority: async () => ({
      manifest: { roles: [{ role_id: "assistant", version: 1, name: "个人工作助理", workspace: "business", execution: "operate", prompts: [], host_tools: [] }], prompts: [] },
      authorizedDirectories: [],
      actions: async (_runtime, _validate, session) => ({
        discover: async () => offered,
        invoke: async (_ref, input) => { invokedInputs.push({ session: session?.session_id ?? "none", input }); return { results: [] }; },
      }),
    }),
    methods: {
      roles: () => [],
      bindSigned: async () => new Map(),
      readSigned: () => { throw new Error("not read"); },
      recordSignedUse: () => {},
      recordSkillUse: () => {},
      skills: async () => [autoSkill],
      readSkills: async () => [],
    },
  }, "web-user");
  try {
    const sent = await service.send({ text: "测试子会话句柄隔离", request_id: "child-isolation-1" }, {});
    await until(async () => (await service.read(sent.work.work_id)).work.state === "completed", "isolation round");
    assert.ok(capturedAuthority?.actions && capturedSessionId, "dispatch passed wrapped actions authority to host.start");
    const parentClient = await capturedAuthority.actions("prologue", undefined, { session_id: capturedSessionId, runtime_id: "prologue" });
    const childClient = await capturedAuthority.actions("prologue", undefined, { session_id: `${capturedSessionId}-child`, runtime_id: "prologue" });
    const unscopedClient = await capturedAuthority.actions("prologue");
    await parentClient.invoke(readBodiesRef, { refs: ["s1"] });
    await childClient.invoke(readBodiesRef, { refs: ["s1"] });
    await unscopedClient.invoke(readBodiesRef, { refs: ["s1"] });
    assert.deepEqual(invokedInputs, [
      { session: capturedSessionId, input: { refs: [autoSkill.ref] } },
      { session: `${capturedSessionId}-child`, input: { refs: ["s1"] } },
      { session: "none", input: { refs: ["s1"] } },
    ], "only the exact parent session translates s1 to the frozen SkillRef; child and unscoped sessions never inherit parent handles");
  } finally {
    service.continuations.close(); await adapter.close(); await rm(home, { recursive: true, force: true });
  }
});

test("P1 #4: 30-item cap prioritizes dynamic safety context over semi-static catalogs and clears told when truncated", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "assistant-overflow-cap-"));
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const longLine = "说明内容".repeat(120);
  const manyMethods: SkillCatalogEntry[] = Array.from({ length: 450 }, (_, idx) => ({
    ...entry(idx),
    name: `自动方法-${idx}`,
    description: `${longLine}-${idx}`,
    when_to_use: `${longLine}-use-${idx}`,
    when_not_to_use: `${longLine}-not-${idx}`,
    pack: { ...entry(idx).pack, title: `扩展包-${idx}` },
  }));
  let capturedMaterials: AgentTextMaterial[] = [];
  let currentMethods: SkillCatalogEntry[] = manyMethods;
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(text), async () => reply("收到。")));
  const queue = new AgentReviewQueue(), agentHost = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-overflow-cap", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture", context_tokens: 1_000_000 }),
    resolveCredential: () => "fixture-only" });
  agentHost.register(adapter);
  const realStart = agentHost.start.bind(agentHost);
  agentHost.start = (async (runtimeId, request, authority) => {
    capturedMaterials = [...(request.text_materials ?? [])];
    return realStart(runtimeId, request, authority);
  }) as typeof agentHost.start;
  const service = new AssistantService(store, {
    pages: async () => [],
    host: async () => agentHost,
    authority: async () => ({
      manifest: { roles: [{ role_id: "assistant", version: 1, name: "个人工作助理", workspace: "business", execution: "operate", prompts: [], host_tools: [] }], prompts: [] },
      authorizedDirectories: [],
      actions: async () => ({ discover: async () => [], invoke: async () => ({ results: [] }) }),
    }),
    methods: {
      roles: () => [],
      bindSigned: async () => new Map(),
      readSigned: () => { throw new Error("not read"); },
      recordSignedUse: () => {},
      recordSkillUse: () => {},
      skills: async () => currentMethods,
      readSkills: async () => [],
    },
  }, "web-user");
  try {
    // Case A: semi-static catalogs exceed 30 items; dynamic safety context (`undone`, `material-*`) and `situation` must survive.
    const workA = store.create({ actor_id: "web-user", scope: { kind: "personal" }, title: "超额半静态测试", origin: null });
    store.saveUndo("web-user", {
      undo_id: "undo-a", work_id: workA.work_id, title: "已撤销的改动", state: "undone",
      created_at: "2026-11-24T00:00:00.000Z", undone_at: "2026-11-24T00:01:00.000Z",
      reference: { capability_id: "demo.undo", version: 1, provider_id: "demo.provider" }, input: {},
    });
    const sentA = await service.send({
      work_id: workA.work_id, text: "继续处理", request_id: "overflow-semi-1",
      materials: [{ material_id: "m1", kind: "text", title: "用户补充材料", text: "必须看到的本轮材料", explicit: true }],
    }, {});
    await until(async () => (await service.read(sentA.work.work_id)).work.state === "completed", "case A");
    assert.equal(capturedMaterials.length, 30);
    const idsA = capturedMaterials.map(item => item.material_id);
    const situationIdx = idsA.indexOf("situation");
    const undoneIdx = idsA.indexOf("undone");
    const matIdx = idsA.indexOf("material-m1");
    assert.ok(idsA.some(id => id.startsWith("methods.")), "semi-static methods fill the prefix before situation");
    assert.ok(situationIdx > 0, "situation remains pinned after semi-static prefix");
    assert.ok(undoneIdx > situationIdx, "undone safety context is preserved after situation");
    assert.ok(matIdx > situationIdx, "user material is preserved after situation");
    assert.equal(store.undos("web-user", workA.work_id).find(u => u.undo_id === "undo-a")?.told, true, "undo is marked told when actually included");

    // Case B: dynamic `undone` itself chunks past the 29-slot budget (`30 - 1` pinned `situation`),
    // so the partially truncated `undone` series MUST NOT be marked told.
    currentMethods = [];
    const workB = store.create({ actor_id: "web-user", scope: { kind: "personal" }, title: "超额动态测试", origin: null });
    const longUndoTitle = "undo-detail-".repeat(45);
    for (let idx = 0; idx < 1100; idx++) {
      store.saveUndo("web-user", {
        undo_id: `undo-b-${idx}`, work_id: workB.work_id, title: `${longUndoTitle}-${idx}`, state: "undone",
        created_at: "2026-11-24T00:00:00.000Z", undone_at: "2026-11-24T00:01:00.000Z",
        reference: { capability_id: "demo.undo", version: 1, provider_id: "demo.provider" }, input: {},
      });
    }
    const sentB = await service.send({ work_id: workB.work_id, text: "继续处理", request_id: "overflow-dynamic-1" }, {});
    await until(async () => (await service.read(sentB.work.work_id)).work.state === "completed", "case B");
    assert.equal(capturedMaterials.length, 30);
    assert.equal(capturedMaterials.filter(item => item.material_id.startsWith("undone.")).length, 29, "only 29 of the >29 undone chunks fit beside pinned situation");
    assert.ok(store.undos("web-user", workB.work_id).every(u => u.told !== true), "partially truncated undone safety context must not be marked told");
  } finally {
    service.continuations.close(); await adapter.close(); await rm(home, { recursive: true, force: true });
  }
});
