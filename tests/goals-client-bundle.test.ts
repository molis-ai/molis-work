import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { registration as goalsRegistration } from "@molis-ai/molis-work-plugin-goals/registration";

const DIR = "plugins/native/goals";
const BROWSER = join(DIR, "src/browser");
const browserFiles = () => readdirSync(BROWSER).filter(file => file.endsWith(".ts")).map(file => join(BROWSER, file));

test("PCL-09 the Goals page client is typed browser code bundled by esbuild, asks the Host only through the shared request helper and writes no plugin id", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /(^|[^.\w])fetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /["'`]io\.molis\.work\.|["'`]\/api\/plugins\/|molisWorkControlHeaders|console\./u, `${file} writes a plugin id, the plugin route prefix or a console call`);
  }
  const pkg = JSON.parse(readFileSync(join(DIR, "package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/u, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/page\.ts --bundle/u, "and bundles the page client");
  assert.match(pkg.scripts.build, /node scripts\/build-test-pieces\.mjs/u, "and the parts only the tests read");
  assert.match(pkg.scripts.typecheck, /tsc -p tsconfig\.browser\.json/u, "and so does the type check");
  // The shell receives one function expression; it is the bundle, not text written in a template string.
  const client = goalsRegistration.workbench?.pageClient ?? "";
  assert.equal(client, readFileSync(join(DIR, "dist/goals-page-client.js"), "utf8").trim(), "the registration hands over the built bundle");
  assert.match(client, /^\(host\) => \{/u);
  assert.doesNotThrow(() => new Function(`return ${client}`), "the bundle is a function expression");
  for (const mark of ["molis-work-frame-container:", "molis-work-decision-receipt", "data-assistant-context", "goals.page-client.new-goal", "/api/board/refresh?view="]) {
    assert.ok(client.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(client, /molisWorkControlHeaders/u, "requests go through molisWorkRequest");
  const built = readdirSync(join(DIR, "dist")).filter(file => file.endsWith("-bundle.js")).sort();
  assert.deepEqual(built, ["dialogs-bundle.js", "document-bundle.js", "event-document-bundle.js", "lifecycle-bundle.js", "momentum-bundle.js", "proposal-bundle.js", "relation-bundle.js"], "the parts tests mount alone are built");
});

test("PCL-09 every word the Goals page client says is a stable key the translation scanner sees", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => call.file.startsWith(BROWSER + "/"));
  assert.ok(calls.length > 100, "the actual scanner sees the browser words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key");
  // The one family built at run time is the relation kind's words, keyed by relationWordKey as the server draws them.
  const dynamic = scan.dynamicCalls.filter(call => call.file.startsWith(BROWSER + "/"));
  const lines = (file: string) => readFileSync(file, "utf8").split("\n");
  assert.deepEqual(dynamic.filter(call => !lines(call.file)[call.line - 1]?.includes("t.text(relationWordKey(")), [], "no other stable key is chosen at run time");
});
