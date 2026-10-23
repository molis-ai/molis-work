import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { IMAGES_CLIENT_FACTORY_SCRIPT, IMAGES_MESSAGES, renderImagesWorkbench } from "@molis-ai/molis-work-plugin-images";

const SRC = "plugins/native/images/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));
/** The two placement phrases the page shares with other plugins: their Chinese originals are another owner's keys. */
const SHARED_PHRASES = ["来自 {source}", "可以在 Shelf 里用于项目"];

test("RAC-142 every word the Images page says has a stable key with both languages; only the shared placement phrases keep their Chinese", () => {
  const used = new Set<string>();
  for (const file of [join(SRC, "ui.ts"), ...browserFiles()]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/"(images(?:\.[a-z0-9_-]+)+)"/gu)) used.add(match[1]!);
    const chinese = [...source.matchAll(/\bL\("([^"]*[一-鿿][^"]*)"/gu)].map(match => match[1]!);
    assert.deepEqual(chinese.filter(key => !SHARED_PHRASES.includes(key)), [], `${file} calls the translator with a Chinese key`);
  }
  assert.deepEqual([...used].filter(key => !(key in IMAGES_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(IMAGES_MESSAGES).filter(key => !used.has(key)), [], "every defined key is asked for");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(IMAGES_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  const html = renderImagesWorkbench({ primitives: { escape: String, text: key => `«${key}»` } });
  assert.match(html, /placeholder="«images\.compose\.example»"/u, "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

test("RAC-143 the Images page's client is typed browser code bundled by esbuild, and asks the Host only through the shared request helper", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  assert.match(readFileSync("plugins/native/images/package.json", "utf8"), /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.doesNotThrow(() => new Function(`return ${IMAGES_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(IMAGES_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "molis:placement-result", "images.status.running"]) {
    assert.ok(IMAGES_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(IMAGES_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|life\.fetch/u, "requests go through molisWorkRequest");
});
