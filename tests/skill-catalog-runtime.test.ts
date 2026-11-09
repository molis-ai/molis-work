import assert from "node:assert/strict";
import test from "node:test";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillCatalogEntry, type SkillBodyReadResult, type SkillResourceContent } from "@molis-ai/molis-work-contracts/services/skills";
import { homeAgentDefinitions, withSkillSelection, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { installedPackageHost } from "./fixtures/signed-package-host.js";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { CONTENT_PLUGIN_ID, MEETING_NOTES, signedContentPackage } from "./fixtures/content-package.js";

const ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });

test("SKC-05 SKC-06 SKC-08 SKC-09: installed Skills use scoped settings, frozen naming and exact signed reads", { timeout: 90_000 }, async () => {
  const h = await installedPackageHost();
  try {
    const publisher = newPublisher();
    const person = { ...h.person, permissions: [...h.person.permissions, ...SKILLS_PERMISSIONS] };
    const list = async () => ((await h.client.invoke(person, ref(skillCatalogActions.list), {})) as { skills: SkillCatalogEntry[] }).skills.filter(row => row.ref.source.plugin_id === CONTENT_PLUGIN_ID);
    const read = async (entry: SkillCatalogEntry) => (await h.client.invoke(person, ref(skillCatalogActions.readBodies), { refs: [entry.ref] }) as { results: SkillBodyReadResult[] }).results[0]!;
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
    const selection = { actor_id: person.actor_id, project_id: person.project_id, consumer: "assistant" as const, named: [skill.ref] };
    assert.equal((await withSkillSelection(selection, () => read(skill))).ok, true);
    assert.equal((await withSkillSelection({ ...selection, actor_id: "someone-else" }, () => read(skill))).ok, false);
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
    assert.equal((await withSkillSelection(selection, () => read(skill))).ok, false, "old frozen names cannot select an upgraded Skill");
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
