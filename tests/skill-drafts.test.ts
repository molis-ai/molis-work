import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILL_AUTHORED_PLUGIN_IDS, SKILLS_DRAFT_PERMISSION, SKILLS_PERMISSIONS, skillCatalogActions, skillDraftActions, skillPlaceholders, type SkillAuthoredFields,
  type SkillBodyReadResult, type SkillCatalogEntry, type SkillDraft, type SkillDraftAdoptResult, type SkillDraftSummary, type SkillTrial, type SkillVersion } from "@molis-ai/molis-work-contracts/services/skills";
import { currentObservationSource } from "@molis-ai/molis-work-service-observation";
import { DEMO_PROJECT_ID, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, handlePluginTrustHttp, molisWorkHostProjectReference, pluginInstallActions, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { signedContentPackage } from "./fixtures/content-package.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { caller, mac } from "./fixtures/signed-package-host.js";

// Batch 42 (specs/skill-packs/authoring-path-design.md; 定样 docs/design/skill-improvement, scheme B): making a Skill better. Every
// change is a draft first and only adopting it makes a version; an Assistant may open a draft from a piece of work, with the known
// answer of that work, and replay it, never adopt it; a replay calls only the text model, in the `trial` observation source, for
// each entry the Skill applies to and the version in use beside the draft; versions are the package's signed releases; a copy of a
// general Skill remembers its source and is told of the source's newer version without being changed (BL-166).

const ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
const fields = (name: string, extra: Partial<SkillAuthoredFields> = {}): SkillAuthoredFields =>
  ({ name, description: `用户要${name}时使用。`, applies_to: "assistant", body: `# ${name}\n\n1. 先问清楚。\n2. 再动手。`, ...extra });
const refused = (code: string, field?: string) => (error: unknown) => error instanceof ActionError && error.code === code
  && (field === undefined || (error.details as { field?: string } | undefined)?.field === field);
const KNOWN = { title: "上周的周报", task: "把上周的三条进展整理成周报", material: "进展：A 完成；B 延期到周五；C 新开", expected: "周报：A 完成；B 延期到周五；C 新开。按负责人分组。" };

type Model = (prompt: string) => string;
/** A text model double: every call is answered by `answer`, and kept with the observation source it ran in. */
function modelDouble(answer: Model) {
  const calls: Array<{ prompt: string; source: string | undefined }> = [];
  return { calls, complete: async (prompt: unknown) => { const text = String(prompt); calls.push({ prompt: text, source: currentObservationSource() }); return answer(text); } };
}
/** The replay's judge answers: each result whose text names `differs` is said to differ, the others match. */
const judge = (prompt: string) => {
  const results = [...prompt.matchAll(/\{"index":(\d+),"output":"((?:[^"\\]|\\.)*)"\}/gu)];
  return JSON.stringify({ results: results.map(([, index, output]) => output!.includes("differs")
    ? { index: Number(index), verdict: "differs", differences: ["少了按负责人分组"] } : { index: Number(index), verdict: "match", differences: [] }) });
};
const isJudge = (prompt: string) => prompt.includes("你在对照技能回放的结果");

test("QEA-103 a case changed while the model waits refuses its old replay, retains other cases, and recovers before adoption", mac, async () => {
  let release!: () => void, entered!: () => void, held = false;
  const waiting = new Promise<void>(resolve => { entered = resolve; }), resume = new Promise<void>(resolve => { release = resolve; });
  const model = modelDouble(prompt => isJudge(prompt) ? judge(prompt) : "当前答案"), complete = model.complete;
  model.complete = async prompt => { const answer = await complete(prompt); if (held && !isJudge(String(prompt))) { held = false; entered(); await resume; } return answer; };
  const h = await harness(model);
  try {
    const opened = await h.draft({ scope: "project", target: { kind: "new" }, fields: fields("等待中修改答案"), case: KNOWN });
    const extra = await h.call<{ case_id: string }>(h.person, skillDraftActions.putCase, { draft_id: opened.draft_id, ...KNOWN, title: "不变的另一条" });
    await h.call(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: extra.case_id });
    held = true;
    const pending = h.call(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: opened.cases[0]!.case_id });
    const refusedTrial = assert.rejects(pending, refused("skills.draft_conflict"));
    await waiting;
    await h.call(h.person, skillDraftActions.putCase, { draft_id: opened.draft_id, case_id: opened.cases[0]!.case_id, ...KNOWN, expected: "另一份正确答案" });
    release(); await refusedTrial;
    const after = await h.call<SkillDraft>(h.person, skillDraftActions.read, { draft_id: opened.draft_id });
    assert.equal(after.cases.find(item => item.case_id === opened.cases[0]!.case_id)!.expected, "另一份正确答案");
    assert.equal(after.revision, 1, "changing an answer does not invalidate the unchanged Skill and other case");
    assert.deepEqual(after.untried, [opened.cases[0]!.case_id]);
    assert.equal(after.trial?.case_id, extra.case_id, "the outdated result did not write a trial");
    await assert.rejects(h.adopt({ draft_id: opened.draft_id, expected_revision: 1 }), refused("skills.trial_required"));
    assert.deepEqual(await h.mine(), []);
    await h.call(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: opened.cases[0]!.case_id });
    const adopted = await h.adopt({ draft_id: opened.draft_id, expected_revision: 1 });
    assert.equal(adopted.skill_version, 1);
    assert.equal((await h.mine()).length, 1);
    assert.equal((await h.drafts()).length, 0);
  } finally { release(); await h.close(); }
});

test("QEA-103 adoption uses each case's latest replay, preserving another case's current difference", mac, async () => {
  let answer = "differs";
  const model = modelDouble(prompt => isJudge(prompt) ? judge(prompt) : answer), h = await harness(model);
  try {
    const opened = await h.draft({ scope: "project", target: { kind: "new" }, fields: fields("回放恢复"), case: KNOWN });
    const extra = await h.call<{ case_id: string }>(h.person, skillDraftActions.putCase, { draft_id: opened.draft_id, ...KNOWN, title: "另一条" });
    const replay = (caseId: string) => h.call(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: caseId });
    await replay(opened.cases[0]!.case_id); await replay(extra.case_id);
    answer = "match"; await replay(opened.cases[0]!.case_id);
    await assert.rejects(h.adopt({ draft_id: opened.draft_id, expected_revision: 1 }), refused("skills.trial_differs"));
    await replay(extra.case_id);
    const adopted = await h.adopt({ draft_id: opened.draft_id, expected_revision: 1 });
    assert.equal(adopted.skill_version, 1);
    assert.equal((await h.mine()).length, 1);
  } finally { await h.close(); }
});

test("QEA-103 repeating one case does not evict another unchanged case's accepted replay", mac, async () => {
  const h = await harness(modelDouble(prompt => isJudge(prompt) ? judge(prompt) : "match"));
  try {
    const opened = await h.draft({ scope: "project", target: { kind: "new" }, fields: fields("保留已验证答案"), case: KNOWN });
    const extra = await h.call<{ case_id: string }>(h.person, skillDraftActions.putCase, { draft_id: opened.draft_id, ...KNOWN, title: "反复试的答案" });
    await h.call(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: opened.cases[0]!.case_id });
    for (let turn = 0; turn < 6; turn++) await h.call(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: extra.case_id });
    const current = await h.call<SkillDraft>(h.person, skillDraftActions.read, { draft_id: opened.draft_id });
    assert.deepEqual(current.untried, [], "the unchanged answer already passed and does not need the model again");
    assert.equal(current.trial?.case_id, extra.case_id);
    assert.equal((await h.adopt({ draft_id: opened.draft_id, expected_revision: 1 })).skill_version, 1);
  } finally { await h.close(); }
});

async function harness(model: ReturnType<typeof modelDouble> | null) {
  const base = await mkdtemp(join(tmpdir(), "molis-work-skill-drafts-")), home = join(base, "home");
  await mkdir(home);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: (model?.complete ?? null) as never });
  const databasePath = join(home, "project.sqlite"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const client = host.actionClient(reference);
  const person: ActionCallContext = { ...caller, permissions: [...SKILLS_PERMISSIONS, ...PLUGIN_INSTALL_PERMISSIONS, "model:invoke"],
    user_action: { source: "management", conversation_ref: "42:drafts", message_ref: "42:drafts" } };
  // The Assistant in a piece of work: no person's act, its work as the audit actor, the grants a draft and a replay ask.
  const assistant: ActionCallContext = { ...caller, audience: "agent", actor_kind: "runtime", audit_actor_id: "assistant:work-42", permissions: [SKILLS_DRAFT_PERMISSION, "model:invoke"] };
  const server: Server = createServer((request, response) => {
    handlePluginTrustHttp(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), { localHost: host, projectRef: reference })
      .then(handled => { if (!handled) { response.statusCode = 404; response.end(); } }, error => { response.statusCode = 500; response.end(String(error)); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  /** Adopting, as the page does: the person's own route. */
  const adopt = async (input: object): Promise<SkillDraftAdoptResult> => {
    const text = await new Promise<string>((resolve, reject) => {
      const sent = httpRequest(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/plugin-trust/skills/drafts/adopt`, { method: "POST", headers: { "content-type": "application/json" } }, response => {
        const chunks: Buffer[] = []; response.on("data", chunk => chunks.push(chunk)); response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); response.on("error", reject);
      });
      sent.on("error", reject); sent.end(JSON.stringify(input));
    });
    const body = JSON.parse(text) as SkillDraftAdoptResult | { error: string; code: string; details?: unknown };
    if (body && typeof body === "object" && "code" in body) throw new ActionError(body.code, body.error, { details: body.details as never });
    return body as SkillDraftAdoptResult;
  };
  const call = <Result>(context: ActionCallContext, action: { capability_id: string; version: number }, input: object) => client.invoke(context, ref(action), input) as Promise<Result>;
  const draft = (input: object, context = person) => call<SkillDraft>(context, skillDraftActions.create, input);
  const catalog = async () => (await call<{ skills: SkillCatalogEntry[] }>(person, skillCatalogActions.list, {})).skills;
  const mine = async () => (await catalog()).filter(skill => skill.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.project);
  const drafts = async () => (await call<{ drafts: SkillDraftSummary[] }>(person, skillDraftActions.list, {})).drafts;
  /** A new Skill of one's own, as the page writes one: a draft, then adopting it. */
  const write = async (written: SkillAuthoredFields) => { const opened = await draft({ scope: "project", target: { kind: "new" }, fields: written }); return adopt({ draft_id: opened.draft_id, expected_revision: opened.revision }); };
  const install = async (bundle: unknown, label?: string) => {
    const preview = await call<{ preview_id: string }>(person, pluginInstallActions.preview, { bundle });
    await call(person, pluginInstallActions.confirm, { preview_id: preview.preview_id, consent: true, ...(label ? { pin_label: label } : {}) });
  };
  return { client, person, assistant, call, draft, adopt, catalog, mine, drafts, write, install,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await host.close(); await rm(base, { recursive: true, force: true }); } };
}

test("SKP-11 PWA-103 PWA-104 PWA-106 S-skill-authoring the Assistant drafts a Skill from a piece of work with its known answer; nothing is used or granted until the person replays and adopts it", mac, async () => {
  const model = modelDouble(prompt => isJudge(prompt) ? judge(prompt) : "周报：A 完成；B 延期到周五；C 新开。（differs）");
  const h = await harness(model);
  try {
    const opened = await h.draft({ scope: "project", target: { kind: "new" }, fields: fields("周报整理", { body: "# 周报整理\n\n## 先弄清\n- 哪一周\n\n## 做法\n1. 收集进展。\n2. 按负责人分组。" }), case: KNOWN }, h.assistant);
    assert.equal(opened.origin.by, "assistant");
    assert.equal(opened.origin.work_ref, "assistant:work-42", "where it came from is the call context's work, not input");
    assert.deepEqual(opened.cases.map(item => [item.title, item.origin]), [["上周的周报", "conversation"]]);
    assert.equal(opened.trial_needed, true);
    // The conversation shows the platform's receipt: one sentence, the draft's name, a way to open it; the change is undone by discarding it.
    const definition = skillDraftActions.create.action;
    assert.deepEqual([definition.result_view?.link?.label, definition.result_view?.title_pointer, definition.undo?.capability_id], ["打开草稿", "/fields/name", skillDraftActions.discard.capability_id]);
    assert.deepEqual(definition.audiences, ["user", "agent"]);

    // A draft is used by nothing: no Skill in the catalog, no round can read it, and the draft is the person's to see.
    assert.deepEqual(await h.mine(), []);
    assert.deepEqual((await h.drafts()).map(row => [row.name, row.origin.by]), [["周报整理", "assistant"]]);

    // Adopting and switching on stay the person's: the Assistant's own call is refused, whatever it holds.
    await assert.rejects(h.call({ ...h.assistant, permissions: [...SKILLS_PERMISSIONS, ...PLUGIN_INSTALL_PERMISSIONS] }, skillDraftActions.adopt, { draft_id: opened.draft_id, expected_revision: 1 }),
      (error: unknown) => error instanceof ActionError, "an Agent cannot adopt a draft");
    for (const audience of ["plugin", "workflow", "mcp"] as const) {
      await assert.rejects(h.call({ ...h.person, audience }, skillDraftActions.create, { scope: "project", target: { kind: "new" } }), (error: unknown) => error instanceof ActionError, `no draft for ${audience}`);
    }

    // Adopting needs a replay of this revision; a replay that differs needs the person's yes.
    await assert.rejects(h.adopt({ draft_id: opened.draft_id, expected_revision: 1 }), refused("skills.trial_required"));
    const trial = await h.call<SkillTrial>(h.assistant, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: opened.cases[0]!.case_id });
    assert.deepEqual([trial.verdict, trial.cells.map(cell => [cell.consumer, cell.side, cell.verdict])], ["differs", [["assistant", "draft", "differs"]]]);
    assert.deepEqual(trial.cells[0]!.differences, ["少了按负责人分组"]);
    await assert.rejects(h.adopt({ draft_id: opened.draft_id, expected_revision: 1 }), refused("skills.trial_differs"));
    assert.deepEqual(await h.mine(), [], "nothing was adopted");
    const adopted = await h.adopt({ draft_id: opened.draft_id, expected_revision: 1, accept_differences: true });
    assert.deepEqual([adopted.plugin_id, adopted.skill_version], [SKILL_AUTHORED_PLUGIN_IDS.project, 1]);
    const [skill] = await h.mine();
    assert.deepEqual([skill?.name, skill?.state], ["周报整理", "off"], "a new Skill is off until the person switches it on");
    assert.deepEqual(await h.drafts(), [], "an adopted draft is closed");
    await assert.rejects(h.call(h.person, skillDraftActions.read, { draft_id: opened.draft_id }), refused("skills.draft_unknown"));

    // The known answer stays with the Skill: the next draft of it carries it.
    const next = await h.draft({ scope: "project", target: { kind: "own", skill_id: adopted.skill_id } });
    assert.deepEqual([next.cases.map(item => item.title), next.base?.version, next.target], [["上周的周报"], 1, { kind: "own", skill_id: adopted.skill_id, base_version: 1 }]);
  } finally { await h.close(); }
});

test("PWA-16 PWA-83 a replay calls only the text model, in the trial observation source, for each entry the Skill applies to with the version in use beside the draft; a stale revision is refused", mac, async () => {
  const model = modelDouble(prompt => isJudge(prompt) ? judge(prompt) : prompt.includes("新做法") ? "按负责人分组的周报" : "没分组的周报（differs）");
  const h = await harness(model);
  try {
    const first = await h.write(fields("周报整理", { applies_to: "both", body: "# 周报整理\n\n旧做法：照抄进展。" }));
    const opened = await h.draft({ scope: "project", target: { kind: "own", skill_id: first.skill_id } });
    const known = await h.call<{ case_id: string }>(h.person, skillDraftActions.putCase, { draft_id: opened.draft_id, ...KNOWN });
    const changed = await h.call<{ revision: number }>(h.person, skillDraftActions.update, { draft_id: opened.draft_id, expected_revision: 1, fields: fields("周报整理", { applies_to: "both", body: "# 周报整理\n\n新做法：按负责人分组。" }) });
    // The draft is no round's: switched on and named, the catalog still reads version 1's body.
    const [listed] = await h.mine();
    const skill = await h.call<SkillCatalogEntry>(h.person, skillCatalogActions.setState, { scope: "project", install_id: listed!.ref.install_id, skill_id: listed!.ref.skill_id, state: "auto", expected_revision: 0 });
    const read = await h.call<{ results: SkillBodyReadResult[] }>({ ...h.person, skill_round: { consumer: "assistant", named: [skill.ref] } }, skillCatalogActions.readBodies, { refs: [skill.ref] });
    assert.deepEqual([skill.ref.version, (read.results[0] as { body?: string }).body?.includes("旧做法")], [1, true]);

    await assert.rejects(h.call(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: known.case_id }), refused("skills.draft_conflict"));
    model.calls.length = 0;
    const trial = await h.call<SkillTrial>(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: changed.revision, case_id: known.case_id });
    assert.deepEqual(trial.cells.map(cell => [cell.consumer, cell.side, cell.verdict]).sort(),
      [["assistant", "base", "differs"], ["assistant", "draft", "match"], ["coding", "base", "differs"], ["coding", "draft", "match"]]);
    assert.equal(trial.verdict, "match", "the draft's verdict is its own cells'");
    assert.equal(model.calls.length, 5, "one call per entry × version, and one judge");
    assert.deepEqual([...new Set(model.calls.map(item => item.source))], ["trial"], "every model call runs as a trial, kept apart from real work");
    assert.ok(model.calls.some(item => item.prompt.includes("助理：")) && model.calls.some(item => item.prompt.includes("Coding：")), "each entry replays in its own role");
    assert.ok(model.calls.every(item => !isJudge(item.prompt) ? item.prompt.includes("没有任何工具") : true), "the replay's instructions say it has no tools");
    assert.ok(model.calls.filter(item => !isJudge(item.prompt)).every(item => item.prompt.includes(KNOWN.material)), "the known answer's material is the replay's input");

    const reopened = await h.call<SkillDraft>(h.person, skillDraftActions.read, { draft_id: opened.draft_id });
    assert.deepEqual([reopened.trial?.trial_id, reopened.trial_needed, reopened.untried], [trial.trial_id, false, []]);
    // A known answer added after the replay is not vouched for by it: adopting waits until that one is replayed too.
    const added = await h.call<{ case_id: string }>(h.person, skillDraftActions.putCase, { draft_id: opened.draft_id, ...KNOWN, title: "另一周" });
    const owed = await h.call<SkillDraft>(h.person, skillDraftActions.read, { draft_id: opened.draft_id });
    assert.deepEqual([owed.untried, owed.trial_needed], [[added.case_id], true]);
    await assert.rejects(h.adopt({ draft_id: opened.draft_id, expected_revision: changed.revision }), refused("skills.trial_required"));
    await h.call<SkillTrial>(h.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: changed.revision, case_id: added.case_id });
    const adopted = await h.adopt({ draft_id: opened.draft_id, expected_revision: changed.revision });
    assert.equal(adopted.skill_version, 2, "adopting a change is the Skill's next version");
  } finally { await h.close(); }
});

test("PWA-14 PWA-105 every version of one's own Skill is listed from the signed releases; restoring one opens a draft and is adopted as the next version; a discarded draft can be taken back", mac, async () => {
  const h = await harness(null);
  try {
    const first = await h.write(fields("周报整理", { body: "第一版做法。" }));
    const second = await h.draft({ scope: "project", target: { kind: "own", skill_id: first.skill_id }, fields: fields("周报整理", { body: "第二版做法。" }) });
    await h.adopt({ draft_id: second.draft_id, expected_revision: 1 });
    await h.write(fields("别的技能"));
    const listed = await h.call<{ versions: SkillVersion[] }>(h.person, skillDraftActions.versions, { scope: "project", skill_id: first.skill_id });
    assert.deepEqual(listed.versions.map(version => [version.version, version.fields.body]), [[2, "第二版做法。"], [1, "第一版做法。"]], "another Skill's change is no version of this one");
    assert.ok(listed.versions.every(version => version.adopted_at));

    const restoring = await h.draft({ scope: "project", target: { kind: "own", skill_id: first.skill_id, from_version: 1 } });
    assert.deepEqual([restoring.fields.body, restoring.base?.version, restoring.base?.fields.body], ["第一版做法。", 2, "第二版做法。"], "a restore is compared with the version in use");
    const restored = await h.adopt({ draft_id: restoring.draft_id, expected_revision: 1 });
    assert.equal(restored.skill_version, 3, "history is not rewritten: the old version comes back as the next one");
    assert.deepEqual((await h.call<{ versions: SkillVersion[] }>(h.person, skillDraftActions.versions, { scope: "project", skill_id: first.skill_id })).versions.map(version => [version.version, version.fields.body]),
      [[3, "第一版做法。"], [2, "第二版做法。"], [1, "第一版做法。"]]);

    const dropped = await h.draft({ scope: "project", target: { kind: "new" }, fields: fields("不要了") });
    assert.deepEqual(await h.call(h.person, skillDraftActions.discard, { draft_id: dropped.draft_id }), { draft_id: dropped.draft_id, discarded: true });
    assert.deepEqual(await h.drafts(), []);
    await assert.rejects(h.call(h.person, skillDraftActions.read, { draft_id: dropped.draft_id }), refused("skills.draft_unknown"));
    assert.deepEqual(await h.call(h.person, skillDraftActions.discard, { draft_id: dropped.draft_id, restore: true }), { draft_id: dropped.draft_id, discarded: false });
    assert.deepEqual((await h.drafts()).map(row => row.name), ["不要了"]);
    assert.equal((await h.mine()).find(skill => skill.ref.skill_id === first.skill_id)?.draft, undefined, "a new Skill's draft is no existing Skill's");
    const editing = await h.draft({ scope: "project", target: { kind: "own", skill_id: first.skill_id } });
    assert.deepEqual((await h.mine()).find(skill => skill.ref.skill_id === first.skill_id)?.draft, { draft_id: editing.draft_id }, "the catalog says a Skill has an open draft");
  } finally { await h.close(); }
});

test("BL-166 SKP-11 a copy of a general Skill remembers its source and the placeholders it replaced; the source's newer version is told, brought into a draft with the replacements, or left", mac, async () => {
  const h = await harness(null);
  try {
    const publisher = newPublisher(), pluginId = "io.molis.work.example.weekly";
    await h.install(signedContentPackage(publisher, { pluginId, skills: [{ id: "weekly", name: "周报", applies_to: "assistant", body: "# 周报\n\n把进展记进 ~~project tracker。\n" }] }), "示例发布者");
    const general = (await h.catalog()).find(skill => skill.pack.plugin_id === pluginId)!;
    const copy = await h.draft({ scope: "project", target: { kind: "custom", ref: general.ref } });
    assert.deepEqual(copy.target, { kind: "custom", source: { install_id: general.ref.install_id, plugin_id: pluginId, skill_id: "weekly", version: 1, name: "周报" } });
    assert.deepEqual(skillPlaceholders(copy.fields.body), ["~~project tracker"]);
    assert.equal(copy.base?.version, 1, "a copy is compared with its source");
    const replaced = { ...copy.fields, body: copy.fields.body.replace("~~project tracker", "Linear") };
    await h.call(h.person, skillDraftActions.update, { draft_id: copy.draft_id, expected_revision: 1, fields: replaced, replacements: { "~~project tracker": "Linear" } });
    const adopted = await h.adopt({ draft_id: copy.draft_id, expected_revision: 2 });
    assert.equal(adopted.source?.skill_id, "weekly", "adopting a copy names its source, which the person may switch off in the same step");
    const own = () => h.mine().then(rows => rows.find(row => row.ref.skill_id === adopted.skill_id)!);
    assert.deepEqual((await own()).based_on, { source: copy.target.kind === "custom" ? copy.target.source : undefined });

    // The source's next version: the copy stays as it is and says so; a draft brings the new version in with the copy's replacements.
    await h.install(signedContentPackage(publisher, { pluginId, version: "2.0.0", compatibleFrom: ["1.0.0"],
      skills: [{ id: "weekly", version: 2, name: "周报", applies_to: "assistant", body: "# 周报\n\n把进展记进 ~~project tracker，再按负责人分组。\n" }] }));
    assert.equal((await own()).based_on?.newer_version, 2);
    assert.equal((await own()).ref.version, 1, "the copy in use is not changed");
    // The capability pack's version line says it as it does of an edited prompt whose default moved on (design §2.5).
    const kit = await h.call<{ entries: Array<{ entry_id: string; version: { change?: unknown } }> }>(h.person, { capability_id: "skills.kit.report", version: 1 }, {});
    assert.deepEqual(kit.entries.find(item => item.entry_id.endsWith(`/${adopted.skill_id}`))?.version.change, { kind: "default_updated", base_version: 1, default_version: 2 });
    const rebased = await h.draft({ scope: "project", target: { kind: "own", skill_id: adopted.skill_id, from_source: true } });
    assert.match(rebased.fields.body, /记进 Linear，再按负责人分组/u);
    assert.equal(rebased.target.kind === "own" && rebased.target.rebase?.version, 2);
    await h.call(h.person, skillDraftActions.discard, { draft_id: rebased.draft_id });
    assert.deepEqual(await h.call(h.person, skillDraftActions.dismissSource, { scope: "project", skill_id: adopted.skill_id, source_version: 2 }), { skill_id: adopted.skill_id, seen_version: 2 });
    assert.equal((await own()).based_on?.newer_version, undefined, "left, it is not told again until a newer version comes");
    await assert.rejects(h.call(h.person, skillDraftActions.dismissSource, { scope: "project", skill_id: "nope", source_version: 2 }), refused("skills.authored_unknown"));
  } finally { await h.close(); }
});

test("PWA-14 「告诉助理怎么改」 rewrites the draft's fields as its next revision; an answer that is no draft and a Home without a text model are refused, and a known answer is checked", mac, async () => {
  const answers: string[] = [];
  const model = modelDouble(() => answers.shift() ?? "");
  const h = await harness(model);
  try {
    const opened = await h.draft({ scope: "project", target: { kind: "new" }, fields: fields("周报整理") });
    answers.push("```json\n" + JSON.stringify({ name: "周报整理", description: "用户要整理周报时使用。", applies_to: "nobody", body: "# 周报整理\n\n按负责人分组。" }) + "\n```");
    const revised = await h.call<SkillDraft>(h.person, skillDraftActions.revise, { draft_id: opened.draft_id, expected_revision: 1, instruction: "按负责人分组" });
    assert.deepEqual([revised.revision, revised.fields.body, revised.fields.applies_to], [2, "# 周报整理\n\n按负责人分组。", "assistant"]);
    assert.ok(model.calls[0]!.prompt.includes("按负责人分组"));
    answers.push("我不太确定。");
    await assert.rejects(h.call(h.person, skillDraftActions.revise, { draft_id: opened.draft_id, expected_revision: 2, instruction: "随便" }), refused("skills.draft_unreadable"));
    await assert.rejects(h.call(h.person, skillDraftActions.revise, { draft_id: opened.draft_id, expected_revision: 1, instruction: "随便" }), refused("skills.draft_conflict"));
    await assert.rejects(h.call(h.person, skillDraftActions.putCase, { draft_id: opened.draft_id, ...KNOWN, expected: "  " }), refused("skills.case_invalid", "expected"));
    await assert.rejects(h.call(h.person, skillDraftActions.removeCase, { draft_id: opened.draft_id, case_id: "case-nope" }), refused("skills.case_invalid", "case_id"));
  } finally { await h.close(); }
  const none = await harness(null);
  try {
    const opened = await none.draft({ scope: "project", target: { kind: "new" }, fields: fields("周报整理"), case: KNOWN });
    await assert.rejects(none.call(none.person, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: 1, case_id: opened.cases[0]!.case_id }),
      refused("actions.connection_required"), "no text model says where to set one up");
  } finally { await none.close(); }
});

test("S-skill-authoring the Assistant replays and takes back only a draft it opened in the same piece of work; the person's drafts and another work's are refused and left as they are", mac, async () => {
  const model = modelDouble(prompt => isJudge(prompt) ? judge(prompt) : "周报：A 完成；B 延期到周五；C 新开。");
  const h = await harness(model);
  try {
    const persons = await h.draft({ scope: "project", target: { kind: "new" }, fields: fields("周报整理"), case: KNOWN });
    const own = await h.draft({ scope: "project", target: { kind: "new" }, fields: fields("会议纪要"), case: KNOWN }, h.assistant);
    const elsewhere: ActionCallContext = { ...h.assistant, audit_actor_id: "assistant:work-other" };
    for (const [context, opened] of [[h.assistant, persons], [elsewhere, own]] as const) {
      await assert.rejects(h.call(context, skillDraftActions.discard, { draft_id: opened.draft_id }), refused("skills.draft_refused"));
      await assert.rejects(h.call(context, skillDraftActions.runTrial, { draft_id: opened.draft_id, expected_revision: opened.revision, case_id: opened.cases[0]!.case_id }), refused("skills.draft_refused"));
    }
    assert.equal(model.calls.length, 0, "a refused replay calls no model");
    const kept = await h.call<SkillDraft>(h.person, skillDraftActions.read, { draft_id: persons.draft_id });
    assert.deepEqual([kept.revision, kept.trial], [persons.revision, undefined], "the person's draft is as it was: not discarded, not replayed");
    assert.deepEqual((await h.drafts()).map(item => item.draft_id).sort(), [persons.draft_id, own.draft_id].sort());
    // Its own draft, in its own work: replayed and taken back.
    await h.call<SkillTrial>(h.assistant, skillDraftActions.runTrial, { draft_id: own.draft_id, expected_revision: own.revision, case_id: own.cases[0]!.case_id });
    await h.call(h.assistant, skillDraftActions.discard, { draft_id: own.draft_id });
    assert.deepEqual((await h.drafts()).map(item => item.draft_id), [persons.draft_id]);
  } finally { await h.close(); }
});
