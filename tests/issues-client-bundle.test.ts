import { scanTree, workingTreeSnapshot, isProductSource } from "../scripts/gates/translations.mjs";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ISSUES_CLIENT_FACTORY_SCRIPT, ISSUES_MESSAGES, renderIssuesWorkbench } from "@molis-ai/molis-work-plugin-issues";

const SRC = "plugins/native/issues/src";
const BROWSER = join(SRC, "browser");
const browserFiles = () => readdirSync(BROWSER).map(file => join(BROWSER, file));

test("RAC-138 every word the Issue page says has a stable key with both languages, and none is a Chinese key", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => call.file === join(SRC, "ui.ts") || call.file.startsWith(BROWSER + "/"));
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "the real scanner covers the UI and browser translation entry points");
  assert.ok(calls.some(call => call.file === join(SRC, "ui.ts") && call.callee === "L"), "the view-model L translator is included");
  const used = new Set<string>(calls.map(call => call.key));
  for (const file of [join(SRC, "ui.ts"), ...browserFiles()]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /data-issue-i18n/u, `${file} still marks static controls for runtime translation`);
  }
  assert.deepEqual([...used].filter(key => !(key in ISSUES_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(ISSUES_MESSAGES).filter(key => !used.has(key)), [], "every defined key is asked for");
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(ISSUES_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  const html = renderIssuesWorkbench({ primitives: { text: key => `«${key}»` } });
  assert.match(html, /placeholder="«issues\.composer\.placeholder»"/u, "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
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
