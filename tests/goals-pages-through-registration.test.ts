// T-116 (PG-060, RAC-2683): Goals' GET pages are answered through the routes Goals declares in its Manifest and the one matcher the Host runs
// over every registered plugin's declarations. The matcher functions Goals used to export for the Host are gone; Goals reads the match.
import assert from "node:assert/strict";
import test from "node:test";
import * as goals from "@molis-ai/molis-work-plugin-goals";
import { GOALS_PAGE_ROUTES, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { matchDeclaredPageRoute, pageRouteProblems } from "@molis-ai/molis-work-plugin-sdk";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

test("RAC-2683 Goals declares its page routes as data and no longer exports matcher functions for the Host", () => {
  assert.deepEqual(goalsManifest.ui.page_routes, GOALS_PAGE_ROUTES);
  assert.deepEqual(pageRouteProblems(goalsManifest), []);
  for (const removed of ["resolveGoalsReadRoute", "resolveGoalsPageRoute", "matchGoalsPlanningRoute"]) {
    assert.equal(removed in goals, false, `${removed} is a private path of the Host; the Manifest's routes replace it`);
  }
});

test("RAC-2683 every built-in plugin's declared route is answered by that plugin and no other (no two routes fit one path)", () => {
  const manifests = BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest);
  let checked = 0;
  for (const manifest of manifests) {
    for (const route of manifest.ui.page_routes ?? []) {
      const path = route.path.replace(/:[a-z0-9_]+/gu, "x");
      const found = matchDeclaredPageRoute(manifests, path, new URLSearchParams());
      assert.deepEqual([found?.plugin_id, found?.route_id], [manifest.plugin_id, route.route_id], `${manifest.plugin_id} ${route.route_id} ${path}`);
      checked++;
    }
  }
  assert.ok(checked >= GOALS_PAGE_ROUTES.length);
});
