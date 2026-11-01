import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";
import { builtinCatalogText, checkProposalUiOwnership, hasWorkbenchUiContribution } from "../scripts/check-package-boundaries.mjs";
import { CATALOG, catalogText } from "../scripts/gates/catalog-entries.mjs";
import { PLATFORM_FILE, pluginRegistryProblems } from "../scripts/generate-plugin-registry.mjs";
import { WORKSPACE_PACKAGES } from "../scripts/workspace-packages.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

test("DD2 UI guard rejects restored root implementations, bypassed mounts and legacy client handlers", () => {
  const sources = ["apps/workbench/src/renderer.ts", "apps/workbench/src/index.ts", "plugins/native/goals/src/page/factories.ts", "plugins/native/goals/src/page/surfaces.ts", "apps/workbench/src/scripts/client/events-accessibility.ts"]
    .map(file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      + (file === "apps/workbench/src/index.ts" ? readFileSync(new URL("../apps/workbench/src/ui-composition.ts", import.meta.url), "utf8") : ""));
  sources.push(readFileSync(new URL("../apps/workbench/src/plugin-workbench.ts", import.meta.url), "utf8"));
  sources.push(builtinCatalogText(root));
  const pageDirectory = new URL("../plugins/native/goals/src/page/", import.meta.url);
  sources.push(readdirSync(pageDirectory).filter(name => name.endsWith(".ts")).map(name => readFileSync(new URL(name, pageDirectory), "utf8")).join("\n"));
  assert.deepEqual(checkProposalUiOwnership(...sources), []);
  for (const name of ["renderGoalTreeProposalDecision", "renderContractProposal", "recentDecisionResults"]) {
    const changed = [...sources]; changed[0] += `\nfunction ${name}(view) { return oldRenderer(view); }`;
    assert.match(checkProposalUiOwnership(...changed).join("\n"), /belongs to the Goals contribution/);
  }
  const unregistered = [...sources]; unregistered[6] = unregistered[6].replace(/contributions:\s*\[[^\]]*\]/gu, list => list.replace("goalsProposalUiContribution,", ""));
  assert.match(checkProposalUiOwnership(...unregistered).join("\n"), /registered with UiHost/);
  const bypassed = [...sources]; bypassed[2] = bypassed[2].replace("surfaceRenderers<GoalsProposalRenderer", "oldRender<GoalsProposalRenderer");
  assert.match(checkProposalUiOwnership(...bypassed).join("\n"), /must mount/);
  const legacy = [...sources]; legacy[4] += '\nconst goalTreeDecisionForm = form.closest("[data-goal-tree-decision-form]");';
  assert.match(checkProposalUiOwnership(...legacy).join("\n"), /Goals client factory/);
  // The chain from the Goals page to the registered contribution is pinned at each link (T-116 review): swapping any one is refused.
  const otherMount = [...sources]; otherMount[0] = otherMount[0].replace("mount: mountContributionsOf(GOALS_PLUGIN_ID)", "mount: renderWorkbenchContribution");
  assert.match(checkProposalUiOwnership(...otherMount).join("\n"), /created with mount: mountContributionsOf\(GOALS_PLUGIN_ID\)/);
  const unowned = [...sources]; unowned[1] = unowned[1].replace("}, pluginId).html", "}).html");
  assert.match(checkProposalUiOwnership(...unowned).join("\n"), /mountContributionsOf must mount through the workbench host with the plugin's id as owner/);
  const notDeclared = [...sources]; notDeclared[1] = notDeclared[1].replace("workbenchUiHost.mountDeclared(", "workbenchUiHost.render(");
  assert.match(checkProposalUiOwnership(...notDeclared).join("\n"), /workbenchUiHost\.mountDeclared/);
  const ownMount = [...sources]; ownMount[3] = ownMount[3].replace("return mount(contributionId, surface, model)", "return ownMount(contributionId, surface, model)");
  assert.match(checkProposalUiOwnership(...ownMount).join("\n"), /mounted with the mount the shell gave it/);
  const redrawn = [...sources]; redrawn[7] += "\nfunction renderContractProposal(view) { return oldRenderer(view); }";
  assert.match(checkProposalUiOwnership(...redrawn).join("\n"), /plugins\/native\/goals\/src\/page: DD2 renderContractProposal/);
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
  assert.match(checkProposalUiOwnership("", composition, readFileSync(new URL("../plugins/native/goals/src/page/factories.ts", import.meta.url), "utf8"), "", "handleGoalProposalSubmit(submittedForm, event)", registry, retired).join("\n"), /retired/);
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
  assert.throws(() => catalogText(edited(CATALOG, text => text.replace("  feedRegistration,\n", "  feedManifest,\n"))), /is not a plugin's imported registration/);
  assert.throws(() => catalogText({ files: files.filter(file => !file.includes("/feed/")), read }), /is not a built-in plugin's src\/registration\.ts/);
});

// RAC-566: the catalog has one form, the generated list of each plugin's own registration. A catalog written by hand, an entry
// written in place among the generated ones, or a platform list written by hand is refused by the gates' reader and by --check.
test("RAC-566 a catalog or platform list written by hand is refused, by the gates' reader and by the generator's --check", () => {
  const files = readdirSync(path.join(root, "plugins/native")).map(directory => `plugins/native/${directory}/package.json`);
  const read = file => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } };
  const edited = (target, edit) => ({ files, read: file => (file === target ? edit(read(file)) : read(file)) });
  assert.deepEqual(pluginRegistryProblems({ files, read }, WORKSPACE_PACKAGES), [], "the tree as it is passes");
  const feed = read("plugins/native/feed/src/registration.ts").match(/export const registration[^=]*=\s*(\{[\s\S]*\});\s*$/m)?.[1];
  assert.ok(feed, "Feed's registration is an object literal");
  const inPlace = edited(CATALOG, text => text.replace("  feedRegistration,\n", `  ${feed},\n`));
  assert.throws(() => catalogText(inPlace), /a catalog entry is written by hand/);
  assert.match(pluginRegistryProblems(inPlace, WORKSPACE_PACKAGES).join("\n"), /builtin-plugins\.ts is out of date or edited by hand/);
  const byHand = edited(CATALOG, () => `export const BUILTIN_PLUGIN_CATALOG = [\n${feed},\n];\n`);
  assert.throws(() => catalogText(byHand), /a catalog entry is written by hand/);
  assert.match(pluginRegistryProblems(byHand, WORKSPACE_PACKAGES).join("\n"), /builtin-plugins\.ts is out of date or edited by hand/);
  const platformByHand = edited(PLATFORM_FILE, () => "export const PLATFORM_PLUGIN_REGISTRATIONS = [];\n");
  assert.match(pluginRegistryProblems(platformByHand, WORKSPACE_PACKAGES).join("\n"), /plugin-registry\.generated\.ts is out of date or edited by hand/);
});

// RAC-2681: these two ports and the renderer factories remain in the Goals leaf modules.
test("RAC-2681 Frame L and icon are function properties, not method signatures", () => {
  const file = "plugins/native/goals/src/page/frame-stage.ts";
  const source = ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
  const render = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "renderGoalFrameStage");
  assert.ok(render);
  const ports = render.parameters[0].type;
  assert.ok(ports && ts.isTypeLiteralNode(ports));
  for (const name of ["L", "icon"]) {
    const member = ports.members.find(node => node.name?.getText(source) === name);
    assert.ok(member && ts.isPropertySignature(member) && member.type && ts.isFunctionTypeNode(member.type), `${name} must be a function property`);
  }
});

test("RAC-2681 Goals renderer factories import owner leaves without returning through the package root", () => {
  const file = "plugins/native/goals/src/page/factories.ts";
  const source = ts.createSourceFile(file, readFileSync(path.join(root, file), "utf8"), ts.ScriptTarget.Latest, true);
  const imports = source.statements.filter(ts.isImportDeclaration);
  assert.ok(imports.length > 0);
  for (const entry of imports) {
    assert.ok(ts.isStringLiteral(entry.moduleSpecifier));
    assert.match(entry.moduleSpecifier.text, /^(?:\.\/ports|\.\/surfaces|\.\.\/(?:context|dialogs|document|factors|momentum|planning|policy|proposal|relation|status|tree)-ui(?:-model)?)\.js$/, "factory import must name its owner leaf");
  }
});
