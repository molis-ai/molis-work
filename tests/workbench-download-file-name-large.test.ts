// T-223 二审 (6528258710) split RAC-2163 out of tests/workbench-download-file-name.test.ts: in one process with the earlier cases its
// large inputs (two million characters, a hundred thousand) made Node 24.14.0 arm64 crash inside V8's Sparkplug about 6–25% of runs.
// The assertions are the same ones, unchanged; the shell mock is repeated here so this file stands alone (统筹答 6528513276 approved the
// split and asked for 100 runs of each file with no crash).
// RAC-2160–2163: the name a plugin page's download is saved under (apps/workbench/src/browser/plugin-frame/links.ts). Two roads end in
// one cut: a page hands the shell a file it named (`downloadPageBlob`), and a page link marked `download` is fetched under the page's
// authority and named by the response's Content-Disposition (`downloadFrameFile`). The name is at most 200 whole characters (a
// two-unit character such as an emoji is one), and a cut keeps the extension. The source runs bundled, on a small page port that
// records the `download` attribute of the link the shell clicks.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildSync } from "esbuild";

const LINKS = buildSync({ entryPoints: [fileURLToPath(new URL("../apps/workbench/src/browser/plugin-frame/links.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "Links", platform: "browser", target: "es2022" }).outputFiles[0]!.text;

type Scope = { signal: undefined; assertCurrent(): void; own(release: () => void): void };
type Links = { downloadPageBlob(blob: Blob, filename: string, scope: Scope): void; downloadFrameFile(url: URL, pageId: string, scope: Scope): Promise<void> };

/** The shell's page, as links.ts uses it: links that remember their `download` when clicked, and a response that says what the case gives. */
const shell = () => {
  const saved: string[] = [];
  let disposition: string | null = null;
  const request = Object.assign(async () => ({ ok: true, headers: { get: () => disposition }, blob: async () => new Blob(["x"]), json: async () => ({}) }), { text: String });
  const context = vm.createContext({ URL, Blob, location: { origin: "http://localhost" }, molisWorkRequest: request,
    document: { createElement: () => ({ download: "", href: "", hidden: false, click() { saved.push(this.download); }, remove() {} }), body: { append() {} } } });
  // Adds up the UTF-16 units of every string the page code spreads into characters.
  vm.runInContext("globalThis.spread = 0; { const iterate = String.prototype[Symbol.iterator]; String.prototype[Symbol.iterator] = function () { spread += this.length; return iterate.call(this); }; }", context);
  vm.runInContext(LINKS, context);
  const links = vm.runInContext("Links", context) as Links;
  const scope: Scope = { signal: undefined, assertCurrent() {}, own() {} };
  return {
    spread: () => vm.runInContext("spread", context) as number,
    /** The name a page's own `host.download(blob, name)` is saved under. */
    byPage(name: string): string { saved.length = 0; links.downloadPageBlob(new Blob(["x"]), name, scope); return saved[0]!; },
    /** The name a link marked `download` is saved under, when the response says `Content-Disposition: attachment; filename*=UTF-8''<name>` (none: no header). */
    async byLink(name: string | null): Promise<string> {
      saved.length = 0; disposition = name === null ? null : `attachment; filename*=UTF-8''${encodeURIComponent(name)}`;
      await links.downloadFrameFile(new URL("http://localhost/api/plugins/x/file"), "page-1", scope); return saved[0]!;
    },
  };
};


test("RAC-2163 a name of millions of characters is cut without spreading more than 400 units", async t => {
  await t.test("page", () => {
    const page = shell();
    assert.equal(page.byPage("字".repeat(2_000_000) + ".docx"), "字".repeat(195) + ".docx");
    assert.ok(page.spread() <= 400, `${page.spread()} units spread`);
  });
  await t.test("link", async () => {
    const page = shell();
    assert.equal(await page.byLink("字".repeat(100_000) + ".docx"), "字".repeat(195) + ".docx");
    assert.ok(page.spread() <= 400, `${page.spread()} units spread`);
  });
});
