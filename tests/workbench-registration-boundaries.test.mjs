import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkProposalUiOwnership, hasWorkbenchUiContribution } from "../scripts/check-package-boundaries.mjs";

test("DD2 UI guard rejects restored root implementations, bypassed mounts and legacy client handlers", () => {
  const sources = ["apps/workbench/src/renderer.ts", "apps/workbench/src/index.ts", "apps/workbench/src/goals-proposal-ui.ts", "apps/workbench/src/scripts/client/events-accessibility.ts"]
    .map(file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      + (file === "apps/workbench/src/index.ts" ? readFileSync(new URL("../apps/workbench/src/ui-composition.ts", import.meta.url), "utf8") : ""));
  sources.splice(3, 0, "");
  sources.push(readFileSync(new URL("../apps/workbench/src/plugin-workbench.ts", import.meta.url), "utf8"));
  assert.deepEqual(checkProposalUiOwnership(...sources), []);
  for (const name of ["renderGoalTreeProposalDecision", "renderContractProposal", "recentDecisionResults"]) {
    const changed = [...sources]; changed[0] += `\nfunction ${name}(view) { return oldRenderer(view); }`;
    assert.match(checkProposalUiOwnership(...changed).join("\n"), /belongs to the Goals contribution/);
  }
  const unregistered = [...sources]; unregistered[5] = unregistered[5].replace("      goalsProposalUiContribution,", "");
  assert.match(checkProposalUiOwnership(...unregistered).join("\n"), /registered with UiHost/);
  const bypassed = [...sources]; bypassed[2] = bypassed[2].replace("host.mount(", "oldRender(");
  assert.match(checkProposalUiOwnership(...bypassed).join("\n"), /must mount/);
  const legacy = [...sources]; legacy[4] += '\nconst goalTreeDecisionForm = form.closest("[data-goal-tree-decision-form]");';
  assert.match(checkProposalUiOwnership(...legacy).join("\n"), /Goals client factory/);
});

test("Workbench registration guard follows the pack registry and rejects broken wiring", () => {
  const composition = readFileSync(new URL("../apps/workbench/src/ui-composition.ts", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../apps/workbench/src/plugin-workbench.ts", import.meta.url), "utf8");
  for (const name of ["feedUiContribution", "goalsProposalUiContribution", "goalsDecisionResultsUiContribution"]) {
    assert.equal(hasWorkbenchUiContribution(composition, registry, name), true);
    // Leave the import intact: only an entry in a registered pack counts.
    const removed = registry.replace(/contributions:\s*\[[^\]]*\]/gu, list => list.replace(name, ""));
    assert.equal(hasWorkbenchUiContribution(composition, removed, name), false);
    assert.equal(hasWorkbenchUiContribution(composition.replace("host.register(contribution)", "ignored(contribution)"), registry, name), false);
    assert.equal(hasWorkbenchUiContribution(composition.replace("./plugin-workbench.js", "./other.js"), registry, name), false);
    assert.equal(hasWorkbenchUiContribution(`host.register(${name})`, "", name), true);
  }
  const retired = registry.replace("contributions: [feedUiContribution]", "contributions: [feedUiContribution, goalsLegacyProposalUiContribution]");
  assert.match(checkProposalUiOwnership("", composition, "host.mount(", "", "handleGoalProposalSubmit(submittedForm, event)", retired).join("\n"), /retired/);
});

