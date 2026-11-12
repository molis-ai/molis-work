import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { SKILLS_PERMISSIONS, SKILLS_PROVIDER_ID, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
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
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.assistant-methods-test", appVersion: "1.0.0" }, storageRoot: join(h.home, "sdk"), reviewQueue: queue,
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
    const uses = homeAgentDefinitions(h.home).skills.uses(skill.ref.install_id, skill.ref.skill_id);
    assert.deepEqual(uses.map(use => [use.caller, use.ref]), [["assistant", skill.ref]]);

    // The next round does not carry it; the Skill is listed, with exactly how to read one.
    await service.send({ text: "再补一条：李四负责预算", request_id: "method-send-2", work_id: sent.work.work_id }, {});
    await until(async () => { const view = await service.read(sent.work.work_id); return view.rounds.length === 2 && view.work.state === "completed"; }, "second round");
    const second = requests.at(-1)!;
    assert.ok(!second.includes("用户为这一轮选定的方法"), "a chosen method is for its own round only");
    assert.ok(second.includes(skill.ref.installation_generation), "the round sees the Skill's exact reference");
    assert.ok(second.includes(`capability_id 为 ${skillCatalogActions.readBodies.capability_id}，version 为 ${skillCatalogActions.readBodies.version}，provider_id 为 ${SKILLS_PROVIDER_ID}`),
      "and reads its body from the shared catalog");
    assert.equal(homeAgentDefinitions(h.home).skills.uses(skill.ref.install_id, skill.ref.skill_id).length, 1, "a listed Skill is not a use");

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
  const chosen = await service.materials.chosenMethods(work, skills.map((skill, index) => ({ material_id: `m${index}`, kind: "method" as const, title: "方法", explicit: true, method: { kind: "skill" as const, ref: skill.ref } })));
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
      const ports = await assistantAuthority(h.host, work, () => new Set(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, named).actions?.("prologue");
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
