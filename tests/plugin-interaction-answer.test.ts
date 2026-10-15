import assert from "node:assert/strict";
import test from "node:test";
import type { InteractionRequestResult } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { withPluginInteraction } from "@molis-ai/molis-work-app-local-host";

// specs/ai-interaction-experience S1: whichever plugin asks the person first, its route answer gets the shared question card,
// and a refusal that names question problems gets each field's line. The Host never looks at which plugin or which code.

const asked: InteractionRequestResult = { status: "needs_input", interaction: { interaction_id: "notes-1", why: "先确认<b>记给谁</b>", note: "回答后接着整理。",
  questions: [{ index: 0, prompt: "记给谁？", type: "choice", required: true, multiple: false, allow_other: false, options: [{ index: 0, label: "自己" }, { index: 1, label: "团队" }] }] } };

test("AC-26 any plugin that asks first gets the shared question card, with its own footer line and its words escaped", () => {
  const answer = withPluginInteraction(asked) as InteractionRequestResult;
  const html = answer.interaction.html!;
  assert.match(html, /data-ix-question="q-notes-1"/);
  assert.match(html, /data-ix-field="q0"/);
  assert.match(html, /data-ix-option="1"/);
  assert.match(html, /回答后接着整理。/, "the plugin's own footer line, not one the Host writes for it");
  assert.match(html, /&lt;b&gt;记给谁&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>记给谁/);
  assert.deepEqual({ ...answer.interaction, html: undefined }, { ...asked.interaction, html: undefined }, "the rest of the answer is left as the plugin gave it");
  assert.match((withPluginInteraction({ ...asked, interaction: { ...asked.interaction, note: undefined } }) as InteractionRequestResult).interaction.html!, /回答后接着做。/);
});

test("AC-26 a refusal whose details name question problems gets each field's line, whatever its code", () => {
  const refused = withPluginInteraction({ error: "有 1 题的回答不能提交", code: "notes.answer_invalid", details: { problems: [{ question: 0, reason: "required" }, { question: 2, reason: "unknown-option" }] } });
  assert.deepEqual((refused as { details: { errors: unknown } }).details.errors, { q0: "这一题需要回答", q2: "选项已经变化，请重新选择" });
});

test("AC-26 answers that only look alike pass through untouched", () => {
  for (const body of [
    { status: "needs_input" },
    { status: "needs_input", interaction: { interaction_id: "x", why: "w", questions: [] } },
    { status: "needs_input", interaction: { interaction_id: "x", why: "w", questions: [{ prompt: "no index" }] } },
    { error: "x", code: "workflows.invalid", details: { problems: ["第 2 步缺少输入"] } },
    { error: "x", code: "notes.invalid", details: { problems: [{ question: 0, reason: "required" }], errors: { q0: "已写好" } } },
    { status: "done", form: {} }, null, "text",
  ]) assert.deepEqual(withPluginInteraction(body), body, JSON.stringify(body));
});
