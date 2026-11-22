import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { CODING_BOX, CODING_COMPOSER, CODING_SEND, CODING_TAKEN, codingType } from "./fixtures/coding-composer.js";
import { recordingTextModel, type ModelWire } from "./fixtures/recording-text-model.js";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";
import { holdSubtaskDraft } from "./fixtures/subtask-draft-barrier.js";

// SAI-01/02/03/05/11/14/15: installed Coding contribution and SDK, original TaskBoard, isolated grant and local HTTP model.
// The selected B entries and original TaskBoard resolve the same child; this local HTTP model is separate from real-provider acceptance.
for (const entry of ["board", "card", "results"] as const) test(`Coding's ${entry} returns focus after real child refresh and preserves its main input`, { timeout: 150_000 }, async t => {
  let parentCalls = 0, childCalls = 0; const childBodies: ModelWire[] = [];
  const boardReply = entry === "board" ? { started: Promise.withResolvers<void>(), finish: Promise.withResolvers<void>() } : undefined;
  t.after(() => boardReply?.finish.resolve());
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, { prepareHome: async home => {
    await recordingTextModel(t, home, async body => {
      const first = JSON.stringify(body.messages.find(message => message.role === "user")?.content);
      if (first.includes("SAI_CODING_CHILD")) {
        const attempt = ++childCalls; childBodies.push(body);
        if (attempt === 2 && boardReply) { boardReply.started.resolve(); await boardReply.finish.promise; }
        return reply(undefined, attempt === 1 ? "CODING_ORIGINAL_CHILD_RESULT" : attempt === 2 ? "CODING_CONTINUED_CHILD_RESULT" : "CODING_THIRD_CHILD_RESULT");
      }
      if (first.includes("SAI_CODING_PARENT") && ++parentCalls === 1) {
        const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
        return reply({ name: "dispatch-subagent", input: { instruction: "SAI_CODING_CHILD: inspect this task without changing files.", tools: [], character, idempotencyKey: "coding-ui-child", maxTurns: 3 } });
      }
      return reply(undefined, "CODING_PARENT_STAYS_HERE");
    });
  } }); if (!b) return;
  const main = await pluginFrameBrowser(t, b, "coding");
  const child = await pluginFrameBrowser(t, b, undefined, undefined, "[data-work-task-float] iframe[data-plugin-frame]");
  const workspace = join(b.homeDirectory, "coding-subtask-entry"); await mkdir(workspace); await writeFile(join(workspace, "README.md"), "Isolated child conversation test.\n");
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  await b.click(".navigator-project-settings"); await b.waitFor("document.querySelector('[data-settings-section=workspaces]')");
  await b.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await b.waitFor("document.querySelector('[data-project-directories]')?.dataset.state==='ready'");
  await b.evaluate(`(()=>{const field=document.querySelector('[data-directories-add] [name=path]');field.value=${JSON.stringify(workspace)};field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await b.click("[data-directories-add] [type=submit]"); await b.waitFor("document.querySelector('[data-directories-inputs]').textContent.includes('coding-subtask-entry')");
  await b.click("[data-directories-inputs] [data-directory-row]:has([title$='/coding-subtask-entry']) [data-act=set-output]");
  await b.waitFor("document.querySelector('[data-directories-output] [data-text=path]')?.title.endsWith('/coding-subtask-entry')");
  await b.click('[data-plugin-strip] [data-plugin-id="coding"]');
  await b.waitFor("document.querySelector('[data-work-surface=coding]')?.dataset.uiClientState==='ready'");
  await main.click("[data-coding-new]");
  await b.waitFor(`${CODING_TAKEN}&&!document.querySelector(${JSON.stringify(CODING_BOX)}).disabled&&document.querySelector('${CODING_COMPOSER} [data-composer-control=model]').options.length>0`);
  await b.evaluate(`(()=>{for(const [id,value] of [['model',${JSON.stringify(JSON.stringify(["local-only", "fixture-model"]))}],['intent','collaborate']]){const select=document.querySelector('${CODING_COMPOSER} [data-composer-control='+id+']');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  await b.evaluate(codingType("SAI_CODING_PARENT")); await b.click(CODING_SEND);
  let completed = false;
  for (const until = Date.now() + 35_000; Date.now() < until;) {
    if (await b.evaluate("[...document.querySelectorAll('[data-agent-review-approve]:not(:disabled)')].some(button=>button.checkVisibility())")) {
      await b.click("[data-agent-review-approve]:not(:disabled)");
      await b.waitFor("document.querySelector('[data-page-dialog=confirm]')");
      await b.click("[data-page-dialog=confirm] [type=submit]");
    }
    completed = await main.evaluate<boolean>("!!document.querySelector('.coding-child[data-state=completed]')"); if (completed) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(completed, JSON.stringify({ parentCalls, childCalls, status: await main.evaluate("document.body.innerText.slice(-12000)") }));
  assert.equal(childCalls, 1);
  await main.waitFor("[...document.querySelectorAll('.coding-turn[data-kind=notice]')].some(node=>node.textContent.includes('CODING_ORIGINAL_CHILD_RESULT'))", 15_000);
  const notices = await main.evaluate<string[]>("[...document.querySelectorAll('.coding-turn[data-kind=notice]')].map(node=>node.textContent)");
  assert.doesNotMatch(notices.join("\n"), /resume: subagent|board-report|A person added input to subagent/, "SAI-07: original summaries reach the Coding parent without model protocol");
  await b.evaluate(codingType("CODING_MAIN_DRAFT_STAYS"));
  await b.evaluate(`window.__codingMainInput=document.querySelector(${JSON.stringify(CODING_BOX)})`);
  if (entry === "board") await main.click('[data-coding-view="board"]');
  if (entry === "results") await main.click(".coding-child[data-state=completed] .coding-child-foot button:not([data-coding-child-conversation])");
  const entrySelector = entry === "board" ? "[data-coding-board] [data-board-key^=child-] .coding-board-node" : entry === "card" ? ".coding-child [data-coding-child-conversation]" : "[data-coding-subagents] [data-coding-child-conversation]";
  await main.waitFor(`document.querySelector(${JSON.stringify(entrySelector)})`);
  await main.evaluate(`window.__taskEntry=document.querySelector(${JSON.stringify(entrySelector)})`);
  await main.click(entrySelector);
  await b.waitFor("document.querySelector('[data-work-task-float] [data-ui-client-state=ready] iframe[data-plugin-frame]')");
  try { await child.waitFor("document.querySelector('.mw-subtask textarea')&&!document.querySelector('.mw-subtask textarea').disabled&&document.body.textContent.includes('CODING_ORIGINAL_CHILD_RESULT')"); }
  catch (error) { t.diagnostic(await child.evaluate("document.body.innerText.slice(-6000)")); throw error; }
  assert.deepEqual(await b.evaluate(`{const field=document.querySelector(${JSON.stringify(CODING_BOX)});[field===window.__codingMainInput,field.value,${CODING_TAKEN}]}`), [true, "CODING_MAIN_DRAFT_STAYS", true]);
  await child.evaluate("const field=document.querySelector('.mw-subtask textarea');field.value='CODING_CHILD_FOLLOW_UP';field.dispatchEvent(new Event('input',{bubbles:true}));field.focus()");
  await child.click("[data-composer-send]");
  try {
    if (boardReply) {
      await boardReply.started.promise;
      await main.waitFor("document.querySelector('.coding-child[data-state=running]')", 20_000);
    }
    else await child.waitFor("document.body.textContent.includes('CODING_CONTINUED_CHILD_RESULT')", 20_000);
  }
  catch (error) { t.diagnostic(JSON.stringify({ childCalls, child: await child.evaluate("document.body.innerText.slice(-6000)"), shell: await b.evaluate("document.body.innerText.slice(-3500)") })); throw error; }
  assert.equal(childCalls, 2); assert.ok(JSON.stringify(childBodies[1]!.messages).includes("CODING_CHILD_FOLLOW_UP"));
  assert.ok(JSON.stringify(childBodies[1]!.messages).includes("CODING_ORIGINAL_CHILD_RESULT"), "continued model consumes its original child history");
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "CODING_MAIN_DRAFT_STAYS");
  await main.waitFor("!window.__taskEntry.isConnected");
  await child.evaluate("document.querySelector('.mw-subtask textarea').focus()");
  await b.command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }, b.sessionId);
  await b.waitFor("!document.querySelector('[data-work-task-float]')");
  await main.waitFor("document.activeElement===document.getElementById(window.__taskEntry.id)");
  if (boardReply) {
    // B59-FIX-03 / SAI-13: let the real completion update replace the board row after focus has returned to it.
    await main.evaluate("window.__focusedBoardEntry=document.activeElement");
    boardReply.finish.resolve();
    await main.waitFor("!window.__focusedBoardEntry.isConnected && document.querySelector('.coding-child[data-state=completed]')", 20_000);
    assert.equal(await main.evaluate("document.activeElement===document.getElementById(window.__taskEntry.id)"), true, "the late TaskBoard redraw keeps focus on the same task");
  }
  assert.equal(await main.evaluate("document.activeElement===window.__taskEntry"), false, "the real state refresh rebuilt this entry");
  await main.click(entrySelector); await child.waitFor("document.querySelector('[data-subtask-close]')");
  if (boardReply) await child.waitFor("document.body.textContent.includes('CODING_CONTINUED_CHILD_RESULT')", 20_000);
  await child.click("[data-subtask-close]"); await b.waitFor("!document.querySelector('[data-work-task-float]')");
  await main.waitFor("document.activeElement===document.getElementById(window.__taskEntry.id)");
  if (entry !== "board") {
    assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "CODING_MAIN_DRAFT_STAYS");
    assert.equal(await main.evaluate("document.querySelectorAll('[data-coding-turns] [data-run]').length"), 1);
    await main.click(entrySelector);
    await child.waitFor("document.querySelector('.mw-subtask textarea')");
    await b.click(CODING_BOX);
    // WLN-36 (36A-3): the task's card stands in the info column's place and the conversation beside it does not change, so
    // the main input takes the words with the card still there; the card is put away by its own key.
    assert.equal(await b.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(CODING_BOX)})`), true, "clicking the main input takes focus there, not stolen back to the plugin");
    await b.command("Input.insertText", { text: "x" }, b.sessionId);
    assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "CODING_MAIN_DRAFT_STAYSx");
    assert.equal(await b.evaluate("Boolean(document.querySelector('[data-work-task-float]'))"), true, "the card stays beside the conversation while the person types");
    await child.click("[data-subtask-close]"); await b.waitFor("!document.querySelector('[data-work-task-float]')");
    if (entry === "card") {
      // B59-FIX-01/02: the same frame can reopen after a close during draft CAS, retry the budget command and continue.
      const extend = "[data-subtask-action=extend-budget]";
      await main.click(entrySelector);
      await child.waitFor("document.querySelector(" + JSON.stringify(extend) + ") && document.querySelector('.mw-subtask textarea').disabled");
      const held = await holdSubtaskDraft(b, "extend-budget");
      try {
        await child.click(extend);
        await held.wait();
        await child.click("[data-subtask-close]");
        await b.waitFor("!document.querySelector('[data-work-task-float]')");
      } finally { await held.release(); }
      await main.click(entrySelector);
      await child.waitFor("document.querySelector(" + JSON.stringify(extend + ":not(:disabled)") + ")");
      assert.equal(held.posts(), 0);
      await child.click(extend);
      await child.waitFor("document.querySelector('.mw-subtask textarea:not(:disabled)')");
      assert.equal(held.posts(), 1);
      held.dispose();
      assert.equal(childCalls, 2, "budget extension is not an execution");
      await child.evaluate("(()=>{const field=document.querySelector('.mw-subtask textarea');field.value='SAI_THIRD_CODING';field.dispatchEvent(new Event('input',{bubbles:true}));field.focus()})()");
      await child.click("[data-composer-send]");
      await child.waitFor("document.body.textContent.includes('CODING_THIRD_CHILD_RESULT')", 20_000);
      assert.equal(childCalls, 3);
      assert.match(JSON.stringify(childBodies[2]!.messages), /CODING_CONTINUED_CHILD_RESULT/);
      assert.match(JSON.stringify(childBodies[2]!.messages), /SAI_THIRD_CODING/);
      assert.equal(await main.evaluate("document.querySelectorAll('[data-coding-turns] [data-run]').length"), 1);
      assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "CODING_MAIN_DRAFT_STAYSx");
    }
    return;
  }
  assert.equal(await main.evaluate("document.querySelector('[data-coding-board]').hidden"), false);
  await main.click('[data-coding-view="dialogue"]');
  await main.click(".coding-child [data-coding-child-conversation]");
  await b.waitFor("document.querySelector('[data-work-task-float] [data-ui-client-state=ready] iframe[data-plugin-frame]')");
  await child.waitFor("document.body.textContent.includes('CODING_CONTINUED_CHILD_RESULT')");
  assert.equal(childCalls, 2, "opening the card's conversation does not start another attempt");
  await child.click("[data-subtask-back]"); await b.waitFor("!document.querySelector('[data-work-task-float]')");
  await main.click(".coding-child[data-state=completed] .coding-child-foot button:not([data-coding-child-conversation])");
  await main.waitFor("!document.querySelector('[data-coding-subagents]').hidden&&!!document.querySelector('[data-coding-subagents] [data-feedback]')");
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "CODING_MAIN_DRAFT_STAYS");
  await main.click("[data-coding-subagents] [data-coding-child-conversation]");
  await b.waitFor("document.querySelector('[data-work-task-float] [data-ui-client-state=ready] iframe[data-plugin-frame]')");
  await child.waitFor("document.body.textContent.includes('CODING_CONTINUED_CHILD_RESULT')");
  await child.click("[data-subtask-back]"); await b.waitFor("!document.querySelector('[data-work-task-float]')");
  assert.equal(await main.evaluate("document.querySelector('[data-coding-subagents]').hidden"), false, "return preserves the original results panel");
  assert.equal(childCalls, 2); assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "CODING_MAIN_DRAFT_STAYS");
  assert.equal(await main.evaluate("document.querySelectorAll('[data-coding-turns] [data-run]').length"), 1, "child conversation adds no parent run");
});
