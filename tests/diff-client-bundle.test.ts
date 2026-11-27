import { assertPageWords } from "./fixtures/page-text.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { DIFF_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-diff";

const PLUGINS = [
  { name: "diff", dir: "plugins/native/diff", script: DIFF_CLIENT_FACTORY_SCRIPT, bundle: "diff-client.js" },
];
const browserFiles = (dir: string) => readdirSync(join(dir, "src/browser")).map(file => join(dir, "src/browser", file));

test("RAC-169 the Diff page says every word by a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  for (const { name, dir } of PLUGINS) {
    const calls = scan.calls.filter(call => call.file.startsWith(join(dir, "src/browser") + "/"));
    assert.ok(calls.length > 0, `${name}: the actual scanner sees the page's words`);
    assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], `${name}: no Chinese key`);
    assert.deepEqual(scan.dynamicCalls.filter(call => call.file.startsWith(join(dir, "src/browser") + "/")), [], `${name}: no dynamic key choice the scanner cannot list`);
    assertPageWords(name, calls.map(call => call.key));
  }
});

test("RAC-169 the Diff client is typed browser code bundled by esbuild, asks the Host only through the shared request and names no plugin route", () => {
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

test("F-plugins-rest-w2-10: Diff client resets stale change_index to 0 when a newer turn shrinks to a single file", async () => {
  class StubElement {
    disabled = false;
    hidden = false;
    textContent = "";
    innerHTML = "";
    dataset: Record<string, string> = {};
    private readonly attrs = new Map<string, string>();
    constructor(private readonly selector?: string, private readonly children: Record<string, StubElement> = {}) {}
    matches(query: string) { return query === this.selector; }
    querySelector(query: string) { return this.children[query] ?? null; }
    querySelectorAll() { return []; }
    setAttribute(name: string, value: string) { this.attrs.set(name, value); }
    replaceChildren() { this.innerHTML = ""; }
    append() {}
    closest(query: string) { return query === this.selector ? this : null; }
  }
  const spin = new StubElement(".mw-spinner");
  const reload = new StubElement("[data-companion-refresh]", { ".mw-spinner": spin });
  const body = new StubElement("[data-companion-content]");
  const note = new StubElement("[data-companion-status]");
  const root = new StubElement("[data-companion]", {
    "[data-companion-refresh]": reload, "[data-companion-content]": body, "[data-companion-status]": note,
  });
  const listeners = new Map<string, (event: unknown) => void>();
  const requested: string[] = [];
  let singleFile = false;
  const savedGlobals = {
    HTMLElement: globalThis.HTMLElement,
    document: globalThis.document,
    t: (globalThis as Record<string, unknown>).t,
    molisWorkRequest: (globalThis as Record<string, unknown>).molisWorkRequest,
  };
  Object.assign(globalThis, {
    HTMLElement: StubElement,
    document: { createTextNode: (v: string) => v },
    t: { text: (key: string) => key },
    molisWorkRequest: Object.assign(async (url: string) => {
      requested.push(url);
      if (singleFile && url.endsWith("change_index=1")) {
        return { view: { phase: "unavailable", group: "change-set", files: [{ path: "only.ts" }] }, html: "<div>unavailable</div>" };
      }
      return { view: { phase: "ready", group: "change-set", files: singleFile ? [{ path: "only.ts" }] : [{ path: "a.ts" }, { path: "b.ts" }] },
        html: singleFile ? "<div>only.ts diff</div>" : `<div>${url}</div>` };
    }, { show() {} }),
  });
  try {
    const factory = new Function(`return ${DIFF_CLIENT_FACTORY_SCRIPT}`)() as (host: unknown) => unknown;
    factory({
      root,
      pluginRoute: (path: string) => path,
      mountPluginClient: () => ({
        alive: true, visible: true,
        listen: (target: unknown, name: string, cb: (event: unknown) => void) => { if (target === root) listeners.set(name, cb); },
        whenVisible: (start: (signal: AbortSignal) => void) => { start(new AbortController().signal); return () => {}; },
        assertCurrent() {},
      }),
    });
    await new Promise(resolve => setImmediate(resolve));
    const fileBtn = new StubElement('[data-action="diff.show-file"]');
    fileBtn.dataset.changeIndex = "1";
    listeners.get("click")?.({ target: fileBtn });
    await new Promise(resolve => setImmediate(resolve));
    singleFile = true;
    listeners.get("click")?.({ target: reload });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requested, ["/state?change_index=0", "/state?change_index=1", "/state?change_index=1", "/state?change_index=0"]);
    assert.equal(body.innerHTML, "<div>only.ts diff</div>");
  } finally {
    for (const [key, value] of Object.entries(savedGlobals)) {
      if (value === undefined) Reflect.deleteProperty(globalThis, key);
      else Object.assign(globalThis, { [key]: value });
    }
  }
});
