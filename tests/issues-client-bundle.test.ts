import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ISSUES_CLIENT_FACTORY_SCRIPT, renderIssuesWorkbench } from "@molis-ai/molis-work-plugin-issues";
import { inspectLocaleSet, installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";

const SRC = "plugins/native/issues/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));

test("RAC-138 every word the Issue page says has a stable key with both languages, and none is a Chinese key", () => {
  const used = new Set<string>();
  for (const file of [join(SRC, "ui.ts"), ...browserFiles()]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /data-issue-i18n|\bt(?:\.text)?\(["'][^"']*\p{Script=Han}/u, `${file} must draw with stable keys`);
    for (const match of source.matchAll(/"(issues\.[a-z][\w.-]+)"/gu)) used.add(match[1]!);
  }
  const packs = ["zh", "en"].map(locale => {
    const read = parseLocalePack(readFileSync(join(SRC, "..", "locales", locale + ".json"), "utf8"));
    assert.ok(read.value, JSON.stringify(read.problems));
    return read.value;
  });
  assert.deepEqual(inspectLocaleSet(packs, { default: "zh" }), []);
  assert.deepEqual([...used].filter(key => !Object.hasOwn(packs[0]!.messages, key)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(packs[0]!.messages).filter(key => !used.has(key)), [], "every defined key is asked for");
  const withdraw = installTextForTest({ packs, locale: "en" });
  try {
    const html = renderIssuesWorkbench();
    assert.match(html, /placeholder="What went wrong\?/u, "the server-drawn page reads its English words");
    assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the English page");
  } finally { withdraw(); }
});

test("RAC-139 the Issue page's client is typed browser code bundled with its style sheet, and asks the Host only through the shared request helper", () => {
  for (const file of browserFiles()) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\bfetch\(/u, `${file} calls fetch directly`);
    assert.doesNotMatch(source, /:\s*any\b|as any\b|as unknown as|catch\s*(\([^)]*\))?\s*\{\s*\}/u, `${file} has an untyped escape or an empty catch`);
  }
  assert.match(readFileSync(join(BROWSER, "request.ts"), "utf8"), /molisWorkRequest/);
  assert.match(readFileSync("plugins/native/issues/package.json", "utf8"), /tsc -p tsconfig\.browser\.json/, "the build type-checks the browser code");
  assert.doesNotThrow(() => new Function("return " + ISSUES_CLIENT_FACTORY_SCRIPT), "the bundle is a function expression");
  assert.match(ISSUES_CLIENT_FACTORY_SCRIPT, /\.issues-row/u, "the style sheet travels inside the bundle");
  assert.doesNotMatch(ISSUES_CLIENT_FACTORY_SCRIPT, /scope\.fetch|window\.confirm|window\.alert|window\.prompt/u);
});
