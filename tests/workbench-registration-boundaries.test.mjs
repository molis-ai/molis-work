import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { builtinCatalogText, checkProposalUiOwnership, hasWorkbenchUiContribution } from "../scripts/check-package-boundaries.mjs";
import { CATALOG, catalogText } from "../scripts/gates/catalog-entries.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("DD2 UI guard rejects restored root implementations, bypassed mounts and legacy client handlers", () => {
  const sources = ["apps/workbench/src/renderer.ts", "apps/workbench/src/index.ts", "apps/workbench/src/ui-composition.ts", "apps/workbench/src/scripts/client/events-accessibility.ts"]
    .map(file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      + (file === "apps/workbench/src/index.ts" ? readFileSync(new URL("../apps/workbench/src/ui-composition.ts", import.meta.url), "utf8") : ""));
  sources.splice(3, 0, "");
  sources.push(readFileSync(new URL("../apps/workbench/src/plugin-workbench.ts", import.meta.url), "utf8"));
  sources.push(builtinCatalogText(root));
  assert.deepEqual(checkProposalUiOwnership(...sources), []);
  for (const name of ["renderGoalTreeProposalDecision", "renderContractProposal", "recentDecisionResults"]) {
    const changed = [...sources]; changed[0] += `\nfunction ${name}(view) { return oldRenderer(view); }`;
    assert.match(checkProposalUiOwnership(...changed).join("\n"), /belongs to the Goals contribution/);
  }
  const unregistered = [...sources]; unregistered[6] = unregistered[6].replace(/contributions:\s*\[[^\]]*\]/gu, list => list.replace("goalsProposalUiContribution,", ""));
  assert.match(checkProposalUiOwnership(...unregistered).join("\n"), /registered with UiHost/);
  const bypassed = [...sources]; bypassed[2] = bypassed[2].replace("createSurfaceRenderers<GoalsProposalRenderer", "oldRender<GoalsProposalRenderer");
  assert.match(checkProposalUiOwnership(...bypassed).join("\n"), /must mount/);
  const legacy = [...sources]; legacy[4] += '\nconst goalTreeDecisionForm = form.closest("[data-goal-tree-decision-form]");';
  assert.match(checkProposalUiOwnership(...legacy).join("\n"), /Goals client factory/);
});

test("Workbench registration guard follows the pack registry and rejects broken wiring", () => {
  const composition = readFileSync(new URL("../apps/workbench/src/ui-composition.ts", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../apps/workbench/src/plugin-workbench.ts", import.meta.url), "utf8");
  const descriptors = builtinCatalogText(root);
  for (const name of ["feedUiContribution", "goalsProposalUiContribution", "goalsDecisionResultsUiContribution"]) {
    assert.equal(hasWorkbenchUiContribution(composition, registry, name, descriptors), true);
    // Leave the import intact: only an entry in a registered pack counts.
    const removed = descriptors.replace(/contributions:\s*\[[^\]]*\]/gu, list => list.replace(name, ""));
    assert.equal(hasWorkbenchUiContribution(composition, registry, name, removed), false);
    assert.equal(hasWorkbenchUiContribution(composition.replace("host.register(contribution)", "ignored(contribution)"), registry, name, descriptors), false);
    assert.equal(hasWorkbenchUiContribution(composition.replace("./plugin-workbench.js", "./other.js"), registry, name, descriptors), false);
    assert.equal(hasWorkbenchUiContribution(composition, registry.replace("./builtin-plugins.js", "./other.js"), name, descriptors), false);
    assert.equal(hasWorkbenchUiContribution(composition, registry.replace("= pluginWorkbenchPacks()", "= []"), name, descriptors), false);
    assert.equal(hasWorkbenchUiContribution(composition, registry.replace("...entry.workbench", "...other"), name, descriptors), false);
    assert.equal(hasWorkbenchUiContribution(`host.register(${name})`, "", name), true);
  }
  const retired = descriptors.replace("contributions: [feedUiContribution]", "contributions: [feedUiContribution, goalsLegacyProposalUiContribution]");
  assert.match(checkProposalUiOwnership("", composition, composition, "", "handleGoalProposalSubmit(submittedForm, event)", registry, retired).join("\n"), /retired/);
});

// W5-02: the catalog lists each plugin's own src/registration.ts; the guard reads the entry there, and only for a listed one.
test("W5-02-REG-03 the registration guard reads each listed plugin's own registration, and nothing the catalog does not list", () => {
  const composition = readFileSync(new URL("../apps/workbench/src/ui-composition.ts", import.meta.url), "utf8");
  const registry = readFileSync(new URL("../apps/workbench/src/plugin-workbench.ts", import.meta.url), "utf8");
  const files = readdirSync(path.join(root, "plugins/native")).map(directory => `plugins/native/${directory}/package.json`);
  const read = file => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } };
  const edited = (target, edit) => ({ files, read: file => (file === target ? edit(read(file)) : read(file)) });
  assert.match(read(CATALOG), /^  feedRegistration,$/m, "the generated catalog lists Feed's registration");
  assert.equal(hasWorkbenchUiContribution(composition, registry, "feedUiContribution", catalogText({ files, read })), true);
  const unlisted = catalogText(edited(CATALOG, text => text.replace("  feedRegistration,\n", "")));
  assert.equal(hasWorkbenchUiContribution(composition, registry, "feedUiContribution", unlisted), false, "a registration the catalog does not list registers nothing");
  const emptied = catalogText(edited("plugins/native/feed/src/registration.ts", text => text.replace("contributions: [feedUiContribution]", "contributions: []")));
  assert.equal(hasWorkbenchUiContribution(composition, registry, "feedUiContribution", emptied), false, "the plugin's own entry is what counts, not its import");
  assert.throws(() => catalogText(edited(CATALOG, text => text.replace("  feedRegistration,\n", "  feedManifest,\n"))), /neither an object literal nor a plugin's imported registration/);
  assert.throws(() => catalogText({ files: files.filter(file => !file.includes("/feed/")), read }), /is not a built-in plugin's src\/registration\.ts/);
});
