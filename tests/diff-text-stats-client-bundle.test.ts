import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { DIFF_CLIENT_FACTORY_SCRIPT, DIFF_MESSAGES } from "@molis-ai/molis-work-plugin-diff";
import { TEXT_STATS_CLIENT_FACTORY_SCRIPT, TEXT_STATS_MESSAGES } from "@molis-ai/molis-work-plugin-text-stats";

const PLUGINS = [
  { name: "diff", dir: "plugins/native/diff", script: DIFF_CLIENT_FACTORY_SCRIPT, messages: DIFF_MESSAGES as Record<string, { zh: string; en: string }>, bundle: "diff-client.js" },
  { name: "text-stats", dir: "plugins/native/text-stats", script: TEXT_STATS_CLIENT_FACTORY_SCRIPT, messages: TEXT_STATS_MESSAGES as Record<string, { zh: string; en: string }>, bundle: "text-stats-client.js" },
];
const browserFiles = (dir: string) => readdirSync(join(dir, "src/browser")).map(file => join(dir, "src/browser", file));

test("RAC-169 the Diff and Text Stats pages say every word by a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  for (const { name, dir, messages } of PLUGINS) {
    const calls = scan.calls.filter(call => call.file.startsWith(join(dir, "src/browser") + "/"));
    assert.ok(calls.length > 0, `${name}: the actual scanner sees the page's words`);
    assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], `${name}: no Chinese key`);
    assert.deepEqual(scan.dynamicCalls.filter(call => call.file.startsWith(join(dir, "src/browser") + "/")), [], `${name}: no dynamic key choice the scanner cannot list`);
    assert.deepEqual([...new Set(calls.map(call => call.key))].filter(key => !(key in messages)), [], `${name}: every key the page asks for is defined`);
    for (const [key, text] of Object.entries(messages)) assert.ok(text.zh && text.en, `${key} has Chinese and English`);
  }
});

test("RAC-169 the Diff and Text Stats clients are typed browser code bundled by esbuild, ask the Host only through the shared request and name no plugin route", () => {
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  for (const { name, dir, script, bundle } of PLUGINS) {
    for (const file of browserFiles(dir)) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
      assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
      assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
      assert.doesNotMatch(source, /\/api\/plugins\/|io\.molis\.work\./u, `${file} writes a plugin route or id: the Host gives the route (host.pluginRoute)`);
    }
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string> };
    assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, `${name}: the build type-checks the browser code`);
    assert.match(pkg.scripts.build, new RegExp(`esbuild src/browser/factory\\.ts --bundle.*--outfile=dist/${bundle.replace(".", "\\.")}`), `${name}: and bundles it`);
    assert.match(pkg.scripts.typecheck, /tsc -p tsconfig\.browser\.json/, `${name}: and so does the type check`);
    assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, `${name}: esbuild is the package's own dev dependency, at the root's version`);
    assert.doesNotThrow(() => new Function(`return ${script}`), `${name}: the bundle is a function expression`);
    assert.match(script, /^\(host\) => \{/u, `${name}: it takes the host`);
    assert.ok(script.includes("data-companion-refresh"), `${name}: the bundle carries the page's refresh control`);
    // Hand it a root that is not a companion page (the test has no DOM, so the page's `instanceof HTMLElement` needs a stand-in): it mounts nothing.
    const factory = new Function(`return ${script}`)() as (host: unknown) => unknown;
    Object.assign(globalThis, { HTMLElement: class {} });
    try {
      assert.doesNotThrow(() => factory({ root: {}, translate: (key: string) => key, mountPluginClient: () => assert.fail("mounted on a root that is not its page"), pluginRoute: (path: string) => path }), `${name}: a root that is not its page mounts nothing`);
    } finally {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    }
  }
});
