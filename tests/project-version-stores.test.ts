import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { projectVersionStores } from "@molis-ai/molis-work-module-artifacts";
import { LocalProjectDatabase, openProjectVersionStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";

const root = join(import.meta.dirname, "..");

function productSources(directory: string, found: string[] = []): string[] {
  for (const name of readdirSync(directory)) {
    if (name === "node_modules" || name === "dist" || name === "tests" || name === ".git") continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) productSources(path, found);
    else if (/\.(ts|tsx|mts)$/u.test(name)) found.push(path);
  }
  return found;
}

test("RAC-410: a project library has one pair of version stores, however many callers ask", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-version-stores-"));
  const first = join(directory, "first.db"), second = join(directory, "second.db");
  seedDemoBoard(first); seedDemoBoard(second);
  const a = new LocalProjectDatabase(first), b = new LocalProjectDatabase(second);
  try {
    const ports = { homeOwner: "person", appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => a.appendEvent(event), eventCursor: (id: string) => a.eventCursor(id) };
    const pair = projectVersionStores({ db: a.db, ...ports });
    assert.equal(projectVersionStores({ db: a.db, ...ports }), pair, "the same library gives the same pair");
    assert.notEqual(projectVersionStores({ db: b.db, ...ports }), pair, "another library has its own pair");
    const opened = openProjectVersionStores(a);
    assert.equal(openProjectVersionStores(a).artifacts.query, opened.artifacts.query, "the Host opens the same stores again and again");
    assert.equal(opened.artifacts.query, pair.artifacts.query, "the Host's pair is the library's pair");
    assert.equal(opened.processItems.query, pair.processItems.query);
  } finally { a.close(); b.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("RAC-410: product source constructs the version stores in one place only", () => {
  const owners = new Set(["modules/artifacts/src/index.ts"]);
  const constructions: string[] = [];
  for (const top of ["apps", "packages", "modules", "plugins", "server", "horizontal"]) {
    for (const file of productSources(join(root, top))) {
      const path = relative(root, file);
      if (owners.has(path)) continue;
      if (/new (?:ArtifactsModule|ProcessItemsModule)\(/u.test(readFileSync(file, "utf8"))) constructions.push(path);
    }
  }
  assert.deepEqual(constructions, []);
});
