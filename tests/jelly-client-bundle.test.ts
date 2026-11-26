import { assertPageWords, pageText, withPageText } from "./fixtures/page-text.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { JELLY_ACTIONS, JELLY_CLIENT_FACTORY_SCRIPT, jellyErrors, renderJellyWorkbench } from "@molis-ai/molis-work-plugin-jelly";

const SRC = "plugins/native/jelly/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));

test("RAC-140 every word the Jelly page says has a stable key with both languages, and the page writes no Chinese as a key", () => {
  const used = new Set<string>();
  for (const file of [join(SRC, "ui.ts"), ...browserFiles()]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/"(jelly(?:\.[a-z0-9_-]+)+)"/gu)) used.add(match[1]!);
    const chinese = [...source.matchAll(/"([^"\n]*[一-鿿][^"\n]*)"/gu)].map(match => match[1]!);
    assert.deepEqual(chinese, [], `${file} writes a Chinese string where a stable key belongs`);
  }
  // The page names the actions it calls and the codes it tells apart by their ids (src/browser/api.ts); those are not words it says.
  for (const definition of JELLY_ACTIONS) used.delete(definition.capability_id);
  for (const reason of Object.keys(jellyErrors)) used.delete(`jelly.${reason}`);
  assertPageWords("jelly", used);
  const html = withPageText("en", ["jelly"], () => renderJellyWorkbench({ primitives: { escape: String, text: String } }));
  assert.ok(html.includes(pageText("en", "jelly")("jelly.load.opening")), "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

test("RAC-141 the Jelly page's client is typed browser code bundled by esbuild, and asks the Host only through its own actions", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(|\b(?:confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
  }
  // Every read and write is one of Jelly's own actions, through the host the workbench gives the page: no request of its own.
  assert.match(readFileSync(join(BROWSER, "api.ts"), "utf8"), /host\.invokeAction[<(]/u);
  assert.match(readFileSync("plugins/native/jelly/package.json", "utf8"), /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.doesNotThrow(() => new Function(`return ${JELLY_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(JELLY_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "molis:assistant-effect", "molis-work:select-item", "molis-work:item-unreadable", "molis-work:language-changed", "jelly.note.saved"]) {
    assert.ok(JELLY_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(JELLY_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|life\.fetch|molisWorkRequest|\/api\/plugins\//u, "the page asks only through its actions");
});
