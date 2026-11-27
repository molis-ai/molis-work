// @requires-platform darwin
import assert from "node:assert/strict";
import test from "node:test";
import { SKILL_AUTHORED_PLUGIN_IDS, SKILLS_PERMISSIONS, skillDraftActions, type SkillDraft, type SkillDraftAdoptResult, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { LocalHost, homeAgentDefinitions } from "@molis-ai/molis-work-app-local-host";
import { LOCALE_COOKIE } from "@molis-ai/molis-work-app-workbench";
import { deferred, person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { mac } from "./fixtures/signed-package-host.js";

const fields = { name: "采用期间的草稿", description: "整理任务时使用。", applies_to: "assistant", body: "# 原来批准的正文" };
const known = { title: "已知答案", task: "整理这条记录", expected: "按顺序整理" };
const api = (f: Awaited<ReturnType<typeof serveHomeRuntime>>, locale: "zh" | "en" = "zh") => async <Result>(project: string, route: string, body: object, signal?: AbortSignal) => {
  const response = await f.request(`/projects/${project}/api/${route}`, { method: "POST", body, signal, headers: { cookie: `${LOCALE_COOKIE}=${locale}` } });
  return { status: response.status, body: await response.json() as Result };
};

/** Let the real exposure read finish, then hold the final directory refresh for the running candidate. */
function holdHomeSkillRefresh(t: Parameters<typeof serveHomeRuntime>[0], f: Awaited<ReturnType<typeof serveHomeRuntime>>, version: string) {
  const entered = deferred(), release = deferred(), inspect = LocalHost.prototype.inspectActions;
  let reads = 0;
  t.after(release.resolve);
  const hold = t.mock.method(LocalHost.prototype, "inspectActions", async function (this: LocalHost<unknown>, ...args: Parameters<typeof inspect>) {
    const result = await inspect.apply(this, args);
    const caller = args[0], current = f.host.homePlugins!.installation(SKILL_AUTHORED_PLUGIN_IDS.home);
    if (caller.project_id === null && caller.locale === "zh" && caller.audience === "plugin" && !caller.permissions.length
      && current?.state === "running" && current.version === version && ++reads === 2) {
      entered.resolve();
      await release.promise;
    }
    return result;
  });
  return { entered: entered.promise, release: release.resolve, restore: () => hold.mock.restore() };
}

for (const { stage, upgrade } of [{ stage: "before", upgrade: false }, { stage: "refresh", upgrade: false }, { stage: "refresh", upgrade: true }] as const) test(`QEA-104 Home draft adoption at ${stage} of actual ${upgrade ? "upgrade" : "install"} refuses concurrent revision and another project's update`, { ...mac, timeout: 120_000 }, async t => {
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
  const refresh = stage === "refresh" ? holdHomeSkillRefresh(t, f, upgrade ? "2.0.0" : "1.0.0") : undefined;
  // The other project uses its own language's catalog, so it can reach the draft while this refresh is waiting.
  const other = api(f, "en");
  let installs = 0;
  t.mock.method(home, "installPackage", async (...args: Parameters<typeof install>) => {
    if (args[0].packaged?.manifest.plugin_id !== SKILL_AUTHORED_PLUGIN_IDS.home) return install.apply(home, args);
    if (stage === "before") { installEntered.resolve(); await installRelease.promise; }
    const result = await install.apply(home, args); installs++;
    return result;
  });
  const adopting = post<SkillDraftAdoptResult>(a.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: draft.draft_id, expected_revision: 1 });
  try {
    await (refresh?.entered ?? installEntered.promise);
    modelRelease.resolve();
    const revisedResult = await revised;
    const changed = await other<{ revision: number }>(b.project_id, "skills/drafts/update", { draft_id: draft.draft_id,
      expected_revision: revisedResult.body.revision ?? 1, fields: { ...fields, body: "# 另一个项目提交的新修改" }, replacements: {} });
    const beforeFinish = await other<SkillDraft>(b.project_id, "skills/drafts/read", { draft_id: draft.draft_id });
    refresh?.release();
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
    modelRelease.resolve(); installRelease.resolve(); refresh?.release();
    await Promise.allSettled([revised, adopting]);
    refresh?.restore();
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

for (const stage of ["new", "upgrade", "committed"] as const) test(`QEA-119 disconnect during Home Skill adoption at ${stage} has the effect of its actual commit boundary`, { ...mac, timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("采用断连"), post = api(f);
  const home = f.host.homePlugins!, controller = new AbortController();
  const create = async (target: object, body: string) => {
    const result = await post<SkillDraft>(project.project_id, "skills/drafts/create", { scope: "home", target, fields: { ...fields, body } });
    assert.equal(result.status, 200);
    return result.body;
  };
  const adopt = (draft: SkillDraft, signal?: AbortSignal) => post<SkillDraftAdoptResult>(project.project_id, "plugin-trust/skills/drafts/adopt",
    { draft_id: draft.draft_id, expected_revision: draft.revision }, signal);
  const mine = async () => {
    const result = await post<{ skills: SkillCatalogEntry[] }>(project.project_id, "skills/list", {});
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body.skills.filter(item => item.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.home);
  };
  const old = stage === "upgrade" ? await adopt(await create({ kind: "new" }, fields.body)) : undefined;
  if (old) assert.equal(old.status, 200);
  const draft = await create(old ? { kind: "own", skill_id: old.body.skill_id } : { kind: "new" }, "# 此次要采用的正文");
  const committed = stage === "committed";
  const refresh = committed ? undefined : holdHomeSkillRefresh(t, f, old ? "2.0.0" : "1.0.0");
  const entered = deferred(), release = deferred(), abortSeen = deferred(), settled = deferred();
  const install = home.installPackage;
  const delayReceipt = committed ? t.mock.method(home, "installPackage", async (...args: Parameters<typeof install>) => {
    await install.apply(home, args);
    entered.resolve();
    await release.promise;
  }) : undefined;
  const actionClient = f.host.actionClient;
  const observe = t.mock.method(f.host, "actionClient", (...args: Parameters<typeof actionClient>) => {
    const client = actionClient.apply(f.host, args);
    return { ...client, invoke(...call: Parameters<typeof client.invoke>) {
      const [caller, action] = call;
      if (action.capability_id !== skillDraftActions.adopt.capability_id) return client.invoke(...call);
      assert.ok(caller.signal, "the actual HTTP invocation carries a disconnect signal");
      caller.signal.addEventListener("abort", abortSeen.resolve, { once: true });
      return client.invoke(...call).finally(settled.resolve);
    } };
  });
  const pending = adopt(draft, controller.signal);
  const cancelled = assert.rejects(pending, /fixture disconnect after start/);
  try {
    await (refresh?.entered ?? entered.promise);
    assert.equal(home.installation(SKILL_AUTHORED_PLUGIN_IDS.home)?.version, old ? "2.0.0" : "1.0.0", "the real installation already reached its candidate edition");
    controller.abort(new Error("fixture disconnect after start"));
    await Promise.all([cancelled, abortSeen.promise]);
    refresh?.release();
    release.resolve();
    await settled.promise;
    observe.mock.restore();
    delayReceipt?.mock.restore();
    refresh?.restore();
    const remaining = await post<SkillDraft>(project.project_id, "skills/drafts/read", { draft_id: draft.draft_id });
    const installed = await mine();
    if (committed) {
      assert.equal(remaining.status, 404, "losing the HTTP reply does not reopen the settled draft");
      assert.equal((await adopt(draft)).status, 404, "the same draft cannot install a second time");
    } else {
      assert.equal(remaining.status, 200);
      assert.equal(remaining.body.revision, draft.revision);
      assert.deepEqual(remaining.body.fields, draft.fields);
      assert.deepEqual(installed.map(item => [item.ref.version, item.excerpt]), old ? [[1, fields.body]] : []);
      const retry = await adopt(draft);
      assert.equal(retry.status, 200, JSON.stringify(retry.body));
      assert.equal(retry.body.skill_version, old ? 2 : 1);
    }
    assert.deepEqual((await mine()).map(item => [item.ref.version, item.excerpt]), [[old ? 2 : 1, draft.fields.body]]);
  } finally {
    controller.abort(); refresh?.release(); release.resolve();
    await Promise.allSettled([pending, cancelled]);
  }
});

test("QEA-119 a real Home settings disable during a new install's final refresh is not turned into an uninstall", { ...mac, timeout: 120_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("采用期间停用"), post = api(f);
  const opened = await post<SkillDraft>(project.project_id, "skills/drafts/create", { scope: "home", target: { kind: "new" }, fields });
  assert.equal(opened.status, 200);
  const draft = opened.body, pluginId = SKILL_AUTHORED_PLUGIN_IDS.home;
  const refresh = holdHomeSkillRefresh(t, f, "1.0.0");
  const pending = post<{ code: string }>(project.project_id, "plugin-trust/skills/drafts/adopt", { draft_id: draft.draft_id, expected_revision: draft.revision });
  try {
    await refresh.entered;
    const response = await f.request("/api/settings/plugin-permissions/disable", { method: "POST", body: { plugin_id: pluginId },
      headers: { cookie: `${LOCALE_COOKIE}=en` } });
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await response.json() as { state: string }).state, "disabled");
    const disabled = f.host.homePlugins!.installation(pluginId);
    assert.equal(disabled?.state, "disabled");
    refresh.release();
    const rejected = await pending;
    assert.equal(rejected.body.code, "actions.provider_replaced", JSON.stringify(rejected.body));
    const kept = f.host.homePlugins!.installation(pluginId);
    assert.equal(kept?.state, "disabled", "cleanup of the older attempt cannot turn a later disable into an uninstall");
    assert.equal(kept?.installation_generation, disabled?.installation_generation);
    assert.equal(kept?.manifest_digest, disabled?.manifest_digest);
    const remaining = await post<SkillDraft>(project.project_id, "skills/drafts/read", { draft_id: draft.draft_id });
    assert.equal(remaining.status, 200);
    assert.deepEqual(remaining.body.fields, draft.fields);
    assert.equal(remaining.body.revision, draft.revision);
  } finally {
    refresh.release();
    await Promise.allSettled([pending]);
    refresh.restore();
  }
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
