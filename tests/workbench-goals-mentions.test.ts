// T-116 (PG-060, RAC-2685): the workbench draws Goals' pages through its declared stage and through the
// contributions Goals registers; the files of `apps/workbench/src` that still name the Goals package are written down here and the
// list only shrinks. A file that stops naming the package must leave the list in the same change (the test fails until it does), and a
// file that starts naming it fails the test: add the need to the platform, not a Goals import to the shell. `builtin-plugins.ts` is the
// generated registry (`node scripts/generate-plugin-registry.mjs`), which names every built-in package by design.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";

const ROOT = new URL("../", import.meta.url);
const GOALS_PACKAGE = /@molis-ai\/molis-work-plugin-goals\b/u;

/** Who takes each remaining name out: T-117 owns remaining view types; settings forwards existing facts without Goals presentation types. */
const WORKBENCH_FILES_NAMING_GOALS: ReadonlyArray<readonly [string, string]> = [
  ["page-view.ts", "T-117 (PG-064): the view's Goal types"],
  ["project-settings-pages.ts", "Existing ProjectGuidanceView and PlanningMethodPack facts from Goals /contract"],
];

const sourceFiles = (directory: URL): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? sourceFiles(new URL(`${entry.name}/`, directory)).map(name => `${entry.name}/${name}`) : entry.name.endsWith(".ts") ? [entry.name] : []);

test("RAC-2685 the workbench files that name the Goals package are exactly the written list", () => {
  const directory = new URL("apps/workbench/src/", ROOT);
  const naming = sourceFiles(directory).filter(name => name !== "builtin-plugins.ts" && GOALS_PACKAGE.test(readFileSync(new URL(name, directory), "utf8"))).sort();
  assert.deepEqual(naming, WORKBENCH_FILES_NAMING_GOALS.map(([name]) => name).sort(),
    "a file that no longer names the Goals package leaves WORKBENCH_FILES_NAMING_GOALS; a file that starts to is a Goals import in the shell");
});

test("RAC-2685 the host's route handlers match pages with the declared routes and import none of Goals' matchers", () => {
  const removed = ["resolveGoalsReadRoute", "resolveGoalsPageRoute", "matchGoalsPlanningRoute"];
  for (const name of ["web-goals-read.ts", "web-planning.ts", "web-home-plugin-recovery.ts"]) {
    const text = readFileSync(new URL(`apps/local-host/src/${name}`, ROOT), "utf8");
    for (const matcher of removed) assert.equal(text.includes(matcher), false, `${name} names ${matcher}`);
    assert.equal(text.includes("GOALS_PAGE_ROUTES"), false, `${name} reads Goals' declarations instead of the Host's matcher`);
  }
  assert.match(readFileSync(new URL("apps/local-host/src/page-routes.ts", ROOT), "utf8"), /matchDeclaredPageRoute\(PLATFORM_PLUGIN_REGISTRATIONS\.map\(entry => entry\.manifest\)/u);
  assert.equal(GOALS_PACKAGE.test(readFileSync(new URL("apps/local-host/src/web-home-plugin-recovery.ts", ROOT), "utf8")), false);
  assert.ok(goalsManifest.ui.page_routes?.length, "Goals declares its page routes in its Manifest");
});
