import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { CODING_BOX, CODING_COMPOSER, CODING_SEND, CODING_TAKEN, codingType } from "./fixtures/coding-composer.js";
import { recordingTextModel, type ModelWire } from "./fixtures/recording-text-model.js";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";

// SAI-01/02/03/05/11/14/15: installed Coding contribution and SDK, original TaskBoard, isolated grant and local HTTP model.
// The selected B entries and original TaskBoard resolve the same child; this local HTTP model is separate from real-provider acceptance.
test("Coding's card, results and TaskBoard open the same real SDK child without replacing the main input", { timeout: 150_000 }, async t => {
  let parentCalls = 0, childCalls = 0; const childBodies: ModelWire[] = [];
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, { prepareHome: async home => {
    await recordingTextModel(t, home, body => {
      const first = JSON.stringify(body.messages.find(message => message.role === "user")?.content);
      if (first.includes("SAI_CODING_CHILD")) { childCalls++; childBodies.push(body); return reply(undefined, childCalls === 1 ? "CODING_ORIGINAL_CHILD_RESULT" : "CODING_CONTINUED_CHILD_RESULT"); }
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
  await b.evaluate(codingType("CODING_MAIN_DRAFT_STAYS"));
  await b.evaluate(`window.__codingMainInput=document.querySelector(${JSON.stringify(CODING_BOX)})`);
  await main.click('[data-coding-view="board"]');
  await main.waitFor("document.querySelector('[data-coding-board] [data-board-key^=child-] .coding-board-node')");
  await main.click("[data-coding-board] [data-board-key^=child-] .coding-board-node");
  await b.waitFor("document.querySelector('[data-work-task-float] [data-ui-client-state=ready] iframe[data-plugin-frame]')");
  try { await child.waitFor("document.querySelector('.mw-subtask textarea')&&!document.querySelector('.mw-subtask textarea').disabled&&document.body.textContent.includes('CODING_ORIGINAL_CHILD_RESULT')"); }
  catch (error) { t.diagnostic(await child.evaluate("document.body.innerText.slice(-6000)")); throw error; }
  assert.deepEqual(await b.evaluate(`{const field=document.querySelector(${JSON.stringify(CODING_BOX)});[field===window.__codingMainInput,field.value,${CODING_TAKEN}]}`), [true, "CODING_MAIN_DRAFT_STAYS", true]);
  await child.evaluate("const field=document.querySelector('.mw-subtask textarea');field.value='CODING_CHILD_FOLLOW_UP';field.dispatchEvent(new Event('input',{bubbles:true}));field.focus()");
  await child.click("[data-composer-send]");
  try { await child.waitFor("document.body.textContent.includes('CODING_CONTINUED_CHILD_RESULT')", 20_000); }
  catch (error) { t.diagnostic(JSON.stringify({ childCalls, child: await child.evaluate("document.body.innerText.slice(-6000)"), shell: await b.evaluate("document.body.innerText.slice(-3500)") })); throw error; }
  assert.equal(childCalls, 2); assert.ok(JSON.stringify(childBodies[1]!.messages).includes("CODING_CHILD_FOLLOW_UP"));
  assert.ok(JSON.stringify(childBodies[1]!.messages).includes("CODING_ORIGINAL_CHILD_RESULT"), "continued model consumes its original child history");
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "CODING_MAIN_DRAFT_STAYS");
  await child.click("[data-subtask-back]"); await b.waitFor("!document.querySelector('[data-work-task-float]')");
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
