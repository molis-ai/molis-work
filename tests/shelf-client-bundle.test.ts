import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { HOTKEY_OCCUPIED, HOTKEY_RECORDING } from "@molis-ai/molis-work-module-shelf";
import {
  SHELF_CLIENT_FACTORY_SCRIPT,
  SHELF_MESSAGES,
  SHELF_SETTINGS_CLIENT_SCRIPT,
  renderShelfWorkbench,
} from "@molis-ai/molis-work-plugin-shelf";

const SRC = "plugins/native/shelf/src";
const BROWSER = join(SRC, "browser");
const sourcesIn = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? sourcesIn(path) : [path];
});
const browserFiles = sourcesIn(BROWSER);
const SERVER_DRAWN = join(SRC, "ui.ts");
const owns = (file: string) => file === SERVER_DRAWN || file.startsWith(BROWSER + "/");

test("RAC-164 every word the Shelf page's client and drawn list say has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => owns(call.file));
  assert.ok(calls.some(call => call.file === SERVER_DRAWN), "the actual scanner sees the server-drawn words");
  assert.ok(calls.some(call => call.file.startsWith(join(BROWSER, "settings") + "/")), "the actual scanner sees the settings page's words");
  assert.ok(calls.some(call => call.file === join(BROWSER, "bar.ts")), "the actual scanner sees the browser words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  assert.deepEqual(scan.dynamicCalls.filter(call => owns(call.file)), [], "all dynamic stable-key choices are enumerated by the real scanner");
  // Words the Host or a route wrote (a recipe's name, a reason) are shown as written: they reach the translator at one place, `said`.
  const forwarding = browserFiles.flatMap(file => readFileSync(file, "utf8").split("\n").map((text, index) => ({ file, line: index + 1, text })))
    .filter(({ text }) => /\bL\((?!["'`])/u.test(text));
  assert.deepEqual(forwarding.map(({ file, text }) => `${file}: ${text.trim()}`), [`${join(BROWSER, "dom.ts")}: export const said = (L: Translate, text: string): string => L(text);`],
    "no browser code hands a word it did not choose from the table to the translator, except `said`");
  const used = new Set<string>(calls.map(call => call.key));
  assert.deepEqual([...used].filter(key => !(key in SHELF_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(SHELF_MESSAGES).filter(key => !used.has(key)), [], "every defined key is asked for");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(SHELF_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.match(key, /^shelf\.[a-z0-9-]+\.[a-z0-9-]+$/u, `${key} is a stable key`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  // The chord words the module's own errors and the settings page's drawn page speak are the ones the bundle shows.
  assert.equal(SHELF_MESSAGES["shelf.settings.hotkey-occupied"].zh, HOTKEY_OCCUPIED);
  assert.equal(SHELF_MESSAGES["shelf.settings.hotkey-recording"].zh, HOTKEY_RECORDING);
  const html = renderShelfWorkbench({ materials: [], results: [], clipboard: [], selected_id: null, primitives: { escape: String, text: key => `«${key}»` } });
  assert.match(html, /«shelf\.ui\.[a-z0-9-]+»/u, "the server-drawn list speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the list directly");
});

test("RAC-1320 the Shelf package no longer declares the xterm packages it does not import", () => {
  const manifest = JSON.parse(readFileSync("plugins/native/shelf/package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    "molis-work"?: { extraDependencies?: Record<string, string> };
  };
  const xterm = (names: readonly string[] | undefined) => Object.keys(names ?? {}).filter(name => name.startsWith("@xterm/"));
  assert.deepEqual(xterm(Object.keys(manifest.dependencies ?? {})), []);
  assert.deepEqual(xterm(Object.keys(manifest["molis-work"]?.extraDependencies ?? {})), []);
  assert.throws(() => statSync(join(SRC, "xterm-css.d.ts")), /ENOENT/);
});

test("RAC-165 the Shelf page's client is typed browser code bundled by esbuild, asks the Host only through the shared request helper and names no plugin", () => {
  for (const file of browserFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /io\.molis\.work\.|molisWorkControlHeaders/u, `${file} writes a plugin id or builds the control headers`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  const pkg = JSON.parse(readFileSync("plugins/native/shelf/package.json", "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/factory\.ts --bundle/, "and bundles the page's client");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/settings\/factory\.ts --bundle/, "and the settings page's");
  assert.match(pkg.scripts.typecheck, /tsc -p tsconfig\.browser\.json/, "and so does the type check");
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, "esbuild is the package's own dev dependency, at the root's version");
  assert.doesNotThrow(() => new Function(`return ${SHELF_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(SHELF_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "application/x-molis-shelf", "data-shelf-act-rule", "molis-shelf-refresh", "molis-shelf-send-tui", "molis:placement-request", "shelf.request.shelf-request-failed"]) {
    assert.ok(SHELF_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(SHELF_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|io\.molis\.work\./u, "requests go through molisWorkRequest and the plugin id comes from the host");
});

test("RAC-166 the Shelf settings page's client is bundled the same way, with the chord tables and the route put in front of it", () => {
  assert.doesNotThrow(() => new Function(SHELF_SETTINGS_CLIENT_SCRIPT), "the settings client is a script");
  assert.match(SHELF_SETTINGS_CLIENT_SCRIPT, /^\(\(\) => \{\nconst SHELF_HOTKEY_TABLES = \{"codes":\{/u);
  assert.match(SHELF_SETTINGS_CLIENT_SCRIPT, /const SHELF_SETTINGS_API = "\/api\/plugins\/io\.molis\.work\.shelf";/u);
  assert.match(SHELF_SETTINGS_CLIENT_SCRIPT, /shelf_apply_hotkeys/u);
  assert.match(SHELF_SETTINGS_CLIENT_SCRIPT, /shelf\.settings\.hotkey-recording/u);
  assert.doesNotMatch(SHELF_SETTINGS_CLIENT_SCRIPT, /molisWorkControlHeaders|data-shelf-settings-tab/u, "requests go through molisWorkRequest");
  const tables = /const SHELF_HOTKEY_TABLES = (\{.*\});/u.exec(SHELF_SETTINGS_CLIENT_SCRIPT)?.[1];
  assert.ok(tables, "the tables are put in front as JSON");
  const parsed = JSON.parse(tables) as { codes: Record<string, number>; defaults: Record<string, { key_code: number; carbon_modifiers: number }>; control: number; cmd: number };
  assert.equal(parsed.codes.KeyD, 2, "the tables are the module's own");
  assert.deepEqual(Object.keys(parsed.defaults).sort(), ["capture", "files", "toggle"]);
  assert.ok(parsed.control > 0 && parsed.cmd > 0);
});
