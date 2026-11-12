import { assertPageWords, pageText, withPageText } from "./fixtures/page-text.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { PAGES_CLIENT_FACTORY_SCRIPT, PAGES_TEMPLATES, renderPagesWorkbench } from "@molis-ai/molis-work-plugin-pages";

const SRC = "plugins/native/pages/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));
// What the page itself says (RAC-158): its drawn shell, the comments panel and the landing, and the browser code. The editor's own
// labels (`editor-*.ts`, `commands-*.ts`) are looked up by their Chinese text for now (BACKLOG BL-464).
const OWN_WORDS = [join(SRC, "ui.ts"), join(SRC, "comment-side-view.ts"), join(SRC, "comment-side-client.ts"), join(SRC, "comment-editor-client.ts"), join(SRC, "landing-editor.ts")];
const owns = (file: string) => OWN_WORDS.includes(file) || file.startsWith(BROWSER + "/");

test("RAC-158 every word the Pages page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => owns(call.file));
  assert.ok(calls.some(call => call.file === join(SRC, "ui.ts")), "the actual scanner sees server-drawn words");
  assert.ok(calls.some(call => call.file === join(SRC, "comment-side-client.ts")), "the actual scanner sees the comments panel's words");
  assert.ok(calls.some(call => call.file.startsWith(BROWSER + "/")), "the actual scanner sees browser words");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  assert.deepEqual(scan.dynamicCalls.filter(call => owns(call.file)), [], "all dynamic stable-key choices are enumerated by the real scanner");
  // The words that are not chosen from the table are data: a document's title, a reason or a result the Host or an action wrote.
  // The Host already writes them in the person's language: they are shown as written and never reach the translator.
  const forwarding = browserFiles().flatMap(file => readFileSync(file, "utf8").split("\n").map((text, index) => ({ file, line: index + 1, text })))
    .filter(({ text }) => /\bL\((?!["'`])/u.test(text));
  assert.deepEqual(forwarding.map(({ file, text }) => `${file}: ${text.trim()}`), [], "no browser code hands a word it did not choose from the table to the translator");
  const used = new Set<string>(calls.map(call => call.key));
  assertPageWords("pages", used);
  for (const template of PAGES_TEMPLATES) {
    assertPageWords("pages", [`pages.template.${template.id}.title`, `pages.template.${template.id}.summary`]);
  }
  const html = withPageText("en", ["pages"], () => renderPagesWorkbench({ primitives: { escape: String } }));
  assert.ok(html.includes(pageText("en", "pages")("pages.action.new-doc")), "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

test("RAC-159 the Pages page's client is typed browser code bundled by esbuild, asks the Host only through the shared request helper and names no plugin", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
    assert.doesNotMatch(source, /io\.molis\.work\.|\/api\/plugins\//u, `${file} writes a plugin id or the plugin route prefix`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  const pkg = JSON.parse(readFileSync("plugins/native/pages/package.json", "utf8")) as { scripts: Record<string, string>; devDependencies?: Record<string, string> };
  assert.match(pkg.scripts.build, /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.match(pkg.scripts.build, /esbuild src\/browser\/factory\.ts --bundle/, "and bundles it");
  assert.match(pkg.scripts.typecheck, /tsc -p tsconfig\.browser\.json/, "and so does the type check");
  const root = JSON.parse(readFileSync("package.json", "utf8")) as { devDependencies: Record<string, string> };
  assert.ok(root.devDependencies.esbuild, "the root declares esbuild");
  assert.equal(pkg.devDependencies?.esbuild, root.devDependencies.esbuild, "esbuild is the package's own dev dependency, at the root's version");
  assert.doesNotThrow(() => new Function(`return ${PAGES_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(PAGES_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "molis:surface-focus", "molis:context-tools", "molis-work:select-item", "data-pages-back", "pages.error.no-project"]) {
    assert.ok(PAGES_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(PAGES_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|io\.molis\.work\./u, "requests go through molisWorkRequest and the plugin id comes from the host");
});

test("RAC-916-L4 the comment side client only needs its plugin route and ships both oversize outcomes", () => {
  const ports = readFileSync(join(SRC, "comment-browser-types.ts"), "utf8").split("export interface CommentDraft")[0]!;
  assert.doesNotMatch(ports, /\broute\(/u, "the unused platform route is no longer a comment-side port");
  const mount = readFileSync(join(BROWSER, "client.ts"), "utf8").match(/Editor\.mountComments\(\{[^}]+\}\)/u)?.[0];
  assert.ok(mount);
  assert.doesNotMatch(mount, /\broute:/u);
  assert.match(mount, /pluginRoute:/u);
  const commentsBundle = readFileSync(new URL(import.meta.resolve("@molis-ai/molis-work-plugin-pages/editor")), "utf8");
  for (const key of ["pages.comments.draft-too-long", "pages.comments.saved-offer-too-long"]) {
    assert.ok(commentsBundle.includes(key), `the shipped editor/comments bundle carries ${key}`);
    assertPageWords("pages", [key]);
  }
});
