import assert from "node:assert/strict";
import test from "node:test";
import { SKILL_AUTHORED_PLUGIN_IDS, SKILLS_PERMISSIONS, skillDraftActions, type SkillDraft, type SkillDraftAdoptResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { mac } from "./fixtures/signed-package-host.js";

const fields = { name: "采用期间的草稿", description: "整理任务时使用。", applies_to: "assistant", body: "# 原来批准的正文" };
const known = { title: "已知答案", task: "整理这条记录", expected: "按顺序整理" };
const api = (f: Awaited<ReturnType<typeof serveHomeRuntime>>) => async <Result>(project: string, route: string, body: object, signal?: AbortSignal) => {
  const response = await f.request(`/projects/${project}/api/${route}`, { method: "POST", body, signal });
  return { status: response.status, body: await response.json() as Result };
};

for (const { stage, upgrade } of [{ stage: "before", upgrade: false }, { stage: "after", upgrade: false }, { stage: "after", upgrade: true }] as const) test(`QEA-104 Home draft adoption ${stage} actual ${upgrade ? "upgrade" : "install"} refuses concurrent revision and another project's update`, { ...mac, timeout: 120_000 }, async t => {
  const modelEntered = deferred(), modelRelease = deferred(), installEntered = deferred(), installRelease = deferred();
  t.after(() => { modelRelease.resolve(); installRelease.resolve(); });
  const f = await serveHomeRuntime(t, { completeText: (async () => {
    modelEntered.resolve(); await modelRelease.promise;
    return JSON.stringify({ ...fields, body: "# 等待模型返回的新修订" });
  }) as never });
  const a = await f.project("采用入口"), b = await f.project("另一个编辑入口");
  const post = api(f);
  let target: { kind: "new" } | { kind: "own"; skill_id: string } = { kind: "new" };
  if (upgrade) {
    const first = await post<SkillDraft>(a.project_id, "skills/drafts/create", { scope: "home", target, fields });
    const adopted = await post<SkillDraftAdoptResult>(a.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: first.body.draft_id, expected_revision: 1 });
    assert.equal(adopted.status, 200);
    target = { kind: "own", skill_id: adopted.body.skill_id };
  }
  const created = await post<SkillDraft>(a.project_id, "skills/drafts/create", { scope: "home", target, fields });
  assert.equal(created.status, 200);
  const draft = created.body as SkillDraft;
  const revised = post<SkillDraft>(a.project_id, "skills/drafts/revise", { draft_id: draft.draft_id, expected_revision: 1, instruction: "补一个步骤" });
  await modelEntered.promise;
  const home = f.host.homePlugins!, install = home.installPackage;
  let installs = 0;
  t.mock.method(home, "installPackage", async (...args: Parameters<typeof install>) => {
    if (args[0].packaged?.manifest.plugin_id !== SKILL_AUTHORED_PLUGIN_IDS.home) return install.apply(home, args);
    if (stage === "before") { installEntered.resolve(); await installRelease.promise; }
    const result = await install.apply(home, args); installs++;
    if (stage === "after") { installEntered.resolve(); await installRelease.promise; }
    return result;
  });
  const adopting = post<SkillDraftAdoptResult>(a.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: draft.draft_id, expected_revision: 1 });
  try {
    await installEntered.promise;
    modelRelease.resolve();
    const revisedResult = await revised;
    const changed = await post<{ revision: number }>(b.project_id, "skills/drafts/update", { draft_id: draft.draft_id,
      expected_revision: revisedResult.body.revision ?? 1, fields: { ...fields, body: "# 另一个项目提交的新修改" }, replacements: {} });
    const beforeFinish = await post<SkillDraft>(b.project_id, "skills/drafts/read", { draft_id: draft.draft_id });
    installRelease.resolve();
    const adopted = await adopting;
    const read = await post<{ code: string }>(b.project_id, "skills/drafts/read", { draft_id: draft.draft_id });
    t.diagnostic(JSON.stringify({ adoption: adopted.status, revise: revisedResult.status, update: changed.status,
      accepted_revision: beforeFinish.body.revision, draft_after_adoption: read.status }));
    assert.equal(adopted.status, 200, JSON.stringify(adopted.body));
    assert.equal(installs, 1);
    assert.equal(revisedResult.status, 409, "a model result must not be accepted then erased by the older adoption");
    assert.equal(changed.status, 409, "another project must not write the same Home draft during adoption");
    assert.equal(beforeFinish.body.fields.body, fields.body);
    assert.equal(beforeFinish.body.revision, 1);
    assert.equal(read.status, 404);
    const catalog = await post<{ skills: SkillCatalogEntry[] }>(b.project_id, "skills/list", {});
    const own = catalog.body.skills.filter(item => item.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.home);
    assert.equal(own.length, 1);
    assert.equal(own[0]!.ref.version, upgrade ? 2 : 1);
    assert.equal(own[0]!.excerpt, fields.body);
  } finally {
    modelRelease.resolve(); installRelease.resolve();
    await Promise.allSettled([revised, adopting]);
  }
});

test("QEA-105 a failed adoption releases only its draft after refusing all its write paths and an in-flight replay", { ...mac, timeout: 120_000 }, async t => {
  const modelEntered = deferred(), modelRelease = deferred(), installEntered = deferred(), installRelease = deferred();
  t.after(() => { modelRelease.resolve(); installRelease.resolve(); });
  let holdModel = false;
  const f = await serveHomeRuntime(t, { completeText: (async (prompt: unknown) => {
    const text = String(prompt);
    if (text.includes("你在对照技能回放的结果")) return JSON.stringify({ results: [...text.matchAll(/\{"index":(\d+),"output":/gu)].map(([, index]) => ({ index: Number(index), verdict: "match", differences: [] })) });
    if (holdModel) { holdModel = false; modelEntered.resolve(); await modelRelease.promise; }
    return "按顺序整理";
  }) as never });
  const a = await f.project("失败后恢复采用"), b = await f.project("并发入口"), post = api(f);
  const opened = await post<SkillDraft>(a.project_id, "skills/drafts/create", { scope: "home", target: { kind: "new" }, fields, case: known });
  assert.equal(opened.status, 200);
  const draft = opened.body, caseId = draft.cases[0]!.case_id;
  const trialInput = { draft_id: draft.draft_id, expected_revision: 1, case_id: caseId };
  const firstTrial = await post<{ trial_id: string }>(a.project_id, "skills/drafts/trial", trialInput);
  assert.equal(firstTrial.status, 200);
  holdModel = true;
  const replaying = post<{ code: string }>(a.project_id, "skills/drafts/trial", trialInput);
  await modelEntered.promise;
  const home = f.host.homePlugins!, install = home.installPackage;
  const blocked = t.mock.method(home, "installPackage", async (...args: Parameters<typeof install>) => {
    if (args[0].packaged?.manifest.plugin_id !== SKILL_AUTHORED_PLUGIN_IDS.home) return install.apply(home, args);
    installEntered.resolve(); await installRelease.promise;
    throw new Error("fixture installation refused");
  });
  const adopting = post<{ error: string }>(a.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: draft.draft_id, expected_revision: 1 });
  try {
    await installEntered.promise;
    modelRelease.resolve();
    const refusedReplay = await replaying;
    assert.equal(refusedReplay.status, 409);
    assert.equal(refusedReplay.body.code, "skills.draft_adopting");
    const writes: Array<[string, object]> = [
      ["skills/drafts/update", { expected_revision: 1, fields, replacements: {} }],
      ["skills/drafts/cases/put", { case_id: caseId, ...known, expected: "别的答案" }],
      ["skills/drafts/cases/remove", { case_id: caseId }],
      ["skills/drafts/discard", {}], ["skills/drafts/discard", { restore: true }],
      ["plugin-trust/skills/drafts/adopt", { expected_revision: 1 }],
    ];
    for (const [route, body] of writes) {
      const refused = await post<{ code: string }>(b.project_id, route, { draft_id: draft.draft_id, ...body });
      assert.equal(refused.status, 409, route); assert.equal(refused.body.code, "skills.draft_adopting", route);
    }
    const separate = await post<SkillDraft>(b.project_id, "skills/drafts/create", { scope: "home", target: { kind: "new" }, fields: { ...fields, name: "另一份草稿" } });
    assert.equal(separate.status, 200, "adoption does not block other drafts");
    assert.equal((await post(b.project_id, "skills/drafts/update", { draft_id: separate.body.draft_id, expected_revision: 1, fields: { ...fields, name: "另一份已修改" }, replacements: {} })).status, 200);
    const current = await post<SkillDraft>(b.project_id, "skills/drafts/read", { draft_id: draft.draft_id });
    assert.deepEqual(current.body.fields, draft.fields); assert.deepEqual(current.body.cases, draft.cases);
    assert.equal(current.body.trial?.trial_id, firstTrial.body.trial_id);
    installRelease.resolve();
    const failed = await adopting;
    assert.equal(failed.status, 500); assert.match(failed.body.error, /fixture installation refused/);
    blocked.mock.restore();
    const changed = await post<{ revision: number }>(b.project_id, "skills/drafts/update", { draft_id: draft.draft_id, expected_revision: 1, fields: { ...fields, body: "# 失败后修改并重试" }, replacements: {} });
    assert.equal(changed.status, 200); assert.equal(changed.body.revision, 2);
    assert.equal((await post(a.project_id, "skills/drafts/trial", { ...trialInput, expected_revision: 2 })).status, 200);
    const adopted = await post<SkillDraftAdoptResult>(a.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: draft.draft_id, expected_revision: 2 });
    assert.equal(adopted.status, 200); assert.equal(adopted.body.skill_version, 1);
    const catalog = await post<{ skills: SkillCatalogEntry[] }>(b.project_id, "skills/list", {});
    assert.equal(catalog.body.skills.filter(item => item.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.home).length, 1);
  } finally {
    modelRelease.resolve(); installRelease.resolve();
    await Promise.allSettled([replaying, adopting]);
  }
});

test("QEA-105 cancelling the real adoption request before installation retains the draft and permits a fresh edit and adoption", { ...mac, timeout: 120_000 }, async t => {
  const entered = deferred(), release = deferred(), settled = deferred(), controller = new AbortController();
  t.after(() => { controller.abort(); release.resolve(); });
  const f = await serveHomeRuntime(t), a = await f.project("取消采用"), b = await f.project("取消后编辑"), post = api(f);
  const opened = await post<SkillDraft>(a.project_id, "skills/drafts/create", { scope: "home", target: { kind: "new" }, fields });
  assert.equal(opened.status, 200);
  const draft = opened.body;
  const home = f.host.homePlugins!, install = home.installPackage;
  const delayed = t.mock.method(home, "installPackage", async (...args: Parameters<typeof install>) => {
    if (args[0].packaged?.manifest.plugin_id !== SKILL_AUTHORED_PLUGIN_IDS.home) return install.apply(home, args);
    entered.resolve(); await release.promise;
    try { return await install.apply(home, args); } finally { settled.resolve(); }
  });
  const adopting = post(a.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: draft.draft_id, expected_revision: 1 }, controller.signal);
  const cancelled = assert.rejects(adopting, /fixture cancel adoption/);
  try {
    await entered.promise;
    controller.abort(new Error("fixture cancel adoption"));
    await cancelled;
    // The server observes the real disconnected response before the held installation resumes.
    const stillOpen = await post<SkillDraft>(b.project_id, "skills/drafts/read", { draft_id: draft.draft_id });
    assert.equal(stillOpen.status, 200);
    release.resolve(); await settled.promise;
    // The same project's serial read waits for the cancelled adopt handler to finish its cleanup.
    const current = await post<SkillDraft>(a.project_id, "skills/drafts/read", { draft_id: draft.draft_id });
    assert.equal(current.status, 200); assert.deepEqual(current.body.fields, draft.fields); assert.equal(current.body.revision, 1);
    const beforeRetry = await post<{ skills: SkillCatalogEntry[] }>(b.project_id, "skills/list", {});
    assert.deepEqual(beforeRetry.body.skills.filter(item => item.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.home), []);
    delayed.mock.restore();
    const changed = await post<{ revision: number }>(b.project_id, "skills/drafts/update", { draft_id: draft.draft_id, expected_revision: 1, fields: { ...fields, body: "# 取消后明确重试的正文" }, replacements: {} });
    assert.equal(changed.status, 200); assert.equal(changed.body.revision, 2);
    const adopted = await post<SkillDraftAdoptResult>(a.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: draft.draft_id, expected_revision: 2 });
    assert.equal(adopted.status, 200); assert.equal(adopted.body.skill_version, 1);
  } finally { controller.abort(); release.resolve(); await Promise.allSettled([adopting, cancelled]); }
});

for (const change of ["adopt", "discard", "fill", "discard-remove"] as const) test(`QEA-107 a case write rechecks the draft after authority waits across ${change}`, { ...mac, timeout: 120_000 }, async t => {
  const entered = deferred(), release = deferred();
  t.after(() => release.resolve());
  const f = await serveHomeRuntime(t), a = await f.project("草稿变化入口"), b = await f.project("等待中的新增答案"), post = api(f);
  const opened = await post<SkillDraft>(a.project_id, "skills/drafts/create", { scope: "home", target: { kind: "new" }, fields });
  assert.equal(opened.status, 200);
  const draftId = opened.body.draft_id, store = homeAgentDefinitions(f.home).skillDrafts;
  if (change === "fill") for (let n = 0; n < 4; n++) assert.equal((await post(a.project_id, "skills/drafts/cases/put", { draft_id: draftId, ...known, title: `原答案${n}` })).status, 200);
  const toRemove = change === "discard-remove" ? await post<{ case_id: string }>(a.project_id, "skills/drafts/cases/put", { draft_id: draftId, ...known }) : undefined;
  if (toRemove) assert.equal(toRemove.status, 200);
  const originalRead = store.draft;
  let read = false, held = false;
  t.mock.method(store, "draft", (id: string) => { const value = originalRead.call(store, id); if (id === draftId) read = true; return value; });
  // Pause the real dispatcher's next authority check only after the owner has read this draft; no business handler is replaced.
  const pending = f.host.actionClient(b.reference).invoke({ ...person(SKILLS_PERMISSIONS, b.project_id), validate_authority: async () => {
    if (read && !held) { held = true; entered.resolve(); await release.promise; }
  } }, { capability_id: toRemove ? skillDraftActions.removeCase.capability_id : skillDraftActions.putCase.capability_id, version: 1 },
    toRemove ? { draft_id: draftId, case_id: toRemove.body.case_id } : { draft_id: draftId, ...known, title: "等待后才写的答案" });
  const outcome = pending.then(value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
  try {
    await entered.promise;
    const changed = change === "adopt"
      ? await post(a.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: draftId, expected_revision: 1 })
      : change === "discard" || change === "discard-remove" ? await post(a.project_id, "skills/drafts/discard", { draft_id: draftId })
        : await post(a.project_id, "skills/drafts/cases/put", { draft_id: draftId, ...known, title: "刚写入的第五条" });
    assert.equal(changed.status, 200);
    release.resolve();
    const result = await outcome;
    assert.equal(store.cases(`draft:${draftId}`).length, change === "fill" ? 5 : toRemove ? 1 : 0, "no orphan, discarded draft write or sixth case may be committed");
    assert.equal(result.ok, false, "the stale append must refuse at its write boundary");
    if (!result.ok) assert.equal((result.error as { code: string }).code, change === "fill" ? "skills.case_invalid" : "skills.draft_unknown");
  } finally { release.resolve(); await outcome; }
});
