import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import * as dataset from "@molis-ai/molis-work-plugin-dataset";
import * as form from "@molis-ai/molis-work-plugin-form";
import * as lingguang from "@molis-ai/molis-work-plugin-lingguang";
import * as ppt from "@molis-ai/molis-work-plugin-ppt";
import * as todo from "@molis-ai/molis-work-plugin-todo";
import { openDatasetStore, openFormStore, openLingguangStore, openPptStore, openTodoStore } from "./fixtures/plugin-home-stores.js";
import { tmpdir } from "node:os";

// specs/repository-anti-corruption/slices/plugin-packages-drop-storage.md, PG-023: a plugin gets its library from the Runtime
// (`services.database`); it does not depend on the private storage package or open a file of the Home by path.

const PLUGINS = { todo, form, lingguang, dataset, ppt } as const;

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/u.test(name) ? [path] : [];
  });
}

test("RAC-700 Todo, Form, Lingguang, Dataset and PPT do not depend on, import or export a way to open a Home file by path", () => {
  for (const [name, module] of Object.entries(PLUGINS)) {
    const directory = join("plugins", "native", name);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    assert.equal("@molis-ai/molis-work-storage" in { ...manifest.dependencies, ...manifest.devDependencies }, false, `${name}: package.json`);
    for (const file of sources(join(directory, "src"))) assert.doesNotMatch(readFileSync(file, "utf8"), /molis-work-storage/u, file);
    assert.deepEqual(Object.keys(module).filter(key => /^open\w*Store$/u.test(key)), [], `${name}: exports`);
  }
});

test("RAC-701 the test fixture opens each plugin's library at its declared baseline, outside the plugin packages", t => {
  const home = mkdtempSync(join(tmpdir(), "plugin-home-stores-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  for (const open of [openTodoStore, openFormStore, openLingguangStore, openDatasetStore, openPptStore]) {
    const store = open(home);
    store.close();
  }
});
