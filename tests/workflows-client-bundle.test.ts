import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { renderWorkflowsWorkbench, WORKFLOWS_CLIENT_FACTORY_SCRIPT, WORKFLOWS_MESSAGES } from "@molis-ai/molis-work-plugin-workflows";

const SRC = "plugins/native/workflows/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));

test("RAC-156 every word the Workflows page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const owns = (file: string) => file === join(SRC, "ui.ts") || file.startsWith(BROWSER + "/");
  const calls = scan.calls.filter(call => owns(call.file));
  assert.ok(calls.some(call => call.file === join(SRC, "ui.ts")), "the actual scanner sees server-drawn words");
  assert.ok(calls.some(call => call.file.startsWith(BROWSER + "/")), "the actual scanner sees browser words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  assert.deepEqual(scan.dynamicCalls.filter(call => owns(call.file)), [], "all dynamic stable-key choices are enumerated by the real scanner");
  // The words that are not chosen from the table are data: a plugin's name, a reason or a result the Host or an action wrote.
  // They reach the translator in one place, so a new site that forwards something else cannot hide among them.
  const forwarding = browserFiles().flatMap(file => readFileSync(file, "utf8").split("\n").map((text, index) => ({ file, line: index + 1, text })))
    .filter(({ text }) => /\bL\((?!["'`])/u.test(text));
  assert.deepEqual(forwarding.map(({ file, text }) => `${file}: ${text.trim()}`), [`${join(BROWSER, "dom.ts")}: export const said = (L: Translate, text: string) => L(text);`], "one place hands words the Host wrote to the translator");
  const used = new Set<string>(calls.map(call => call.key));
  assert.deepEqual([...used].filter(key => !(key in WORKFLOWS_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(WORKFLOWS_MESSAGES).filter(key => !used.has(key) && !named(key)), [], "every defined key is asked for or named as a reason");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(WORKFLOWS_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  const html = renderWorkflowsWorkbench({ primitives: { escape: String, text: key => `«${key}»` } });
  assert.match(html, /«workflows\.ui\.new-flow»/u, "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

// A key the code carries as a reason (or a label) and a later `said(...)` translates: it is named as a literal, not called.
function named(key: string): boolean {
  return browserFiles().some(file => readFileSync(file, "utf8").includes(`"${key}"`));
}

test("RAC-157 the Workflows page's client is typed browser code bundled by esbuild, asks the Host only through the shared request helper and names no plugin", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /io\.molis\.work\.|\/api\/plugins\//u, `${file} writes a plugin id or the plugin route prefix`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  const pkg = JSON.parse(readFileSync("plugins/native/workflows/package.json", "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/factory\.ts --bundle/, "and bundles it");
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.ok(root.devDependencies.esbuild, "the root declares esbuild");
  assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, "esbuild is the package's own dev dependency, at the root's version");
  assert.doesNotThrow(() => new Function(`return ${WORKFLOWS_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(WORKFLOWS_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "molis-work:model-ready", "molis-work:select-item", "molis-work:item-unreadable", "workflows.save.failed", "data-wf-chain"]) {
    assert.ok(WORKFLOWS_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(WORKFLOWS_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|io\.molis\.work\.native/u, "requests go through molisWorkRequest and the plugin id comes from the host");
});
