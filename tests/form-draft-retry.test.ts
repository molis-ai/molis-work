import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { buildSync } from "esbuild";

// specs/ai-interaction-experience S1 (AC-26), QA-002: Forms' 「AI 生成题目」 as the page runs it, bundled from its browser source
// the way the plugin's client pack is and run here on a small DOM port. A follow-up the Host refused leaves its reason on the
// editor's note line; tried again, a card the model asked properly takes that reason back, takes focus and can be answered,
// and the form gains no question until the person answers. An answer the Host sends back field by field takes back the reason
// an earlier answer failed with. The note line is the page's own (`showNote`, and the draft's filter `draftNote`, both from
// status.ts): only what the draft said is taken back, never what a save or a publication left there.

const bundle = (file: string, globalName: string) => buildSync({ entryPoints: [fileURLToPath(new URL(`../plugins/native/form/src/browser/${file}`, import.meta.url))],
  bundle: true, write: false, format: "iife", globalName, platform: "browser", target: "es2022" }).outputFiles[0]!.text;
const DRAFT = bundle("draft.ts", "FormDraft"), STATUS = bundle("status.ts", "FormStatus");

class Element {
  hidden = true; inert = false; disabled = false; children: Element[] = [];
  constructor(readonly html = "") {}
  append(...nodes: Element[]) { this.children.push(...nodes); }
  replaceChildren() { this.children = []; }
}
class Template { content = { firstElementChild: null as Element | null }; set innerHTML(html: string) { this.content.firstElementChild = html ? new Element(html) : null; } }
/** The editor's one note line, as `showNote` paints it. */
class NoteLine {
  hidden = true; textContent = ""; marks = new Set<string>();
  classList = { toggle: (name: string, on: boolean) => { if (on) this.marks.add(name); else this.marks.delete(name); } };
  scrollIntoView() {}
}

const PROMPT = "另做一份培训反馈问卷，请先问我面向哪种学员和题量。";
const REFUSED = "模型想先问几个问题，但问题写得不完整，请把要求写得更具体后重试";
const CARD = "<section data-ix-card><fieldset data-ix-question=\"0\">面向哪种学员？</fieldset><fieldset data-ix-question=\"1\">要几题？</fieldset></section>";
const FORM = { id: "form-1", version: 3, title: "培训反馈", questions: ["你的部门", "总体满意度", "讲师表现", "其他建议"].map((title, index) => ({ id: `q${index}`, title, type: "text" })) };
const NEEDS_INPUT = async () => ({ status: "needs_input", interaction: { interaction_id: "draft-2", html: CARD } });
// Everything here is promise work, so one turn of the event loop lets a whole send run its course.
const settle = () => new Promise(resolve => setImmediate(resolve));

type Status = { showNote(page: object, text: string, isError: boolean, scope?: string): void; draftNote(page: object, text: string, isError: boolean): unknown };

function page(replies: Array<() => Promise<unknown>>) {
  const frames: Array<() => void> = [], sent: Array<Record<string, unknown>> = [], done: Array<typeof FORM> = [];
  const cards: Array<{ card: Element; submit: () => void; focused: string[]; shown: Array<{ errors: unknown; focus: unknown }>; destroyed: boolean }> = [];
  const ask = new Element(), button = new Element(), prompt = { value: PROMPT };
  const noteLine = new NoteLine(), editor = { note: noteLine, noteScope: "" };
  const { showNote, draftNote } = vm.runInNewContext(`${STATUS};FormStatus`, {}) as Status;
  const { formDraft } = vm.runInNewContext(`${DRAFT};FormDraft`, { HTMLElement: Element, document: { createElement: () => new Template() }, requestAnimationFrame: (run: () => void) => frames.push(run) });
  const draft = formDraft({
    host: { interaction: (card: Element, { onSubmit }: { onSubmit: () => void }) => {
      const bound = { card, submit: onSubmit, focused: [] as string[], shown: [] as Array<{ errors: unknown; focus: unknown }>, destroyed: false, read: () => ({ q0: ["1"], q1: ["0"] }),
        showErrors(errors: unknown, options?: { focus?: unknown }) { bound.shown.push({ errors, focus: options?.focus }); },
        focusField(id: string) { bound.focused.push(id); }, destroy() { bound.destroyed = true; } };
      cards.push(bound);
      return bound;
    } },
    request: async (_method: string, path: string, body: Record<string, unknown>) => { assert.equal(path, "/form-1/draft-questions"); sent.push(body); return replies.shift()!(); },
    L: (text: string) => text, ask, prompt, button, form: () => FORM, done: async (record: typeof FORM) => { done.push(record); },
    // The same one-line port the page gives the draft (client.ts), over the note line's real code.
    note: (text: string, isError: boolean) => draftNote(editor, text, isError),
  }) as { start(): Promise<void> };
  return { draft, ask, button, prompt, frames, sent, done, cards, editor,
    get line() { return { text: noteLine.textContent, error: noteLine.marks.has("is-error") }; },
    /** Something other than the draft writes on the note line (a save, a publication, another button). */
    say: (text: string, isError: boolean, scope = "") => showNote(editor, text, isError, scope) };
}

test("AC-26, QA-002: after a refused follow-up, the retry's card takes focus and can be answered, the old error is gone, and nothing is added before the answer", async () => {
  const refused = Object.assign(new Error(REFUSED), { code: "form.invalid" });
  const p = page([() => Promise.reject(refused), NEEDS_INPUT,
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
  assert.deepEqual(p.done, [], "no question is added before the person answers");

  p.cards[0]!.submit();
  await settle();
  // The body is built inside the page's realm; it is compared by value.
  assert.deepEqual(JSON.parse(JSON.stringify(p.sent[2])), { prompt: PROMPT, expected_version: 3, interaction: { interaction_id: "draft-2", values: { q0: ["1"], q1: ["0"] } } },
    "the answer goes on with the same request and the card it answers");
  assert.deepEqual(p.done.map(record => record.questions.length), [5], "only then does the form gain its questions");
  assert.equal(p.ask.hidden, true);
  assert.equal(p.cards[0]!.destroyed, true);
});

test("AC-26, QA-002: an answer sent back field by field takes back the reason an earlier answer failed with, and marks the fields on the card", async () => {
  const conflict = Object.assign(new Error("这份问卷刚被改过，请刷新后再试"), { code: "form.version_conflict" });
  const errors = { q0: "请选一项", q1: "题数要在 1 到 20 之间" };
  const fields = Object.assign(new Error("有两个问题没答好"), { code: "form.invalid", details: { errors } });
  const p = page([NEEDS_INPUT, () => Promise.reject(conflict), () => Promise.reject(fields)]);

  await p.draft.start();
  for (const run of p.frames.splice(0)) run();
  const card = p.cards[0]!;

  card.submit();
  await settle();
  assert.deepEqual(p.line, { text: conflict.message, error: true }, "an answer refused for no field's sake says why on the note line");
  assert.deepEqual(card.shown, [], "and marks no field");

  card.submit();
  await settle();
  assert.deepEqual(card.shown, [{ errors, focus: true }], "the fields the Host named are marked on the card, focus on the first");
  assert.deepEqual(p.line, { text: "", error: false }, "QA-002 the earlier reason is taken back, not shown beside the field errors");
  assert.equal(p.editor.noteScope, "");
  assert.equal(p.sent.length, 3);
  assert.equal(p.cards.length, 1, "it is still the one card, with the person's picks");
  assert.equal(card.destroyed, false);
  assert.equal(p.ask.hidden, false);
  assert.equal(p.ask.inert, false, "and it can be answered again");
  assert.deepEqual(p.done, [], "no question is added");
});

test("AC-26, QA-002: a card that stands takes back only what the draft said, not what a save, a publication or another button left on the note line", async () => {
  for (const scope of ["save", "publication", "required", ""]) {
    const text = `别处留下的话（${scope || "没有范围"}）`;
    const p = page([NEEDS_INPUT]);
    p.say(text, true, scope);
    await p.draft.start();
    for (const run of p.frames.splice(0)) run();
    assert.equal(p.ask.hidden, false, "the card stands");
    assert.deepEqual(p.line, { text, error: true }, `a note in scope "${scope}" stays`);
    assert.equal(p.editor.noteScope, scope);
  }
});
