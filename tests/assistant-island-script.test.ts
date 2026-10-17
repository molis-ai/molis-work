import assert from "node:assert/strict";
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

// UIV-04: exercise the shipped draft functions, including persistence and a receipt arriving in another work.
test("UIV-04 same text in different projects does not share materials, and a background send consumes only its attachments", () => {
  const start = ASSISTANT_ISLAND_FACTORY_SCRIPT.indexOf("  const drafts = new Map();");
  const end = ASSISTANT_ISLAND_FACTORY_SCRIPT.indexOf("  const switchTo =", start);
  assert.ok(start >= 0 && end > start, "the production draft functions must be present in the shipped client");
  interface DraftHarness {
    select(projectId: string, workId: string | null): void;
    type(text: string): void;
    attach(id: string): void;
    read(): { text: string; files: string[] };
    sent(): object;
    settle(intent: object): void;
    load(): void;
  }
  const make = new Function("saved", `
    const json=JSON.stringify,uri=encodeURIComponent;
    let project={id:'A'},curId=null,files=[],sel=null,nextScope='project',nextExec='assistant',nextMode='execute',nextChar=null,pendingChar;
    const removed=new Set(),joined=new Set(),store={get:key=>saved.get(key)||null,set:(key,value)=>value===null?saved.delete(key):saved.set(key,value)};
    let draftTimer,activeSend=null,draftWrite=Promise.resolve();const works=[],input={value:''},compose={dataset:{}},newDraftKey=()=> 'draft:'+project.id,
      getWork=()=>null,syncSend=()=>{},api=()=>Promise.resolve(),paintMats=()=>saveContext();
    ${ASSISTANT_ISLAND_FACTORY_SCRIPT.slice(start, end)}
    return {
      select(projectId,workId){saveDraft(true);project={id:projectId};curId=workId;loadDraft();},
      type(text){input.value=text;saveDraft(true);},
      attach(id){files.push({material_id:id,title:id,preview:'data:image/png;base64,abc'});saveContext();},
      read(){return {text:input.value,files:files.map(file=>file.material_id)};},
      sent(){return {contextKey:contextKey(),files:files.slice(),selection:sel,removed:[...removed],joined:[...joined]};},
      settle:takeMaterials,load:loadDraft
    };`) as (saved: Map<string, string>) => DraftHarness;
  const saved = new Map<string, string>();
  const ui = make(saved); ui.load(); ui.type("same"); ui.attach("A attachment"); const intent = ui.sent();
  ui.select("B", null); assert.deepEqual(ui.read(), { text: "", files: [] });
  ui.type("same"); ui.attach("B attachment"); ui.settle(intent);
  assert.deepEqual(ui.read(), { text: "same", files: ["B attachment"] });
  ui.select("A", null); assert.deepEqual(ui.read(), { text: "same", files: [] });
  ui.attach("added later");
  const reloaded = make(saved); reloaded.load();
  assert.deepEqual(reloaded.read(), { text: "same", files: ["added later"] });
  assert.equal([...saved.values()].some(value => value.includes("base64")), false, "only attachment references, not preview copies, are persisted");
});


// UIV-04: chooser initialization runs before the stored work arrives. Its empty placeholder is not an edit.
test("UIV-04 restoring an unloaded work does not erase its draft, while input and deliberate clearing still save", () => {
  const source = ASSISTANT_ISLAND_FACTORY_SCRIPT;
  const draftStart = source.indexOf("  const drafts = new Map();");
  const draftEnd = source.indexOf("  const switchTo =", draftStart);
  const inputStart = source.indexOf("  let typed = false, inputRev = 0;");
  const inputEnd = source.indexOf('  onEl(input, "keydown",', inputStart);
  const getWork = source.match(/  const getWork = [^\n]+/)?.[0];
  assert.ok(draftStart >= 0 && draftEnd > draftStart && inputStart >= 0 && inputEnd > inputStart && getWork,
    "use the shipped draft code, work lookup and input handler");
  interface DraftInitHarness {
    restore(): void;
    arrive(): void;
    edit(text: string): void;
    flush(): void;
    read(): { text: string; saved: string; writes: Array<{ path: string; draft: string }> };
  }
  const make = new Function(`
    const json=JSON.stringify,uri=encodeURIComponent;
    let project={id:'A'},curId='saved-work',files=[],sel=null,nextScope='project',nextExec='assistant',nextMode='execute',nextChar=null,pendingChar;
    const removed=new Set(),joined=new Set(),stored=new Map(),store={get:key=>stored.get(key)||null,set:(key,value)=>value===null?stored.delete(key):stored.set(key,value)};
    let draftTimer,activeSend=null,draftWrite=Promise.resolve(),view=null,onInput,saved='Host draft';
    const works=[],writes=[],input={value:''},compose={dataset:{}},newDraftKey=()=> 'draft:'+project.id;
    const syncSend=()=>{},paintMats=()=>{},closeSlash=()=>{},mentionAt=()=>null,closeMention=()=>{},setStarts=()=>{},
      onEl=(_node,_event,handler)=>{onInput=handler;},api=(path,_method,body)=>{saved=body.draft;writes.push({path,draft:body.draft});return Promise.resolve();};
    ${getWork}
    ${source.slice(draftStart, draftEnd)}
    ${source.slice(inputStart, inputEnd)}
    return {
      restore(){loadDraft();saveDraft(true);},
      arrive(){works.push({work_id:curId,draft:saved});loadDraft();},
      edit(text){input.value=text;onInput();},flush(){saveDraft(true);},
      read(){return {text:input.value,saved,writes:[...writes]};}
    };`) as () => DraftInitHarness;
  const cold = make(); cold.restore();
  assert.deepEqual(cold.read(), { text: "", saved: "Host draft", writes: [] }, "initialization cannot write the unloaded placeholder");
  cold.arrive(); assert.equal(cold.read().text, "Host draft", "the untouched Host draft is displayed when its work arrives");
  cold.edit(""); cold.flush();
  assert.deepEqual(cold.read(), { text: "", saved: "", writes: [{ path: "/works/saved-work/draft", draft: "" }] }, "clearing a loaded draft is a real write");
  const early = make(); early.restore(); early.edit("Written before the list arrives"); early.flush();
  assert.equal(early.read().saved, "Written before the list arrives", "the loading guard must not discard early typing");
  const cleared = make(); cleared.restore(); cleared.edit("Temporary text"); cleared.edit(""); cleared.flush();
  assert.deepEqual(cleared.read(), { text: "", saved: "", writes: [{ path: "/works/saved-work/draft", draft: "" }] }, "an input event records deliberate empty text even before the work arrives");
});
