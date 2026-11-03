import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { L, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/assistant-island.js";

// The bottom bar's client script is one template string: a single slip (a name declared twice, an unescaped newline)
// stops the whole Assistant, search and plugin switching with it, and only a browser run would show it otherwise.
test("the Assistant's bottom-bar script parses as one function", () => {
  assert.doesNotThrow(() => new Function(`return (${ASSISTANT_ISLAND_FACTORY_SCRIPT});`));
});

// What the person did not write must not reach the Host as something they typed (memory's 「你说过」 rests on it): the Send the bottom bar composes itself
// carries the page's mark, and so does a plugin's hand-over that goes out on a click. A Send added later without the mark fails here.
test("every Send the bottom bar writes itself is marked as the page's; only the composer's own Send can carry the person's words", () => {
  const script = ASSISTANT_ISLAND_FACTORY_SCRIPT;
  // The argument of each api("/send", "POST", …) call: up to the parenthesis that closes it, skipping what is inside quotes.
  const calls = [...script.matchAll(/api\("\/send", "POST", /g)].map(found => {
    const start = found.index! + found[0].length;
    let depth = 1, quote = "", index = start;
    for (; index < script.length && depth > 0; index += 1) {
      const char = script[index]!;
      if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
    }
    return script.slice(start, index - 1).trim();
  });
  assert.equal(calls.length, 4, "the bottom bar sends from four places: the browser hand-back, asking a closed question again (D5), the frozen composer and a receipt's correction");
  assert.equal(calls.filter(call => call === "intent.body, intent.route").length, 1, "the composer sends the frozen body and trusted route it captured");
  // RCPT-326: a correction is what the person typed in the receipt's form, so it is theirs, with the input it corrects.
  const correction = "{ work_id: work(), text, about, request_id: key }";
  assert.equal(calls.filter(call => call === correction).length, 1, "a receipt's correction sends the person's words, the input it corrects and the receipt's key");
  for (const call of calls.filter(call => call !== "intent.body, intent.route" && call !== correction)) assert.match(call, /written_by: "page"/, call.slice(0, 100));
  assert.match(script, /const body = \{[^\n]*\.\.\.\(byPage \? \{ written_by: "page" \} : \{\}\)/, "the composer marks a hand-over the person neither wrote nor changed");
  assert.match(script, /pageText = message\.text && input\.value\.trim\(\);/, "a hand-over with words is remembered as the page's until it is sent");
});

// A sentence the person reads is one translated text with its own punctuation: gluing a translated word to a Chinese colon
// ("Viewing：Notes") puts a full-width colon in English. The object the bottom bar says it is looking at is such a sentence.
test("what the bottom bar is looking at is one translated sentence, with the object's name as a parameter", () => {
  assert.doesNotMatch(ASSISTANT_ISLAND_FACTORY_SCRIPT, /L\("正在看"\)/, "no word-plus-colon glue for the page's object");
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /L\("正在看：\{title\}", \{ title: name \}\)/);
  assert.equal(L("正在看：{title}", { title: "需求说明" }), "正在看：需求说明");
  assert.equal(runWithLocale("en", () => L("正在看：{title}", { title: "Notes" })), "Viewing: Notes", "English keeps its own colon");
  // The strip names it with that sentence, never with its prefix cut off by a pattern. (The 「材料」 button's short name is gone with
  // the button: the strip took its place, context-program §21.2 point 1.)
  assert.doesNotMatch(ASSISTANT_ISLAND_FACTORY_SCRIPT, /replace\(\/\^正在看/);
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /el\("span", "assistant-strip-label", item\.label\)/);
});

// Where an object lives is named by the plugin catalog (the host passes the tab workspace's names, which hold the catalog and
// the plugins installed at run time), not by whatever the plugin switcher's list shows in the page (specs/BACKLOG BL-086).
test("a plugin's name in the bottom bar comes from the catalog, not from the plugin list in the page", async () => {
  const body = ASSISTANT_ISLAND_FACTORY_SCRIPT.match(/const surfaceName = \(surf\) => [^\n]*\n/)?.[0] ?? "";
  assert.match(body, /host\.pluginTitle/);
  assert.doesNotMatch(body, /plugin-rail-items|querySelector/);
  const { renderMolisWorkWorkbenchClientScript } = await import("./workbench-renderer-fixture.js");
  assert.match(renderMolisWorkWorkbenchClientScript(), /pluginTitle: \(plugin\) => tabWorkspace\?\.pluginTitle\(plugin\)/);
  assert.match(renderMolisWorkWorkbenchClientScript(), /pluginTitle: ops\.pluginTitle/);
});

// The line is measured with its chips on it, whether or not the phone's typing rule is hiding them, so a tap into the input and away
// leaves the steps where they were; and the steps that take parts off the line are made only where the stylesheet applies them
// (44px targets), never in a fine-pointer window, where a folded chip would still be on the line. tests/touch-targets.e2e.test.ts measures both.
test("the bottom bar measures its line with its chips on it and folds parts off only in touch windows", () => {
  const fit = ASSISTANT_ISLAND_FACTORY_SCRIPT.match(/const fitInput = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(fit, /compose\.dataset\.measuring = "";[\s\S]*dataset\.crowded = step;[\s\S]*delete compose\.dataset\.measuring;/, "the typing rule is off from the first measurement to the last");
  assert.match(fit, /if \(matchMedia\("\(max-width: 600px\), \(pointer: coarse\)"\)\.matches\) for \(const step of \["choosers", "mark", "chips"\]\)/, "and the steps are the touch rules'");
});

// RAC-2571: the script is cut by job into twelve parts joined in place (W5-10 batch A, T-060), so the main file stays under the
// giant-unit limit. Each part is one String.raw constant (the main template is raw: a plain template would turn its \n and \d into
// other characters), and the main file joins each on a line of its own, which keeps the line breaks around it as they were.
test("RAC-2571: the bottom-bar script is twelve String.raw parts joined in place, and the main file stays under 770 lines", () => {
  const dir = new URL("../apps/workbench/src/scripts/client/", import.meta.url);
  const main = readFileSync(new URL("assistant-island.ts", dir), "utf8");
  assert.ok(main.split("\n").length <= 770, `assistant-island.ts has ${main.split("\n").length} lines`);
  const parts = {
    "assistant-choosers.ts": "ASSISTANT_CHOOSERS_PART",
    "assistant-browser-handback.ts": "ASSISTANT_BROWSER_HANDBACK_PART",
    "assistant-layout.ts": "ASSISTANT_LAYOUT_PART",
    "assistant-conversation.ts": "ASSISTANT_CONVERSATION_PART",
    "assistant-side-kit.ts": "ASSISTANT_SIDE_KIT_PART",
    "assistant-side-path.ts": "ASSISTANT_SIDE_PATH_PART",
    "assistant-strip.ts": "ASSISTANT_STRIP_PART",
    "assistant-tabs.ts": "ASSISTANT_TABS_PART",
    "assistant-notices.ts": "ASSISTANT_NOTICES_PART",
    "assistant-materials.ts": "ASSISTANT_MATERIALS_PART",
    "assistant-composer.ts": "ASSISTANT_COMPOSER_PART",
    "assistant-page-messages.ts": "ASSISTANT_PAGE_MESSAGES_PART",
  };
  for (const [file, name] of Object.entries(parts)) {
    const source = readFileSync(new URL(file, dir), "utf8");
    assert.deepEqual([...source.matchAll(/^export const (ASSISTANT_[A-Z_]+_PART) = String\.raw`/gm)].map(found => found[1]), [name], `${file} exports ${name} as one String.raw template`);
    assert.equal(source.match(/^export /gm)?.length, 1, `${file} exports nothing else`);
    assert.ok(source.split("\n").length < 800, `${file} has ${source.split("\n").length} lines`);
    assert.equal(main.split("\n").filter(line => line === "${" + name + "}").length, 1, `the main file joins ${name} once, on a line of its own`);
  }
});
