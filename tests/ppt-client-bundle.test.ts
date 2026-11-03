import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { PPT_CLIENT_FACTORY_SCRIPT, PPT_MESSAGES, renderPptWorkbench } from "@molis-ai/molis-work-plugin-ppt";

const SRC = "plugins/native/ppt/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));

test("RAC-152 every word the PPT page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const owns = (file: string) => file === join(SRC, "ui.ts") || file.startsWith(BROWSER + "/");
  const calls = scan.calls.filter(call => owns(call.file));
  assert.ok(calls.some(call => call.file === join(SRC, "ui.ts")), "the actual scanner sees server-drawn words");
  assert.ok(calls.some(call => call.file.startsWith(BROWSER + "/")), "the actual scanner sees browser words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  // The only words not chosen from the table are the sentences the server itself wrote for "the model is not available" and
  // "Pages cannot be read": the common translator knows them by their Chinese original (src/en.ts, BL-461).
  const dynamic = scan.dynamicCalls.filter(call => owns(call.file));
  const lines = (file: string) => readFileSync(file, "utf8").split("\n");
  assert.deepEqual(dynamic.map(call => `${call.file}`), [join(BROWSER, "outline.ts"), join(BROWSER, "outline.ts")], "only the outline dialog forwards server sentences");
  for (const call of dynamic) assert.match(lines(call.file)[call.line - 1]!, /aiUnavailableReason|unavailable_reason/u, `${call.file}:${call.line} forwards a server reason`);
  const used = new Set<string>(calls.map(call => call.key));
  assert.deepEqual([...used].filter(key => !(key in PPT_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(PPT_MESSAGES).filter(key => !used.has(key)), [], "every defined key is asked for");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(PPT_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  const html = renderPptWorkbench({ primitives: { escape: String, text: key => `«${key}»` } });
  assert.match(html, /<span>«ppt\.action\.new»<\/span>/u, "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

test("RAC-153 the PPT page's client is typed browser code bundled by esbuild, asks the Host only through the shared request helper and names no plugin", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /io\.molis\.work\.|\/api\/plugins\//u, `${file} writes a plugin id or the plugin route prefix`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  const pkg = JSON.parse(readFileSync("plugins/native/ppt/package.json", "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/factory\.ts --bundle/, "and bundles it");
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.ok(root.devDependencies.esbuild, "the root declares esbuild");
  assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, "esbuild is the package's own dev dependency, at the root's version");
  assert.doesNotThrow(() => new Function(`return ${PPT_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(PPT_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "molis:placement-result", "molis:placement-changed", "molis-work:model-ready", "ppt.save.saved", "ppt.conflict"]) {
    assert.ok(PPT_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(PPT_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|io\.molis\.work\.ppt/u, "requests go through molisWorkRequest and the plugin id comes from the host");
});
