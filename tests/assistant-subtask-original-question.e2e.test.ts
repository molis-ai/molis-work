import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { recordingTextModel, type ModelWire } from "./fixtures/recording-text-model.js";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";

// SAI-06/09/15: actual native float, original question renderer, HTTP owner and installed SDK; only model replies are scripted.
for (const source of ["work", "sdk"] as const) test(`${source} child ordinary chat leaves the original questionnaire open; its form answers the same Run`, { timeout: 120_000 }, async t => {
  let parentCalls = 0, childCalls = 0; const childBodies: ModelWire[] = [];
  const b = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, { prepareHome: async home => {
    await recordingTextModel(t, home, body => {
      const first = JSON.stringify(body.messages.find(message => message.role === "user")?.content);
      if (first.includes("SAI_ORIGINAL_QUESTION_CHILD")) {
        childBodies.push(body);
        if (++childCalls === 1) return reply({ name: "ask-user", input: { why: "Confirm original duration", questions: [{ id: "minutes", type: "number", prompt: "Original duration", min: 15, max: 120, integer: true }] } });
        return reply(undefined, "ORIGINAL_ANSWER_45_ACCEPTED");
      }
      if (first.includes("SAI_ORIGINAL_QUESTION_PARENT") && ++parentCalls === 1) {
        if (source === "work") return reply({ name: "delegate-work", input: { title: "Original question child", brief: "SAI_ORIGINAL_QUESTION_CHILD: ask duration before finishing.", acceptance: "Duration confirmed" } });
        const character = JSON.stringify(body.system).match(/molis-child-[a-z0-9-]+@\d+/u)?.[0]; assert.ok(character);
        return reply({ name: "dispatch-subagent", input: { instruction: "SAI_ORIGINAL_QUESTION_CHILD: ask duration before finishing.", tools: ["ask-user"], character, idempotencyKey: "original-question-child" } });
      }
      return reply(undefined, "Parent keeps its own conversation.");
    });
  } }); assert.ok(b);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/" }, b.sessionId));
  await b.waitFor("document.querySelector('[data-assistant-composer] textarea')");
  const base = "/api/assistant";
  const sent = await b.evaluate<AssistantSendResult>(`fetch('${base}/send',{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({text:'SAI_ORIGINAL_QUESTION_PARENT',scope:{kind:'personal'},request_id:crypto.randomUUID()})}).then(r=>r.json())`);
  assert.ok(sent.work, JSON.stringify(sent));
  const workPath = base + "/works/" + sent.work.work_id;
  const read = () => b.evaluate<AssistantWorkView>(`fetch(${JSON.stringify(workPath)}).then(r=>r.json())`);
  for (const end = Date.now() + 25_000; Date.now() < end && !childCalls;) {
    const view = await read();
    for (const review of view.reviews) await b.evaluate(`fetch(${JSON.stringify(workPath + "/reviews/" + review.review_id)},{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({decision:'approve',version:${JSON.stringify(review.version)}})}).then(r=>r.json())`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(childCalls, 1);
  await b.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open',{detail:{work_id:${JSON.stringify(sent.work.work_id)}}}))`);
  await b.waitFor("document.querySelector('.assistant-subtask-name')");
  if (!await b.evaluate("document.querySelector('.assistant-subtask-name').getBoundingClientRect().width>0")) await b.click("[data-assistant-side-toggle]");
  await b.click(".assistant-subtask-name");
  const field = "[data-work-task-float] [data-ix-field=n0] input", composer = "[data-work-task-float] .mw-subtask__composer textarea";
  await b.waitFor(`document.querySelector(${JSON.stringify(field)})`);
  await b.evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(composer)});input.value='Ordinary supplement, not a questionnaire answer';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();})()`);
  await b.command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 2 }, b.sessionId);
  await b.waitFor("document.querySelector('[data-work-task-float]')?.textContent.includes('Ordinary supplement, not a questionnaire answer')");
  assert.equal(childCalls, 1, "ordinary chat cannot settle the pending question or restart its Run");
  assert.ok(await b.evaluate(`!!document.querySelector(${JSON.stringify(field)})`));
  await b.evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(field)});input.value='45';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await b.click('[data-work-task-float] [data-ix-action="answer"]');
  await b.waitFor("document.querySelector('[data-work-task-float]')?.textContent.includes('ORIGINAL_ANSWER_45_ACCEPTED')", 20_000);
  assert.equal(childCalls, 2);
  assert.ok(JSON.stringify(childBodies[1]!.messages).includes("45"));
  assert.ok(JSON.stringify(childBodies[1]!.messages).includes("Ordinary supplement, not a questionnaire answer"));
  const parent = await read();
  if (source === "work") {
    const child = parent.delegated![0]!;
    const view = await b.evaluate<AssistantWorkView>(`fetch('${base}/works/${child.work_id}').then(r=>r.json())`);
    assert.equal(view.rounds.length, 1, "the original live question resumes its own Run");
    assert.equal(view.rounds[0]!.awaiting_input.length, 0);
  } else {
    assert.ok(parent.sdk_subtasks && "children" in parent.sdk_subtasks);
    assert.equal(parent.sdk_subtasks.children[0]!.budget!.attempt, 1);
  }
});
