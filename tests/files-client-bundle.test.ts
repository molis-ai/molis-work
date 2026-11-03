import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { FILES_CLIENT_FACTORY_SCRIPT, FILES_MESSAGES, renderFilesBrowserDirectory, renderFilesBrowserResult } from "@molis-ai/molis-work-plugin-files";

const SRC = "plugins/native/files/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));

test("RAC-160 every word the Files page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const owns = (file: string) => file.startsWith(BROWSER + "/");
  const calls = scan.calls.filter(call => owns(call.file));
  assert.ok(calls.some(call => call.file.startsWith(BROWSER + "/")), "the actual scanner sees browser words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  assert.deepEqual(scan.dynamicCalls.filter(call => owns(call.file)), [], "all dynamic stable-key choices are enumerated by the real scanner");
  // The words that are not chosen from the table are data: a refusal or a reason the Host or an action wrote. They reach the
  // translator in one place, so a new site that forwards something else cannot hide among them.
  const forwarding = browserFiles().flatMap(file => readFileSync(file, "utf8").split("\n").map((text, index) => ({ file, line: index + 1, text })))
    .filter(({ text }) => /\bL\((?!["'`])/u.test(text));
  assert.deepEqual(forwarding.map(({ file, text }) => `${file}: ${text.trim()}`), [`${join(BROWSER, "dom.ts")}: export const said = (L: Translate, text: string) => L(text);`], "one place hands words the Host wrote to the translator");
  const used = new Set<string>(calls.map(call => call.key));
  assert.deepEqual([...used].filter(key => !(key in FILES_MESSAGES)), [], "every key the page asks for is defined");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(FILES_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  // The server-drawn halves speak through the translator too, with keys the table defines.
  const drawn = renderFilesBrowserDirectory(key => `«${key}»`) + renderFilesBrowserResult(key => `«${key}»`);
  assert.deepEqual([...drawn.matchAll(/«([^»]+)»/gu)].map(match => match[1]).filter(key => !(key in FILES_MESSAGES)), [], "every key the drawn page asks for is defined");
  assert.doesNotMatch(drawn, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

test("RAC-161 the Files page's client is typed browser code bundled by esbuild, asks the Host only in request.ts and names no plugin route", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /\/api\/plugins\/|io\.molis\.work\./u, `${file} writes a plugin route or id: the Host gives the route (host.pluginRoute)`);
    if (!file.endsWith("/request.ts")) assert.doesNotMatch(source, /molisWorkRequest/u, `${file} asks the Host itself: request.ts owns the requests`);
  }
  const pkg = JSON.parse(readFileSync("plugins/native/files/package.json", "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/factory\.ts --bundle/, "and bundles it");
  assert.match(pkg.scripts.typecheck, /tsc -p tsconfig\.browser\.json/, "and so does the type check");
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, "esbuild is the package's own dev dependency, at the root's version");
  assert.doesNotThrow(() => new Function(`return ${FILES_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(FILES_CLIENT_FACTORY_SCRIPT, /^\(host\) => \(\(host, icons, browser\) => \{/u, "it takes the host, is given the icons and hands back what it mounted");
  assert.match(FILES_CLIENT_FACTORY_SCRIPT, /return browser\}\)\(host, \{"folder":/u);
  for (const mark of ["data-assistant-context", "molis-work:select-item", "/view-revision", "files.reader.too-large", "data-files-capture"]) {
    assert.ok(FILES_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  // Hand it a root without Files' elements, as a page that gives its ports would: it mounts nothing and hands back nothing.
  const factory = new Function(`return ${FILES_CLIENT_FACTORY_SCRIPT}`)() as (host: unknown) => unknown;
  assert.equal(factory({ root: { querySelector: () => null }, translate: (key: string) => key, openResult() {}, closeResult() {}, route: (path: string) => path, pluginRoute: (path: string) => path }), null);
});
