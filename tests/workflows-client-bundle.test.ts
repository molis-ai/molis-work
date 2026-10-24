import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isProductSource, scanTree, workingTreeSnapshot } from "../scripts/gates/translations.mjs";

import { renderWorkflowsWorkbench, WORKFLOWS_MESSAGES } from "@molis-ai/molis-work-plugin-workflows";

const SRC = "plugins/native/workflows/src";
const PAGE_FILES = ["ui.ts", "client.ts", "save-client.ts", "gap-picker-client.ts"].map(file => `${SRC}/${file}`);

test("RAC-156 every word the Workflows page says has a stable key with both languages", () => {
  const scan = scanTree(workingTreeSnapshot(process.cwd()), isProductSource);
  const calls = scan.calls.filter(call => PAGE_FILES.includes(call.file));
  assert.ok(calls.some(call => call.file === `${SRC}/ui.ts`), "the actual scanner sees server-drawn words");
  assert.ok(calls.some(call => call.file === `${SRC}/client.ts`), "and the words the client script says");
  assert.deepEqual(calls.filter(call => /\p{Script=Han}/u.test(call.key)), [], "no Chinese key: every word the page says is a stable key");
  const used = new Set<string>(calls.map(call => call.key));
  assert.deepEqual([...used].filter(key => !(key in WORKFLOWS_MESSAGES)), [], "every key the page asks for is defined");
  assert.deepEqual(Object.keys(WORKFLOWS_MESSAGES).filter(key => !used.has(key) && !mentioned(key)), [], "every defined key is asked for or named as a choice");
  // The words that are not chosen from the table are data: a station's name, a reason or a result the Host or an action wrote.
  const dynamic = scan.dynamicCalls.filter(call => PAGE_FILES.includes(call.file));
  const allowed = /(?:L|tx)\(\s*(?:stnMeta|info\.label|KINDS\[|[\w.?]*reason|row\.reason|choice\.reason|ready\.reason|res\?*\.summary|res\.link\.label|run\.stopped\.reason|val\.action)/u;
  for (const call of dynamic) {
    const line = readFileSync(call.file, "utf8").split("\n")[call.line - 1]!;
    assert.match(line, allowed, `${call.file}:${call.line} forwards something other than a station name, a reason or a result`);
  }
  const names = (value: string) => [...new Set([...value.matchAll(/\{([a-z]+)[|}]/gu)].map(match => match[1]))].sort();
  for (const [key, text] of Object.entries(WORKFLOWS_MESSAGES)) {
    assert.ok(text.zh && text.en, `${key} has Chinese and English`);
    assert.deepEqual(names(text.zh), names(text.en), `${key} uses the same placeholders in both languages`);
  }
  const html = renderWorkflowsWorkbench({ primitives: { escape: String, text: key => `«${key}»` } });
  assert.match(html, /«workflows\.ui\.new-flow»/u, "the server-drawn page speaks through the translator");
  assert.doesNotMatch(html, /[一-鿿]/u, "no Chinese is drawn into the page directly");
});

// A key the script names without calling the translator on it: a choice table the client later looks up.
function mentioned(key: string): boolean {
  return PAGE_FILES.some(file => readFileSync(file, "utf8").includes(`'${key}'`) || readFileSync(file, "utf8").includes(`"${key}"`));
}
