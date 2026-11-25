import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { actionReachesAudience, LOCAL_PERSON_ACTOR_ID, PERSONAL_SPACE_PROJECT_ID, type ActionCallContext, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SKILL_AUTHORED_PLUGIN_IDS, SKILLS_PERMISSIONS, SKILLS_PROVIDER_ID, skillAuthoringActions, skillCatalogActions, skillDraftActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { MolisWorkLocalHost, SkillAuthoringService, SkillCatalog, SkillImportService, homeAgentDefinitions, molisWorkHostProjectReference, type CatalogSkill, type SkillAuthoringPorts, type SkillImportPorts } from "@molis-ai/molis-work-app-local-host";

// S-skill-authoring: adopting a draft and the other authoring actions are the person's alone and are not MCP/Agent/plugin/workflow
// tools; the Assistant may only start a draft, replay it and take its own draft back. A package of the same id from another
// publisher is not the person's even when this Home once signed the same version.

const ASSISTANT_DRAFTING = new Set([skillDraftActions.create, skillDraftActions.discard, skillDraftActions.runTrial]);

test("S-skill-authoring adopting and the authored actions are user-only and reach no MCP, Agent, workflow or plugin caller", () => {
  for (const action of [...Object.values(skillAuthoringActions), ...Object.values(skillDraftActions).filter(action => !ASSISTANT_DRAFTING.has(action))]) {
    assert.deepEqual(action.action.audiences, ["user"], action.capability_id);
    for (const audience of ["mcp", "agent", "workflow", "plugin"] as const)
      assert.equal(actionReachesAudience(action.action, action.capability_id, audience), false, `${action.capability_id} must not reach ${audience}`);
  }
  assert.ok(Object.values(skillDraftActions).includes(skillDraftActions.adopt));
  for (const action of ASSISTANT_DRAFTING) {
    assert.deepEqual([...action.action.audiences].sort(), ["agent", "user"], action.capability_id);
    for (const audience of ["mcp", "workflow", "plugin"] as const)
      assert.equal(actionReachesAudience(action.action, action.capability_id, audience), false, `${action.capability_id} must not reach ${audience}`);
  }
});

const packaged = (publisher: string, version: string, skillId: string) => ({
  manifest: { plugin_id: SKILL_AUTHORED_PLUGIN_IDS.project, version, methods: [{ skill_id: skillId, version: 1, name: skillId, summary: skillId,
    description: `用户要${skillId}时使用。`, applies_to: "assistant", body: `skills/${skillId}/SKILL.md` }] },
  trust: publisher, agentBodies: [{ kind: "method", entry_id: skillId, body: `# ${skillId}` }],
});

test("S-skill-authoring a foreign package of the same id and version is not the person's, even when this Home retained that version", async () => {
  let signed = 0, removed = 0;
  const foreign = packaged("foreign-key", "1.0.0", "foreign");
  const ports = {
    installed: async () => foreign,
    publisherKeyId: () => "home-key",
    readSealedPublisherKeyId: async () => { throw new Error("must not read a sealed key"); },
    retained: () => [], retainedOf: () => [packaged("home-key", "1.0.0", "mine")],
    installedPublisher: async () => "foreign-key",
    sign: async () => { signed++; throw new Error("must not sign"); },
    uninstall: async () => { removed++; },
    install: { readPreview: () => { throw new Error("must not preview"); }, confirm: async () => { throw new Error("must not confirm"); } },
  } as SkillAuthoringPorts;
  const service = new SkillAuthoringService(ports);
  await assert.rejects(service.save({ name: "mine", description: "用户要mine时使用。", applies_to: "assistant", body: "# mine", scope: "project" },
    { project_id: "project-a", actor_id: "person" }, {} as never),
  (error: { code?: string }) => error.code === "skills.authored_unknown");
  assert.deepEqual([signed, removed], [0, 0], "nothing was signed or taken off");
});

test("UPP-31 R22 the personal space has no project layer of own Skills: saving or removing one there is refused before anything is read", async () => {
  const untouched = new Proxy({}, { get: (_target, name) => () => { throw new Error(`port ${String(name)} must not be reached`); } });
  const service = new SkillAuthoringService(untouched as never);
  const who = { project_id: "personal", actor_id: "local-person" };
  const caller = {} as never;
  const refusedScope = (error: unknown) => (error as { code?: string; details?: { field?: string } }).code === "skills.authored_invalid"
    && (error as { details?: { field?: string } }).details?.field === "scope";
  await assert.rejects(service.save({ name: "周报", description: "写周报时用。", applies_to: "assistant", body: "先问清楚。", scope: "project" }, who, caller), refusedScope);
  await assert.rejects(service.remove({ scope: "project", skill_id: "weekly", expected_version: 1 }, who, caller), refusedScope);
});

test("UPP-31 R22 SkillImportService refuses scope: project in personal space and previews only the home layer", async () => {
  const installedScopes: string[] = [];
  const activeSceneScopes: string[] = [];
  let signCalls = 0;
  const ports: SkillImportPorts = {
    scan: () => ({
      root: "/tmp/fake-claude",
      skills: [{
        id: "weekly",
        name: "weekly",
        description: "写周报",
        path: "/tmp/nonexistent-not-a-symlink",
        compatibility: "portable",
        files: [{ path: "SKILL.md", encoding: "utf8", content: "---\nname: weekly\ndescription: 写周报\napplies_to: assistant\n---\n# 做法\n先列重点。" }],
      }],
    }),
    installed: async (_pluginId, scope) => { installedScopes.push(scope); return undefined; },
    publisherKeyId: () => "ed25519:sha256:" + "0".repeat(64),
    readSealedPublisherKeyId: async () => { throw new Error("unused"); },
    retained: () => [],
    retainedOf: () => [],
    sign: async () => { signCalls += 1; throw new Error("stop-after-scope-check"); },
    install: { readPreview: () => { throw new Error("unused"); }, confirm: async () => { throw new Error("unused"); } },
    activeScenes: async scope => { activeSceneScopes.push(scope); return new Map(); },
  };
  const service = new SkillImportService(ports);
  const who = { project_id: PERSONAL_SPACE_PROJECT_ID, actor_id: LOCAL_PERSON_ACTOR_ID };
  const preview = await service.preview({ source: { kind: "runtime", runtime_id: "claude-code" } }, who);
  assert.deepEqual(installedScopes, ["home"], "preview in personal space must only inspect home layer");
  assert.deepEqual(activeSceneScopes, ["home"], "preview activeScenes in personal space must use home layer");

  await assert.rejects(
    service.confirm({ preview_id: preview.preview_id, skill_ids: ["weekly"], scope: "project" }, who, { beforeEffect: async () => {} } as ActionExecutionContext),
    { code: "skills.scope_mismatch" },
  );
  assert.equal(signCalls, 0, "refused confirm must not sign");
  // Preview was not consumed by the refused scope: project call, so retrying with scope: home reaches signing.
  await assert.rejects(
    service.confirm({ preview_id: preview.preview_id, skill_ids: ["weekly"], scope: "home" }, who, { beforeEffect: async () => {} } as ActionExecutionContext),
    /stop-after-scope-check/u,
  );
  assert.equal(signCalls, 1);
});

test("UPP-31 R22 personal space refuses scope: project drafts/settings and unifies reading and writing skill settings onto global home layer", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-skill-r22-"));
  let host: MolisWorkLocalHost | undefined;
  try {
    const personal = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.getProject(PERSONAL_SPACE_PROJECT_ID));
    host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    const client = host.actionClient(molisWorkHostProjectReference({ databasePath: personal.database_path, projectId: personal.project_id }));
    const personalCaller: ActionCallContext = {
      actor_id: LOCAL_PERSON_ACTOR_ID, project_id: PERSONAL_SPACE_PROJECT_ID, audience: "user", permissions: [...SKILLS_PERMISSIONS],
    };
    const refusedScope = (error: unknown) => (error as { code?: string; details?: { field?: string } }).code === "skills.authored_invalid"
      && (error as { details?: { field?: string } }).details?.field === "scope";
    await assert.rejects(
      client.invoke(personalCaller, { ...skillDraftActions.create, provider_id: SKILLS_PROVIDER_ID }, { scope: "project", target: { kind: "new" } }),
      refusedScope,
      "personal space refuses creating a project-scoped draft",
    );
    await assert.rejects(
      client.invoke(personalCaller, { ...skillDraftActions.versions, provider_id: SKILLS_PROVIDER_ID }, { scope: "project", skill_id: "weekly" }),
      refusedScope,
      "personal space refuses reading project-scoped versions",
    );
    const homeDraft = await client.invoke(
      personalCaller,
      { ...skillDraftActions.create, provider_id: SKILLS_PROVIDER_ID },
      { scope: "home", target: { kind: "new" }, fields: { name: "个人草稿", description: "个人空间起草。", applies_to: "assistant", body: "# 做法" } },
    ) as { scope: string; draft_id: string };
    assert.equal(homeDraft.scope, "home");
    await assert.rejects(
      client.invoke(personalCaller, { ...skillCatalogActions.setState, provider_id: SKILLS_PROVIDER_ID },
        { scope: "project", install_id: "install-own-home", skill_id: "weekly", state: "auto", expected_revision: 0 }),
      { code: "skills.scope_mismatch" },
      "Host skills.settings.set@1 refuses scope: project in personal space",
    );

    // Verify SkillCatalog + SkillSettingsStore unify personal space onto "home" rather than creating a split "personal" row.
    const definitions = homeAgentDefinitions(home);
    const sampleSkill: CatalogSkill = {
      ref: {
        source: { kind: "plugin", plugin_id: SKILL_AUTHORED_PLUGIN_IDS.home, plugin_version: "1.0.0", publisher_signature: "local-key" },
        skill_id: "weekly", version: 1, install_id: "install-own-home", installation_generation: "gen-1",
      },
      declaration: { skill_id: "weekly", version: 1, name: "周报", summary: "写周报", description: "写周报时用。", tools: [], applies_to: "assistant" },
      body: "# 周报\n先梳理重点。",
      pack: { plugin_id: SKILL_AUTHORED_PLUGIN_IDS.home, title: "我的技能", version: "1.0.0", publisher_label: "这台电脑", trust: "home_local", scope: "home" },
      availability: { available: true },
      assertCurrent: () => {},
      assertPublisher: () => {},
    };
    const catalog = new SkillCatalog({
      definitions,
      withSkills: async (_caller, use) => use([sampleSkill]),
      resource: () => { throw new Error("unused"); },
      publishers: () => new Map(),
    });
    const execPersonal: ActionExecutionContext = { ...personalCaller, beforeEffect: async () => {} };
    await assert.rejects(
      catalog.setState(execPersonal, { scope: "project", install_id: sampleSkill.ref.install_id, skill_id: "weekly", state: "auto", expected_revision: 0 }),
      { code: "skills.scope_mismatch" },
      "personal space refuses setting project-scoped skill state",
    );
    const updated: SkillCatalogEntry = await catalog.setState(execPersonal, { scope: "home", install_id: sampleSkill.ref.install_id, skill_id: "weekly", state: "auto", expected_revision: 0 });
    assert.equal(updated.state, "auto");
    assert.equal(updated.enabled?.scope, "home");
    assert.deepEqual(definitions.skills.scopes(sampleSkill.ref.install_id), ["home"], "stored solely under global home layer, never split into personal");

    const fromPersonal = await catalog.list(personalCaller, {});
    const fromHome = await catalog.list({ ...personalCaller, project_id: null }, {});
    assert.equal(fromPersonal.skills[0]?.state, "auto", "listing from personal space sees global home setting");
    assert.equal(fromPersonal.skills[0]?.settings_revision, updated.settings_revision);
    assert.equal(fromHome.skills[0]?.state, "auto");
    assert.equal(fromHome.skills[0]?.settings_revision, updated.settings_revision);
    assert.deepEqual(definitions.skills.setting(PERSONAL_SPACE_PROJECT_ID, sampleSkill.ref.install_id, "weekly"), definitions.skills.setting("home", sampleSkill.ref.install_id, "weekly"));
  } finally {
    await host?.close();
    await rm(home, { recursive: true, force: true });
  }
});
