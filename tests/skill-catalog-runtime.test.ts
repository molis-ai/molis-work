import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillCatalogEntry, type SkillBodyReadResult, type SkillDraft, type SkillResourceContent, type SkillSceneChoice, type SkillTrial } from "@molis-ai/molis-work-contracts/services/skills";
import type { KitCatalog } from "@molis-ai/molis-work-contracts/services/kit";
import { HomeConsentLedger, homeAgentDefinitions, hostTextProblems, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { installedPackageHost } from "./fixtures/signed-package-host.js";
import { newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { CONTENT_PLUGIN_ID, MEETING_NOTES, signedContentPackage } from "./fixtures/content-package.js";

const ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });

test("SKC-05 SKC-06 SKC-08 SKC-09: installed Skills use scoped settings, frozen naming and exact signed reads", { timeout: 90_000 }, async () => {
  const h = await installedPackageHost();
  try {
    const publisher = newPublisher();
    const person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] };
    const list = async () => ((await h.client.invoke(person, ref(skillCatalogActions.list), {})) as { skills: SkillCatalogEntry[] }).skills.filter(row => row.ref.source.plugin_id === CONTENT_PLUGIN_ID);
    const read = async (entry: SkillCatalogEntry, caller: typeof person = person) => (await h.client.invoke(caller, ref(skillCatalogActions.readBodies), { refs: [entry.ref] }) as { results: SkillBodyReadResult[] }).results[0]!;
    // A round's read: the Host writes the round's frozen named list on its own calls to `system.skills` only (`skill_round`, §2.3).
    const roundRead = (named: SkillRef[], entry: SkillCatalogEntry) => read(entry, { ...person, skill_round: { consumer: "assistant", named } });
    const set = (entry: SkillCatalogEntry, state: "off" | "auto" | "manual") => h.client.invoke(person, ref(skillCatalogActions.setState), {
      install_id: entry.ref.install_id, skill_id: entry.ref.skill_id, scope: "project", expected_revision: entry.settings_revision, state,
    }) as Promise<SkillCatalogEntry>;
    assert.deepEqual(await list(), []);
    await h.install(signedContentPackage(publisher));
    let skill = (await list())[0]!;
    assert.equal(skill.state, "off");
    assert.equal("body" in skill, false);
    assert.equal(skill.excerpt, MEETING_NOTES.body);
    assert.deepEqual(await read(skill), { ref: skill.ref, ok: false, reason: "off" });
    skill = await set(skill, "auto");
    assert.equal(skill.state, "auto");
    assert.equal(skill.enabled?.scope, "project");
    assert.deepEqual(await read(skill), { ref: skill.ref, ok: true, name: MEETING_NOTES.id, body: MEETING_NOTES.body });
    const resource = await h.client.invoke(person, ref(skillCatalogActions.readResource), { ref: skill.ref, path: "skills/meeting-notes/references/template.md" }) as SkillResourceContent;
    assert.equal(resource.content, MEETING_NOTES.resources!["references/template.md"]);
    assert.equal(resource.encoding, "utf8");
    await assert.rejects(h.client.invoke(person, ref(skillCatalogActions.readResource), { ref: skill.ref, path: "skills/meeting-notes/references/missing.md" }), { code: "skills.resource_undeclared" });
    const old = skill;
    skill = await set(skill, "manual");
    await assert.rejects(set(old, "off"), { code: "skills.settings_conflict" });
    assert.deepEqual(await read(skill), { ref: skill.ref, ok: false, reason: "not_named" });
    const named = [skill.ref];
    assert.equal((await roundRead(named, skill)).ok, true);
    // The list is the round's: a round that named another Skill does not name this one.
    assert.equal((await roundRead([{ ...skill.ref, skill_id: "another-skill" }], skill)).ok, false);
    await h.control("disable", { plugin_id: CONTENT_PLUGIN_ID });
    assert.equal((await list())[0]!.state, "manual");
    assert.deepEqual(await read(skill), { ref: skill.ref, ok: false, reason: "plugin_disabled" });
    await h.control("enable", { plugin_id: CONTENT_PLUGIN_ID });
    assert.equal((await list())[0]!.state, "manual");
    await h.reopen();
    assert.equal((await list())[0]!.state, "manual");
    const oldRef = skill.ref;
    await h.install(signedContentPackage(publisher, { version: "2.0.0", compatibleFrom: ["1.0.0"], skills: [{ ...MEETING_NOTES, version: 2, body: "Updated method" }] }));
    skill = (await list())[0]!;
    assert.equal(skill.state, "manual");
    assert.equal(skill.ref.version, 2);
    assert.deepEqual(await read({ ...skill, ref: oldRef }), { ref: oldRef, ok: false, reason: "not_current" });
    assert.equal((await roundRead(named, skill)).ok, false, "old frozen names cannot select an upgraded Skill");
    await h.control("uninstall", { plugin_id: CONTENT_PLUGIN_ID, keep_data: false });
    assert.deepEqual(await list(), []);
    assert.equal(homeAgentDefinitions(h.home).skills.setting(person.project_id!, skill.ref.install_id, skill.ref.skill_id), undefined);
    assert.deepEqual(await read(skill), { ref: skill.ref, ok: false, reason: "not_current" });
    await h.install(signedContentPackage(publisher, { version: "2.0.0", compatibleFrom: ["1.0.0"], skills: [{ ...MEETING_NOTES, version: 2, body: "Updated method" }] }));
    assert.equal((await list())[0]!.state, "off");
  } finally { await h.close(); }
});

test("SKC-05 SKC-06 SKC-09: Home Skills have independent project settings and removed Skills lose settings", { timeout: 90_000 }, async () => {
  const h = await installedPackageHost();
  try {
    const publisher = newPublisher(), projectCaller = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] };
    const homeCaller = { ...projectCaller, project_id: null }, homeClient = h.host.homeActionClient();
    const list = async (scope: "home" | "project") => ((await (scope === "home" ? homeClient : h.client).invoke(scope === "home" ? homeCaller : projectCaller,
      ref(skillCatalogActions.list), {})) as { skills: SkillCatalogEntry[] }).skills.filter(row => row.ref.source.plugin_id === CONTENT_PLUGIN_ID);
    const set = (scope: "home" | "project", skill: SkillCatalogEntry, state: "auto" | "manual") => (scope === "home" ? homeClient : h.client).invoke(scope === "home" ? homeCaller : projectCaller,
      ref(skillCatalogActions.setState), { scope, install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, expected_revision: skill.settings_revision, state });
    await h.install(signedContentPackage(publisher, { scope: "home", skills: [MEETING_NOTES, { id: "review" }] }));
    const homeSkill = (await list("home")).find(row => row.ref.skill_id === "meeting-notes")!;
    assert.equal(homeSkill.pack.scope, "home");
    await set("home", homeSkill, "auto");
    let projectSkill = (await list("project")).find(row => row.ref.skill_id === "meeting-notes")!;
    assert.equal(projectSkill.state, "off", "Home enablement never enables a project");
    await set("project", projectSkill, "manual");
    assert.equal((await list("home")).find(row => row.ref.skill_id === "meeting-notes")!.state, "auto");
    const review = (await list("project")).find(row => row.ref.skill_id === "review")!;
    await set("project", review, "auto");
    await h.install(signedContentPackage(publisher, { scope: "home", version: "2.0.0", compatibleFrom: ["1.0.0"], skills: [MEETING_NOTES] }));
    projectSkill = (await list("project"))[0]!;
    assert.equal(projectSkill.state, "manual");
    assert.equal((await list("home"))[0]!.state, "auto");
    assert.equal(homeAgentDefinitions(h.home).skills.setting(projectCaller.project_id!, review.ref.install_id, "review"), undefined);
    await h.host.homePlugins!.packageAction(CONTENT_PLUGIN_ID, "uninstall", { keepData: true });
    assert.deepEqual(await list("home"), []);
    assert.deepEqual(await list("project"), []);
    assert.equal(homeAgentDefinitions(h.home).skills.scopes(homeSkill.ref.install_id).length, 0, "keep data never preserves enablement");
  } finally { await h.close(); }
});


test("SKC-10 cancellation after Runtime committed but before Supervisor returned restores old Skills and settings", { timeout: 90_000 }, async () => {
  const h = await installedPackageHost(), publisher = newPublisher();
  const person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] };
  const list = async () => ((await h.client.invoke(person, ref(skillCatalogActions.list), {})) as { skills: SkillCatalogEntry[] }).skills.filter(row => row.pack.plugin_id === CONTENT_PLUGIN_ID);
  const original = PluginRuntime.prototype.upgrade, controller = new AbortController(); let switched = false;
  try {
    await h.install(signedContentPackage(publisher));
    const first = (await list())[0]!;
    await h.client.invoke(person, ref(skillCatalogActions.setState), { install_id: first.ref.install_id, skill_id: first.ref.skill_id, scope: "project", expected_revision: first.settings_revision, state: "manual" });
    const old = (await list())[0]!;
    const bundle = signedContentPackage(publisher, { version: "2.0.0", compatibleFrom: ["1.0.0"], skills: [{ ...MEETING_NOTES, version: 2, body: "new body" }] });
    const preview = await h.client.invoke(person, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string };
    PluginRuntime.prototype.upgrade = async function(input) {
      const result = await original.call(this, input);
      if (input.definition.manifest.plugin_id === CONTENT_PLUGIN_ID) { switched = true; controller.abort(new ActionError("actions.cancelled", "cancel after Runtime commit")); }
      return result;
    };
    await assert.rejects(h.client.invoke({ ...person, signal: controller.signal }, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true }), { code: "actions.cancelled" });
    assert.equal(switched, true, "the candidate really committed before cancellation");
    const restored = (await list())[0]!;
    assert.deepEqual(restored.ref, old.ref); assert.equal(restored.state, "manual"); assert.equal(restored.settings_revision, old.settings_revision);
    assert.equal(restored.excerpt, MEETING_NOTES.body); assert.equal(restored.availability.available, true);
    await h.reopen();
    assert.deepEqual((await list())[0]!.ref, old.ref, "the restored version survives reopening");
  } finally { PluginRuntime.prototype.upgrade = original; await h.close(); }
});

test("SKC-09 N42–N44: a body read of many references reads the publisher ledger once, not once per reference", { timeout: 90_000 }, async () => {
  const h = await installedPackageHost();
  try {
    const publisher = newPublisher(), person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] };
    const many = Array.from({ length: 20 }, (_, index) => ({ id: `skill-${String(index).padStart(2, "0")}` }));
    await h.install(signedContentPackage(publisher, { skills: many }));
    const listed = (await h.client.invoke(person, ref(skillCatalogActions.list), {}) as { skills: SkillCatalogEntry[] }).skills
      .filter(row => row.ref.source.plugin_id === CONTENT_PLUGIN_ID);
    assert.equal(listed.length, 20);
    const use = Object.getOwnPropertyDescriptor(HomeConsentLedger.prototype, "use");
    assert.ok(use, "the ledger's per-call open is on the prototype, so this test can count it");
    let opens = 0;
    Object.defineProperty(HomeConsentLedger.prototype, "use", { configurable: true,
      value(this: unknown, ...args: unknown[]) { opens += 1; return (use.value as ((this: unknown, ...inner: unknown[]) => unknown)).apply(this, args); } });
    try {
      const read = await h.client.invoke(person, ref(skillCatalogActions.readBodies), { refs: listed.map(row => row.ref) }) as { results: SkillBodyReadResult[] };
      assert.equal(read.results.length, 20);
      assert.equal(opens, 1, "one snapshot read the ledger once; a read path must not reopen it per reference");
    } finally { Object.defineProperty(HomeConsentLedger.prototype, "use", use); }
  } finally { await h.close(); }
});

test("SKC-09 N42–N44: /api/skills/body previews a manual Skill in one body.read action without listing first", { timeout: 90_000 }, async t => {
  const f = await serveHomeRuntime(t), project = await f.project("Skill preview single call");
  const bundle = signedContentPackage(newPublisher(), {
    skills: [
      { id: "coding-only", applies_to: "coding", body: "# Coding body" },
      { id: "assistant-only", applies_to: "assistant", body: "# Assistant body" },
    ],
  });
  const preview = await (await f.request(`/projects/${project.project_id}/api/plugin-trust/install/preview`, { method: "POST", body: { bundle } })).json() as { preview_id: string };
  assert.equal((await f.request(`/projects/${project.project_id}/api/plugin-trust/install/confirm`, { method: "POST", body: { preview_id: preview.preview_id, consent: true, pin_label: "Preview test" } })).status, 200);
  const catalog = await (await f.request(`/projects/${project.project_id}/api/skills/list`, { method: "POST", body: {} })).json() as { skills: SkillCatalogEntry[] };
  const installed = catalog.skills.filter(row => row.pack.plugin_id === CONTENT_PLUGIN_ID);
  assert.equal(installed.length, 2);
  for (const skill of installed) {
    assert.equal((await f.request(`/projects/${project.project_id}/api/skills/set`, {
      method: "POST", body: { scope: "project", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, expected_revision: skill.settings_revision, state: "manual" },
    })).status, 200);
  }
  const originalInvoke = ActionService.prototype.invoke;
  const invoked: string[] = [];
  const spy = t.mock.method(ActionService.prototype, "invoke", function (this: ActionService, ...args: Parameters<ActionService["invoke"]>) {
    invoked.push(args[1].capability_id);
    return originalInvoke.apply(this, args);
  });
  try {
    for (const [skillId, expectedBody] of [["coding-only", "# Coding body"], ["assistant-only", "# Assistant body"]] as const) {
      const skill = installed.find(row => row.ref.skill_id === skillId)!;
      invoked.length = 0;
      const response = await f.request(`/projects/${project.project_id}/api/skills/body`, { method: "POST", body: { refs: [skill.ref] } });
      assert.equal(response.status, 200);
      const body = await response.json() as { results: SkillBodyReadResult[] };
      assert.deepEqual(body.results, [{ ref: skill.ref, ok: true, name: skillId, body: expectedBody }]);
      assert.deepEqual(invoked, [skillCatalogActions.readBodies.capability_id], "previewing a Skill body must invoke skills.body.read once without a prior skills.catalog.list");
      assert.equal(homeAgentDefinitions(f.home).skills.uses(skill.ref.install_id, skillId).length, 0, "previewing a Skill records no use");
    }
  } finally { spy.mock.restore(); }
});

test("BL-skill-settings-installed-plugin-scenes: real signed third-party sandbox package scenes flow into skill/kit settings, authoring, replay and install preview, stay scope-isolated, and invalidate immediately on disable, uninstall and publisher revoke", { skip: process.platform !== "darwin", timeout: 180_000 }, async t => {
  const completeText = async (prompt: unknown) => {
    const text = String(prompt);
    if (text.includes("你在对照技能回放的结果")) {
      const count = [...text.matchAll(/\{"index":(\d+),/gu)].length;
      return JSON.stringify({ results: Array.from({ length: count }, (_, index) => ({ index, verdict: "match", differences: [] })) });
    }
    return "回放输出：整理完毕。";
  };
  const f = await serveHomeRuntime(t, { completeText: completeText as never });
  const projectA = await f.project("Scene Project A"), projectB = await f.project("Scene Project B");
  const post = async <T>(path: string, body: object = {}) => {
    const response = await f.request(path, { method: "POST", body });
    return { status: response.status, body: await response.json() as T };
  };
  const kitScenes = async (projectId: string | null) => {
    const res = await post<KitCatalog>(projectId ? `/projects/${projectId}/api/kit/list` : "/api/kit/list");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.issues, []);
    return res.body;
  };
  const skillScenes = async (projectId: string | null) => {
    const res = await post<{ skills: SkillCatalogEntry[]; scenes?: SkillSceneChoice[] }>(projectId ? `/projects/${projectId}/api/skills/list` : "/api/skills/list");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.scenes ?? [];
  };
  const installBundle = async (projectId: string, bundle: unknown, pinLabel: string) => {
    const preview = await post<{ preview_id: string; memory_scene_after_restart?: true; skill_scenes?: SkillSceneChoice[]; code?: string }>(`/projects/${projectId}/api/plugin-trust/install/preview`, { bundle });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const confirm = await post(`/projects/${projectId}/api/plugin-trust/install/confirm`, { preview_id: preview.body.preview_id, consent: true, pin_label: pinLabel });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.body));
    return preview.body;
  };

  const problemsBefore = hostTextProblems().length;
  // Baseline: only built-in scene (`coding`) is registered.
  assert.deepEqual((await skillScenes(projectA.project_id)).map(row => row.scene), ["coding"]);

  // 1. Install a real signed third-party project-scoped sandbox package declaring `memory_scene: "field-notes"`.
  const publisherA = newPublisher();
  const fieldNotesBundle = signedPackage(publisherA, undefined, { pluginId: "com.example.field-notes", name: "Field Notes", memoryScene: "field-notes" });
  const fieldPreview = await installBundle(projectA.project_id, fieldNotesBundle, "Field Notes Publisher");
  assert.equal(fieldPreview.memory_scene_after_restart, true, "preview reports new memory scene after restart and passes output schema");

  const scenesA = await skillScenes(projectA.project_id);
  assert.deepEqual(scenesA, [
    { scene: "coding", name: "Coding", scope: "home" },
    { scene: "field-notes", name: "Field Notes", scope: "project" },
  ]);
  const kitA = await kitScenes(projectA.project_id);
  assert.deepEqual(kitA.scenes, scenesA);
  // Scope isolation: project-only plugin scene must not appear in Home or another project.
  assert.equal((await skillScenes(null)).some(row => row.scene === "field-notes"), false, "project scene must not leak to Home");
  assert.equal((await kitScenes(null)).scenes?.some(row => row.scene === "field-notes"), false);
  assert.equal((await skillScenes(projectB.project_id)).some(row => row.scene === "field-notes"), false, "project scene must not leak to another project");
  assert.equal((await kitScenes(projectB.project_id)).scenes?.some(row => row.scene === "field-notes"), false);

  // 2. Bind a new Skill draft to `"field-notes"`, replay it (with consumer `"field-notes"`), and adopt it in Project A.
  const draftA = await post<SkillDraft>(`/projects/${projectA.project_id}/api/skills/drafts/create`, {
    scope: "project", target: { kind: "new" },
    fields: { name: "田野笔记整理", description: "整理田野笔记时用。", applies_to: "field-notes", body: "# 田野笔记\n\n按主题汇总。" },
    case: { title: "一条笔记", task: "整理现场记录", expected: "回放输出：整理完毕。" },
  });
  assert.equal(draftA.status, 200, JSON.stringify(draftA.body));
  const trialA = await post<SkillTrial>(`/projects/${projectA.project_id}/api/skills/drafts/trial`, {
    draft_id: draftA.body.draft_id, expected_revision: draftA.body.revision, case_id: draftA.body.cases[0]!.case_id,
  });
  assert.equal(trialA.status, 200, JSON.stringify(trialA.body));
  assert.deepEqual(trialA.body.cells.map(cell => cell.consumer), ["field-notes"]);
  const adoptedA = await post<{ skill_id: string }>(`/projects/${projectA.project_id}/api/plugin-trust/skills/drafts/adopt`, {
    draft_id: draftA.body.draft_id, expected_revision: draftA.body.revision,
  });
  assert.equal(adoptedA.status, 200, JSON.stringify(adoptedA.body));

  // Also author an unrelated `both` Skill in Project A to verify `where` includes `"Field Notes"` and unrelated removals keep working after disable.
  const draftBoth = await post<SkillDraft>(`/projects/${projectA.project_id}/api/skills/drafts/create`, {
    scope: "project", target: { kind: "new" },
    fields: { name: "通用汇总", description: "汇总要点时用。", applies_to: "both", body: "# 汇总\n\n列要点。" },
  });
  assert.equal(draftBoth.status, 200);
  const adoptedBoth = await post<{ skill_id: string; skill_version: number }>(`/projects/${projectA.project_id}/api/plugin-trust/skills/drafts/adopt`, {
    draft_id: draftBoth.body.draft_id, expected_revision: draftBoth.body.revision,
  });
  assert.equal(adoptedBoth.status, 200);

  const kitWithSkills = await kitScenes(projectA.project_id);
  const fieldEntry = kitWithSkills.entries.find(row => row.kind === "skill" && row.skill.ref.skill_id === adoptedA.body.skill_id)!;
  assert.deepEqual(fieldEntry.where, ["Field Notes"]);
  const bothEntry = kitWithSkills.entries.find(row => row.kind === "skill" && row.skill.ref.skill_id === adoptedBoth.body.skill_id)!;
  assert.deepEqual(bothEntry.where, ["助理", "Coding", "Field Notes"]);

  // A Home-scoped draft cannot bind to a project-only plugin scene.
  const homeDraftBad = await post<SkillDraft>(`/projects/${projectA.project_id}/api/skills/drafts/create`, {
    scope: "home", target: { kind: "new" },
    fields: { name: "跨作用域失败", description: "不应在个人空间绑定项目场景。", applies_to: "field-notes", body: "# 测试\n\n内容。" },
  });
  assert.equal(homeDraftBad.status, 200);
  const homeAdoptRefused = await post<{ code: string; details?: { field?: string } }>(`/projects/${projectA.project_id}/api/plugin-trust/skills/drafts/adopt`, {
    draft_id: homeDraftBad.body.draft_id, expected_revision: homeDraftBad.body.revision,
  });
  assert.equal(homeAdoptRefused.body.code, "skills.authored_invalid");
  assert.equal(homeAdoptRefused.body.details?.field, "applies_to");

  // A signed content package targeting `"field-notes"` previews with `skill_scenes` in Project A, while a Home content package targeting it is refused.
  const contentPub = newPublisher();
  const projectContentPreview = await post<{ preview_id: string; skill_scenes?: SkillSceneChoice[] }>(`/projects/${projectA.project_id}/api/plugin-trust/install/preview`, {
    bundle: signedContentPackage(contentPub, { pluginId: "com.example.field-methods", skills: [{ id: "fn-check", applies_to: "field-notes" }] }),
  });
  assert.equal(projectContentPreview.status, 200, JSON.stringify(projectContentPreview.body));
  assert.ok(projectContentPreview.body.skill_scenes?.some(row => row.scene === "field-notes" && row.name === "Field Notes"));
  const homeContentRefused = await post<{ code: string }>(`/projects/${projectA.project_id}/api/plugin-trust/install/preview`, {
    bundle: signedContentPackage(contentPub, { pluginId: "com.example.field-methods-home", scope: "home", skills: [{ id: "fn-check", applies_to: "field-notes" }] }),
  });
  assert.equal(homeContentRefused.body.code, "plugin.declaration_invalid");

  // 3. Disable `com.example.field-notes`: candidate disappears immediately, stale preview confirm and new bindings/replays/content-previews are refused, unrelated removal still succeeds.
  const disabled = await post(`/projects/${projectA.project_id}/api/plugin-trust/installed/disable`, { plugin_id: "com.example.field-notes" });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  // TOCTOU check: confirming a preview held before disable must re-validate live active scenes and refuse.
  const staleConfirmRefused = await post<{ code: string }>(`/projects/${projectA.project_id}/api/plugin-trust/install/confirm`, {
    preview_id: projectContentPreview.body.preview_id, consent: true, pin_label: "Content Publisher",
  });
  assert.equal(staleConfirmRefused.body.code, "plugin.declaration_invalid");
  assert.deepEqual((await skillScenes(projectA.project_id)).map(row => row.scene), ["coding"]);
  const kitAfterDisable = await kitScenes(projectA.project_id);
  assert.deepEqual(kitAfterDisable.scenes?.map(row => row.scene), ["coding"]);
  const bothAfterDisable = kitAfterDisable.entries.find(row => row.kind === "skill" && row.skill.ref.skill_id === adoptedBoth.body.skill_id)!;
  assert.deepEqual(bothAfterDisable.where, ["助理", "Coding"]);

  const draftAfterDisable = await post<SkillDraft>(`/projects/${projectA.project_id}/api/skills/drafts/create`, {
    scope: "project", target: { kind: "new" },
    fields: { name: "停用后绑定", description: "停用后不应通过。", applies_to: "field-notes", body: "# 停用后\n\n步骤。" },
    case: { title: "样本", task: "任务", expected: "预期" },
  });
  assert.equal(draftAfterDisable.status, 200);
  const trialRefused = await post<{ code: string; details?: { field?: string } }>(`/projects/${projectA.project_id}/api/skills/drafts/trial`, {
    draft_id: draftAfterDisable.body.draft_id, expected_revision: draftAfterDisable.body.revision, case_id: draftAfterDisable.body.cases[0]!.case_id,
  });
  assert.equal(trialRefused.body.code, "skills.authored_invalid");
  assert.equal(trialRefused.body.details?.field, "applies_to");
  const adoptDraftNoCase = await post<SkillDraft>(`/projects/${projectA.project_id}/api/skills/drafts/create`, {
    scope: "project", target: { kind: "new" },
    fields: { name: "停用后采用", description: "停用后不应采用。", applies_to: "field-notes", body: "# 停用后\n\n步骤。" },
  });
  const adoptRefused = await post<{ code: string; details?: { field?: string } }>(`/projects/${projectA.project_id}/api/plugin-trust/skills/drafts/adopt`, {
    draft_id: adoptDraftNoCase.body.draft_id, expected_revision: adoptDraftNoCase.body.revision,
  });
  assert.equal(adoptRefused.body.code, "skills.authored_invalid");
  assert.equal(adoptRefused.body.details?.field, "applies_to");
  const contentAfterDisable = await post<{ code: string }>(`/projects/${projectA.project_id}/api/plugin-trust/install/preview`, {
    bundle: signedContentPackage(contentPub, { pluginId: "com.example.field-methods-disabled", skills: [{ id: "fn-check", applies_to: "field-notes" }] }),
  });
  assert.equal(contentAfterDisable.body.code, "plugin.declaration_invalid");
  // Removing the unrelated `both` Skill still succeeds while the existing `field-notes` Skill remains untouched in `my-skills.project`.
  const removedUnrelated = await post<{ remaining: number }>(`/projects/${projectA.project_id}/api/plugin-trust/skills/authored/remove`, {
    scope: "project", skill_id: adoptedBoth.body.skill_id, expected_version: adoptedBoth.body.skill_version,
  });
  assert.equal(removedUnrelated.status, 200, JSON.stringify(removedUnrelated.body));
  assert.equal(removedUnrelated.body.remaining, 1);

  // 4. Re-enable brings `"field-notes"` back, and uninstall (even with keep_data: true) removes it immediately.
  const overviewResp = await f.request(`/projects/${projectA.project_id}/api/plugin-trust/overview`);
  const overview = await overviewResp.json() as { plugins: Array<{ plugin_id: string; install_id: string; installation_generation: string; manifest_digest: string; version: string; uninstall_target: unknown }> };
  const rowA = overview.plugins.find(item => item.plugin_id === "com.example.field-notes")!;
  const reenabled = await post(`/projects/${projectA.project_id}/api/plugin-trust/installed/enable`, {
    plugin_id: "com.example.field-notes",
    expected_installation: { scope: "project", install_id: rowA.install_id, installation_generation: rowA.installation_generation, version: rowA.version, manifest_digest: rowA.manifest_digest },
  });
  assert.equal(reenabled.status, 200, JSON.stringify(reenabled.body));
  assert.ok((await skillScenes(projectA.project_id)).some(row => row.scene === "field-notes"));

  const overview2 = await (await f.request(`/projects/${projectA.project_id}/api/plugin-trust/overview`)).json() as typeof overview;
  const targetA = overview2.plugins.find(item => item.plugin_id === "com.example.field-notes")!.uninstall_target;
  const uninstalled = await post(`/projects/${projectA.project_id}/api/plugin-trust/installed/uninstall`, {
    plugin_id: "com.example.field-notes", keep_data: true, target: targetA,
  });
  assert.equal(uninstalled.status, 200, JSON.stringify(uninstalled.body));
  assert.deepEqual((await skillScenes(projectA.project_id)).map(row => row.scene), ["coding"]);
  assert.deepEqual((await kitScenes(projectA.project_id)).scenes?.map(row => row.scene), ["coding"]);
  const adoptAfterUninstall = await post<{ code: string }>(`/projects/${projectA.project_id}/api/plugin-trust/skills/drafts/adopt`, {
    draft_id: adoptDraftNoCase.body.draft_id, expected_revision: adoptDraftNoCase.body.revision,
  });
  assert.equal(adoptAfterUninstall.body.code, "skills.authored_invalid");

  // 5. Home-scoped signed third-party sandbox package appears across Home and all projects, and disappears immediately on publisher revocation.
  const publisherHome = newPublisher();
  const homeRadarBundle = signedPackage(publisherHome, undefined, { pluginId: "com.example.home-radar", name: "Home Radar", memoryScene: "radar", scope: "home" });
  await installBundle(projectA.project_id, homeRadarBundle, "Home Radar Publisher");
  for (const scopeProject of [null, projectA.project_id, projectB.project_id]) {
    const listed = await skillScenes(scopeProject);
    assert.ok(listed.some(row => row.scene === "radar" && row.name === "Home Radar" && row.scope === "home"), `radar visible in ${scopeProject ?? "home"}`);
    assert.ok((await kitScenes(scopeProject)).scenes?.some(row => row.scene === "radar" && row.name === "Home Radar" && row.scope === "home"));
  }
  const homeDraftRadar = await post<SkillDraft>(`/projects/${projectA.project_id}/api/skills/drafts/create`, {
    scope: "home", target: { kind: "new" },
    fields: { name: "雷达研判", description: "需要雷达研判时用。", applies_to: "radar", body: "# 雷达研判\n\n按信号分级。" },
  });
  assert.equal(homeDraftRadar.status, 200);
  const adoptedHomeRadar = await post(`/projects/${projectA.project_id}/api/plugin-trust/skills/drafts/adopt`, {
    draft_id: homeDraftRadar.body.draft_id, expected_revision: homeDraftRadar.body.revision,
  });
  assert.equal(adoptedHomeRadar.status, 200, JSON.stringify(adoptedHomeRadar.body));

  // Revoke the Home plugin's publisher: `"radar"` vanishes immediately everywhere and new bindings are refused.
  const revoked = await post("/api/settings/plugin-publishers/revoke", { key_id: publisherHome.identity });
  assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
  for (const scopeProject of [null, projectA.project_id, projectB.project_id]) {
    assert.equal((await skillScenes(scopeProject)).some(row => row.scene === "radar"), false, `radar removed in ${scopeProject ?? "home"} after revoke`);
    assert.equal((await kitScenes(scopeProject)).scenes?.some(row => row.scene === "radar"), false);
  }
  const draftAfterRevoke = await post<SkillDraft>(`/projects/${projectA.project_id}/api/skills/drafts/create`, {
    scope: "home", target: { kind: "new" },
    fields: { name: "撤权后绑定", description: "撤权后不应通过。", applies_to: "radar", body: "# 撤权后\n\n步骤。" },
  });
  const adoptAfterRevoke = await post<{ code: string; details?: { field?: string } }>(`/projects/${projectA.project_id}/api/plugin-trust/skills/drafts/adopt`, {
    draft_id: draftAfterRevoke.body.draft_id, expected_revision: draftAfterRevoke.body.revision,
  });
  assert.equal(adoptAfterRevoke.body.code, "skills.authored_invalid");
  assert.equal(adoptAfterRevoke.body.details?.field, "applies_to");
  // Reading active scenes across built-in and third-party plugins must not produce spurious ui.text_missing problems.
  assert.deepEqual(hostTextProblems().slice(problemsBefore).filter(item => item.code === "ui.text_missing"), []);
});
