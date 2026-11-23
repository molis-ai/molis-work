import assert from "node:assert/strict";
import { mkdir, readFile, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeAgentDefinitions, homeConnectorDirectory, homeIntegrationRegistry, offerProjectAutomation, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { AUTOMATION_ADOPTION_PROVIDER_ID, automationAdoptionActions, type AutomationOfferResult, type AutomationReport } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { attachAutomationWorkspace } from "./fixtures/automation-workspace.js";
import { signedContentPackage } from "./fixtures/content-package.js";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";

/**
 * The Assistant bringing up a project's automation and turning it on (specs/automation-recommender §7; AUT-03, AUT-06, AUT-07, AUT-08):
 * connection suggestions come from the services' declared `project_hints`, not a list of names; the Assistant's card is placed once per
 * new find, runs as the person only, turns on exactly what was ticked and is undone without leaving anything behind.
 */
const base = (project: TestProject) => `/projects/${project.project_id}`;
const recommendations = (project: TestProject) => `${base(project)}/api/automation/recommendations`;
const offersFile = (home: string) => join(home, "config", "automation-offers.json");

async function scan(fixture: TestHome, project: TestProject): Promise<AutomationReport> {
  const response = await fetch(fixture.origin + recommendations(project), { headers: { "x-molis-work-control-token": fixture.controlToken } });
  assert.equal(response.status, 200, await response.clone().text());
  return await response.json() as AutomationReport;
}
const offer = (fixture: TestHome, project: TestProject) => fixture.web.post<AutomationOfferResult>(recommendations(project) + "/offer", {});
/** A look not repeated within minutes: the test moves the last look back instead of waiting. */
async function forgetLastLook(home: string) {
  const state = JSON.parse(await readFile(offersFile(home), "utf8")) as { rows: Array<{ looked_at: string | null }> };
  for (const row of state.rows) row.looked_at = "2000-01-01T00:00:00.000Z";
  await writeFile(offersFile(home), JSON.stringify(state) + "\n");
}

test("§7 AUT-03 SCAF-04: a cold report takes hints from declared dependencies, files and Git remotes", { timeout: 60_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Hints project");
  const folder = join(fixture.home, "hinted");
  await mkdir(join(folder, ".git"), { recursive: true });
  await writeFile(join(folder, "package.json"), JSON.stringify({ dependencies: { "@linear/sdk": "^20.0.0", "@sentry/node": "*" } }));
  await writeFile(join(folder, ".gitlab-ci.yml"), "stages: [test]\n");
  await writeFile(join(folder, ".git", "config"), "[remote \"origin\"]\n\turl = https://someone:secret-token@gitlab.com/team/private-repo.git\n[lfs]\n\turl = https://bitbucket.org/project/assets\n");
  await writeFile(join(folder, "pyproject.toml"), '[project]\ndescription = "dropbox"\ndependencies = [\n  "lark-oapi>=1", # "discord.py"\n]\n');
  await attachAutomationWorkspace(fixture, project, folder);
  const report = await scan(fixture, project);
  assert.ok(!report.gaps.some(gap => gap.code === "directory-unavailable" && gap.category === "connections"));
  const hinted = report.evidence.flatMap(row => (row.hints ?? []).map(hint => `${row.path}:${hint.service_id}:${hint.kind}:${hint.hint}`));
  assert.ok(hinted.includes("package.json:linear:dependency:@linear/sdk"), hinted.join("\n"));
  assert.ok(hinted.includes("package.json:sentry:dependency:@sentry/*"), `a scope hint matches any package of the scope: ${hinted.join(" | ")}`);
  assert.ok(hinted.includes(".gitlab-ci.yml:gitlab:file:.gitlab-ci.yml"));
  assert.ok(hinted.includes(".git/config:gitlab:git_host:gitlab.com"), "a remote on a declared host is matched by its host only");
  assert.doesNotMatch(JSON.stringify(report), /secret-token|someone|private-repo|\^20/, "nothing of the remote address or the versions is kept");
  assert.ok(hinted.includes("pyproject.toml:feishu:dependency:lark-oapi"), hinted.join("\n"));
  assert.ok(!hinted.some(row => /:(dropbox|discord|bitbucket|slack):/u.test(row)), "descriptions, comments and non-remote URL fields do not count");
  const connections = report.groups.find(group => group.category === "connections")!.suggestions;
  assert.ok(connections.length > 0 && connections.length <= 2);
  for (const row of connections) {
    assert.equal(row.next.kind, "connection");
    const service = row.next.kind === "connection" ? row.next.service_id : "";
    assert.ok(row.evidence.every(entry => (entry.hints ?? []).every(hint => hint.service_id === service)), "a suggestion's evidence names only its own service");
  }
});

test("§7 AUT-06 AUT-07 AUT-08: the Assistant's card is said once, runs as the person, turns on what was ticked and undoes it", { timeout: 120_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Card project");
  const folder = join(fixture.home, "card-folder");
  await mkdir(folder);
  await writeFile(join(folder, "package.json"), JSON.stringify({ scripts: { test: "fixture" }, devDependencies: { vitest: "*" }, dependencies: { "@linear/sdk": "*" } }));
  await attachAutomationWorkspace(fixture, project, folder);
  await homeConnectorDirectory(fixture.home);
  const bundle = signedContentPackage(newPublisher(), { skills: [{ id: "review-tests" }, { id: "coverage-tests" }] });
  const preview = await fixture.web.post<{ preview_id: string }>(base(project) + "/api/plugin-trust/install/preview", { bundle });
  await fixture.web.post(base(project) + "/api/plugin-trust/install/confirm", { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });

  // No folder: nothing is said (a project of its own, so this project's look is not spent).
  const empty = await fixture.createProject("No folder");
  assert.deepEqual(await offer(fixture, empty), { offered: false, reason: "no-workspace" });

  const simultaneous = await Promise.all([offer(fixture, project), offer(fixture, project)]);
  const first = simultaneous.find(result => result.offered);
  assert.equal(simultaneous.filter(result => result.offered).length, 1, "SCAF-04: two tabs make one suggestion card");
  assert.ok(first);
  if (!first.offered) return;
  const read = () => fixture.web.get<AssistantWorkView>(`${base(project)}/api/assistant/works/${first.work_id}`);
  const view = await read();
  const card = view.cards.find(row => row.capability_id === automationAdoptionActions.adopt.capability_id)!;
  assert.ok(card, "the card is in the project's work for it");
  assert.equal(card.status, "ready");
  const adopt = card.fields.find(field => field.key === "adopt")!, never = card.fields.find(field => field.key === "never")!;
  assert.equal(adopt.multiple, true);
  assert.ok(adopt.options!.length >= 2 && adopt.options!.length <= 3, "at most three, the most worth having");
  assert.deepEqual(JSON.parse(adopt.raw!), adopt.options!.map(option => option.value), "all start ticked");
  assert.deepEqual(JSON.parse(never.raw!), [], "nothing is hidden unless ticked");
  assert.ok(adopt.options!.every(option => option.description), "each says where it comes from or why");
  assert.ok(adopt.options!.filter(option => /Linear/u.test(option.label)).length <= 1, "at most one connection");

  // Said once: the same find does not make the Assistant speak again; the look itself is not repeated within minutes.
  assert.deepEqual(await offer(fixture, project), { offered: false, reason: "recent" });
  await forgetLastLook(fixture.home);
  assert.deepEqual(await offer(fixture, project), { offered: false, reason: "nothing-new" });

  // Only the person runs it: no Agent can reach the adoption, and the card ran nothing yet.
  const agent = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "agent" as const, permissions: [] };
  await assert.rejects(fixture.host.actionClient(project.reference).invoke(agent, { ...automationAdoptionActions.adopt, provider_id: AUTOMATION_ADOPTION_PROVIDER_ID },
    { adopt: [], never: [], skill_state: "auto" }));
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user" as const, permissions: [...SKILLS_PERMISSIONS] };
  const skills = async () => (await fixture.host.actionClient(project.reference).invoke(person, skillCatalogActions.list, {}) as { skills: SkillCatalogEntry[] }).skills
    .filter(row => ["review-tests", "coverage-tests"].includes(row.ref.skill_id));
  assert.ok((await skills()).every(row => row.state === "off"));

  // Tick one skill and hide another; how skills are used is the person's pick.
  const skillOptions = adopt.options!.filter(option => !/Linear/u.test(option.label));
  const [on, hide] = skillOptions;
  assert.ok(on && hide);
  const ran = await fixture.web.post<{ status: string; outcome?: unknown }>(`${base(project)}/api/assistant/works/${first.work_id}/cards/${card.card_id}/run`,
    { revision: card.revision, values: { adopt: [on.value], never: [hide.value], skill_state: "manual" } });
  assert.equal(ran.status, "done", JSON.stringify(ran));
  const after = await skills();
  assert.equal(after.find(row => row.name === on.label)?.state, "manual", "the ticked skill is on, only when named");
  assert.equal(after.find(row => row.name === hide.label)?.state, "off", "the hidden one is not turned on");
  const report = await scan(fixture, project);
  assert.ok(report.preferences?.choices.some(choice => choice.id === hide.value && choice.choice === "hidden"), "「以后别再提」 is the project's preference (AUT-07)");

  // Undo turns back exactly what this adoption turned on (AUT-08).
  const undoable = (await read()).undoable?.find(row => row.state === "available");
  assert.ok(undoable, "the work offers to undo it");
  await fixture.web.post(`${base(project)}/api/assistant/works/${first.work_id}/undo/${undoable.undo_id}`, {});
  assert.ok((await skills()).every(row => row.state === "off"), "nothing turned on is left behind");
  assert.equal((await read()).undoable?.find(row => row.undo_id === undoable.undo_id)?.state, "undone");

  // The person's switch: off, the Assistant says nothing in any project.
  assert.deepEqual(await fixture.web.post(recommendations(project) + "/offers", { enabled: false }), { enabled: false });
  await forgetLastLook(fixture.home);
  assert.deepEqual(await offer(fixture, project), { offered: false, reason: "off" });
  const setting = await fetch(fixture.origin + recommendations(project) + "/offers", { headers: { "x-molis-work-control-token": fixture.controlToken } });
  assert.deepEqual(await setting.json(), { enabled: false });
});

test("§7 AUT-06: a connection ticked in the card is prepared, never connected, and finished in the card's own connection card", { timeout: 90_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Connection card");
  const folder = join(fixture.home, "linear-folder");
  await mkdir(folder);
  await writeFile(join(folder, "package.json"), JSON.stringify({ dependencies: { "@linear/sdk": "*" } }));
  await attachAutomationWorkspace(fixture, project, folder);
  await homeConnectorDirectory(fixture.home);
  const first = await offer(fixture, project);
  assert.equal(first.offered, true);
  if (!first.offered) return;
  const view = await fixture.web.get<AssistantWorkView>(`${base(project)}/api/assistant/works/${first.work_id}`);
  const card = view.cards.find(row => row.capability_id === automationAdoptionActions.adopt.capability_id)!;
  const linear = card.fields.find(field => field.key === "adopt")!.options!.find(option => option.label === "Linear");
  assert.ok(linear, "the declared hint made Linear an option");
  assert.match(linear.description ?? "", /package\.json · @linear\/sdk/u, "the option says what in the project points at it");
  const ran = await fixture.web.post<{ status: string; presentation?: { pending_connection?: { authorization_id: string } } }>(
    `${base(project)}/api/assistant/works/${first.work_id}/cards/${card.card_id}/run`, { revision: card.revision, values: { adopt: [linear.value], never: [], skill_state: "auto" } });
  assert.equal(ran.status, "done", JSON.stringify(ran));
  assert.ok(ran.presentation?.pending_connection?.authorization_id, "the result carries the connection to finish in the card");
  const accounts = withConnectorConnections(fixture.home, store => store.list().filter(row => row.service_id === "linear"), true) ?? [];
  assert.deepEqual(accounts, [], "nothing is connected until the person finishes it");
});

test("SCAF-02 AUT-06 a failed preference save restores the skill and cancels only the setup created by that adoption", { timeout: 60_000 }, async t => {
  const fixture = await openTestHome(t);
  for (const reuse of [false, true]) {
    const project = await fixture.createProject(`Write failure, reuse ${reuse}`);
    const sample = await adoptionSample(fixture, project);
    const request = { service_id: "linear", method: "token", display_name: "Linear", expected_revision: null };
    const setup = () => fixture.host.actionClient(project.reference).invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
      audience: "user", permissions: ["connectors:management:write"] }, { capability_id: "connectors.setup.prepare", version: 1 }, request) as Promise<{ authorization_id: string }>;
    const previous = reuse ? (await setup()).authorization_id : undefined;
    const preferences = join(fixture.home, "config", "automation-recommendations.json");
    await mkdir(preferences);
    try {
      const failed = await sample.run();
      assert.equal(failed.status, "failed", JSON.stringify(failed));
      assert.deepEqual(homeAgentDefinitions(fixture.home).skills.settings(project.project_id), []);
      assert.deepEqual((await sample.read()).undoable ?? [], []);
    } finally {
      await rmdir(preferences);
    }
    const saved = JSON.parse(await readFile(offersFile(fixture.home), "utf8")) as { rows: Array<{ adoptions: unknown[] }> };
    assert.ok(saved.rows.every(row => row.adoptions.length === 0));
    assert.equal((await scan(fixture, project)).preferences?.choices.length, 0);
    using db = new DatabaseSync(homeSqlitePath(fixture.home, "connectors"), { readOnly: true });
    const rows = db.prepare("SELECT id, status FROM connector_authorization_results WHERE json_extract(initiator_json,'$.project_id')=?")
      .all(project.project_id) as Array<{ id: string; status: string }>;
    assert.equal(rows.length, 1, "the real setup owner ran before preferences failed");
    if (reuse) assert.deepEqual({ ...rows[0] }, { id: previous, status: "prepared" }, "the original pending request remains reusable");
    else assert.equal(rows[0]?.status, "cancelled");
    assert.deepEqual(withConnectorConnections(fixture.home, store => store.list("linear")), []);
  }
});

test("SCAF-02 SCAF-03 an interrupted adoption leaves an undo receipt which a fresh person request can use", { timeout: 60_000 }, async t => {
  let fault: (() => void) | undefined;
  const fixture = await openTestHome(t, { assertAccountCurrent: () => fault?.() });
  for (const code of ["actions.cancelled", "actions.forbidden"] as const) {
    const project = await fixture.createProject(`Adoption interrupted by ${code}`);
    const sample = await adoptionSample(fixture, project);
    const skills = () => homeAgentDefinitions(fixture.home).skills.settings(project.project_id);
    let reached = false;
    fault = () => {
      if (!skills().some(row => row.state === "auto")) return;
      reached = true;
      throw new ActionError(code, "Fixture stopped the original call after its skill write");
    };
    try { await sample.run().catch(error => assert.match(String(error), /Fixture stopped|取消|拒绝/i)); }
    finally { fault = undefined; }
    assert.ok(reached, "the skill owner committed before the fault");
    assert.equal(skills().filter(row => row.state === "auto").length, 1);
    assert.equal((await scan(fixture, project)).preferences?.choices.length, 0);
    const work = await sample.read(), undo = work.undoable?.find(row => row.state === "available");
    assert.ok(undo, "a durable work receipt exists for the skill which already changed");
    const saved = await fixture.web.post<AssistantWorkView>(sample.path + "/undo/" + undo.undo_id, {});
    assert.equal(saved.undoable?.find(row => row.undo_id === undo.undo_id)?.state, "undone");
    assert.deepEqual(skills(), []);
  }
});

test("SCAF-02 AUT-06 a downstream preparation failure after a skill write restores the skill", { timeout: 60_000 }, async t => {
  let failPrepare: (() => void) | undefined;
  const fixture = await openTestHome(t, { assertAccountCurrent: () => failPrepare?.() });
  const project = await fixture.createProject("Setup refused after skill commit");
  const sample = await adoptionSample(fixture, project);
  const skills = () => homeAgentDefinitions(fixture.home).skills.settings(project.project_id);
  let reached = false;
  failPrepare = () => {
    if (!skills().some(row => row.state === "auto")) return;
    reached = true;
    failPrepare = undefined;
    throw new ActionError("actions.service_unavailable", "Fixture preparation failed after skill commit");
  };
  try { assert.equal((await sample.run()).status, "failed"); }
  finally { failPrepare = undefined; }
  assert.ok(reached);
  assert.deepEqual(skills(), []);
  assert.deepEqual((await sample.read()).undoable ?? [], []);
  assert.equal((await scan(fixture, project)).preferences?.choices.length, 0);
});

test("SCAF-03 AUT-08 undo preserves a previously enabled skill and a skill the person edited afterward", { timeout: 60_000 }, async t => {
  const fixture = await openTestHome(t), project = await fixture.createProject("Preserve original skills");
  const sample = await adoptionSample(fixture, project);
  const client = fixture.host.actionClient(project.reference), person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id,
    audience: "user" as const, permissions: [...SKILLS_PERMISSIONS] };
  const skills = async () => (await client.invoke(person, skillCatalogActions.list, {}) as { skills: SkillCatalogEntry[] }).skills;
  const set = (skill: SkillCatalogEntry, state: "manual" | "auto") => client.invoke(person, skillCatalogActions.setState,
    { scope: "project", install_id: skill.ref.install_id, skill_id: skill.ref.skill_id, state, expected_revision: skill.settings_revision });
  const named = (rows: SkillCatalogEntry[], label: string) => rows.find(row => row.name === label)!;
  await set(named(await skills(), sample.on.label), "manual");
  const before = named(await skills(), sample.on.label);
  const result = await sample.run({ adopt: [sample.on.value, sample.hide.value], never: [], skill_state: "auto" });
  assert.equal(result.status, "done");
  const adopted = named(await skills(), sample.hide.label);
  assert.equal(adopted.state, "auto");
  await set(adopted, "manual");
  const edited = named(await skills(), sample.hide.label);
  const undo = (await sample.read()).undoable?.find(row => row.state === "available");
  assert.ok(undo);
  const after = await fixture.web.post<AssistantWorkView>(sample.path + "/undo/" + undo.undo_id, {}), current = await skills();
  assert.equal(after.undoable?.find(row => row.undo_id === undo.undo_id)?.state, "undone");
  assert.match(after.undoable?.find(row => row.undo_id === undo.undo_id)?.detail ?? "", /改过|changed/u);
  assert.deepEqual([named(current, sample.on.label).state, named(current, sample.on.label).settings_revision], ["manual", before.settings_revision]);
  assert.deepEqual([named(current, sample.hide.label).state, named(current, sample.hide.label).settings_revision], ["manual", edited.settings_revision]);
});

async function adoptionSample(fixture: TestHome, project: TestProject) {
  const folder = join(fixture.home, `workspace-${project.project_id}`);
  await mkdir(folder);
  await writeFile(join(folder, "package.json"), JSON.stringify({ devDependencies: { vitest: "*" }, dependencies: { "@linear/sdk": "*" } }));
  await attachAutomationWorkspace(fixture, project, folder);
  const bundle = signedContentPackage(newPublisher(), { skills: [{ id: "review-tests" }, { id: "coverage-tests" }] });
  const plugin = base(project) + "/api/plugin-trust/install";
  const preview = await fixture.web.post<{ preview_id: string }>(plugin + "/preview", { bundle });
  await fixture.web.post(plugin + "/confirm", { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const provided = await offer(fixture, project);
  assert.ok(provided.offered);
  const path = base(project) + "/api/assistant/works/" + provided.work_id;
  const read = () => fixture.web.get<AssistantWorkView>(path);
  const [card] = (await read()).cards;
  assert.ok(card);
  const choices = card.fields.find(field => field.key === "adopt")?.options ?? [];
  const linear = choices.find(row => row.label === "Linear");
  const [on, hide] = choices.filter(row => row !== linear);
  assert.ok(linear && on && hide);
  return { path, read, on, hide, run: (values = { adopt: [on.value, linear.value], never: [hide.value], skill_state: "auto" }) =>
    fixture.web.post<{ status: string }>(path + "/cards/" + card.card_id + "/run", { revision: card.revision, values }) };
}

test("B61 P1-E5: Home-scoped skill packs can be adopted and undone per project, while CLI-only services stay off the proactive card", { timeout: 120_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Home skill & CLI");
  const other = await fixture.createProject("Other untouched");
  const folder = join(fixture.home, "home-skill-cli");
  await mkdir(folder);
  await writeFile(join(folder, "package.json"), JSON.stringify({ scripts: { test: "fixture" }, devDependencies: { vitest: "*" } }));
  await attachAutomationWorkspace(fixture, project, folder);

  // 1. Register a CLI-only service (no token, no ready OAuth) and verify offerProjectAutomation never puts CLI-only or MCP-only services onto a proactive card.
  const registry = await homeIntegrationRegistry(fixture.home);
  const attached = await registry.attach({
    schema_version: 1,
    host_api_version: 1,
    plugin_id: "com.example.clionly",
    version: "1.0.0",
    name: "CLI Only Fixture",
    kind: "integration",
    publisher: { publisher_id: "example", signature: newPublisher().identity },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    runtime: { scope: "home" },
    connection_services: [{
      service_id: "cli-only-fixture",
      title: "CLI Only Service",
      group_id: "work",
      summary: "CLI-only service fixture",
      auth_kind: "none",
      auth: { methods: [{ kind: "cli" }] },
      capabilities: [{ label: "阅读", fulfillment: "live" }],
      project_hints: { files: ["cli-only.marker"] },
    }],
    integrations: [{ integration_id: "cli-only-fixture", kind: "source", service_id: "cli-only-fixture" }],
  }, "install-cli-only", () => null, () => true);
  assert.equal(attached, true);

  let placedCards = 0;
  const cliOnlyReport: AutomationReport = {
    evidence: [{ workspace_id: "ws-cli", workspace: "home-skill-cli", path: "cli-only.marker", signals: [], hints: [{ service_id: "cli-only-fixture", kind: "file", hint: "cli-only.marker" }] }],
    groups: [{
      category: "connections",
      suggestions: [{
        id: "connection:cli-only-fixture",
        category: "connections",
        title: "CLI Only Service",
        confidence: "high",
        reason: "CLI-only service",
        effect: "Reads via CLI",
        requirements: ["CLI login"],
        risk: "Uses CLI rules",
        evidence: [{ workspace_id: "ws-cli", workspace: "home-skill-cli", path: "cli-only.marker", signals: [], hints: [{ service_id: "cli-only-fixture", kind: "file", hint: "cli-only.marker" }] }],
        next: { kind: "connection", service_id: "cli-only-fixture" },
      }, {
        id: "connection:loom",
        category: "connections",
        title: "Loom",
        confidence: "high",
        reason: "MCP-only service",
        effect: "Reads via MCP",
        requirements: ["MCP"],
        risk: "Uses MCP rules",
        evidence: [{ workspace_id: "ws-cli", workspace: "home-skill-cli", path: "cli-only.marker", signals: [] }],
        next: { kind: "connection", service_id: "loom" },
      }],
    }],
    gaps: [],
    preferences: null,
    save_token: "save-token-cli-only",
  };
  const cliOffer = await offerProjectAutomation(
    fixture.home,
    { actor: LOCAL_PERSON_ACTOR_ID, project: project.project_id, incarnation: "inc-cli-only" },
    cliOnlyReport,
    {
      place: async () => {
        placedCards += 1;
        return { work_id: "unexpected" };
      },
      notify: () => {},
    },
    () => {},
  );
  assert.deepEqual(cliOffer, { offered: false, reason: "nothing-new" }, "CLI-only and MCP-only services are excluded from proactive adoption cards");
  assert.equal(placedCards, 0);

  // 2. Install a skill pack at Home scope (not project scope), then offer & adopt in project: succeeds and stays isolated to this project.
  const homeBundle = signedContentPackage(newPublisher(), { scope: "home", skills: [{ id: "home-review-tests" }] });
  const preview = await fixture.web.post<{ preview_id: string }>(base(project) + "/api/plugin-trust/install/preview", { bundle: homeBundle });
  await fixture.web.post(base(project) + "/api/plugin-trust/install/confirm", { preview_id: preview.preview_id, consent: true, pin_label: "Home Skill Publisher" });

  const offered = await offer(fixture, project);
  assert.equal(offered.offered, true);
  if (!offered.offered) return;
  const workPath = `${base(project)}/api/assistant/works/${offered.work_id}`;
  const view = await fixture.web.get<AssistantWorkView>(workPath);
  const card = view.cards.find(row => row.capability_id === automationAdoptionActions.adopt.capability_id)!;
  const options = card.fields.find(field => field.key === "adopt")!.options ?? [];
  assert.equal(options.some(option => /CLI Only Service|Loom/u.test(option.label)), false, "CLI-only service is never placed on the proactive card");
  assert.equal(options.length, 1);

  const ran = await fixture.web.post<{ status: string }>(
    `${workPath}/cards/${card.card_id}/run`,
    { revision: card.revision, values: { adopt: [options[0]!.value], never: [], skill_state: "auto" } },
  );
  assert.equal(ran.status, "done", JSON.stringify(ran));

  const listSkillsIn = async (targetProject: TestProject | null) => {
    const client = targetProject ? fixture.host.actionClient(targetProject.reference) : fixture.host.homeActionClient();
    const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: targetProject?.project_id ?? null, audience: "user" as const, permissions: [...SKILLS_PERMISSIONS] };
    return ((await client.invoke(caller, skillCatalogActions.list, {}) as { skills: SkillCatalogEntry[] }).skills)
      .find(row => row.ref.skill_id === "home-review-tests");
  };
  assert.equal((await listSkillsIn(project))?.state, "auto", "Home-scoped skill pack enabled for this project");
  assert.equal((await listSkillsIn(other))?.state, "off", "other project stays off");
  assert.equal((await listSkillsIn(null))?.state, "off", "Home scope stays off");

  const undoable = (await fixture.web.get<AssistantWorkView>(workPath)).undoable?.find(row => row.state === "available");
  assert.ok(undoable);
  await fixture.web.post(`${workPath}/undo/${undoable.undo_id}`, {});
  assert.equal((await listSkillsIn(project))?.state, "off", "undo turns the Home-scoped skill pack back off for this project");
});
