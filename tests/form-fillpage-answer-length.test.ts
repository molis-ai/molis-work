import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";
import { formFillPageHtml, FORM_ANSWER_FORMAT } from "@molis-ai/molis-work-plugin-form";
import type { FormQuestion, FormRecord } from "@molis-ai/molis-work-plugin-form/contract";
import { openFormStore } from "./fixtures/plugin-home-stores.js";

// RAC-2725: the exported fill page caps an answer by characters (code points), exactly the rule the workbench's answer fields
// (src/browser/fields.ts, T-234) apply: one emoji is one character, and a `maxlength` attribute (UTF-16 units) would stop an emoji
// answer at half the limit. The cap runs after an input method finishes composing, never in the middle of a composition.
//
// The checks below run the handlers of the page that is actually shipped: the page's own script builds the questions and binds
// its listeners against a minimal DOM, and the unmodified `buildFields` source of the workbench fields is executed the same way.
// Both are then driven with the same emoji / ASCII / mixed boundary answers, so a page whose `input` handler is gone fails here
// instead of being covered by a text match on the template (the text match is kept as structural evidence only).

type Listener = (event: { preventDefault(): void }) => void;

/** The few DOM properties the two scripts touch, with listeners that a test can fire itself. */
class FakeElement {
  readonly nodeType = 1;
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  textContent = "";
  value = "";
  type = "";
  name = "";
  id = "";
  htmlFor = "";
  checked = false;
  required = false;
  hidden = false;
  className = "";
  title = "";
  maxLength = 0;
  lang = "";
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  private readonly listeners = new Map<string, Listener[]>();
  readonly classList = {
    add: (name: string) => { if (!this.className.split(/\s+/u).includes(name)) this.className = `${this.className} ${name}`.trim(); },
    remove: (name: string) => { this.className = this.className.split(/\s+/u).filter(item => item && item !== name).join(" "); },
    toggle: () => {},
    contains: (name: string) => this.className.split(/\s+/u).includes(name),
  };
  constructor(readonly tagName: string) {}
  append(...nodes: Array<FakeElement | { textContent: string }>) { for (const node of nodes) this.appendChild(node); }
  appendChild(node: FakeElement | { textContent: string }) { if (node instanceof FakeElement) { node.parent = this; this.children.push(node); } return node; }
  replaceChildren(...nodes: Array<FakeElement | { textContent: string }>) { this.children.length = 0; this.append(...nodes); }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  getAttribute(name: string) { return this.attributes[name] ?? null; }
  removeAttribute(name: string) { delete this.attributes[name]; }
  addEventListener(type: string, fn: Listener) { const list = this.listeners.get(type) ?? []; list.push(fn); this.listeners.set(type, list); }
  removeEventListener() {}
  /** Fire what the browser would fire, onto the handlers the page registered. */
  fire(type: string) { for (const fn of this.listeners.get(type) ?? []) fn({ preventDefault() {} }); }
  hasListeners(type: string) { return (this.listeners.get(type) ?? []).length > 0; }
  querySelectorAll(selector: string) { return descendants(this).filter(node => matchSelector(node, selector)); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  matches(selector: string) { return matchSelector(this, selector); }
  closest(selector: string) { let node: FakeElement | null = this; while (node) { if (matchSelector(node, selector)) return node; node = node.parent; } return null; }
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  reset() { for (const node of descendants(this)) if (node instanceof FakeInput) node.value = ""; }
  click() {}
}
class FakeInput extends FakeElement { constructor() { super("input"); } }
class FakeSelect extends FakeElement { constructor() { super("select"); } }
class FakeLabel extends FakeElement { constructor() { super("label"); } }
class FakeOption { constructor(readonly text: string, readonly value: string) {} }
class FakeBlob { constructor(readonly parts: unknown[]) {} }

const descendants = (root: FakeElement): FakeElement[] => root.children.flatMap(child => [child, ...descendants(child)]);

/** The one attribute-looking value a selector may test; properties the scripts assign (type, dataset) count as attributes. */
const attribute = (node: FakeElement, name: string): string | undefined => {
  if (name.startsWith("data-")) {
    const key = name.slice(5).replace(/-([a-z])/gu, (_match, letter: string) => letter.toUpperCase());
    return (node.dataset as Record<string, string>)[key];
  }
  return node.attributes[name] ?? (name === "type" ? (node.type || undefined) : undefined);
};

const matchOne = (node: FakeElement, raw: string): boolean => {
  let rest = raw.trim();
  const tag = /^([a-zA-Z][\w-]*)/u.exec(rest);
  if (tag) { if (node.tagName.toLowerCase() !== tag[1]!.toLowerCase()) return false; rest = rest.slice(tag[1]!.length); }
  while (rest.length) {
    const not = /^:not\(([^)]*)\)/u.exec(rest);
    if (not) { if (matchOne(node, not[1]!)) return false; rest = rest.slice(not[0].length); continue; }
    if (rest.startsWith(":checked")) { if (!node.checked) return false; rest = rest.slice(":checked".length); continue; }
    const attr = /^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/u.exec(rest);
    if (attr) { const got = attribute(node, attr[1]!); if (got === undefined) return false; if (attr[2] !== undefined && got !== attr[2]) return false; rest = rest.slice(attr[0].length); continue; }
    const cls = /^\.([\w-]+)/u.exec(rest);
    if (cls) { if (!node.className.split(/\s+/u).includes(cls[1]!)) return false; rest = rest.slice(cls[0].length); continue; }
    return false;
  }
  return true;
};
const matchSelector = (node: FakeElement, selector: string) => selector.split(",").some(part => matchOne(node, part));

/** A page document: the ids the page script reaches for, and the nodes it builds children under. */
const pageDocument = (dataJson: string) => {
  const byId = new Map<string, FakeElement>();
  const node = (id: string, tag = "div") => { const element = new FakeElement(tag); element.id = id; byId.set(id, element); return element; };
  const documentElement = node("html", "html"), body = node("body", "body");
  const form = node("f", "form"), questions = node("qs"), error = node("e", "p"), title = node("t", "h1"), lede = node("d", "p");
  const go = node("go", "button"), hint = node("h", "p"), ok = node("ok"), okTitle = node("okt", "h1"), okLede = node("okd", "p"), again = node("again", "button");
  const data = node("form-data", "script"); data.textContent = dataJson;
  form.append(title, lede, questions, error, go, hint);
  ok.append(okTitle, okLede, again);
  body.append(form, ok, node("foot", "p"));
  const document = {
    documentElement, body,
    createElement: (tag: string) => tag === "input" ? new FakeInput() : tag === "select" ? new FakeSelect() : tag === "label" ? new FakeLabel() : new FakeElement(tag),
    createTextNode: (text: string) => ({ textContent: text }),
    getElementById: (id: string) => byId.get(id) ?? descendants(body).find(element => element.id === id) ?? null,
  };
  return { document, byId: (id: string) => byId.get(id)! };
};

/** Run the complete script the exported fill page ships, against the stub document above. */
const runFillPage = (form: FormRecord) => {
  const html = formFillPageHtml(form);
  const dataJson = /<script id="form-data" type="application\/json">([\s\S]*?)<\/script>/u.exec(html)?.[1];
  const script = /<script>\n([\s\S]*?)\n<\/script>\s*<\/body>/u.exec(html)?.[1];
  assert.ok(dataJson && script, "the page ships its data and its script");
  const page = pageDocument(dataJson);
  const context = vm.createContext({ document: page.document, navigator: { language: "zh-CN" }, crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000000" },
    Blob: FakeBlob, URL: { createObjectURL: () => "blob:fixture" }, Option: FakeOption });
  vm.runInContext(script, context, { filename: "fillpage.js" });
  const input = page.byId("qs").querySelectorAll("input").find(node => node.type === "text");
  assert.ok(input instanceof FakeInput, "the page built the answer box");
  return { html, input, error: page.byId("e") };
};

/** Run the unmodified `buildFields` source of the workbench fields (src/browser/fields.ts) against the same stub DOM. */
const runWorkbenchFields = async (questions: readonly FormQuestion[], limit: number) => {
  const source = await readFile(new URL("../plugins/native/form/src/browser/fields.ts", import.meta.url), "utf8");
  const code = transformSync(source, { loader: "ts", format: "cjs", target: "node22" }).code;
  const page = pageDocument("{}");
  const module = { exports: {} as Record<string, unknown> };
  const requireModule = (specifier: string) => {
    if (specifier === "../fillpage.js") return { FORM_ANSWER_LIMIT: limit };
    if (specifier === "./dom.js") return { make: (tag: string, className?: string, text?: string) => {
      const node = page.document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
    } };
    throw new Error(`unexpected import in fields.ts: ${specifier}`);
  };
  new Function("require", "module", "exports", "document", "crypto", "Option", "HTMLLabelElement", "HTMLInputElement", "HTMLSelectElement", code)(
    requireModule, module, module.exports, page.document, { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    FakeOption, FakeLabel, FakeInput, FakeSelect);
  const container = new FakeElement("div");
  (module.exports.buildFields as (L: (key: string) => string, target: FakeElement, questions: readonly FormQuestion[]) => void)((key: string) => key, container, questions);
  const input = container.querySelectorAll("input").find(node => node.type === "text");
  assert.ok(input instanceof FakeInput, "the workbench fields built the answer box");
  return { input };
};

const textQuestion = (): FormQuestion => ({ id: "words", title: "备注", type: "text" });

test("RAC-2725 the shipped fill page handlers and the workbench fields cap the same answers by characters", async t => {
  const home = await mkdtemp(join(tmpdir(), "form-fillpage-cap-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const store = openFormStore(home);
  let form: FormRecord;
  try { form = store.receive("a", "fillpage-cap", "长度", [textQuestion()]); }
  finally { store.close(); }

  const page = runFillPage(form);
  const limit = Number(/每题回答最多 (\d+) 个字/u.exec(page.html)?.[1]);
  assert.equal(limit, 4000, "the page names FORM_ANSWER_LIMIT");
  const fields = await runWorkbenchFields(form.questions, limit);
  const inputs = ["", "a", "🟢", "a".repeat(limit - 1), "a".repeat(limit), "a".repeat(limit + 1),
    "🟢".repeat(limit / 2), "🟢".repeat(limit / 2 + 1), "a".repeat(limit - 1) + "🟢", "🟢" + "a".repeat(limit),
    "a".repeat(limit * 2) + "🟢", "混🟢".repeat(limit / 2)];
  for (const text of inputs) {
    page.input.value = text; page.input.fire("input");
    fields.input.value = text; fields.input.fire("input");
    const fromPage = page.input.value, fromFields = fields.input.value;
    assert.equal(fromPage, fromFields, `the page and the fields agree on ${[...text].length} characters (${JSON.stringify(text.slice(0, 8))}…)`);
    assert.equal(fromPage, [...text].slice(0, limit).join(""), `the same characters the form keeps: ${[...text].length} in`);
    assert.ok([...fromPage].length <= limit, "at most the form's characters");
    assert.doesNotMatch(fromPage, /[\uD800-\uDBFF]$/u, "never leaves half a character at its end");
  }

  // Structural evidence only (kept from the first round): a text match proves the template says it, not that the handlers run.
  const fieldsSource = await readFile(new URL("../plugins/native/form/src/browser/fields.ts", import.meta.url), "utf8");
  assert.match(fieldsSource, /input\.value\.length > FORM_ANSWER_LIMIT && \[\.\.\.input\.value\]\.length > FORM_ANSWER_LIMIT/u, "fields.ts counts characters, not units");
  assert.match(fieldsSource, /\[\.\.\.input\.value\]\.slice\(0, FORM_ANSWER_LIMIT\)\.join\(""\)/u, "and cuts at whole characters");
  const { html } = page;
  assert.match(html, /addEventListener\("compositionstart"/u, "the page binds a composition start handler");
  assert.match(html, /addEventListener\("compositionend"/u, "the page binds a composition end handler");
  assert.match(html, /addEventListener\("input", capNow\)/u, "the page binds its cap to input events");
  assert.doesNotMatch(html, /maxLength/u, "no maxlength attribute: it counts UTF-16 units and would stop an emoji answer at half the limit");
});

test("RAC-2725 the fill page does not cap during an input method composition and caps once it ends", async t => {
  const home = await mkdtemp(join(tmpdir(), "form-fillpage-compose-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const store = openFormStore(home);
  let form: FormRecord;
  try { form = store.receive("a", "fillpage-compose", "组词", [textQuestion()]); }
  finally { store.close(); }
  const page = runFillPage(form), input = page.input, error = page.error;
  const limit = Number(/每题回答最多 (\d+) 个字/u.exec(page.html)?.[1]);
  assert.ok(input.hasListeners("compositionstart") && input.hasListeners("compositionend") && input.hasListeners("input"),
    "the page's answer box actually carries the three handlers (not just their names in the template)");

  // An over-limit answer arrives while the input method is still composing: the box keeps it whole, and no too-long line shows yet.
  const duringComposition = "🟢".repeat(limit + 1);
  assert.ok([...duringComposition].length > limit, `${[...duringComposition].length} characters is over the limit`);
  input.fire("compositionstart");
  input.value = duringComposition;
  input.fire("input");
  assert.equal(input.value, duringComposition, "the box is not cut in the middle of a composition");
  assert.equal(error.textContent, "", "and the too-long line waits for the composition to end");

  // The composition ends: the cap now runs, to whole characters, and says the page's own too-long sentence.
  input.fire("compositionend");
  assert.equal(input.value, "🟢".repeat(limit), "the cap runs when the composition ends, at whole characters");
  assert.match(error.textContent, new RegExp(`每题回答最多 ${limit} 个字`, "u"), "the page's own too-long sentence is shown");

  // Once no composition is running, ordinary typing is capped as it goes, and coming back under the limit clears the line.
  input.value = "a".repeat(limit + 1);
  input.fire("input");
  assert.equal(input.value, "a".repeat(limit), "typing is capped as it goes");
  input.value = "短回答";
  input.fire("input");
  assert.equal(input.value, "短回答", "an answer under the limit is untouched");
  assert.equal(error.textContent, "", "and the too-long line is cleared");
});

// RAC-2725 (second half): an answer file's size is checked in UTF-8 bytes, the size people see on disk, not in UTF-16 units, so a
// file over 400,000 bytes is refused however few units its text takes.
test("RAC-2725 an answer file over 400,000 UTF-8 bytes is refused, even when its UTF-16 units are under the limit", async t => {
  const home = await mkdtemp(join(tmpdir(), "form-import-bytes-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const store = openFormStore(home);
  try {
    const form = store.receive("a", "bytes-answer", "大小", [{ id: "q", title: "备注", type: "text" }]);
    const answer = (answerId: string, pad: string) => ({ name: `${answerId}.molis-answer.json`, content: JSON.stringify({ format: FORM_ANSWER_FORMAT,
      form_id: form.id, form_version: form.version, answer_id: answerId, submitted_at: "2026-10-31T00:00:00.000Z", questions: form.questions,
      answers: { q: "好" }, pad }) });
    const small = answer("bytes-answer-01", "");
    assert.equal(store.importAnswers(form.id, [small], "a").imported, 1, "a small answer imports");
    const multibyte = answer("bytes-answer-02", "汉".repeat(140_000));
    assert.ok(multibyte.content.length < 400_000 && Buffer.byteLength(multibyte.content) > 400_000,
      `${multibyte.content.length} UTF-16 units but ${Buffer.byteLength(multibyte.content)} UTF-8 bytes`);
    const refused = store.importAnswers(form.id, [multibyte], "a");
    assert.deepEqual([refused.imported, refused.rejected.length], [0, 1], "the file is refused, not imported");
    assert.match(refused.rejected[0]!.reason, /文件过大/u, "and named as too large");
  } finally { store.close(); }
});
