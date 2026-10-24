import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { JELLY_CLIENT_FACTORY_SCRIPT, JELLY_MESSAGES, renderJellyWorkbench } from "@molis-ai/molis-work-plugin-jelly";

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
  assert.deepEqual([...used].filter(key => !(key in JELLY_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(JELLY_MESSAGES).filter(key => !used.has(key)), [], "every defined key is asked for");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(JELLY_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  const html = renderJellyWorkbench({ primitives: { escape: String, text: key => `«${key}»` } });
  assert.match(html, /placeholder="«jelly\.search\.placeholder»"/u, "the server-drawn page speaks through the translator");
  // The date pickers are the design system's own component and say their own words (arrows, weekdays); everything else is Jelly's.
  assert.doesNotMatch(html.replace(/<div class="mw-date-picker[\s\S]*?<\/section>\s*<\/div>/gu, ""), /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

test("RAC-141 the Jelly page's client is typed browser code bundled by esbuild, and asks the Host only through the shared request helper", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
    assert.doesNotMatch(source, /window\.(confirm|alert|prompt)\(|\b(?:confirm|alert|prompt)\(/u, `${file} opens a browser dialog`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  assert.match(readFileSync("plugins/native/jelly/package.json", "utf8"), /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.doesNotThrow(() => new Function(`return ${JELLY_CLIENT_FACTORY_SCRIPT}`), "the bundle is a function expression");
  assert.match(JELLY_CLIENT_FACTORY_SCRIPT, /^\(host\) => \{/u);
  for (const mark of ["data-assistant-context", "molis:assistant-effect", "molis-work:select-item", "molis-work:item-unreadable", "molis-work:model-ready", "jelly.save.saved"]) {
    assert.ok(JELLY_CLIENT_FACTORY_SCRIPT.includes(mark), `the bundle carries ${mark}`);
  }
  assert.doesNotMatch(JELLY_CLIENT_FACTORY_SCRIPT, /molisWorkControlHeaders|life\.fetch/u, "requests go through molisWorkRequest");
});
