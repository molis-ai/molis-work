import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pageText } from "./fixtures/page-text.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/dist/scripts/client/assistant-island.js";
import { assistantWorkFixture } from "./fixtures/assistant-browser-contract.js";
import { LOGIN_URLS_OPENED, LOGIN_URLS_REFUSED, loginOpens } from "./fixtures/connection-login-urls.js";

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
  assert.equal(calls.length, 4, "the bottom bar sends from four places: the browser hand-back, asking a closed question again (D5), the one Send (`post`) and a receipt's correction");
  assert.equal(calls.filter(call => call === "intent.body, intent.route").length, 1, "the composer sends the frozen body and trusted route it captured");
  // RCPT-326: a correction is what the person typed in the receipt's form, so it is theirs, with the input it corrects.
  const correction = "{ work_id: work(), text, about, request_id: key }";
  assert.equal(calls.filter(call => call === correction).length, 1, "a receipt's correction sends the person's words, the input it corrects and the receipt's key");
  for (const call of calls.filter(call => call !== "intent.body, intent.route" && call !== correction)) assert.match(call, /written_by: "page"/, call.slice(0, 100));
  // K3: the one Send carries the mark it is given; the composer gives none (the words are the person's), a page's hand-over gives the page's.
  assert.match(script, /const body = \{[^\n]*\n[^\n]*\.\.\.\(extra\.written_by \? \{ written_by: extra\.written_by \} : \{\}\)/, "the one Send marks what it is told is the page's");
  assert.match(script, /void say\(message\.text, \{ named: "msg-" \+ message\.message_id, written_by: "page" \}\);/, "a hand-over with words goes out as the page's");
  const delegate = script.match(/const delegate = async \(message\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.ok(delegate, "the delegated Send is found");
  assert.doesNotMatch(delegate, /input\.value =|setWords\(/, "and never through the input, where the person's words would mix with it");
});

// A sentence the person reads is one translated text with its own punctuation: gluing a translated word to a Chinese colon
// ("Viewing：Notes") puts a full-width colon in English. The object the bottom bar says it is looking at is such a sentence.
test("what the bottom bar is looking at is one translated sentence, with the object's name as a parameter", () => {
  assert.doesNotMatch(ASSISTANT_ISLAND_FACTORY_SCRIPT, /L\("正在看"\)/, "no word-plus-colon glue for the page's object");
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /readText\("workbench\.assistant-materials\.viewing-title", \{ title: name \}\)/);
  assert.equal(pageText("zh")("workbench.assistant-materials.viewing-title", { title: "需求说明" }), "正在看：需求说明");
  assert.equal(pageText("en")("workbench.assistant-materials.viewing-title", { title: "Notes" }), "Viewing: Notes", "English keeps its own colon");
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
  // The served build shortens local bindings; the forwarding relation must remain unchanged.
  assert.match(renderMolisWorkWorkbenchClientScript(), /pluginTitle:\s*\(?([\w$]+)\)?\s*=>\s*[\w$]+\?\.pluginTitle\(\1\)/);
  assert.match(renderMolisWorkWorkbenchClientScript(), /pluginTitle:\s*[\w$]+\.pluginTitle/);
});

// K3: the bar's line is the platform composer now, which folds its controls behind 更多 on a narrow box by its own sheet: the island
// measures nothing and takes no parts off. What it still does is tell the sheets above the bar how tall the bar is (one variable).
test("the bottom bar measures no line of its own and gives the bar's height to the sheets above it through --dock-h", () => {
  assert.doesNotMatch(ASSISTANT_ISLAND_FACTORY_SCRIPT, /const fitInput = |dataset\.crowded|dataset\.measuring/, "no line fitting left in the island");
  assert.match(ASSISTANT_ISLAND_FACTORY_SCRIPT, /new ResizeObserver\(\(\) => \{ const height = bar\.offsetHeight; if \(height\) document\.body\.style\.setProperty\("--dock-h", height \+ "px"\); else document\.body\.style\.removeProperty\("--dock-h"\); \}\)/, "the bar's measured height is --dock-h");
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

// S-plugin-connection-card B1: the Assistant's connection card checks the login address with the card's own function, written into
// the script from it (on the one loopback spelling); the same addresses are opened and refused as by the shell's card.
test("S-plugin-connection-card B1 the Assistant's card opens only an https login or one on this computer, never one with a user name in it", () => {
  const script = ASSISTANT_ISLAND_FACTORY_SCRIPT, start = script.indexOf("const isLoopbackHostname = "), end = script.indexOf("let state = null", start);
  assert.ok(start > 0 && end > start, "the card writes the check in");
  assert.equal(/127\\\.0\\\.0\\\.1\|localhost\)\[:\/\]/u.test(script), false, "no second spelling of this computer is left");
  const check = new Function(`${script.slice(start, end)}; return isConnectionLoginUrl;`)() as (value: string) => boolean;
  for (const url of LOGIN_URLS_OPENED) assert.equal(check(url), true, url);
  for (const url of LOGIN_URLS_REFUSED) assert.equal(check(url), false, url);
});

test("S-plugin-connection-card B1 the Assistant's card checks the login address before it opens the browser or the window it reserved", () => {
  const { opens, unchecked } = loginOpens(ASSISTANT_ISLAND_FACTORY_SCRIPT);
  assert.equal(opens, 2, "the card opens the login in the system browser or in the window it reserved");
  assert.deepEqual(unchecked, [], "each open comes after isConnectionLoginUrl");
});

test("D0007 D0337 actual list script rejects late A/B/A responses and preserves current drafts", async () => {
  const begin = ASSISTANT_ISLAND_FACTORY_SCRIPT.indexOf("  let worksRead = ");
  const end = ASSISTANT_ISLAND_FACTORY_SCRIPT.indexOf("  const reload = ", begin);
  assert.ok(begin > 0 && end > begin);
  const pending: Array<{ route: string; resolve(value: { works: Array<{ work_id: string; draft: string; draft_revision?: number }> }): void }> = [];
  let route = "A";
  const script = new Function("host", "api", `let works=[],curId=null,tabs=[],view=null;
    const island={isConnected:true}, remember=()=>{},saveTabs=()=>{},openTab=()=>{},paintList=()=>{},paintAim=()=>{},paintSum=()=>{},drawTabs=()=>{};
    ${ASSISTANT_ISLAND_FACTORY_SCRIPT.slice(begin,end)}
    return {loadWorks,read:()=>works,edit:(id,text,revision)=>{curId=id;works=works.map(work=>work.work_id===id?{...work,draft:text,draft_revision:revision}:work);}};`);
  const list = script({ route: () => route }, (_path: string, _method: string, _body: unknown, at: string) => new Promise(resolve => pending.push({ route: at, resolve })));
  const a = list.loadWorks(); route = "B"; const b = list.loadWorks(); route = "A"; const again = list.loadWorks();
  assert.deepEqual(pending.map(item => item.route), ["A", "B", "A"]);
  const work = assistantWorkFixture;
  pending[2]!.resolve({ works: [work] }); await again;
  pending[1]!.resolve({ works: [{ work_id: "foreign", draft: "" }] }); await b;
  pending[0]!.resolve({ works: [] }); await a;
  assert.deepEqual(list.read(), [work], "old replies cannot clear the latest work or unsent draft");
  list.edit(work.work_id, "new local text", 7);
  const refresh = list.loadWorks();
  pending[3]!.resolve({ works: [{ ...work, draft: "older server text", draft_revision: 2 }] }); await refresh;
  assert.equal(list.read()[0].draft, "new local text", "refresh preserves the person's current draft");
  assert.equal(list.read()[0].draft_revision, 7, "the draft and its revision remain one observation");
});

test("D0007: served Assistant response fixtures compile against the owning public contract", async () => {
  const ts = (await import("typescript")).default;
  const fixture = new URL("./fixtures/assistant-browser-contract.ts", import.meta.url).pathname;
  const program = ts.createProgram([fixture], { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
  const errors = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), [], "a renamed required field must fail this test, rather than be erased by tsx");
});

test("D0007 D0009: the served usage client reads empty, running and failed responses and never reuses an older round's model or tokens", async () => {
  const { assistantViewFixtures } = await import("./fixtures/assistant-browser-contract.js");
  const start = ASSISTANT_ISLAND_FACTORY_SCRIPT.indexOf("const usagePane = (") + "const usagePane = (".length;
  const end = ASSISTANT_ISLAND_FACTORY_SCRIPT.indexOf(")({ readText, el, progress, api, toast:", start);
  assert.ok(start > 0 && end > start, "execute the usage factory actually embedded in the served Assistant client");
  const ASSISTANT_SIDE_USAGE_FACTORY_SCRIPT = ASSISTANT_ISLAND_FACTORY_SCRIPT.slice(start, end);
  class Node {
    children: Array<Node | string> = []; hidden = false; dataset: Record<string, string> = {};
    querySelector() { return null; }
    append(...values: Array<Node | string>) { this.children.push(...values); }
    replaceChildren(...values: Array<Node | string>) { this.children = values; }
    text(): string { return this.children.map(value => typeof value === "string" ? value : value.text()).join(" "); }
  }
  const create = new Function("globalThis", `return (${ASSISTANT_SIDE_USAGE_FACTORY_SCRIPT});`)({ t: { text: pageText("zh") } });
  for (const [name, view] of Object.entries(assistantViewFixtures)) {
    const box = new Node();
    const client = create({ readText: pageText("zh"), el: (_tag: string, _class: string, text?: string) => { const node = new Node(); if (text) node.append(text); return node; },
      progress: () => new Node(), box: () => box, current: () => JSON.parse(JSON.stringify(view)) });
    client.paint(view.work);
    assert.equal(box.hidden, name === "empty");
    assert.doesNotMatch(box.text(), /old-model|777|888/, name);
    if (name === "running" || name === "latestWithoutUsage") assert.match(box.text(), /进行中/);
    if (name === "failed") assert.match(box.text(), /暂不可用/);
  }
});
