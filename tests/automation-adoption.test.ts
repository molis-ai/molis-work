import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { AUTOMATION_ADOPTION_PROVIDER_ID, automationAdoptionActions, type AutomationOfferResult, type AutomationReport } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { attachAutomationWorkspace } from "./fixtures/automation-workspace.js";
import { signedContentPackage } from "./fixtures/content-package.js";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";
import { homeConnectorDirectory } from "../apps/local-host/dist/connector-directory.js";

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

test("§7 AUT-03: connection suggestions come from declared project hints — dependencies, files and Git remote hosts — and keep only the hint", { timeout: 60_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Hints project");
  const folder = join(fixture.home, "hinted");
  await mkdir(join(folder, ".git"), { recursive: true });
  await writeFile(join(folder, "package.json"), JSON.stringify({ dependencies: { "@linear/sdk": "^20.0.0", "@sentry/node": "*" } }));
  await writeFile(join(folder, ".gitlab-ci.yml"), "stages: [test]\n");
  await writeFile(join(folder, ".git", "config"), "[remote \"origin\"]\n\turl = https://someone:secret-token@gitlab.com/team/private-repo.git\n");
  await attachAutomationWorkspace(fixture, project, folder);
  // The scan reads the Home's service directory as it is and never builds it (AUT-01); a running Home has built it at start.
  await homeConnectorDirectory(fixture.home);
  const report = await scan(fixture, project);
  assert.ok(!report.gaps.some(gap => gap.code === "directory-unavailable" && gap.category === "connections"));
  const hinted = report.evidence.flatMap(row => (row.hints ?? []).map(hint => `${row.path}:${hint.service_id}:${hint.kind}:${hint.hint}`));
  assert.ok(hinted.includes("package.json:linear:dependency:@linear/sdk"), hinted.join("\n"));
  assert.ok(hinted.includes("package.json:sentry:dependency:@sentry/*"), `a scope hint matches any package of the scope: ${hinted.join(" | ")}`);
  assert.ok(hinted.includes(".gitlab-ci.yml:gitlab:file:.gitlab-ci.yml"));
  assert.ok(hinted.includes(".git/config:gitlab:git_host:gitlab.com"), "a remote on a declared host is matched by its host only");
  assert.doesNotMatch(JSON.stringify(report), /secret-token|someone|private-repo|\^20/, "nothing of the remote address or the versions is kept");
  assert.ok(!hinted.some(row => row.includes(":slack:")), "a service whose hints nothing matches is not suggested");
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

  const first = await offer(fixture, project);
  assert.equal(first.offered, true);
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
