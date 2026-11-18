import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { AUTOMATION_ADOPTION_PROVIDER_ID, automationAdoptionActions, type AutomationOfferResult } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { SKILLS_PERMISSIONS, skillCatalogActions, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { attachAutomationWorkspace } from "./fixtures/automation-workspace.js";
import { signedContentPackage } from "./fixtures/content-package.js";
import { homeConnectorDirectory } from "@molis-ai/molis-work-app-local-host";
import { openTestHome, type TestProject } from "./fixtures/test-home.js";

/**
 * S-automation-adoption (specs/automation-recommender §7, AUT-06/AUT-08): turning a project's suggestions on runs only as the person, from
 * the card the Host placed; an Agent, a plugin, a delegated call or a page's own card cannot reach it, and it accepts only the items of the
 * project's latest card. Each refusal leaves every skill as it was.
 */
const base = (project: TestProject) => `/projects/${project.project_id}`;
const adoptRef = { ...automationAdoptionActions.adopt, provider_id: AUTOMATION_ADOPTION_PROVIDER_ID };
const undoRef = { ...automationAdoptionActions.undo, provider_id: AUTOMATION_ADOPTION_PROVIDER_ID };

test("S-automation-adoption: only the person's Host card turns suggestions on — Agents, plugins, delegated calls, page cards and items not offered are refused", { timeout: 120_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Adoption boundary");
  const other = await fixture.createProject("Other project");
  const folder = join(fixture.home, "boundary-folder");
  await mkdir(folder);
  await writeFile(join(folder, "package.json"), JSON.stringify({ scripts: { test: "fixture" }, devDependencies: { vitest: "*" } }));
  await attachAutomationWorkspace(fixture, project, folder);
  await homeConnectorDirectory(fixture.home);
  const bundle = signedContentPackage(newPublisher(), { skills: [{ id: "review-tests" }, { id: "coverage-tests" }] });
  const preview = await fixture.web.post<{ preview_id: string }>(base(project) + "/api/plugin-trust/install/preview", { bundle });
  await fixture.web.post(base(project) + "/api/plugin-trust/install/confirm", { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });

  const offered = await fixture.web.post<AutomationOfferResult>(base(project) + "/api/automation/recommendations/offer", {});
  assert.equal(offered.offered, true);
  if (!offered.offered) return;
  const view = await fixture.web.get<AssistantWorkView>(`${base(project)}/api/assistant/works/${offered.work_id}`);
  const card = view.cards.find(row => row.capability_id === automationAdoptionActions.adopt.capability_id)!;
  const ids = card.fields.find(field => field.key === "adopt")!.options!.map(option => option.value);
  assert.ok(ids.length >= 2);

  const client = fixture.host.actionClient(project.reference);
  const person: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: [...SKILLS_PERMISSIONS] };
  const skills = async () => (await client.invoke(person, skillCatalogActions.list, {}) as { skills: SkillCatalogEntry[] }).skills
    .filter(row => ["review-tests", "coverage-tests"].includes(row.ref.skill_id)).map(row => row.state);
  const refused = async (caller: ActionCallContext, input: unknown, code: string, what: string) => {
    await assert.rejects(client.invoke(caller, adoptRef, input), (error: unknown) => error instanceof ActionError && (code === "*" || error.code === code), what);
    assert.deepEqual(await skills(), ["off", "off"], `${what}: nothing was turned on`);
  };
  const input = { adopt: [ids[0]], never: [], skill_state: "auto" };

  // Not offered to Agents: an Agent round can neither see nor call it.
  const agent: ActionCallContext = { ...person, audience: "agent", permissions: [] };
  assert.ok(!(await client.discover(agent)).some(view => view.action.capability_id === adoptRef.capability_id), "no Agent discovers the adoption");
  await assert.rejects(client.invoke(agent, adoptRef, input), "an Agent cannot call it");
  assert.deepEqual(await skills(), ["off", "off"]);
  // A plugin acting for the person or a delegated call (refused before the provider when the Host did not vouch for it), another actor: refused.
  await refused({ ...person, host_plugin: { plugin_id: "io.molis.work.todo", install_id: "builtin:io.molis.work.todo", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id } } as ActionCallContext, input, "*", "a plugin's call");
  await refused({ ...person, delegated_by: "io.molis.work.todo" }, input, "*", "a delegated call");
  await refused({ ...person, actor_id: "someone-else" }, input, "actions.forbidden", "another actor");
  // Only the project's latest card: an id from elsewhere, or the same item both on and hidden, is refused.
  await refused(person, { ...input, adopt: ["f".repeat(64)] }, "actions.conflict", "an item the card did not list");
  await refused(person, { adopt: [ids[0]], never: [ids[0]], skill_state: "auto" }, "actions.input_invalid", "on and hidden at once");
  // Another project's card does not count there: that project has offered nothing.
  await assert.rejects(fixture.host.actionClient(other.reference).invoke({ ...person, project_id: other.project_id }, adoptRef, input),
    (error: unknown) => error instanceof ActionError && error.code === "actions.conflict", "another project's card");
  assert.deepEqual(await skills(), ["off", "off"]);
  // Undo only for this project's own adoptions.
  await assert.rejects(client.invoke(person, undoRef, { adoption_id: "00000000-0000-4000-8000-000000000000" }),
    (error: unknown) => error instanceof ActionError && error.code === "actions.missing");

  // A page cannot place a card for it: the page's card is checked against what the Assistant may use, and asking to run as the person is ignored.
  const page = await fetch(fixture.origin + base(project) + "/api/assistant/cards", { method: "POST",
    headers: { "content-type": "application/json", "x-molis-work-control-token": fixture.controlToken },
    body: JSON.stringify({ message_id: crypto.randomUUID(), source: { surface: "pages", title: "Pages" }, work_id: offered.work_id,
      card: { title: "开启", summary: "页面放的开启卡", reference: adoptRef, input, runs_as: "person" } }) });
  assert.ok(page.status >= 400, `a page card for the adoption is refused (${page.status})`);
  const after = await fixture.web.get<AssistantWorkView>(`${base(project)}/api/assistant/works/${offered.work_id}`);
  assert.equal(after.cards.filter(row => row.capability_id === adoptRef.capability_id).length, 1, "only the Host's card is there");
  assert.deepEqual(await skills(), ["off", "off"]);

  // A step that fails after a skill was turned on (here the project's preferences cannot be written for 「以后别再提」) turns it back off:
  // the failed adoption leaves nothing on and no record to undo.
  const preferences = join(fixture.home, "config", "automation-recommendations.json");
  await rm(preferences, { force: true });
  await mkdir(preferences);
  await assert.rejects(client.invoke(person, adoptRef, { adopt: [ids[0]], never: [ids[1]], skill_state: "auto" }), "the adoption fails as a whole");
  assert.deepEqual(await skills(), ["off", "off"], "the skill turned on before the failure is off again");
  await rm(preferences, { recursive: true });
});
