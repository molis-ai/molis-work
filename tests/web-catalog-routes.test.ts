import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_ROUTES } from "../apps/local-host/src/web-catalog-routes.js";

// W5-10 batch G: handleLocalCatalogWebRequest became an ordered route table, in the shape of W5-07's. What answers each address is
// pinned by web-route-table.test.ts; this pins the order the addresses are tried in, which that list of requests cannot see for
// the entries that only differ by method or a shared prefix: the settings redirect before everything, the generic settings pages
// before the plugin-named ones, the project index last.
test("the catalog's addresses are tried in the order they always were, each entry under its own name", () => {
  assert.deepEqual(CATALOG_ROUTES.map(route => route.id), [
    "settings-address", "capabilities-redirect", "project-arrival", "search", "placement", "functions", "onboarding", "desktop-capsule",
    "component-board", "settings-home", "personal-planning", "model-settings", "settings-page", "plugin-settings-page", "connector-connections",
    "connector-methods", "connectors-settings", "mcp-action-settings", "runtime-settings", "project-settings", "pty-client", "health", "project-index",
  ]);
  assert.equal(new Set(CATALOG_ROUTES.map(route => route.id)).size, CATALOG_ROUTES.length);
});
