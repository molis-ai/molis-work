import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { INTERACTION_CLIENT_SCRIPT_TYPED_DATES } from "@molis-ai/molis-work-design-system";
import { agentQuestionHtml, installHostUiText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { openBoardBrowser } from "./fixtures/board-browser.js";

test("SAI-06/10/11: original question client in the public float retains fields, validation and exact-target lifetime", { timeout: 90_000 }, async t => {
  installHostUiText();
  const forms = Object.fromEntries(["a", "b"].map(target => {
    const question: AgentPendingQuestion = { pending_id: `original-${target}`, pending_revision: 1, kind: "questionnaire", prompt: `Question ${target}`, options: [], allows_free_text: false, answerable: true,
      questions: [{ index: 0, id: "minutes", type: "number", prompt: "Minutes", required: true, options: [], multiple: false, allow_other: false, min: 15, max: 120, integer: true, unit: "minutes" }] };
    return [target, { ...question, html: runWithLocale("en", () => agentQuestionHtml(question, key => key)) }];
  }));
  const bundle = await build({ entryPoints: ["tests/fixtures/subtask-question-probe.ts"], bundle: true, write: false, format: "iife", globalName: "QuestionProbe", platform: "browser" });
  const b = await openBoardBrowser(t, "empty"); if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/__ui/catalog?lang=en` }, b.sessionId));
  await b.waitFor("globalThis.molisComposerProgram && window.molisFollow");
  await b.evaluate(bundle.outputFiles[0]!.text);
  await b.evaluate(`globalThis.qp=QuestionProbe.mountQuestionProbe(${JSON.stringify(forms)}, (${INTERACTION_CLIENT_SCRIPT_TYPED_DATES})); qp.handle.open('a')`);
  const field = "qp.root.querySelector('[data-ix-field=n0] input')";
  await b.waitFor(`${field} && qp.root.querySelector('textarea')?.value === 'a draft'`);
  await b.evaluate("qp.fill('400'); qp.submit()");
  await b.waitFor(`${field}.getAttribute('aria-invalid') === 'true'`);
  assert.equal(await b.evaluate("qp.root.querySelector('[data-ix-error]').textContent"), "At most 120 minutes");
  assert.equal(await b.evaluate(`document.activeElement === ${field}`), true);
  const savedHtml = runWithLocale("en", () => agentQuestionHtml(forms.a!, key => key, { n0: "45" }));
  const submitButton = "qp.root.querySelector('[data-ix-action=answer]')";
  assert.equal(await b.evaluate(`(async () => {
    const button = ${submitButton};
    qp.fill('45');
    qp.forms.a.html = ${JSON.stringify(savedHtml)};
    await qp.handle.refresh();
    return ${submitButton} === button;
  })()`), true, "a saved draft of the same question keeps the live submit button");
  await b.waitFor(`${field}.value === '45'`);
  await b.evaluate("qp.submit()");
  await b.waitFor("qp.answers.length === 2");
  assert.deepEqual(await b.evaluate("qp.answers[1].input"), { pending_id: "original-a", pending_revision: 1, answers: [{ question: 0, value: 45 }] });
  assert.equal(await b.evaluate("qp.root.querySelector('textarea').value"), "a draft", "answering never consumes the ordinary input");
  await b.evaluate("qp.fill('60'); qp.flush()");
  await b.evaluate("qp.gate=qp.blockSave(); qp.submit(); qp.handle.open('b')");
  await b.waitFor("qp.root.textContent.includes('Question b')");
  await b.evaluate("qp.gate.resolve(); qp.flush()");
  assert.equal(await b.evaluate("qp.answers.length"), 2, "closing the original question before its save returns cancels only that unsent answer");
  await b.evaluate("qp.handle.open('a')");
  await b.waitFor(`${field}?.value === '60'`);
  assert.equal(await b.evaluate("qp.answers.length"), 2, "reopen restores without submission");
  const closed = { ...forms.a!, answerable: false, unavailable_reason: "This question closed" };
  const closedHtml = runWithLocale("en", () => agentQuestionHtml(closed, key => key));
  await b.evaluate(`qp.forms.a = ${JSON.stringify({ ...closed, html: closedHtml })}; qp.handle.refresh()`);
  assert.equal(await b.evaluate(`${submitButton} === null && qp.root.textContent.includes('This question closed')`), true);
  await b.evaluate("qp.handle.destroy(); qp.root.remove()");
});
