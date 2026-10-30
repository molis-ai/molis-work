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

const E = "😀"; // U+1F600: two UTF-16 units, one character
/** Every case goes down both roads, and both must save the same name. */
const both = async (t: TestContext, cases: Array<[string, string, string]>) => {
  const page = shell();
  for (const [name, given, saved] of cases) {
    await t.test(`page: ${name}`, () => assert.equal(page.byPage(given), saved));
    await t.test(`link: ${name}`, async () => assert.equal(await page.byLink(given), saved));
  }
};

test("RAC-2160 a name over 200 characters is cut between characters, never inside a two-unit one", async t => {
  await both(t, [
    ["the 200th character is a two-unit one", "a".repeat(199) + E + "尾".repeat(10), "a".repeat(199) + E],
    ["only two-unit characters", E.repeat(250), E.repeat(200)],
    ["one character over, no two-unit character", "尾".repeat(201), "尾".repeat(200)],
  ]);
});

test("RAC-2161 a cut keeps the extension: a dot and up to ten letters or digits at the end", async t => {
  await both(t, [
    ["a long name", "a".repeat(230) + ".pdf", "a".repeat(196) + ".pdf"],
    ["a long name of two-unit characters", E.repeat(250) + ".md", E.repeat(197) + ".md"],
    ["the cut falls on a two-unit character", "b".repeat(194) + E + "尾".repeat(30) + ".html", "b".repeat(194) + E + ".html"],
    ["only the last part of .tar.gz", "c".repeat(250) + ".tar.gz", "c".repeat(197) + ".gz"],
    ["an extension of ten letters", "d".repeat(250) + ".abcdefghij", "d".repeat(189) + ".abcdefghij"],
    ["a part of eleven letters is no extension", "d".repeat(250) + ".abcdefghijk", "d".repeat(200)],
    ["a part that is not letters and digits is no extension", "e".repeat(250) + ".中文", "e".repeat(200)],
  ]);
});

test("RAC-2162 the limit is 200 characters, not 200 UTF-16 units: a name that fits is saved as it is", async t => {
  const fits: Array<[string, string]> = [
    ["a short name", "季度回顾.pptx"],
    ["exactly 200 plain characters", "g".repeat(195) + ".html"],
    ["200 two-unit characters, 400 units", E.repeat(200)],
    ["150 two-unit characters and an extension, 303 units", E.repeat(150) + ".md"],
    ["a Jelly export of a 100-character title of two-unit characters, 205 units", E.repeat(100) + ".html"],
    ["a Form file name of an 80-character title of two-unit characters, 171 units", E.repeat(80) + " · 填写页.html"],
  ];
  await both(t, fits.map(([name, given]) => [name, given, given]));
  await t.test("link: no Content-Disposition, the name is download", async () => assert.equal(await shell().byLink(null), "download"));
});

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
