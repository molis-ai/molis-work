import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkDraftDialogueOwnership, checkGoalTreeApplicationOwnership } from "../scripts/check-package-boundaries.mjs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
for (const [method, file, action] of [
  ["submitGoalTreeProposal", "goal-tree-submission", "treeSubmit"],
  ["checkGoalTreeProposal", "goal-tree-check", "treeCheck"],
  ["decideGoalTreeProposal", "goal-tree-decision", "treeDecide"],
]) test(`${method} stays behind the shared action and original Module owners`, () => {
  const application = read(`plugins/native/goals/src/${file}.ts`), callers = read("apps/local-host/src/goal-callers.ts");
  assert.deepEqual(checkGoalTreeApplicationOwnership(application, method), []);
  for (const extra of ["store.immediate(operation)", `coordinator.${method}(input)`, "db.prepare('INSERT INTO goal_tree_proposals VALUES (?)')"]) {
    assert.match(checkGoalTreeApplicationOwnership(`${application}\n${extra}`, method).join("\n"), /Module owners/);
  }
  // W3-07 PR-5 retired the typed Goals bridges: the Host's typed registrations carry no entry for this proposal step at all, and
  // the only registration is the Goals owner's action list (PG-094 S12: the Host's coordinator these once went through is gone too).
  const typed = read("apps/local-host/src/project-capabilities.ts");
  assert.equal(typed.includes(`goalsActions.${action}`), false, "no typed bridge is registered for the action");
  assert.equal(typed.includes(`coordinator.${method}(`), false, "typed transport cannot bypass action policy");
  assert.ok(callers.includes(`goalsActions.${action}`), "the Goals caller wiring names the action");
  assert.ok(read("plugins/native/goals/src/tree-actions.ts").includes(`goalsTreeActions.${action}`), "and the Goals owner registers it");
});

test("retired draft dialogue facade and Host registrations stay removed", () => {
  const host = read("apps/local-host/src/project-capabilities.ts");
  assert.deepEqual(checkDraftDialogueOwnership(host), []);
  for (const method of ["startDraftDialogue", "recordDraftDialogueTurn", "resumeDraftDialogue"]) {
    assert.match(checkDraftDialogueOwnership(`${host}\ncoordinator.${method}(input)`).join("\n"), /retired/);
  }
});
