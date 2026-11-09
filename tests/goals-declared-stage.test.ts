import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PresentationValues } from "@molis-ai/molis-work-contracts/platform/presentation";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { createLocalHostWorkbenchRenderer } from "@molis-ai/molis-work-app-local-host";
import { desktopWorkbenchRendererPorts } from "@molis-ai/molis-work-app-desktop";
import type { MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { openTestHome } from "./fixtures/test-home.js";
import { goalApplicationOf } from "./fixtures/goal-application.js";

test("RAC-2682 Goals owns the canvas markup and the shell has no Goals renderer import", () => {
  const shell = readFileSync(new URL("../apps/workbench/src/shell-page-renderer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /goal-canvas-shell|buildGoalCollectionModel|molis-work-plugin-goals/u);
});

test("RAC-2682 the declared Goals refresh surface returns content without document tags", t => {
  const view = JSON.parse(readFileSync(new URL("./fixtures/goals-page-golden/view.json", import.meta.url), "utf8")) as MolisWorkWebView;
  const pack = parseLocalePack(readFileSync(new URL("../apps/workbench/resources/locales/zh.json", import.meta.url), "utf8"));
  assert.ok(pack.ok);
  t.after(installTextForTest({ packs: [pack.value], locale: "zh" }));
  const renderer = createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts);
  for (const [selection, goalId] of [["current", "V1"], ["archive", "GRAPH"], ["trash", "AUTO-CONNECT"]] as const) {
    const html = renderer.declaredPageSurface("io.molis.work.goals", "board-refresh", view,
      { collection: view, selection, selected: null, presentation_states: view.goals.map(item => ({ goal_id: item.goal.goal_id, status: "open" })) }, { goal_id: goalId });
    assert.doesNotMatch(html, /<(?:!doctype\b|\/?(?:html|head|body)\b)/iu);
    assert.match(html, /^\n    <div data-refresh-tree-chrome/u);
    assert.match(html, /<section data-document-pane><section data-work-surface="goals">/u);
    assert.match(html, new RegExp('data-goal-view="' + goalId + '"', "u"));
    assert.match(html, /<dialog[^>]+data-create-dialog/u);
    assert.match(html, /<script id="molis-work-data" type="application\/json">/u);
    assert.match(html, /\n  $/u);
  }
});

test("RAC-2682 SSC-14 IUI-03 the declared stage reads the same presentation states as values without another collection read", async t => {
  const served = await openTestHome(t);
  const project = await served.createProject("Goals stage");
  const response = await fetch(`${served.origin}/projects/${project.project_id}/api/plugins/io.molis.work.goals/goals`, {
    method: "POST", headers: { origin: served.origin, "content-type": "application/json", "x-molis-work-control-token": served.controlToken,
      "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify({ title: "Declared stage selection", idempotency_key: randomUUID(),
      acceptance_criteria: ["Check the new result"] }),
  });
  assert.equal(response.status, 201, await response.clone().text());
  const { goal } = await response.json() as { goal: { goal_id: string } };
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, project_id: project.project_id, permissions: ["goals:read"] };
  const actions = bindActionClient(served.host.actionClient(project.reference), () => caller);
  const command = bindActionClient(served.host.actionClient(project.reference), () => ({ ...caller, permissions: ["goals:read", "goals:write"] }));
  const subjects = ["WAITING-CHOICE", "WAITING-ACCEPTANCE"].map(id => ({ kind: "goal", id }));
  for (const { id } of subjects) await command.invoke(goalsActions.create, { goal_id: id, title: id, idempotency_key: "create-" + id,
    requirements: [{ requirement_id: "human-" + id, statement: "People accept the deliverable", human_decision_required: true }] });
  const ask = (index: number, purpose: "suggestion" | "requirement_acceptance") => command.invoke(goalsActions.requestDecision, {
    goal_id: subjects[index]!.id, idempotency_key: "decision-" + index, purpose, question: "Proceed with the work?",
    options: [{ option_id: "yes", label: "Yes", impact: "Proceed" }, { option_id: "no", label: "No", impact: "Revise" }], scope: { requirement_ids: ["human-" + subjects[index]!.id] },
  });
  await ask(0, "suggestion"); await ask(1, "requirement_acceptance");
  const before = await actions.invoke(goalsActions.collection, {});
  const document = await actions.invoke(goalsActions.document, { goal_id: goal.goal_id });
  const stage = await actions.invoke(goalsActions.stage, { goal_id: goal.goal_id });
  assert.deepEqual(stage.collection, before);
  assert.deepEqual(stage.presentation_states.map(row => row.goal_id).sort(), before.goals.map(row => row.goal.goal_id).sort());
  assert.ok(stage.collection.goals.every(row => !Object.hasOwn(row, "presentation_status")));
  const { items: values } = await actions.invoke<{ subjects: typeof subjects; fields: string[] }, PresentationValues>(
    { capability_id: "goals.presentation.values", version: 1 }, { subjects, fields: ["status"] });
  const states = new Map(stage.presentation_states.map(row => [row.goal_id, row.status]));
  assert.deepEqual(subjects.map(subject => states.get(subject.id)), ["pending_decision", "pending_acceptance"]);
  assert.deepEqual(values.map(item => item.values?.status), subjects.map(subject => states.get(subject.id)));
  assert.deepEqual((await actions.invoke(goalsActions.stage, { goal_id: subjects[1]!.id })).presentation_states, stage.presentation_states);
  assert.deepEqual(stage.selected, { goal_id: goal.goal_id, document });
  assert.equal(stage.selection, "current");
  assert.deepEqual(await actions.invoke(goalsActions.collection, {}), before, "reading the stage leaves the owner facts unchanged");
  let stateReads = 0;
  await served.host.withProject(project.reference, runtime => {
    const app = goalApplicationOf(runtime).goalEvents, read = app.readState;
    const prototype: Pick<typeof app, "readState"> = Object.getPrototypeOf(app);
    t.mock.method(prototype, "readState", function (this: typeof app, ...input: Parameters<typeof read>) {
      if (input[0] === project.project_id) stateReads++;
      return read.apply(this, input);
    });
  });
  await actions.invoke(goalsActions.collection, {});
  const collectionReads = stateReads;
  assert.ok(collectionReads >= subjects.length);
  stateReads = 0;
  assert.equal((await actions.invoke(goalsActions.stage, { goal_id: "missing-stage-goal" })).selected, null);
  assert.equal(stateReads, collectionReads, "stage capture takes no additional event-state reads for unselected Goals");
  assert.equal((await actions.invoke(goalsActions.stage, { goal_id: goal.goal_id, collection: "trash" })).selected, null,
    "a Goal outside the requested collection is not selected; the page route supplies its original 404 body");
  const untrusted = { goal_id: goal.goal_id, project_id: "another-project", actor_id: "another-person" };
  await assert.rejects(actions.invoke(goalsActions.stage, untrusted), "request input cannot replace the trusted scope or actor");
  const other = await served.createProject("Other Goals stage");
  const otherActions = bindActionClient(served.host.actionClient(other.reference), () => ({ ...caller, project_id: other.project_id }));
  const outside = await otherActions.invoke(goalsActions.stage, { goal_id: goal.goal_id });
  assert.equal(outside.selected, null);
  assert.equal(outside.collection.goals.some(item => item.goal.goal_id === goal.goal_id), false);
  assert.equal(outside.presentation_states.some(item => subjects.some(subject => subject.id === item.goal_id)), false);
  const denied = bindActionClient(served.host.actionClient(project.reference), () => ({ ...caller, permissions: [] }));
  await assert.rejects(denied.invoke(goalsActions.stage, { goal_id: goal.goal_id }));
  const pageResponse = await fetch(`${served.origin}/projects/${project.project_id}/goals/${goal.goal_id}`);
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();
  assert.equal((html.match(/data-goal-canvas-shell(?=[\s>])/g) ?? []).length, 1, "the actual Runtime stage is not drawn again from the catalog");
  assert.match(html, /<title>Declared stage selection · Molis Work<\/title>/);
  assert.match(html, /data-desktop-surface="goals"/);
  assert.match(html, /data-board-view="current"/);
  const chip = (page: string, goalId: string) => page.match(new RegExp('data-goal-id="' + goalId + '"[^>]*>[\\s\\S]*?class="mw-presentation mw-presentation--chip"([\\s\\S]*?)</div>', "u"))?.[1] ?? "";
  assert.match(chip(html, subjects[0]!.id), /等你决定|Needs your decision/u);
  assert.match(chip(html, subjects[1]!.id), /等你验收|Needs your acceptance/u);
  const selectedState = await actions.invoke(goalsActions.state, { goal_id: goal.goal_id });
  const requirement = selectedState.requirements.find(row => row.statement === "Check the new result");
  assert.ok(requirement, "the web form's criterion has an original requirement ID");
  await command.invoke(goalsActions.requestDecision, { goal_id: goal.goal_id, idempotency_key: "later-request", purpose: "suggestion", question: "Wait for a decision?",
    options: [{ option_id: "yes", label: "Yes", impact: "Proceed" }, { option_id: "no", label: "No", impact: "Revise" }], scope: { requirement_ids: [requirement.requirement_id] } });
  const refreshed = await fetch(`${served.origin}/projects/${project.project_id}/api/board/refresh?goal_id=${subjects[0]!.id}`);
  assert.equal(refreshed.status, 200);
  assert.match(chip(await refreshed.text(), goal.goal_id), /等你决定|Needs your decision/u, "the refresh reads the new state of a now unselected Goal");
  const at = (marker: string) => { const found = html.indexOf(marker); assert.ok(found >= 0, marker); return found; };
  assert.ok(at('id="molis-work-data"') < at('/assets/molis-work-workbench.js'));
});
