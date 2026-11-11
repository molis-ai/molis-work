import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { workExecutorRoleOf, type ActionCallContext, type ActionDefinition, type ActionNamedSkills, type ActionView, type WorkExecutorRole } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillBodyReadResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { PLUGIN_INSTALL_PERMISSIONS, homeAgentDefinitions, molisWorkHostProjectReference, pluginControlActions, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { CONTENT_PLUGIN_ID, signedContentPackage } from "./fixtures/content-package.js";
import { newPublisher } from "./fixtures/sandbox-package.js";

// S-skill-delegation (docs/system/security-invariants/S-skill-delegation.md; specs/capability-pack/contract-design.md §2.6). A round may
// read a `manual` Skill only when the Host's frozen named list holds it, and that list comes only from the Host: the route's naming envelope
// (the page's own installation's Skills) or the Host's own call to an executor's `run.start`. Every refusal here is the refusal itself:
// the reason, no round, no use recorded. Real HTTP, catalog, Agent Host and Coding; only the model's reply is fixed.

const CODING = "io.molis.work.coding";
const roles = Object.fromEntries(codingManifest.actions!.flatMap(row => {
  const role = workExecutorRoleOf(row.action);
  return role ? [[role, row]] : [];
})) as Record<WorkExecutorRole, ActionDefinition>;
const action = (value: { capability_id: string; version: number }) => ({ capability_id: value.capability_id, version: value.version });
type Session = { runs: AgentRunView[] };

/** Coding's project with another plugin's Skill installed and set to `manual` by the person, as the Skills page does. */
async function delegationHost(t: TestContext) {
  const f = await codingProductHost(t, async () => cogniaModelResponse("好的。"));
  const projectId = f.project.project_id;
  const client = f.host.actionClient(molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId }));
  const user_action = { source: "management" as const, conversation_ref: "skill-delegation", message_ref: "confirm" };
  const person: ActionCallContext = { actor_id: "web-user", project_id: projectId, audience: "user", user_action,
    permissions: ["artifact:read", "artifact:write", "storage:private", ...PLUGIN_INSTALL_PERMISSIONS, ...SKILLS_PERMISSIONS] };
  const preview = await client.invoke(person, action(pluginInstallActions.preview), { bundle: signedContentPackage(newPublisher()) }) as { preview_id: string };
  await client.invoke(person, action(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Example" });
  const listed = await client.invoke(person, action(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] };
  const skill = listed.skills.find(row => row.pack.plugin_id === CONTENT_PLUGIN_ID)!;
  await client.invoke(person, action(skillCatalogActions.setState), { scope: "project", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state: "manual", expected_revision: 0 });
  const start = (await client.discover(person)).find((view: ActionView) => view.capability_id === roles["run.start"].capability_id && view.provider.plugin_id === CODING)!;
  const startRef = { capability_id: start.capability_id, version: start.version, provider_id: start.provider.provider_id };
  /** The Host's own delegation binding: these Skills, to this installation's exact `run.start`. */
  const hostNamed = (refs: SkillRef[], bound: Partial<Pick<ActionNamedSkills, "install_id" | "action">> = {}): ActionNamedSkills =>
    ({ install_id: start.provider.plugin_install_id!, action: startRef, from: "host", refs, ...bound });
  const invoke = <Output>(role: WorkExecutorRole, input: unknown, caller: ActionCallContext = person) => client.invoke(caller, roles[role], input) as Promise<Output>;
  const open = async (title: string) => (await invoke<{ session_id: string }>("session.open", { title })).session_id;
  const runs = async (session_id: string) => (await invoke<Session>("session.read", { session_id })).runs;
  const uses = () => homeAgentDefinitions(f.home).skills.uses(skill.ref.install_id, skill.ref.skill_id);
  /** A round's own read of the catalog without the Host's round: what a gateway tool call or a plugin's own call is. */
  const readAs = (caller: ActionCallContext) => client.invoke(caller, action(skillCatalogActions.readBodies), { refs: [skill.ref] }) as Promise<{ results: SkillBodyReadResult[] }>;
  return { f, client, person, skill: skill.ref, hostNamed, invoke, open, runs, uses, readAs, startRef };
}

/** Refused for `reason`: the Runtime is never asked, so the session has no round and no use is recorded. */
async function refused(h: Awaited<ReturnType<typeof delegationHost>>, session: string, attempt: Promise<unknown>, reason: string) {
  await assert.rejects(attempt, (error: Error) => error.message.includes(reason), `refused for ${reason}`);
  assert.deepEqual(await h.runs(session), [], "no round, so no frozen record");
  assert.deepEqual(h.uses(), [], "no use recorded");
}

test("S-skill-delegation 1, 2, 11: a delegated manual Skill starts only when the Host named it; named in the input it names nothing", { timeout: 120_000 }, async t => {
  const h = await delegationHost(t);
  // 1. Handed over without the Host's named list: refused (SKC-06, CPK-09).
  const unnamed = await h.open("没点名");
  await refused(h, unnamed, h.invoke("run.start", { session_id: unnamed, task: "整理纪要", skills: [h.skill] }), "not_named");
  // 11. The run.start input is closed: a named list or a round carried in it is refused before any handler runs.
  for (const forged of [{ named_skills: h.hostNamed([h.skill]) }, { skill_round: { consumer: "coding", named: [h.skill] } }]) {
    await assert.rejects(h.invoke("run.start", { session_id: unnamed, task: "整理纪要", skills: [h.skill], ...forged }), { code: "actions.input_invalid" });
  }
  // 2. The control: the Host's delegation names it, and the round freezes it as named, replying in the delegating round's language (§2.4).
  const named = await h.open("点了名");
  await h.invoke("run.start", { session_id: named, task: "整理纪要", skills: [h.skill] }, { ...h.person, named_skills: h.hostNamed([h.skill]), locale: "en" });
  const [run] = await h.runs(named);
  assert.deepEqual(run!.frozen.skills.map(skill => [skill.ref, skill.origin, skill.named]), [[h.skill, "catalog", true]]);
  assert.equal(run!.frozen.reply_locale, "en");
});

test("S-skill-delegation 4, 6, 7: a named list bound elsewhere, or a round the caller brings, names nothing", { timeout: 120_000 }, async t => {
  const h = await delegationHost(t);
  const session = await h.open("绑定别处");
  // 4. Bound to another installation, or to another action of Coding's: the call that starts the round does not see it.
  const elsewhere: Array<Partial<Pick<ActionNamedSkills, "install_id" | "action">>> = [{ install_id: "another-install" },
    { action: { ...h.startRef, capability_id: roles["session.read"].capability_id } }];
  for (const bound of elsewhere) {
    await refused(h, session, h.invoke("run.start", { session_id: session, task: "整理纪要", skills: [h.skill] }, { ...h.person, named_skills: h.hostNamed([h.skill], bound) }), "not_named");
  }
  // 6, 7. A `skill_round` on the caller is the Host's word only on its own calls to `system.skills`: one brought to the executor opens nothing.
  await refused(h, session, h.invoke("run.start", { session_id: session, task: "整理纪要", skills: [h.skill] },
    { ...h.person, skill_round: { consumer: "coding", named: [h.skill] } }), "not_named");
});

test("S-skill-delegation 3, 5, 9: the page names only its own installation's Skills, in its envelope, for that round only", { timeout: 120_000 }, async t => {
  const h = await delegationHost(t);
  const session = await h.open("页面开的一轮");
  // The Assistant's delegated round named it; the next round, from Coding's page, does not inherit the name (9).
  await h.invoke("run.start", { session_id: session, task: "整理纪要", skills: [h.skill] }, { ...h.person, named_skills: h.hostNamed([h.skill]) });
  for (let end = Date.now() + 15_000; !["completed", "failed", "cancelled", "stopped"].includes((await h.runs(session))[0]?.phase ?? "");) {
    assert.ok(Date.now() < end, "the delegated round ends"); await new Promise(resolve => setTimeout(resolve, 50));
  }
  const before = (await h.runs(session)).length, used = h.uses().length;
  const page = (body: Record<string, unknown>) => h.f.call<{ error?: string }>(h.f.project.project_id, `/api/plugins/${CODING}/sessions/${session}/runs`,
    { task: "再整理一次", intent: "execute", provider_id: "fixture", model_id: "fixture-model", workspace_id: h.f.workspaceId, ...body });
  // 3. The Skill in the page's business field, with no envelope; 5. the envelope naming another plugin's Skill, which the Host drops (D-1).
  for (const body of [{ skills: [h.skill] }, { skills: [h.skill], named_skills: [h.skill] }]) {
    const answer = await page(body);
    assert.notEqual(answer.status, 200, JSON.stringify(answer.body));
    assert.match(JSON.stringify(answer.body), /not_named/);
    assert.equal((await h.runs(session)).length, before, "no new round");
    assert.equal(h.uses().length, used, "no use recorded");
  }
});

test("S-skill-delegation 8, 10, 12: a round's own catalog reads open no manual Skill; a stopped plugin's named Skill is refused, not replaced", { timeout: 120_000 }, async t => {
  const h = await delegationHost(t);
  // 8, 10. A round's tool call reaches the catalog as that round's agent, never with the Host's round: not named, whoever named it before.
  const [result] = (await h.readAs({ ...h.person, audience: "agent" })).results;
  assert.deepEqual(result, { ref: h.skill, ok: false, reason: "not_named" });
  // 12. Named, but its plugin was stopped since: the read is refused for that reason, and no other version is taken (SKC-08).
  await h.client.invoke(h.person, action(pluginControlActions.disable), { plugin_id: CONTENT_PLUGIN_ID });
  const session = await h.open("插件已停用");
  await refused(h, session, h.invoke("run.start", { session_id: session, task: "整理纪要", skills: [h.skill] }, { ...h.person, named_skills: h.hostNamed([h.skill]) }), "plugin_disabled");
});

test("S-skill-delegation 2, CPK-05: a Skill the person chose in the Assistant reaches Coding's round by reference, named by the Host", { timeout: 120_000 }, async t => {
  const h = await delegationHost(t);
  const project = h.f.project.project_id;
  const sent = await h.f.call<AssistantSendResult>(project, "/api/assistant/send", { text: "整理这次会议", request_id: randomUUID(),
    scope: { kind: "project", project_id: project }, executor: { kind: "plugin", plugin_id: CODING },
    materials: [{ kind: "method", title: "方法：会议纪要", explicit: true, method: { kind: "skill", ref: h.skill } }] });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const session = (sent.body.work.executor as { session_id: string }).session_id;
  const [run] = await h.runs(session);
  assert.deepEqual(run!.frozen.skills.map(skill => [skill.ref, skill.origin, skill.named]), [[h.skill, "catalog", true]], "frozen as the Assistant's round named it");
});
