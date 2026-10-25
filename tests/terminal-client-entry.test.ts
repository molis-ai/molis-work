// W5-02 (PG-053): the platform's terminal program (`dist/web/pty-client.js`) is the renderer and the platform's own terminals. It does
// not import a plugin package; Shelf's terminal well is Shelf's own browser code, and Shelf does not ask for the platform's script
// to be preloaded into its frame. The terminal that stays with Goals is named in slices/pg053-terminal-clients.md §3.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildSync } from "esbuild";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

const root = new URL("../", import.meta.url);
const at = (path: string) => fileURLToPath(new URL(path, root));
const bundle = (entry: string) => buildSync({ entryPoints: [at(entry)], bundle: true, write: false, metafile: true, format: "iife", platform: "browser",
  target: "es2022", loader: { ".css": "text" }, logLevel: "silent" });

test("RAC-715 the platform's terminal entry takes in no plugin package, and Shelf no longer exports a terminal client", () => {
  const { metafile } = bundle("apps/workbench/src/terminal-client.ts");
  const taken = Object.keys(metafile.inputs).filter(path => /(^|\/)plugins\/native\/|molis-work-plugin-/u.test(path));
  assert.deepEqual(taken, [], "a plugin's client code is the plugin's own bundle");
  const shelf = JSON.parse(readFileSync(at("plugins/native/shelf/package.json"), "utf8")) as { exports: Record<string, unknown> };
  assert.equal("./terminal-client" in shelf.exports, false);
  assert.equal(existsSync(at("plugins/native/shelf/src/terminal-client.ts")), false);
});

test("RAC-716 Shelf's terminal well starts from Shelf's own bundle, which does not ask for the platform script to be preloaded", () => {
  const shelf = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "shelf");
  assert.ok(shelf?.workbench);
  assert.ok(!(shelf.workbench.clientAssets ?? []).includes("/desktop/pty-client.js"), "the platform loads its renderer when the well first mounts");
  const own = bundle("plugins/native/shelf/src/browser/factory.ts").outputFiles[0]!.text;
  assert.match(own, /data-shelf-tty-screen/);
  assert.match(own, /molisWorkShelfTui\s*=/);
  assert.doesNotMatch(bundle("apps/workbench/src/terminal-client.ts").outputFiles[0]!.text, /data-shelf-tty-screen|molisWorkShelfTui/);
});
