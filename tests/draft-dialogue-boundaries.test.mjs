import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkDraftDialogueOwnership, checkDraftProposalOwnerSql, checkGoalTreeApplicationOwnership } from "../scripts/check-package-boundaries.mjs";

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
for (const [method, port, file, action] of [
  ["submitGoalTreeProposal", "goalTreeSubmission", "goal-tree-submission", "treeSubmit"],
  ["checkGoalTreeProposal", "goalTreeCheck", "goal-tree-check", "treeCheck"],
  ["decideGoalTreeProposal", "goalTreeDecision", "goal-tree-decision", "treeDecide"],
]) test(`${method} stays behind the shared action and original Module owners`, () => {
  const sources = ["apps/local-host/src/goal-project-application.ts", "apps/local-host/src/goals-actions.ts", `plugins/native/goals/src/${file}.ts`].map(read);
  const check = (...args) => checkGoalTreeApplicationOwnership(...args, method, port);
  assert.deepEqual(check(...sources), []);
  assert.match(check(`${sources[0]}\n  ${method}(input) { return legacy(input); }`, sources[1], sources[2]).join("\n"), /legacy/);
  assert.match(check(sources[0], sources[1].replace(`coordinator.${port}.${method}(`, `coordinator.${method}(`), sources[2]).join("\n"), new RegExp(`public ${port}`));
  for (const extra of ["store.immediate(operation)", `coordinator.${method}(input)`, "db.prepare('INSERT INTO goal_tree_proposals VALUES (?)')"]) {
    assert.match(check(sources[0], sources[1], `${sources[2]}\n${extra}`).join("\n"), /Module owners/);
  }
  const typed = read("apps/local-host/src/project-capabilities.ts");
  assert.ok(typed.includes(`goalAction(runtime, goalsActions.${action},`));
  assert.equal(typed.includes(`coordinator.${port}.${method}(`), false, "typed transport cannot bypass action policy");
});

test("Draft owner guard rejects restoring cross-module proposal SQL", () => {
  const source = read("modules/goals/src/goal-commands.ts");
  assert.deepEqual(checkDraftProposalOwnerSql(source), []);
  for (const sql of ["SELECT proposal_id FROM contract_proposals", "UPDATE contract_proposals SET state = 'superseded'"]) {
    assert.match(checkDraftProposalOwnerSql(`${source}\nrepository.db.prepare(${JSON.stringify(sql)});`).join("\n"), /Governance records/);
  }
});

test("retired draft dialogue facade and Host registrations stay removed", () => {
  const coordinator = read("apps/local-host/src/goal-project-application.ts"), host = read("apps/local-host/src/project-capabilities.ts");
  assert.deepEqual(checkDraftDialogueOwnership(coordinator, host), []);
  for (const method of ["startDraftDialogue", "recordDraftDialogueTurn", "resumeDraftDialogue"]) {
    assert.match(checkDraftDialogueOwnership(`${coordinator}\n  ${method}(input) { return legacy(input); }`, host).join("\n"), /legacy/);
    assert.match(checkDraftDialogueOwnership(coordinator, `${host}\ncoordinator.${method}(input)`).join("\n"), /retired/);
  }
});
