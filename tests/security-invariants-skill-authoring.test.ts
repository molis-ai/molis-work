import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { SKILL_AUTHORED_PLUGIN_IDS, SKILLS_PERMISSIONS, skillAuthoringActions, skillCatalogActions, skillDraftActions, type SkillAuthoredFields, type SkillAuthoredSaveResult, type SkillAuthoredSource,
  type SkillBodyReadResult, type SkillCatalogEntry, type SkillDraft, type SkillScope, type SkillVersion } from "@molis-ai/molis-work-contracts/services/skills";
import { DEMO_PROJECT_ID, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, handlePluginTrustHttp, homeAgentDefinitions, molisWorkHostProjectReference, pluginInstallActions, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { signedContentPackage } from "./fixtures/content-package.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { caller, mac } from "./fixtures/signed-package-host.js";

// S-skill-authoring. Batch 41, 41-2 (specs/prologue-strategies/skill.md §10, 定样 docs/design/skill-authoring 方案 B): the person writes Skills of their own in
// settings. A scope's own Skills are one content package signed with this Home's publisher identity and installed through the one
// install path; a new Skill is `off` until the person says otherwise; saving a change is the Skill's next version and keeps every
// other Skill as it was; removing the last one takes the package off, through the project settings door (S-94). A draft is the text
// model's proposal for the form and writes nothing. Since batch 42 a Skill is written by opening a draft and adopting it
// (`skills.drafts.create` → `/api/plugin-trust/skills/drafts/adopt`), which `save` below does in the person's two steps.

const ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
const fields = (name: string, extra: Partial<SkillAuthoredFields> = {}): SkillAuthoredFields =>
  ({ name, description: `用户要${name}时使用。`, applies_to: "assistant", body: `# ${name}\n\n1. 先问清楚。\n2. 再动手。`, ...extra });
const refused = (code: string, field?: string) => (error: unknown) => error instanceof ActionError && error.code === code
  && (field === undefined || (error.details as { field?: string } | undefined)?.field === field);

async function harness(completeText: ((prompt: unknown) => Promise<string>) | null = null) {
  const base = await mkdtemp(join(tmpdir(), "molis-work-skill-authoring-")), home = join(base, "home");
  await mkdir(home);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: completeText as never });
  const databasePath = join(home, "project.sqlite"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const client = host.actionClient(reference);
  const person = { ...caller, permissions: [...SKILLS_PERMISSIONS, ...PLUGIN_INSTALL_PERMISSIONS, "model:invoke"], user_action: { source: "management" as const, conversation_ref: "41-2:authoring", message_ref: "41-2:save" } };
  // The page's own routes: adopting goes through `/api/plugin-trust/skills/drafts/adopt`, drafting and removing through
  // `/api/plugin-trust/skills/authored/*`, removing under the settings door's entry.
  const server: Server = createServer((request, response) => {
    handlePluginTrustHttp(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), { localHost: host, projectRef: reference })
      .then(handled => { if (!handled) { response.statusCode = 404; response.end(); } }, error => { response.statusCode = 500; response.end(String(error)); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const post = async <Result>(route: "drafts/adopt" | "draft" | "remove", input: object): Promise<Result> => {
    const text = await new Promise<string>((resolve, reject) => {
      const sent = httpRequest(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/plugin-trust/skills/${route === "drafts/adopt" ? route : `authored/${route}`}`, { method: "POST", headers: { "content-type": "application/json" } }, response => {
        const chunks: Buffer[] = []; response.on("data", chunk => chunks.push(chunk)); response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); response.on("error", reject);
      });
      sent.on("error", reject); sent.end(JSON.stringify(input));
    });
    const body = JSON.parse(text) as Result | { error: string; code: string; details?: unknown };
    if (body && typeof body === "object" && "code" in body) throw new ActionError(body.code, body.error, { details: body.details as never });
    return body as Result;
  };
  const mine = async () => (await client.invoke(person, ref(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] }).skills.filter(skill => skill.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.project);
  const source = (entry: SkillCatalogEntry) => client.invoke(person, ref(skillAuthoringActions.read), { ref: entry.ref }) as Promise<SkillAuthoredSource>;
  const installed = async () => (await client.invoke(person, ref(pluginInstallActions.installed), {}) as { plugins: Array<{ plugin_id: string; version: string }> }).plugins.filter(row => row.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.project);
  /** Writing a Skill as the page does: a draft of a new one or of one's own, with these fields, then adopting it. */
  const save = async <Result = SkillAuthoredSaveResult>(input: SkillAuthoredFields & { scope: SkillScope; skill_id?: string }): Promise<Result> => {
    const { scope, skill_id, ...written } = input;
    const draft = await client.invoke(person, ref(skillDraftActions.create), { scope, target: skill_id ? { kind: "own", skill_id } : { kind: "new" }, fields: written }) as SkillDraft;
    return post<Result>("drafts/adopt", { draft_id: draft.draft_id, expected_revision: draft.revision });
  };
  return { client, person, post, save, mine, source, installed, reference, host, home,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await host.close(); await rm(base, { recursive: true, force: true }); } };
}

test("SKL-41-2-AU-01 a Skill the person writes is saved off, from this machine, readable back as written; a change is its next version and keeps the others; a stale change, a taken name and an empty field are refused", mac, async () => {
  const h = await harness();
  try {
    const first = await h.save({ ...fields("周报整理", { when_not_to_use: "只是闲聊时不用。", argument_hint: "哪一周" }), scope: "project" });
    assert.deepEqual([first.plugin_id, first.version, first.skill_version], [SKILL_AUTHORED_PLUGIN_IDS.project, "1.0.0", 1]);
    assert.match(first.skill_id, /^skill-[0-9a-f]{8}$/, "a name with no Latin letters gets a made id");
    const [entry] = await h.mine();
    assert.ok(entry);
    assert.deepEqual([entry.name, entry.state, entry.applies_to, entry.pack.trust === "host", entry.ref.version], ["周报整理", "off", "assistant", false, 1]);
    const read = await h.source(entry);
    assert.deepEqual({ name: read.name, description: read.description, when_not_to_use: read.when_not_to_use, argument_hint: read.argument_hint, applies_to: read.applies_to, body: read.body, mine: read.mine, version: read.version, scope: read.scope },
      { ...fields("周报整理"), when_not_to_use: "只是闲聊时不用。", argument_hint: "哪一周", mine: true, version: 1, scope: "project" });

    const second = await h.save({ ...fields("Meeting notes"), scope: "project" });
    assert.deepEqual([second.skill_id, second.version], ["meeting-notes", "2.0.0"]);

    // The person switches the first on; a change to it keeps that choice and is version 2.
    const on = await h.client.invoke(h.person, ref(skillCatalogActions.setState), { scope: "project", install_id: entry.ref.install_id, skill_id: first.skill_id, state: "auto", expected_revision: entry.settings_revision }) as SkillCatalogEntry;
    assert.equal(on.state, "auto");
    const changed = await h.save({ ...fields("周报整理", { body: "改过的做法。" }), scope: "project", skill_id: first.skill_id });
    assert.deepEqual([changed.skill_version, changed.version], [2, "3.0.0"]);
    const after = await h.mine();
    assert.deepEqual(after.map(skill => [skill.ref.skill_id, skill.ref.version, skill.state]).sort(), [["meeting-notes", 1, "off"], [first.skill_id, 2, "auto"]].sort());
    assert.equal((await h.source(after.find(skill => skill.ref.skill_id === first.skill_id)!)).body, "改过的做法。");
    assert.equal((await h.installed()).length, 1, "one package holds the scope's own Skills");

    // A draft is written against the revision read: a change on top of an older revision is refused (batch 42).
    const open = await h.client.invoke(h.person, ref(skillDraftActions.create), { scope: "project", target: { kind: "own", skill_id: first.skill_id } }) as SkillDraft;
    await h.client.invoke(h.person, ref(skillDraftActions.update), { draft_id: open.draft_id, expected_revision: 1, fields: { ...fields("周报整理"), body: "又一版。" } });
    await assert.rejects(h.client.invoke(h.person, ref(skillDraftActions.update), { draft_id: open.draft_id, expected_revision: 1, fields: fields("周报整理") }), refused("skills.draft_conflict"));
    await h.client.invoke(h.person, ref(skillDraftActions.discard), { draft_id: open.draft_id });
    await assert.rejects(h.save({ ...fields("Meeting notes"), scope: "project" }), refused("skills.authored_name_taken", "name"));
    await assert.rejects(h.save({ ...fields("Meeting notes"), scope: "project", skill_id: first.skill_id }), refused("skills.authored_name_taken", "name"));
    await assert.rejects(h.save({ ...fields("空的", { body: "  \n " }), scope: "project" }), refused("skills.authored_invalid", "body"));
    await assert.rejects(h.save({ ...fields("太长", { body: Array.from({ length: SKILL_LIMITS.bodyLines + 1 }, () => "x").join("\n") }), scope: "project" }), refused("skills.authored_invalid", "body"));
    await assert.rejects(h.save({ ...fields("没有的"), scope: "project", skill_id: "nope" }), refused("skills.authored_unknown"));
    assert.deepEqual((await h.mine()).map(skill => skill.ref.version).sort(), [1, 2], "a refused save leaves the package as it was");
  } finally { await h.close(); }
});

test("SKL-41-2-AU-02 B42-F06 B42-F07 B42-F08 removal takes only the settings door, and no Agent or plugin can write or remove one. A same-name rebuild has its own identity.", mac, async () => {
  const h = await harness();
  try {
    const a = await h.save({ ...fields("alpha"), scope: "project" }), b = await h.save({ ...fields("beta"), scope: "project" });
    await assert.rejects(h.post("remove", { scope: "project", skill_id: a.skill_id, expected_version: 2 }), refused("skills.authored_conflict"));
    // Outside the settings door — the action called directly, even by the person — nothing is removed.
    await assert.rejects(h.client.invoke(h.person, ref(skillAuthoringActions.remove), { scope: "project", skill_id: a.skill_id, expected_version: 1 }), refused("actions.forbidden"));
    // Every authored action is the person's alone: no Agent, plugin, workflow or MCP caller can adopt, remove or draft.
    for (const audience of ["agent", "plugin", "workflow", "mcp"] as const) {
      for (const [action, input] of [
        [skillDraftActions.adopt, { draft_id: "draft-x", expected_revision: 1 }],
        [skillAuthoringActions.remove, { scope: "project", skill_id: a.skill_id, expected_version: 1 }],
        [skillAuthoringActions.draft, { intent: "帮我写一个技能" }],
      ] as const) {
        await assert.rejects(h.client.invoke({ ...h.person, audience }, ref(action), input), (error: unknown) => error instanceof ActionError,
          `${action.capability_id} must be refused for ${audience}`);
      }
    }
    const before = await h.mine();
    assert.equal(before.length, 2);
    const old = before.find(skill => skill.ref.skill_id === a.skill_id)!;
    const uses = homeAgentDefinitions(h.home).skills;
    uses.recordUse({ ref: old.ref, name: old.name, scope_ref: DEMO_PROJECT_ID, caller: "assistant", at: new Date().toISOString() });
    const orphan = await h.client.invoke(h.person, ref(skillDraftActions.create), { scope: "project", target: { kind: "own", skill_id: a.skill_id } }) as SkillDraft;
    assert.deepEqual((await h.mine()).find(skill => skill.ref.skill_id === a.skill_id)!.recent_uses, { assistant: 1 });

    assert.deepEqual(await h.post("remove", { scope: "project", skill_id: a.skill_id, expected_version: 1 }), { skill_id: a.skill_id, remaining: 1 });
    assert.deepEqual((await h.mine()).map(skill => skill.ref.skill_id), [b.skill_id]);
    const written = fields("alpha", { body: "恢复的正文。" });
    const rebuilt = await h.save({ ...written, scope: "project" });
    const fresh = (await h.mine()).find(skill => skill.ref.skill_id === rebuilt.skill_id)!;
    assert.equal(fresh.ref.install_id, old.ref.install_id, "the other Skill kept the original installation in place");
    assert.notEqual(fresh.ref.skill_id, old.ref.skill_id);
    assert.equal(fresh.ref.version, 1);
    assert.equal(fresh.recent_uses, undefined);
    assert.deepEqual(uses.uses(old.ref.install_id, old.ref.skill_id).map(use => use.ref), [old.ref]);
    const versions = await h.client.invoke(h.person, ref(skillDraftActions.versions), { scope: "project", skill_id: fresh.ref.skill_id }) as { versions: SkillVersion[] };
    assert.deepEqual(versions.versions.map(version => version.fields.body), [written.body]);
    const oldDraft = await h.client.invoke(h.person, ref(skillDraftActions.read), { draft_id: orphan.draft_id }) as SkillDraft;
    assert.equal(oldDraft.base, undefined);
    await assert.rejects(h.post("drafts/adopt", { draft_id: orphan.draft_id, expected_revision: orphan.revision }), refused("skills.authored_unknown"));
    assert.equal((await h.source(fresh)).body, written.body);

    await h.post("remove", { scope: "project", skill_id: rebuilt.skill_id, expected_version: 1 });
    assert.deepEqual(await h.post("remove", { scope: "project", skill_id: b.skill_id, expected_version: 1 }), { skill_id: b.skill_id, remaining: 0 });
    assert.deepEqual([await h.mine(), await h.installed()], [[], []]);
    await assert.rejects(h.post("remove", { scope: "project", skill_id: b.skill_id, expected_version: 1 }), refused("skills.authored_unknown"));

    // After the package was taken off the person writes again: a new package, the Skill off.
    const again = await h.save({ ...fields("alpha"), scope: "project" });
    assert.ok(![a.skill_id, rebuilt.skill_id].includes(again.skill_id));
    assert.deepEqual((await h.mine()).map(skill => [skill.name, skill.state]), [["alpha", "off"]]);
  } finally { await h.close(); }
});

test("SKL-41-2-AU-03 a draft is the text model's proposal cut to the form's limits and writes nothing; an answer that is not a draft, and a Home with no text model, are refused", mac, async () => {
  const answers: string[] = [], prompts: string[] = [];
  const h = await harness(async prompt => { prompts.push(JSON.stringify(prompt)); return answers.shift() ?? ""; });
  try {
    answers.push("```json\n" + JSON.stringify({ name: "周报  整理", description: "用户要整理周报时使用。", when_not_to_use: "", applies_to: "nobody", body: "1. 收集。\r\n2. 汇总。", extra: 1 }) + "\n```");
    const draft = await h.post<SkillAuthoredFields>("draft", { intent: "帮我把一周的工作整理成周报" });
    assert.deepEqual(draft, { name: "周报 整理", description: "用户要整理周报时使用。", applies_to: "assistant", body: "1. 收集。\n2. 汇总。" });
    assert.ok(prompts[0]!.includes("帮我把一周的工作整理成周报"));
    assert.deepEqual(await h.mine(), [], "a draft writes nothing");
    answers.push("我不太确定你要什么。");
    await assert.rejects(h.post("draft", { intent: "随便" }), refused("skills.draft_unreadable"));
    answers.push(JSON.stringify({ name: "只有名字" }));
    await assert.rejects(h.post("draft", { intent: "随便" }), refused("skills.draft_unreadable"));
  } finally { await h.close(); }
  const none = await harness(null);
  try { await assert.rejects(none.post("draft", { intent: "帮我写周报" }), (error: unknown) => error instanceof ActionError && error.code !== "skills.draft_unreadable"); }
  finally { await none.close(); }
});

test("SKL-41-2-AU-04 a package of the same id from another publisher is not the person's: it reads as not mine, and saving into it or removing from it is refused and leaves it installed", mac, async () => {
  const h = await harness();
  try {
    // Whose it is comes from the installed record's publisher, compared with this Home's key (not from a version this Home also signed).
    const bundle = signedContentPackage(newPublisher(), { pluginId: SKILL_AUTHORED_PLUGIN_IDS.project, skills: [{ id: "foreign", body: "# 别人的\n\n照做。\n" }] });
    const preview = await h.client.invoke(h.person, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string };
    await h.client.invoke(h.person, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Someone else" });
    const [entry] = await h.mine();
    assert.ok(entry, "the foreign package's Skill is in the catalog");
    assert.equal((await h.source(entry)).mine, false);
    await assert.rejects(h.save({ ...fields("mine"), scope: "project" }), refused("skills.authored_unknown"));
    await assert.rejects(h.save({ ...fields("foreign"), scope: "project", skill_id: "foreign" }), refused("skills.authored_unknown"));
    await assert.rejects(h.post("remove", { scope: "project", skill_id: "foreign", expected_version: entry.ref.version }), refused("skills.authored_unknown"));
    assert.deepEqual((await h.mine()).map(skill => skill.ref.skill_id), ["foreign"], "nothing was rewritten or taken off");
    assert.equal((await h.installed()).length, 1);
  } finally { await h.close(); }
});

test("SKL-41-2-AU-07 reading an authored Skill back keeps a leading horizontal rule as the body's own text", mac, async () => {
  const h = await harness();
  try {
    const saved = await h.save({ ...fields("横线开头", { body: "---\n\n# 正文\n" }), scope: "project" });
    const [entry] = await h.mine();
    assert.ok(entry);
    const read = await h.source(entry);
    assert.equal(saved.skill_id, read.skill_id);
    assert.equal(read.body, "---\n\n# 正文", "the authored body is not treated as frontmatter");
  } finally { await h.close(); }
});

test("SKL-41-2-AU-05 the project's own Skills and the personal space's are two packages: writing in one scope does not shut the other out", mac, async () => {
  const h = await harness();
  try {
    const inProject = await h.save({ ...fields("项目里的"), scope: "project" });
    const atHome = await h.save({ ...fields("个人空间的"), scope: "home" });
    assert.deepEqual([inProject.plugin_id, atHome.plugin_id], [SKILL_AUTHORED_PLUGIN_IDS.project, SKILL_AUTHORED_PLUGIN_IDS.home]);
    const listed = (await h.client.invoke(h.person, ref(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] }).skills.filter(skill => skill.pack.trust === "home_local");
    assert.deepEqual(listed.map(skill => [skill.name, skill.pack.scope, skill.pack.plugin_id]).sort(), [["个人空间的", "home", SKILL_AUTHORED_PLUGIN_IDS.home], ["项目里的", "project", SKILL_AUTHORED_PLUGIN_IDS.project]]);
    for (const entry of listed) assert.equal((await h.source(entry)).mine, true, entry.name);
    await h.post("remove", { scope: "home", skill_id: atHome.skill_id, expected_version: 1 });
    assert.deepEqual((await h.mine()).map(skill => skill.name), ["项目里的"], "taking the personal one off leaves the project's");
  } finally { await h.close(); }
});
