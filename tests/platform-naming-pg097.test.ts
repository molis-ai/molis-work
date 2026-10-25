import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pluginWorkbenchClientAsset, pluginWorkbenchPacks } from "@molis-ai/molis-work-app-workbench";
import { resolveHomeSecurityDirectory, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

// PG-097 (ac-artifacts A7, non-directory part): platform names carry no plugin names; the directory rename waits for the maintenance window.

const root = path.resolve(import.meta.dirname, "..");
const tracked = execFileSync("git", ["ls-files", "-z", "--", "apps", "packages", "plugins", "modules", "scripts", "tests", "docs", "skills", "server"], { cwd: root, encoding: "utf8" })
  .split("\0").filter(file => /\.(ts|mjs|js|sh|md|json)$/.test(file) && file !== "tests/platform-naming-pg097.test.ts");
const read = (file: string) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return ""; /* deleted in the working tree */ } };

test("RAC-427: no code, script or document reads MOLIS_JELLY_*; the material helpers take the platform names", () => {
  const offenders = tracked.filter(file => /MOLIS_JELLY_/.test(read(file)));
  assert.deepEqual(offenders, [], "the old variables are not read, not even as a fallback");
  const home = read("apps/local-host/src/material-home.ts");
  assert.match(home, /process\.env\.MOLIS_MATERIAL_NATIVE_HELPER/);
  assert.match(home, /process\.env\.MOLIS_MATERIAL_WHISPER_HELPER/);
});

test("RAC-427: the platform storage function carries no Feed name, and the path it returns is unchanged", () => {
  const offenders = tracked.filter(file => /resolveFeedSecurityDirectory/.test(read(file)));
  assert.deepEqual(offenders, []);
  runWithMolisWorkHome("/tmp/pg097-home", () => assert.equal(resolveHomeSecurityDirectory(), path.join("/tmp/pg097-home", "feed")));
});

test("RAC-412: the same-origin plugin client route sends only bundles in the host build, never a directory entry", () => {
  const built = new Set(pluginWorkbenchPacks().map(pack => pack.project_plugin_id));
  for (const id of ["not-built-in", "installed-elsewhere", "..", "__proto__", "constructor", "toString"]) {
    assert.ok(!built.has(id));
    assert.equal(pluginWorkbenchClientAsset(id), null, `${id} is not served`);
  }
  const served = pluginWorkbenchPacks().filter(pack => pack.clientFactory).map(pack => pack.project_plugin_id);
  assert.ok(served.length > 0 && served.every(id => pluginWorkbenchClientAsset(id) !== null));
  const route = read("apps/local-host/src/web-assets.ts");
  assert.doesNotMatch(route, /readdir|plugins\/native|install(ed)?Dir|pluginDirectory/, "the route does not look the bundle up in a directory");
  assert.match(route, /pluginWorkbenchClientAsset\(plugin\[1\]!\)/, "it asks the host build, once, for the id in the address");
});
