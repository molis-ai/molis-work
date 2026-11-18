import assert from "node:assert/strict";
import test from "node:test";
import type { AgentSubagentConversation } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { recordingTextModel, type ModelWire } from "./fixtures/recording-text-model.js";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";

const userTexts = (body: ModelWire) => body.messages.filter(message => message.role === "user").map(message => typeof message.content === "string" ? message.content : JSON.stringify(message.content)).join("\n");

// SAI-04/11: actual Home, installed SDK, resident Host and native sibling buttons. The HTTP model is scripted.
for (const source of ["work", "sdk"] as const) test(`Assistant ${source} sibling navigation preserves drafts and reading while an original child reply arrives late`, { timeout: 120_000 }, async t => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  let parentCalls = 0; const calls = { A: 0, B: 0 }, received: string[] = [], childInputs: string[] = [];
  const b = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, { prepareHome: async home => {
    await recordingTextModel(t, home, async body => {
      const words = userTexts(body); received.push(words);
      // Child reports also appear later in the parent's context. Classify the original user task, not all material.
      const original = JSON.stringify(body.messages.find(message => message.role === "user")?.content);
      const child = original.includes("SAI11_CHILD_A") ? "A" : original.includes("SAI11_CHILD_B") ? "B" : undefined;
      if (child) {
        childInputs.push(words); calls[child]++;
        if (child === "A" && calls.A === 2) { entered.resolve(); await release.promise; return reply(undefined, "A_LATE_REPLY_ONLY"); }
        return reply(undefined, Array.from({ length: 45 }, (_, index) => `${child}_HISTORY_${index}: Keep this original child context and reading position.`).join("\n\n"));
      }
      if (words.includes("SAI11_PARENT") && ++parentCalls <= 2) {
        const key = parentCalls === 1 ? "A" : "B", instruction = `SAI11_CHILD_${key}: report your findings.`;
        if (source === "work") return reply({ name: "delegate-work", input: { title: `Sibling ${key}`, brief: instruction, acceptance: "Report findings" } });
        const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
        return reply({ name: "dispatch-subagent", input: { instruction, tools: [], character, idempotencyKey: `sibling-${key}` } });
      }
      return reply(undefined, "Parent remains unchanged.");
    });
  } }); if (!b) return;
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/` }, b.sessionId));
  await b.waitFor("document.querySelector('[data-assistant-composer] textarea')");
  const sent = await b.evaluate<AssistantSendResult>(`fetch('/api/assistant/send',{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({text:'SAI11_PARENT',scope:{kind:'personal'},request_id:crypto.randomUUID()})}).then(r=>r.json())`);
  assert.ok(sent.work); const workId = sent.work.work_id;
  await b.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open',{detail:{work_id:${JSON.stringify(workId)}}}))`);
  let current: AssistantWorkView | undefined;
  for (const until = Date.now() + 35_000; Date.now() < until;) {
    current = await b.evaluate<AssistantWorkView>(`fetch('/api/assistant/works/'+${JSON.stringify(workId)}).then(r=>r.json())`);
    for (const review of current.reviews) await b.evaluate(`fetch('/api/assistant/works/'+${JSON.stringify(workId)}+'/reviews/'+${JSON.stringify(review.review_id)},{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({decision:'approve',version:${JSON.stringify(review.version)}})}).then(r=>r.json())`);
    const children = source === "work" ? current.delegated : current.sdk_subtasks && "children" in current.sdk_subtasks ? current.sdk_subtasks.children : [];
    if (calls.A && calls.B && children?.length === 2 && children.every(child => child.state === "completed")) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual(calls, { A: 1, B: 1 });
  await b.evaluate("window.dispatchEvent(new Event('focus'))");
  await b.waitFor("document.querySelectorAll('button.assistant-subtask-name').length===2");
  const input = "[data-work-task-float] textarea", thread = "[data-work-task-float] [data-subtask-thread]";
  const open = async (key: "A" | "B", readyForInput = true) => {
    await b.evaluate(`(()=>{for(const button of document.querySelectorAll('button.assistant-subtask-name')) {delete button.dataset.siblingTarget;if((button.title||button.textContent).includes(${JSON.stringify(source === "sdk" ? "SAI11_CHILD_" + key : "Sibling " + key)}))button.dataset.siblingTarget='';}})()`);
    await b.click("[data-sibling-target]"); await b.waitFor(`document.querySelector(${JSON.stringify(input)})&&document.querySelector('[data-subtask-messages]')?.textContent.includes('${key}_HISTORY_0')`);
    if (readyForInput) await b.waitFor(`!document.querySelector(${JSON.stringify(input)}).disabled`);
  };
  const fill = async (selector: string, text: string) => b.evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(selector)});field.value=${JSON.stringify(text)};field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();})()`);
  await fill("[data-assistant-composer] textarea", "MAIN_DRAFT_UNCHANGED");
  await open("A"); await fill(input, "DRAFT_A");
  const point = await b.evaluate<{ x: number; y: number }>(`(()=>{const box=document.querySelector(${JSON.stringify(thread)}).getBoundingClientRect();return{x:box.x+box.width/2,y:box.y+box.height/2};})()`);
  await b.command("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY: -10000 }, b.sessionId);
  await b.waitFor(`document.querySelector(${JSON.stringify(thread)}).scrollTop<5`);
  await open("B"); await fill(input, "DRAFT_B"); await open("A");
  await b.waitFor(`document.querySelector(${JSON.stringify(input)}).value==='DRAFT_A'`);
  assert.ok(await b.evaluate(`document.querySelector(${JSON.stringify(thread)}).scrollTop<5`), "returning to A preserves its original reading position");
  await b.click("[data-work-task-float] [data-composer-send]");
  let enteredTimer: NodeJS.Timeout | undefined;
  try { await Promise.race([entered.promise, new Promise<never>((_resolve, reject) => { enteredTimer = setTimeout(() => reject(new Error("The original child did not reach the provider")), 15_000); })]); }
  catch (error) { t.diagnostic(JSON.stringify({ calls, parentCalls, lastRequests: received.slice(-3).map(text=>text.slice(0,250)), ui: await b.evaluate("document.querySelector('[data-work-task-float]')?.innerText.slice(-1800)") })); throw error; }
  finally { clearTimeout(enteredTimer); }
  await open("B"); await b.waitFor(`document.querySelector(${JSON.stringify(input)}).value==='DRAFT_B'`);
  await b.evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(input)});field.focus();field.setSelectionRange(1,5);})()`);
  release.resolve();
  let finished = false;
  for (const until = Date.now() + 20_000; Date.now() < until;) {
    finished = await b.evaluate<boolean>(`fetch('/api/assistant/works/'+${JSON.stringify(workId)}).then(r=>r.json()).then(v=>${source === "work" ? "v.delegated.every(c=>c.state==='completed')" : "v.sdk_subtasks.children.every(c=>c.state==='completed')"})`);
    if (finished) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(finished, "the delayed original child attempt actually finished");
  assert.deepEqual(await b.evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(input)});return[field.value,field===document.activeElement,field.selectionStart,field.selectionEnd,document.querySelector('[data-subtask-messages]').textContent.includes('A_LATE_REPLY_ONLY')];})()`), ["DRAFT_B", true, 1, 5, false]);
  await open("A", false); await b.waitFor("document.querySelector('[data-subtask-messages]')?.textContent.includes('A_LATE_REPLY_ONLY')");
  if (source === "sdk") {
    assert.ok(current?.sdk_subtasks && "children" in current.sdk_subtasks);
    const original = current.sdk_subtasks.children.find(child => child.task.includes("SAI11_CHILD_A")); assert.ok(original);
    const path = `/api/assistant/works/${workId}/sdk-subtasks/${original.parent_run.run_id}/${original.subagent_id}`;
    const result = await b.evaluate<{ conversation: AgentSubagentConversation }>(`fetch(${JSON.stringify(path)}).then(r=>r.json())`);
    assert.ok(result.conversation.input_unavailable, "the original attempt budget is exhausted after the continuation");
    assert.ok(await b.evaluate(`document.querySelector('[data-subtask-composer]').textContent.includes(${JSON.stringify(result.conversation.input_unavailable)})`));
    assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(input)}).disabled`), true);
  }
  await b.waitFor(`document.querySelector(${JSON.stringify(input)}).value===''`);
  assert.deepEqual(calls, { A: 2, B: 1 });
  assert.equal(childInputs.filter(words => words.includes("DRAFT_A")).length, 1, "original request starts only one continuation");
  assert.equal(await b.evaluate("document.querySelector('[data-assistant-composer] textarea').value"), "MAIN_DRAFT_UNCHANGED");
  await b.click("[data-work-task-float] [data-subtask-close]"); await b.waitFor("!document.querySelector('[data-work-task-float]')");
  await open("B"); await b.waitFor(`document.querySelector(${JSON.stringify(input)}).value==='DRAFT_B'`);
  await b.evaluate("const outside=document.createElement('button');outside.dataset.outsideProbe='';outside.textContent='Outside';outside.style.cssText='position:fixed;left:4px;top:4px;z-index:99999';document.body.append(outside)");
  await b.click("[data-outside-probe]"); await b.waitFor("!document.querySelector('[data-work-task-float]')");
  await b.evaluate("document.querySelector('[data-outside-probe]').remove()");

});
