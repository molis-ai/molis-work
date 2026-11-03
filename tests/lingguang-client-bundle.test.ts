import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { LINGGUANG_CLIENT_FACTORY_SCRIPT, LINGGUANG_MESSAGES, renderLingguangWorkbench } from "@molis-ai/molis-work-plugin-lingguang";

const SRC = "plugins/native/lingguang/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));

test("RAC-146 every word the 灵光 page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const owns = (file: string) => file === join(SRC, "ui.ts") || file.startsWith(BROWSER + "/");
  const calls = scan.calls.filter(call => owns(call.file));
  assert.ok(calls.some(call => call.file === join(SRC, "ui.ts")), "the actual scanner sees server-drawn words");
  assert.ok(calls.some(call => call.file.startsWith(BROWSER + "/")), "the actual scanner sees browser words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  assert.deepEqual(scan.dynamicCalls.filter(call => owns(call.file)), [], "all dynamic stable-key choices are enumerated by the real scanner");
  const used = new Set<string>(calls.map(call => call.key));
  assert.deepEqual([...used].filter(key => !(key in LINGGUANG_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(LINGGUANG_MESSAGES).filter(key => !used.has(key)), [], "every defined key is asked for");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(LINGGUANG_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  const html = renderLingguangWorkbench({ primitives: { escape: String, text: key => `«${key}»` } });
  assert.match(html, /<span>«lingguang\.action\.capture»<\/span>/u, "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

test("RAC-147 the 灵光 page's client is typed browser code bundled by esbuild, asks the Host only through the shared request helper and names no plugin", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /io\.molis\.work\.|\/api\/plugins\//u, `${file} writes a plugin id or the plugin route prefix`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  const pkg = JSON.parse(readFileSync("plugins/native/lingguang/package.json", "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/factory\.ts --bundle/, "and bundles it");
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.ok(root.devDependencies.esbuild, "the root declares esbuild");
  assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, "esbuild is the package's own dev dependency, at the root's version");
  assert.doesNotThrow(() => new Function(`return ${LINGGUANG_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(LINGGUANG_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "molis:placement-result", "molis:placement-convert", "molis-work:select-item", "panePlugin", "lingguang.revert", "lingguang.save.saved"]) {
    assert.ok(LINGGUANG_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(LINGGUANG_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|life\.fetch|io\.molis\.work\.lingguang/u, "requests go through molisWorkRequest and the plugin id comes from the host");
});
