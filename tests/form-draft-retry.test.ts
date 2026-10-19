import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildSync } from "esbuild";

// specs/ai-interaction-experience S1 (AC-26), QA-002: Forms' 「AI 生成题目」 as the page runs it, bundled from its browser source
// the way the plugin's client pack is and run here on a small DOM port. A follow-up the Host refused leaves its reason on the
// editor's note line; tried again, a card the model asked properly takes that reason back, takes focus and can be answered,
// and the form gains no question until the person answers.

const { outputFiles } = buildSync({ entryPoints: [fileURLToPath(new URL("../plugins/native/form/src/browser/draft.ts", import.meta.url))],
  bundle: true, write: false, format: "iife", globalName: "FormDraft", platform: "browser", target: "es2022" });

class Element {
  hidden = true; inert = false; disabled = false; children: Element[] = [];
  constructor(readonly html = "") {}
  append(...nodes: Element[]) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
}
class Template { content = { firstElementChild: null as Element | null }; set innerHTML(html: string) { this.content.firstElementChild = html ? new Element(html) : null; } }

const PROMPT = "另做一份培训反馈问卷，请先问我面向哪种学员和题量。";
const REFUSED = "模型想先问几个问题，但问题写得不完整，请把要求写得更具体后重试";
const CARD = "<section data-ix-card><fieldset data-ix-question=\"0\">面向哪种学员？</fieldset><fieldset data-ix-question=\"1\">要几题？</fieldset></section>";
const FORM = { id: "form-1", version: 3, title: "培训反馈", questions: ["你的部门", "总体满意度", "讲师表现", "其他建议"].map((title, index) => ({ id: `q${index}`, title, type: "text" })) };

function page(replies: Array<() => Promise<unknown>>) {
  const frames: Array<() => void> = [], sent: Array<Record<string, unknown>> = [], done: Array<typeof FORM> = [], line = { text: "", error: false };
  const cards: Array<{ card: Element; submit: () => void; focused: string[]; destroyed: boolean }> = [];
  const ask = new Element(), button = new Element(), prompt = { value: PROMPT };
  const { formDraft } = vm.runInNewContext(`${outputFiles[0]!.text};FormDraft`, { document: { createElement: () => new Template() }, requestAnimationFrame: (run: () => void) => frames.push(run) });
  const draft = formDraft({
    host: { interaction: (card: Element, { onSubmit }: { onSubmit: () => void }) => {
      const bound = { card, submit: onSubmit, focused: [] as string[], destroyed: false, read: () => ({ q0: ["1"], q1: ["0"] }), showErrors() {},
        focusField(id: string) { bound.focused.push(id); }, destroy() { bound.destroyed = true; } };
      cards.push(bound);
      return bound;
    } },
    request: async (_method: string, path: string, body: Record<string, unknown>) => { assert.equal(path, "/form-1/draft-questions"); sent.push(body); return replies.shift()!(); },
    L: (text: string) => text, ask, prompt, button, form: () => FORM, done: async (record: typeof FORM) => { done.push(record); },
    note: (text: string, isError: boolean) => Object.assign(line, { text, error: isError }),
  }) as { start(): Promise<void> };
  return { draft, ask, button, prompt, frames, sent, done, line, cards };
}

test("AC-26, QA-002: after a refused follow-up, the retry's card takes focus and can be answered, the old error is gone, and nothing is added before the answer", async () => {
  const refused = Object.assign(new Error(REFUSED), { code: "form.invalid" });
  const p = page([() => Promise.reject(refused), async () => ({ status: "needs_input", interaction: { interaction_id: "draft-2", html: CARD } }),
    async () => ({ status: "done", form: { ...FORM, version: 4, questions: [...FORM.questions, { id: "q4", title: "课程长度合适吗？", type: "text" }] } })]);

  await p.draft.start();
  assert.deepEqual(p.line, { text: REFUSED, error: true }, "the refused follow-up says why");
  assert.equal(p.ask.hidden, true);

  await p.draft.start(); // 「AI 生成题目」 again, with the same request
  for (const run of p.frames.splice(0)) run();
  assert.deepEqual(p.line, { text: "", error: false }, "QA-002 the old generation error is taken back once the new card stands");
  assert.equal(p.ask.hidden, false);
  assert.deepEqual(p.ask.children.map(card => card.html), [CARD], "the new card is the one on the page");
  assert.equal(p.cards.length, 1);
  assert.equal(p.cards[0]!.card, p.ask.children[0], "and the shared client is bound to it");
  assert.deepEqual(p.cards[0]!.focused, ["q0"], "its first question takes focus");
  assert.equal(p.ask.inert, false, "the card is answerable, not held inert");
  assert.equal(p.button.disabled, false);
  assert.equal(p.prompt.value, PROMPT, "the person's request is kept");
  assert.deepEqual(p.sent.map(body => [body.prompt, "interaction" in body]), [[PROMPT, false], [PROMPT, false]]);
  assert.equal(p.done.length, 0, "no question is added before the person answers");
  assert.equal(FORM.questions.length, 4);

  p.cards[0]!.submit();
  await new Promise(resolve => setImmediate(resolve));
  // The body is built inside the page's realm; it is compared by value.
  assert.deepEqual(JSON.parse(JSON.stringify(p.sent[2])), { prompt: PROMPT, expected_version: 3, interaction: { interaction_id: "draft-2", values: { q0: ["1"], q1: ["0"] } } },
    "the answer goes on with the same request and the card it answers");
  assert.deepEqual(p.done.map(record => record.questions.length), [5], "only then does the form gain its questions");
  assert.equal(p.ask.hidden, true);
  assert.equal(p.cards[0]!.destroyed, true);
});
