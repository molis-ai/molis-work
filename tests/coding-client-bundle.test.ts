import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import * as coding from "@molis-ai/molis-work-plugin-coding";
import { CODING_MESSAGES, CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";

const DIR = "plugins/native/coding";
const SRC = join(DIR, "src");
const BROWSER = join(SRC, "browser");
const MAIN = join(BROWSER, "main");
const files = (dir: string) => readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(file => file.endsWith(".ts")).map(file => join(dir, file));
const messages = CODING_MESSAGES as Record<string, { zh: string; en: string }>;

test("RAC-543 every word the Coding page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => call.file.startsWith(BROWSER + "/"));
  assert.ok(calls.some(call => call.file.startsWith(MAIN + "/")), "the actual scanner sees the main page's words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  // The only dynamic choices are words the Manifest or the Host's own table carries as data (a method's name and summary, a session's state label).
  const dynamic = new Set(scan.dynamicCalls.filter(call => call.file.startsWith(BROWSER + "/")).map(call => call.file));
  assert.deepEqual([...dynamic].sort(), [join(MAIN, "methods.ts"), join(MAIN, "mount-core.ts"), join(MAIN, "run-facts.ts")], "no other dynamic key choice hides in the page");
  assert.deepEqual([...new Set(calls.map(call => call.key))].filter(key => !(key in messages)), [], "every key the page asks for is defined");
  for (const role of ["planner", "reader", "reviewer", "coordinator", "writers", "builder", "writer", "coding-reader", "coding-reviewer", "coding-builder"]) {
    assert.ok(messages[`coding.role.${role}`], `the role ${role} is named by a stable key`);
  }
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(messages)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
});

test("RAC-544 the Coding page asks the Host only in request.ts, names no plugin route and keeps no state outside its page object", () => {
  for (const file of files(BROWSER)) {
    const source = readFileSync(file, "utf8");
    if (!file.endsWith("/browser/types.ts")) assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /\/api\/plugins\/|io\.molis\.work\./u, `${file} writes a plugin route or id: the Host gives the route (host.pluginRoute)`);
    assert.doesNotMatch(source, /\.toString\(\)/u, `${file} copies a function into a script as text`);
    if (file.startsWith(MAIN + "/") && !file.endsWith("/main/request.ts")) assert.doesNotMatch(source, /molisWorkRequest/u, `${file} asks the Host itself: request.ts owns the requests`);
    if (file.startsWith(MAIN + "/")) assert.doesNotMatch(source, /^(let|var) /mu, `${file} keeps state in the module: the page object (main/page.ts) holds it`);
  }
  const request = readFileSync(join(MAIN, "request.ts"), "utf8");
  assert.match(request, /host\.pluginRoute\(path\)/u, "a request goes to the route the Host gives");
  assert.match(request, /molisWorkRequest/u);
  const workbench = readFileSync(join(BROWSER, "workbench.ts"), "utf8");
  for (const lent of ["pluginId", "pluginRoute", "confirm"]) assert.match(workbench, new RegExp(`const lent = \\{[^}]*\\b${lent}\\b`, "u"), `the workbench hands the page ${lent}`);
});

test("RAC-545 the build type-checks the whole Coding page and bundles it with esbuild", () => {
  const pkg = JSON.parse(readFileSync(join(DIR, "package.json"), "utf8")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/u, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/workbench-factory\.ts [^&]*'--banner:js=\(host\) => \{'[^&]*--outfile=dist\/workbench-bundle\.js/u, "and bundles the page as one function of the host");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/settings\/index\.ts [^&]*--outfile=dist\/settings-bundle\.js/u, "and the settings page as another");
  for (const part of ["steps", "taskboard", "plan-progress", "input-receipts"]) {
    assert.match(pkg.scripts.build, new RegExp(`esbuild src/browser/pieces/${part}\\.ts [^&]*--outfile=dist/${part}-bundle\\.js`, "u"), `and the ${part} part the package exports, so the page-program gate reads its source`);
  }
  assert.match(pkg.scripts.build, /node scripts\/build-test-pieces\.mjs$/u, "and the parts only the tests read");
  assert.match(pkg.scripts.typecheck, /tsc -p tsconfig\.browser\.json/u, "and so does the type check");
  const config = JSON.parse(readFileSync(join(DIR, "tsconfig.browser.json"), "utf8")) as { include: string[]; exclude: string[] };
  assert.deepEqual(config.include, ["src/browser/**/*.ts"]);
  assert.deepEqual(config.exclude.filter(path => path.startsWith("src/")), [], "no part of the page is left out of the type check");
  assert.equal(existsSync(join(DIR, "tsconfig.main.json")), false, "there is no second type-check for the main page");
});

test("RAC-546 the Coding page is one bundle, a function of the host that mounts nothing on a root that is not its page", () => {
  const script = CODING_WORKBENCH_CLIENT_FACTORY_SCRIPT;
  assert.doesNotThrow(() => new Function(`return ${script}`), "the bundle is a function expression");
  assert.match(script, /^\(host\) => \{/u, "it takes the host");
  assert.ok(script.includes("data-coding-workbench"), "and finds its own page by the page's mark");
  assert.doesNotMatch(script, /\/api\/plugins\/|io\.molis\.work\./u, "the bundle names no plugin route: the Host gives it");
  const factory = new Function(`return ${script}`)() as (host: unknown) => unknown;
  // The test has no DOM: a document that finds nothing is a page whose root is gone, and the bundle then mounts nothing.
  Object.assign(globalThis, { document: { querySelector: () => null } });
  try {
    assert.doesNotThrow(() => factory({ root: { matches: () => false }, clients: {}, translate: (key: string) => key, mountPluginClient: () => assert.fail("mounted without its root") }));
  } finally {
    Reflect.deleteProperty(globalThis, "document");
  }
});

test("RAC-547 the page no longer ships as template text: no client.ts, no per-part script exported, parts built alone only for the tests that mount them", () => {
  assert.equal(existsSync(join(SRC, "client.ts")), false, "the page's template is gone");
  assert.equal("CODING_CLIENT_FACTORY_SCRIPT" in coding, false, "and so is its export");
  const wrappers = readdirSync(SRC).filter(file => file.endsWith("-client.ts")).sort();
  assert.deepEqual(wrappers, ["code-paint-client.ts", "input-receipts-client.ts", "plan-progress-client.ts", "question-answered-client.ts", "settings-client.ts", "steps-client.ts", "taskboard-client.ts", "turn-changes-client.ts", "workbench-client.ts"], "what remains is the settings page, the three functions tests inject, and the four parts tests mount alone");
  const built = readdirSync(join(DIR, "dist")).filter(file => file.endsWith("-bundle.js")).sort();
  assert.ok(built.includes("workbench-bundle.js") && built.includes("settings-bundle.js"), "the page and the settings page are built");
  assert.equal(built.includes("draft-bundle.js"), false, "the draft is part of the page, not a bundle of its own");
  for (const file of built.filter(name => !["workbench-bundle.js", "settings-bundle.js"].includes(name))) {
    assert.match(readFileSync(join(DIR, "dist", file), "utf8"), /^\(ports\) => \{\s*(?:"use strict";)?var piece=[\s\S]*return piece\.create\(ports\)\}\s*$/u, `${file} is a part built alone, a factory of its ports`);
  }
});

test("RAC-548 the mount order is one list: the draft is made before the parts that save through it, and the reading starts last", () => {
  const mount = readFileSync(join(MAIN, "mount.ts"), "utf8");
  const order = [...mount.matchAll(/^  (mount\w+)\(page\);$/gmu)].map(match => match[1]);
  assert.deepEqual(order, ["mountFoundations", "mountComposerParts", "mountBoard", "mountWork", "mountSessionEvents", "mountControlEvents", "mountForms", "mountComposer", "mountPolling"]);
  const composer = readFileSync(join(MAIN, "mount-composer.ts"), "utf8");
  assert.ok(composer.indexOf("  mountDraft(page);") < composer.indexOf("  mountRoundParts(page);"), "the draft first");
});
