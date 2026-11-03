import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { SCHEDULE_CLIENT_FACTORY_SCRIPT, SCHEDULE_MESSAGES, renderScheduleWorkbench } from "@molis-ai/molis-work-plugin-schedule";

const SRC = "plugins/native/schedule/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));
const OWN_WORDS = [join(SRC, "ui.ts"), join(SRC, "operation-ui.ts")];
const owns = (file: string) => OWN_WORDS.includes(file) || file.startsWith(BROWSER + "/");

test("RAC-162 every word the Schedule page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => owns(call.file));
  assert.ok(calls.some(call => call.file === join(SRC, "ui.ts")), "the actual scanner sees server-drawn words");
  assert.ok(calls.some(call => call.file === join(SRC, "operation-ui.ts")), "the actual scanner sees the operations' words");
  assert.ok(calls.some(call => call.file.startsWith(BROWSER + "/")), "the actual scanner sees browser words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  assert.deepEqual(scan.dynamicCalls.filter(call => owns(call.file)), [], "all dynamic stable-key choices are enumerated by the real scanner");
  // Words the Host wrote (a refusal, a reason) are shown as written: none reaches the translator from the browser code.
  const forwarding = browserFiles().flatMap(file => readFileSync(file, "utf8").split("\n").map((text, index) => ({ file, line: index + 1, text })))
    .filter(({ text }) => /\bL\((?!["'`])/u.test(text));
  assert.deepEqual(forwarding.map(({ file, text }) => `${file}: ${text.trim()}`), [], "no browser code hands a word it did not choose from the table to the translator");
  const used = new Set<string>(calls.map(call => call.key));
  assert.deepEqual([...used].filter(key => !(key in SCHEDULE_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(SCHEDULE_MESSAGES).filter(key => !used.has(key)), [], "every defined key is asked for");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(SCHEDULE_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  const html = renderScheduleWorkbench({ route_prefix: "/p", jobs: [], tasks: [], primitives: { escape: String, icon: name => name, formatDate: String, text: key => `«${key}»` } });
  assert.match(html, /«schedule\.action\.new»/u, "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

test("RAC-163 the Schedule page's client is typed browser code bundled by esbuild, asks the Host only through the shared request helper and names no plugin", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /io\.molis\.work\.|\/api\/plugins\/|molisWorkControlHeaders/u, `${file} writes a plugin id or the plugin route prefix`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  const pkg = JSON.parse(readFileSync("plugins/native/schedule/package.json", "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string>; dependencies: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/factory\.ts --bundle/, "and bundles it");
  assert.match(pkg.scripts.typecheck, /tsc -p tsconfig\.browser\.json/, "and so does the type check");
  assert.ok(pkg.dependencies["@molis-ai/molis-work-plugin-sdk"], "the SDK types `molisWorkRequest`, so the package declares it");
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, "esbuild is the package's own dev dependency, at the root's version");
  assert.doesNotThrow(() => new Function(`return ${SCHEDULE_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(SCHEDULE_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "data-schedule-operation-decision", "mw-schedule-open", "molis-work:model-ready", "schedule.error.restore-operation"]) {
    assert.ok(SCHEDULE_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(SCHEDULE_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|io\.molis\.work\./u, "requests go through molisWorkRequest and the plugin id comes from the host");
});
