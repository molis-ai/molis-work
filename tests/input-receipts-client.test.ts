import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { INPUT_RECEIPTS_CLIENT_SCRIPT, INPUT_RECEIPTS_EN } from "@molis-ai/molis-work-design-system";
import { fillMessage } from "@molis-ai/molis-work-plugin-sdk";

// specs/ai-input-receipts §3.3, §3.6, §4.2, §4.3 (stage 3c): the one receipt Coding and the Assistant show under a
// supplement. The shipped program runs here on a small DOM port.
const focus: { on: Node | null } = { on: null };
class Node {
  className = ""; textContent = ""; parent: Node | null = null; children: Node[] = []; dataset: Record<string, string> = {};
  attributes = new Map<string, string>(); listeners = new Map<string, Array<(event: object) => void>>();
  open = false; type = ""; disabled = false; value = ""; selectionStart = 0; focused = 0; revealed = 0;
  constructor(public tag: string) {}
  addEventListener(type: string, listener: (event: object) => void) { this.listeners.set(type, [...this.listeners.get(type) ?? [], listener]); }
  fire(type: string, event: object = {}) { for (const listener of this.listeners.get(type) ?? []) listener({ preventDefault() {}, stopPropagation() {}, ...event }); }
  click() { this.fire("click"); }
  focus() { this.focused++; focus.on = this; }
  contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector: string): Node[] { return selector === "button" ? this.buttons() : []; }
  scrollIntoView() { this.revealed++; }
  remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } }
  prepend(...nodes: Node[]) { const rest = this.children; this.children = []; this.append(...nodes); for (const child of rest) { this.children.push(child); } }
  get childElementCount() { return this.children.length; }
  querySelector(selector: string): Node | null {
    const wanted = selector.split(" ").at(-1)!.replace(/^\./u, "");
    return wanted === "summary" ? this.find(node => node.tag === "summary") : this.find(node => node.className.split(" ").includes(wanted));
  }
  find(match: (node: Node) => boolean): Node | null {
    for (const child of this.children) { if (match(child)) return child; const found = child.find(match); if (found) return found; }
    return null;
  }
  buttons(): Node[] { return [...(this.tag === "button" ? [this] : []), ...this.children.flatMap(child => child.buttons())]; }
  button(label: string): Node { const found = this.buttons().find(node => node.text === label); assert.ok(found, `a button 「${label}」`); return found; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  append(...nodes: Array<Node | string>) {
    for (const node of nodes) {
      const child = typeof node === "string" ? Object.assign(new Node("#text"), { textContent: node }) : node;
      child.parent?.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = this; this.children.push(child);
    }
  }
  replaceChildren(...nodes: Node[]) { for (const child of this.children) child.parent = null; this.children = []; this.append(...nodes); }
  get isConnected(): boolean { return this.tag === "body" || Boolean(this.parent?.isConnected); }
  get text(): string { return this.textContent + this.children.map(child => child.text).join(""); }
  all(className: string): Node[] {
    return this.children.flatMap(child => [...(child.className.split(" ").includes(className) ? [child] : []), ...child.all(className)]);
  }
}

// The surfaces that draw receipts and trays: the Assistant's thread, Coding's conversation.
const here = {} as Element, beside = {} as Element;
type Turn = { turn_id: string; kind: string; text: string; steer?: Record<string, unknown> };
type Actions = { withdraw(inputId: string): Promise<string | void>; correct(about: string, text: string, key: string): Promise<string | void> };
// The page's translate (`globalThis.L`, apps/workbench/src/i18n.ts): the catalog's words, then filled by the SDK's `fillMessage`.
type Translate = (text: string, vars?: Record<string, string | number>) => string;
const translate = (catalog: Readonly<Record<string, string>> = {}): Translate => (text, vars) => fillMessage(catalog[text] ?? text, vars);
function receipts(catalog?: Readonly<Record<string, string>>) {
  const body = new Node("body");
  let keys = 0;
  const program = vm.runInNewContext(`(${INPUT_RECEIPTS_CLIENT_SCRIPT})`, {
    document: { createElement: (tag: string) => new Node(tag), body, get activeElement() { return focus.on; } }, queueMicrotask, crypto: { randomUUID: () => `key-${++keys}` },
  }) as (L: Translate) => { line(owner: object, turn: Turn, round?: object, act?: Actions): Node | null; tray(owner: object, queued: object[] | undefined, round?: object, act?: Pick<Actions, "withdraw">): Node | null;
    link(owner: object, inputId: string, first?: () => void): Node | null; step(state: string): string; agreements(owner: object, runs: string[]): Node | null };
  const ui = program(translate(catalog));
  const said = () => new Promise<string[]>(resolve => setTimeout(() => resolve(body.children.map(node => node.textContent)), 0));
  return { ui, body, said };
}
const claim = { treatment: "later-step", kind: "request", targets: [{ kind: "board-node", board: "plan", id: "n4" }], impacts: ["scope", "acceptance"],
  note: "放到第 4 步一起测", tool_call_id: "call-9", revisions: 2 };
const supplement = (steer: Record<string, unknown>): Turn => ({ turn_id: "t1", kind: "user", text: "顺便把注册接口也覆盖一下", steer: { id: "steer-1", ...steer } });

test("RCPT-311, RC-12: the fact line says only the ledger's state, and the model's claim is a separate line marked as what the AI says", () => {
  const { ui } = receipts();
  const facts = ["received", "applied", "read", "unread", "withdrawn"].map(state => ui.line(here, { ...supplement({ state }), turn_id: state })!.all("mw-receipt__fact")[0]!.text);
  assert.deepEqual(facts, ["已送达", "已放进上下文，等 AI 回应", "AI 已读到", "这一轮结束时 AI 没读到，留给下一轮", "已撤回"]);
  const root = ui.line(here, supplement({ state: "read", model_claim: claim }))!;
  assert.equal(root.all("mw-receipt__fact")[0]!.text, "AI 已读到", "a claim never moves the fact");
  assert.equal(root.all("mw-receipt__claim")[0]!.text, "AI 说留到后面某一步 · 影响范围、验收条件");
  const claimed = root.all("mw-receipt__claimed")[0]!;
  assert.match(claimed.text, /^AI 自己说的，Molis 没有核对/u, "the detail puts the claim under its own heading");
  assert.match(claimed.text, /说明过 2 次，以最新一次为准 · 工具调用 call-9/u);
  assert.match(claimed.text, /“放到第 4 步一起测”/u);
  assert.equal(root.all("mw-receipt__facts")[0]!.text.includes("留到后面"), false, "the run record holds no claim");
  assert.match(root.all("mw-receipt__note")[0]!.text, /读到不代表已遵循/u, "the caveat is text, not a tooltip");
});

test("RCPT-311 questions and the waiting round: a supplement sent while a question waits says so, and an open question shows", () => {
  const { ui } = receipts();
  assert.equal(ui.line(here, supplement({ state: "applied" }), { awaiting_input: [{}] })!.all("mw-receipt__fact")[0]!.text, "已补充到这一轮；问题仍在等你回答");
  const asked = ui.line(here, { ...supplement({ state: "read", questions: [{ pending_id: "pend-2", state: "open" }] }), turn_id: "t2" })!;
  assert.equal(asked.all("mw-receipt__ask")[0]!.text, "为这条问了你问题，等你回答");
  const ended = ui.line(here, { ...supplement({ state: "unread", questions: [{ pending_id: "pend-2", state: "unresolved" }] }), turn_id: "t3" })!;
  assert.equal(ended.all("mw-receipt__ask")[0]!.text, "为这条问的问题没等到回答");
});

test("RCPT-311, RC-12: the Host's note gets the Host's mark, never a receipt; turns without a supplement get nothing", () => {
  const { ui } = receipts();
  const note = ui.line(here, { turn_id: "n", kind: "notice", text: "宿主说明", steer: { id: "s", state: "read" } })!;
  assert.equal(note.text, "Molis 的说明，不是你发的话");
  assert.equal(note.all("mw-receipt__fact").length, 0);
  assert.equal(ui.line(here, { turn_id: "u", kind: "user", text: "任务" }), null);
  assert.equal(ui.line(here, { turn_id: "h", kind: "notice", text: "其他宿主说明" }), null, "other Host notices stay as they are");
  assert.equal(ui.line(here, { turn_id: "a", kind: "assistant", text: "好的", steer: { id: "s", state: "read" } }), null);
});

test("RCPT-312, RC-15: a change is made in place and said once on the page's status region, naming the supplement; the first paint says nothing", async () => {
  const { ui, said } = receipts();
  const first = ui.line(here, supplement({ state: "applied" }))!;
  assert.equal(first.getAttribute("aria-live"), "off", "the receipt does not speak through a surrounding log");
  assert.deepEqual(await said(), [], "the first paint is not news");
  first.setAttribute("open", "");
  assert.equal(ui.line(here, supplement({ state: "applied" })), first);
  assert.deepEqual(await said(), [], "an unchanged redraw is not news");
  assert.equal(ui.line(here, supplement({ state: "read", model_claim: claim })), first, "the same element, so an open detail stays open");
  assert.equal(first.getAttribute("open"), "");
  assert.deepEqual(await said(), ["你的补充「顺便把注册接口也覆盖一下」：AI 已读到；AI 说你的补充「顺便把注册接口也覆盖一下」：留到后面某一步 · 影响范围、验收条件"]);
});

test("RCPT-312, RC-15, D28: a receipt is known by its round and input; turn ids repeat in every round", async () => {
  const { ui, said } = receipts();
  const turn = (input: string, state: string): Turn => ({ turn_id: "user-4", kind: "user", text: "补一条回归测试", steer: { id: input, state } });
  // One repaint draws the old round, then the new one, whose supplement has the same turn id.
  const paint = (state: string) => [ui.line(here, turn("steer-1", "read"), { run_id: "run-1" }), ui.line(here, turn("steer-9", state), { run_id: "run-2" })];
  const [old, fresh] = paint("received");
  assert.notEqual(old, fresh, "two supplements, two receipts");
  assert.deepEqual(await said(), [], "a new supplement's first receipt is not a change");
  paint("received"); paint("read");
  assert.deepEqual(await said(), ["你的补充「补一条回归测试」：AI 已读到"], "the new supplement moving on is said once, and 已送达 is never said");
});

test("RCPT-312, D28: a supplement carried into the next round under the same input id has a receipt in each round, and they never take turns being said", async () => {
  const { ui, said } = receipts();
  const turn = (state: string): Turn => ({ turn_id: "user-2", kind: "user", text: "改完补一条回归测试", steer: { id: "steer-6", state } });
  const paint = (carried: string) => [ui.line(here, turn("unread"), { run_id: "run-1" }), ui.line(here, turn(carried), { run_id: "run-2" })];
  const [old, carried] = paint("applied");
  assert.notEqual(old, carried, "the round that did not read it and the round that carried it each keep their own receipt");
  paint("applied");
  assert.deepEqual(await said(), [], "repaints say nothing");
  paint("read");
  assert.deepEqual(await said(), ["你的补充「改完补一条回归测试」：AI 已读到"], "only the carrying round's move is said");
});

/** The page's side of the receipt's actions, recording each call; `fail` makes the next one throw these words. */
function actions() {
  const calls: unknown[][] = [], next: { fail?: string } = {};
  const answer = async (words: string, call: unknown[]) => { calls.push(call); if (next.fail) { const fail = next.fail; next.fail = undefined; throw new Error(fail); } return words; };
  const act: Actions = { withdraw: inputId => answer("", ["withdraw", inputId]), correct: (about, text, key) => answer("", ["correct", about, text, key]) };
  return { act, calls, next };
}
const settled = () => new Promise(resolve => setTimeout(resolve, 0));

test("RCPT-324: a supplement no model has seen can be taken back from its receipt; one it has seen says to send a correction instead", async () => {
  const { ui } = receipts(), { act, calls } = actions();
  const received = ui.line(here, supplement({ state: "received" }), { run_id: "run-1" }, act)!;
  received.button("撤回").click();
  await settled();
  assert.deepEqual(calls, [["withdraw", "steer-1"]]);
  for (const state of ["applied", "read"]) {
    const seen = ui.line(here, { ...supplement({ state }), turn_id: state }, { run_id: "run-1" }, act)!;
    assert.equal(seen.buttons().some(node => node.text === "撤回"), false, `RCPT-324 ${state}: no withdrawal`);
    assert.match(seen.text, /AI 已看到，不能撤回；要改口就发更正。/u);
    assert.ok(seen.button("更正…"));
  }
  const left = ui.line(here, { ...supplement({ state: "unread" }), turn_id: "u" }, { run_id: "run-1" }, act)!;
  assert.equal(left.buttons().some(node => node.text === "撤回"), false, "RCPT-324 one left waiting in the session is the session's to give back (the tray)");
  const withdrawn = ui.line(here, { ...supplement({ state: "withdrawn" }), turn_id: "w" }, { run_id: "run-1" }, act)!;
  assert.equal(withdrawn.buttons().length, 0, "RCPT-324 one taken back offers nothing more");
  assert.equal(ui.line(here, { ...supplement({ state: "received" }), turn_id: "x" }, { run_id: "run-1" })!.buttons().length, 0, "RCPT-324 without the page's actions it only shows");
});

test("RCPT-324: a correction is the person's own words, filled from a few phrases they edit, sent with about naming the input", async () => {
  const { ui, said } = receipts(), { act, calls, next } = actions();
  const root = ui.line(here, supplement({ state: "read", model_claim: claim }), { run_id: "run-1" }, act)!;
  root.button("更正…").click();
  const form = root.find(node => node.tag === "form")!, area = form.find(node => node.tag === "textarea")!;
  assert.equal(root.open, true); assert.ok(area.focused, "the words box takes focus");
  assert.equal(root.buttons().some(node => node.text === "更正…"), false, "one form at a time");
  assert.deepEqual(form.buttons().map(node => node.text), ["不是「留到后面某一步」，而是：", "这条针对的是：", "补充一句：", "发送更正", "取消"], "RCPT-324 the first phrase names what the AI says it does");
  form.button("这条针对的是：").click();
  assert.equal(area.value, "这条针对的是：");
  form.button("补充一句：").click();
  assert.equal(area.value, "补充一句：", "an untouched phrase is replaced");
  form.fire("submit");
  assert.equal(calls.length, 0, "RCPT-324 a phrase alone is not sent");
  assert.match(form.text, /写上要改成什么/u);
  area.value = "补充一句：注册接口只测失败路径";
  form.button("不是「留到后面某一步」，而是：").click();
  assert.equal(area.value, "补充一句：注册接口只测失败路径\n不是「留到后面某一步」，而是：", "RCPT-324 the person's own words are kept; a phrase is added after them");
  area.value = "补充一句：注册接口只测失败路径";

  next.fail = "没确认送到：再按一次，同一条不会重复。";
  form.fire("submit");
  await settled();
  assert.match(form.text, /没确认送到/u, "RCPT-324 a failure stays in the form, with the words");
  assert.equal(area.value, "补充一句：注册接口只测失败路径");
  form.fire("submit");
  await settled();
  assert.deepEqual(calls, [["correct", "steer-1", "补充一句：注册接口只测失败路径", "key-1"], ["correct", "steer-1", "补充一句：注册接口只测失败路径", "key-1"]],
    "RCPT-324 the same words sent again after a lost answer keep their key, so they count once");
  assert.equal(root.find(node => node.tag === "form"), null, "sent: the form closes");
  assert.ok((await said()).includes("更正已发出"));
  assert.ok(root.button("更正…").focused, "focus returns to where the form was opened");

  root.button("更正…").click();
  const again = root.find(node => node.tag === "form")!;
  again.find(node => node.tag === "textarea")!.value = "另一句";
  again.fire("submit");
  await settled();
  assert.equal(calls.at(-1)![3], "key-2", "RCPT-324 new words are a new correction");
});

test("RCPT-324: a correction being written survives every repaint, and Esc or 取消 closes it", async () => {
  const { ui } = receipts(), { act } = actions();
  const root = ui.line(here, supplement({ state: "applied" }), { run_id: "run-1" }, act)!;
  root.button("更正…").click();
  const form = root.find(node => node.tag === "form")!, area = form.find(node => node.tag === "textarea")!;
  area.value = "其实先别动数据库";
  assert.equal(ui.line(here, supplement({ state: "read", model_claim: claim }), { run_id: "run-1" }, act), root, "the round moved on");
  assert.equal(root.find(node => node.tag === "form"), form, "RCPT-324 the same form, not a new one");
  assert.equal(root.children.at(-1), form, "it stays after the detail");
  assert.equal(area.value, "其实先别动数据库", "RCPT-324 the words are untouched");
  assert.equal(root.all("mw-receipt__fact")[0]!.text, "AI 已读到", "what comes before it is drawn again");
  let stopped = 0;
  form.fire("keydown", { key: "Escape", stopPropagation: () => { stopped++; } });
  assert.equal(root.find(node => node.tag === "form"), null);
  assert.equal(stopped, 1, "Esc closes the form and goes no further");
  root.button("更正…").click();
  root.find(node => node.tag === "form")!.button("取消").click();
  assert.equal(root.find(node => node.tag === "form"), null);
});

test("RCPT-325: the original says what it was changed to and the correction what it corrects, both read from about on the ledger", async () => {
  const { ui, said } = receipts(), { act } = actions();
  const original = ui.line(here, supplement({ state: "read" }), { run_id: "run-1" }, act)!;
  const turn = (state: string): Turn => ({ turn_id: "t5", kind: "user", text: "只测失败路径", steer: { id: "steer-5", state, about: "steer-1" } });
  const correction = ui.line(here, turn("received"), { run_id: "run-1" }, act)!;
  assert.equal(correction.all("mw-receipt__link")[0]!.text, "纠正：针对「顺便把注册接口也覆盖一下」");
  assert.equal(original.all("mw-receipt__link")[0]!.text, "你改为：「只测失败路径」", "RCPT-325 the original's receipt changes as soon as its correction is seen");
  assert.deepEqual(await said(), [], "a link is not a change of state");
  original.button("看更正").click();
  assert.equal(correction.open, true); assert.equal(correction.revealed, 1);
  correction.button("看原来那条").click();
  assert.equal(original.open, true); assert.equal(original.revealed, 1);
  ui.line(here, supplement({ state: "read" }), { run_id: "run-1" }, act); ui.line(here, turn("read"), { run_id: "run-1" }, act);
  assert.equal(original.all("mw-receipt__link").length, 1, "repaints add nothing");
  const lone = ui.line(here, { turn_id: "t6", kind: "user", text: "改成只看日志", steer: { id: "steer-6", state: "read", about: "steer-0" } }, { run_id: "run-2" })!;
  assert.equal(lone.all("mw-receipt__link")[0]!.text, "纠正：针对更早的一条", "RCPT-325 an original the page did not draw is still named as earlier");
});

test("RCPT-324: focus on the detail's buttons survives a repaint, landing on the redrawn copy", () => {
  const { ui } = receipts(), { act } = actions();
  const root = ui.line(here, supplement({ state: "applied" }), { run_id: "run-1" }, act)!;
  root.button("更正…").focus();
  ui.line(here, supplement({ state: "read", model_claim: claim }), { run_id: "run-1" }, act);
  const now = root.button("更正…");
  assert.equal(focus.on, now, "the new 更正… has focus");
  root.find(node => node.tag === "summary")!.focus();
  ui.line(here, supplement({ state: "read", model_claim: { ...claim, revisions: 3 } }), { run_id: "run-1" }, act);
  assert.equal(focus.on, root.find(node => node.tag === "summary"), "focus on the summary goes to the new summary");
  focus.on = null;
});

// Stage 3b-2b (§4.4, D37, D38): the tray lists only what the ledger has, for Coding and the Assistant alike.
const drawn = (ui: ReturnType<typeof receipts>["ui"], act?: Actions, owner = here) => {
  const turn = (id: string, text: string, steer: Record<string, unknown>): Turn => ({ turn_id: id, kind: "user", text, steer: { id, ...steer } });
  ui.line(owner, turn("old-read", "上一轮读到的", { state: "read" }), { run_id: "run-1" }, act);
  for (const [id, text, steer] of [
    ["s-read", "顺便看注册接口", { state: "read" }], ["s-said", "改用新 fixture", { state: "read", model_claim: { ...claim, treatment: "apply-now" } }],
    ["s-not", "把缓存也删掉", { state: "read", model_claim: { ...claim, treatment: "not-adopted" } }],
    ["s-clarify", "换个说法", { state: "applied", model_claim: { ...claim, treatment: "needs-clarification" } }],
    ["s-asked", "测试放哪", { state: "read", questions: [{ pending_id: "p1", state: "open" }] }],
    ["s-left", "错误提示用中文", { state: "unread" }], ["s-back", "不要动数据库", { state: "withdrawn" }], ["s-new", "再补一句", { state: "received" }],
  ] as const) ui.line(owner, turn(id, text, steer), { run_id: "run-2" }, act);
};
const groups = (tray: Node) => tray.all("mw-tray__list").map(list => [list.getAttribute("aria-label"), list.children.map(item => item.buttons().map(node => node.text))]);

test("RCPT-331, D37: the tray lists only what the ledger has, from the latest round and the session's queue, each in a labelled list of buttons", () => {
  const { ui } = receipts(), { act } = actions();
  drawn(ui, act);
  const tray = ui.tray(here, [{ input_id: "s-left", text: "错误提示用中文" }, { input_id: "q-late", text: "提示文案再短一点" }], { run_id: "run-2" }, act)!;
  assert.equal(tray.all("mw-receipt__fact")[0]!.text, "6 条还没处理完");
  assert.deepEqual(groups(tray), [
    ["排着，下一轮开始时带上", [["错误提示用中文", "撤回"], ["撤回"]]],
    ["AI 读到了，没说怎么处理", [["顺便看注册接口"]]],
    ["AI 说暂不采纳或需要你澄清", [["把缓存也删掉"], ["换个说法"]]],
    ["为它问的问题还没回答", [["测试放哪"]]],
  ], "RCPT-331 an earlier round, a claim that adopts it, one taken back and one not yet seen are not listed; a queued one is listed once");
  assert.match(tray.text, /提示文案再短一点/u, "one sent straight to the session has nothing to open: taking it back is its button");
  assert.match(tray.text, /AI 说暂不采纳或需要你澄清.*AI 自己说的，Molis 没有核对/su, "RCPT-331 the AI's own words are marked as such");
  assert.equal(ui.tray(here, [], { run_id: "run-9" }, act), null, "nothing open, no tray");
});

test("RCPT-332, D38: an item opens its receipt and moves focus there; 撤回 takes a waiting one back through the page", async () => {
  const { ui } = receipts(), { act, calls } = actions();
  drawn(ui, act);
  const read = ui.line(here, { turn_id: "s-read", kind: "user", text: "顺便看注册接口", steer: { id: "s-read", state: "read" } }, { run_id: "run-2" }, act)!;
  const tray = ui.tray(here, [{ input_id: "q-late", text: "提示文案再短一点" }], { run_id: "run-2" }, act)!;
  tray.button("顺便看注册接口").click();
  assert.equal(read.open, true, "RCPT-332 its receipt opens");
  assert.equal(focus.on, read.find(node => node.tag === "summary"), "RCPT-332 focus moves to the receipt");
  tray.button("撤回").click();
  await settled();
  assert.deepEqual(calls, [["withdraw", "q-late"]], "RCPT-332 the page's own withdraw, with the input id");
  assert.equal(ui.tray(here, [], { run_id: "run-2" })!.buttons().some(node => node.text === "撤回"), false, "without the page's actions it only lists");
});

test("RCPT-333: the tray is one element across repaints, and its count is said once when it changes, never on the first paint", async () => {
  const { ui, said } = receipts();
  drawn(ui);
  const queue = [{ input_id: "q-1", text: "补一条" }];
  const tray = ui.tray(here, queue, { run_id: "run-2" })!;
  tray.open = true;
  assert.deepEqual(await said(), [], "RCPT-333 the first paint is not news");
  assert.equal(ui.tray(here, queue.map(one => ({ ...one })), { run_id: "run-2" }), tray);
  assert.deepEqual(await said(), [], "an unchanged repaint says nothing");
  assert.equal(ui.tray(here, [...queue, { input_id: "q-2", text: "再补一条" }], { run_id: "run-2" }), tray, "the same element, so an open tray stays open");
  assert.equal(tray.open, true);
  assert.deepEqual(await said(), ["6 条还没处理完"], "RCPT-333 a changed count is said once, on the page's status region");
});

test("RCPT-334, 3b-2c: a queue that was not read is not an empty one, and a new round is not news", async () => {
  const { ui, said } = receipts();
  drawn(ui);
  const tray = ui.tray(here, undefined, { run_id: "run-2" })!;
  assert.deepEqual(groups(tray).map(([label]) => label), ["AI 读到了，没说怎么处理", "AI 说暂不采纳或需要你澄清", "为它问的问题还没回答"], "RCPT-334 not read: the tray says nothing of the queue");
  const read = (state: Record<string, unknown>): Turn => ({ turn_id: "r-1", kind: "user", text: "改用新 fixture", steer: { id: "r-1", state: "read", ...state } });
  ui.line(here, read({}), { run_id: "run-3" });
  assert.ok(ui.tray(here, undefined, { run_id: "run-3" }));
  ui.line(here, read({ model_claim: { ...claim, treatment: "apply-now" } }), { run_id: "run-3" });
  assert.equal(ui.tray(here, undefined, { run_id: "run-3" }), null, "nothing left open in the round");
  assert.deepEqual((await said()).filter(text => text.includes("处理完")), [], "RCPT-334 with the queue unread, none left in the round is not said as none left at all");
  ui.line(here, read({}), { run_id: "run-4" });
  assert.ok(ui.tray(here, [], { run_id: "run-4" }));
  ui.line(here, read({ model_claim: { ...claim, treatment: "apply-now" } }), { run_id: "run-4" });
  assert.equal(ui.tray(here, [], { run_id: "run-4" }), null);
  const told = (await said()).filter(text => text.includes("处理完"));
  assert.equal(told.at(-1)?.split("；").at(-1), "没有还没处理完的了", "read and empty: that one is said");
  assert.doesNotMatch(told.join("；"), /\d 条还没处理完/u, "RCPT-334 the count a new round starts with is not said as a change in the last one's");
});

test("RCPT-337, 3b-2c: one tray per surface that draws it, so the Assistant and a Coding page showing the same round each keep their own", async () => {
  const { ui, said } = receipts();
  drawn(ui); drawn(ui, undefined, beside);
  const mine = ui.tray(here, [{ input_id: "q-1", text: "补一条" }], { run_id: "run-2" })!, theirs = ui.tray(beside, undefined, { run_id: "run-2" })!;
  assert.notEqual(mine, theirs, "RCPT-337 two surfaces, two elements");
  assert.equal(groups(mine)[0]![0], "排着，下一轮开始时带上");
  assert.equal(groups(theirs)[0]![0], "AI 读到了，没说怎么处理", "RCPT-337 each draws its own queue: one not read stays not read beside one that was");
  assert.equal(ui.tray(here, [{ input_id: "q-1", text: "补一条" }], { run_id: "run-2" }), mine, "each keeps its own element across repaints");
  assert.equal(ui.tray(beside, undefined, { run_id: "run-2" }), theirs);
  assert.deepEqual(await said(), [], "RCPT-337 the other surface's paint is no change in this one's count, so nothing is said twice");
});

// Stage 3d-2 (§4.5): a step's report that names a supplement, seen from both ends; the report is the AI's words.
const board = (inputId: string) => ({ nodes: [
  { reports: [{ note: "建好 fixture", inputs: [] }] },
  { reports: [{ note: "已按补充改用新 fixture", inputs: [{ session_id: "s", input_id: inputId }] }] },
  { inserted: true, reports: [{ note: "补了注册接口的用例", inputs: [{ session_id: "s", input_id: inputId }] }] },
] });

test("RCPT-344, 3d-2: the receipt quotes each step report that names it, under the AI's own heading, keyed as on the plan card", () => {
  const { ui } = receipts();
  const root = ui.line(here, supplement({ state: "read" }), { run_id: "run-1", step_board: board("steer-1") })!;
  const claimed = root.all("mw-receipt__claimed")[0]!;
  assert.match(claimed.text, /^AI 自己说的，Molis 没有核对步骤报告提到它S2 “已按补充改用新 fixture”插入 “补了注册接口的用例”$/u, "RCPT-344 quoted next to the AI's note heading, S2 and 插入 as the plan card keys them");
  assert.doesNotMatch(root.text, /建好 fixture|已生效/u, "a report that does not name it is not shown, and nothing is said to have taken effect (D21)");
  assert.equal(root.all("mw-receipt__fact")[0]!.text, "AI 已读到", "RCPT-344 a report moves no fact");
  assert.equal(ui.line(here, supplement({ state: "read" }), { run_id: "run-1", step_board: board("steer-1") }), root);
  assert.equal(ui.line(here, { ...supplement({ state: "read" }), turn_id: "t2", steer: { id: "steer-2", state: "read" } }, { run_id: "run-1", step_board: board("steer-1") })!.all("mw-receipt__claimed").length, 0, "no report names it: no AI heading at all");
  const unread = ui.line(here, { ...supplement({ state: "read" }), turn_id: "t3", steer: { id: "steer-3", state: "read" } }, { run_id: "run-2" })!;
  assert.equal(unread.all("mw-receipt__claimed").length, 0, "RCPT-344 a board not read this time is not a board with no reports: nothing is drawn");
  const later = ui.line(here, supplement({ state: "read" }), { run_id: "run-1", step_board: { nodes: [...board("steer-1").nodes, { reports: [{ note: "又跑了一遍", inputs: [{ session_id: "s", input_id: "steer-1" }] }] }] } })!;
  assert.equal(later, root, "the same element");
  assert.match(later.all("mw-receipt__claimed")[0]!.text, /S4 “又跑了一遍”$/u, "RCPT-344 a new report redraws it");
});

test("RCPT-345, 3d-2: link opens a receipt this page drew, after the caller's own step, and is null when it drew none", () => {
  const { ui } = receipts();
  const root = ui.line(here, supplement({ state: "read" }), { run_id: "run-1" })!;
  assert.equal(ui.link(here, "steer-9"), null, "RCPT-345 not drawn on this page (an earlier round): no button that does nothing");
  const order: string[] = [];
  const link = ui.link(here, "steer-1", () => order.push(`first, focus ${focus.on === root.find(node => node.tag === "summary") ? "there" : "elsewhere"}`))!;
  assert.equal(link.text, "关于补充「顺便把注册接口也覆盖一下」");
  focus.on = null;
  link.click();
  assert.deepEqual(order, ["first, focus elsewhere"], "the caller's step runs before the receipt opens (a dialog closes first)");
  assert.equal(root.open, true, "RCPT-345 the receipt opens");
  assert.equal(focus.on, root.find(node => node.tag === "summary"), "RCPT-345 focus lands on its summary");
  assert.ok(ui.link(here, "steer-1"), "without a step of its own it still opens");
  assert.equal(ui.link(here, "steer-1", undefined, "来自补充「")!.text, "来自补充「顺便把注册接口也覆盖一下」", "RCPT-353, 3d-3: a step added for it says where it came from");
  focus.on = null;
});

// Stage 3d-4 (§4.3, D21): what the board records about the step added for a supplement, apart from what the AI says.
const added = (state: string, extra: Record<string, unknown> = {}) => ({ nodes: [
  { state: "succeeded", reports: [{ note: "建好 fixture", at_ms: 1, by: { kind: "session", label: "本会话" } }] },
  { state, title: "注册接口失败路径测试", inserted: true, origins: [{ session_id: "s", input_id: "steer-1" }], reports: [{ note: "用户插入：注册接口失败路径测试；完成条件：测试通过", at_ms: 2, by: { kind: "person", label: "用户" } }], ...extra },
] });

test("RCPT-354, 3d-4: the step the board says was added for it is a fact of the records, said apart from what the AI says", () => {
  const { ui } = receipts();
  const root = ui.line(here, supplement({ state: "read", model_claim: { ...claim, treatment: "new-task" } }), { run_id: "run-1", step_board: added("not-started") })!;
  const facts = root.all("mw-receipt__facts")[0]!;
  assert.match(facts.text, /为它加的步骤插入「注册接口失败路径测试」 · 你加的 · 现在：等待前一步$/u, "RCPT-354 its key and title as on the plan card, that a person added it, and its state now");
  const body = root.all("mw-receipt__body")[0]!.text;
  assert.ok(body.indexOf("记录里的") < body.indexOf("为它加的步骤") && body.indexOf("为它加的步骤") < body.indexOf("AI 自己说的，Molis 没有核对"), "RCPT-354 the records' side is named, and the AI's side stays under its own heading");
  assert.doesNotMatch(root.all("mw-receipt__claimed")[0]!.text, /为它加的步骤/u, "the step is not among what the AI says");
  assert.equal(root.all("mw-receipt__fact")[0]!.text, "AI 已读到", "a step moves no fact line");
  const later = ui.line(here, supplement({ state: "read", model_claim: { ...claim, treatment: "new-task" } }), { run_id: "run-1", step_board: added("succeeded") })!;
  assert.equal(later, root, "the same element");
  assert.match(later.all("mw-receipt__facts")[0]!.text, /现在：模型报告完成$/u, "RCPT-354 the state is read again; done is the model's report, not a check");
  const alone = ui.line(here, { ...supplement({ state: "read" }), turn_id: "t2" }, { run_id: "run-2", step_board: added("running") })!;
  assert.doesNotMatch(alone.text, /记录里的/u, "with nothing the AI said beside it, the facts need no heading");
  assert.match(alone.all("mw-receipt__facts")[0]!.text, /现在：进行中$/u);
  assert.equal(ui.step("blocked"), "受阻，等你决定", "RCPT-356 the same words are handed to the plan card, so one state is never named two ways");
});

test("RCPT-355, 3d-4: only what the board records is shown; nothing is worked out from report times or order", () => {
  const { ui } = receipts();
  const root = ui.line(here, supplement({ state: "read" }), { run_id: "run-1", step_board: added("running", { inserted: undefined, title: undefined }) })!;
  assert.match(root.all("mw-receipt__facts")[0]!.text, /为它加的步骤S2 · 现在：进行中$/u, "RCPT-355 no title, not marked as a person's: neither is said");
  assert.doesNotMatch(root.text, /版|14:|加入|已生效/u, "RCPT-355 no board version, no time it was added, and nothing said to have taken effect");
  const other = ui.line(here, { ...supplement({ state: "read" }), turn_id: "t2", steer: { id: "steer-2", state: "read" } }, { run_id: "run-1", step_board: added("running") })!;
  assert.doesNotMatch(other.text, /为它加的步骤/u, "a step added for another supplement is not this one's");
  const unread = ui.line(here, { ...supplement({ state: "read" }), turn_id: "t3" }, { run_id: "run-3" })!;
  assert.doesNotMatch(unread.text, /为它加的步骤/u, "a board not read this time shows no step");
});

test("RCPT-366, 3d-4: a step a person holds is said as their own mark, never as the model's report", () => {
  const { ui } = receipts();
  const now = (turn: string, state: string, owner?: object) => ui.line(here, { ...supplement({ state: "read" }), turn_id: turn }, { run_id: turn, step_board: added(state, owner ? { owner } : {}) })!
    .all("mw-receipt__facts")[0]!.text.split(" · 现在：").at(-1);
  assert.deepEqual([now("model-done", "succeeded", { kind: "session" }), now("model-failed", "failed"), now("mine-done", "succeeded", { kind: "person" }), now("mine-failed", "failed", { kind: "person" })],
    ["模型报告完成", "模型报告失败", "你标记完成", "你标记失败"], "RCPT-366 the model's report and the person's mark read apart, as on Coding's plan card");
  assert.equal(now("mine-running", "running", { kind: "person" }), "进行中", "a step the person holds but has not ended reads as any running step");
  const root = ui.line(here, supplement({ state: "read" }), { run_id: "run-1", step_board: added("succeeded") })!;
  ui.line(here, supplement({ state: "read" }), { run_id: "run-1", step_board: added("succeeded", { owner: { kind: "person" } }) });
  assert.match(root.all("mw-receipt__facts")[0]!.text, /现在：你标记完成$/u, "RCPT-366 who ended it is part of what is redrawn");
  // The word is picked by a dynamic key (`L(mine && MARK[state] || STEP[state])`), so the translation gate cannot see a missing English entry: draw each mark.
  const english = (state: string) => receipts(INPUT_RECEIPTS_EN).ui.line(here, supplement({ state: "read" }), { run_id: "run-1", step_board: added(state, { owner: { kind: "person" } }) })!.all("mw-receipt__facts")[0]!.text;
  assert.match(english("succeeded"), / · now: You marked it done$/u, "RCPT-366 the person's mark of done has its English");
  assert.match(english("failed"), / · now: You marked it failed$/u, "RCPT-366 the person's mark of failed has its English");
});

// The receipt is kept per surface, like the tray: the Assistant showing a round Coding runs, beside the Coding page.
test("RCPT-348: one receipt per surface that draws it; a correction updates every copy, and link finds only its own surface's", async () => {
  const { ui, said } = receipts();
  const mine = ui.line(here, supplement({ state: "read" }), { run_id: "run-1" })!, theirs = ui.line(beside, supplement({ state: "read" }), { run_id: "run-1" })!;
  assert.notEqual(mine, theirs, "RCPT-348 two surfaces, two elements");
  assert.equal(ui.line(here, supplement({ state: "read" }), { run_id: "run-1" }), mine, "each keeps its own across repaints");
  const fix = { turn_id: "t2", kind: "user", text: "不是这个意思，而是：只看登录", steer: { id: "steer-2", state: "received", about: "steer-1" } };
  ui.line(here, fix, { run_id: "run-1" }); ui.line(beside, fix, { run_id: "run-1" });
  for (const copy of [mine, theirs]) assert.equal(copy.all("mw-receipt__link")[0]?.text, "你改为：「不是这个意思，而是：只看…」", "RCPT-348 the correction changes both copies of its original");
  assert.equal(ui.link(beside, "steer-1")!.text, "关于补充「顺便把注册接口也覆盖一下」");
  ui.link(beside, "steer-1")!.click();
  assert.equal([theirs.open, mine.open].join(), "true,false", "RCPT-348 link opens the copy on its own surface");
  assert.equal(ui.link({} as Element, "steer-1"), null, "a surface that drew none has no link");
  assert.match(ui.tray(beside, undefined, { run_id: "run-1" })!.text, /顺便把注册接口/u, "the surface's tray lists its own receipts");
  assert.equal(ui.tray({} as Element, undefined, { run_id: "run-1" }), null, "and a surface that drew none has nothing open");
  const announced = (await said()).join("；");
  assert.equal(announced.split("你的补充「顺便把注册接").length - 1, 0, "RCPT-348 two copies drawn once each say nothing twice");
  focus.on = null;
});

// Stage 3e-1 (§9.2): 「AI 记下的约定」, what the AI says it takes as a constraint, goal or acceptance condition.
const said = (kind: string | undefined, impacts: string[], treatment = "apply-now") => ({ treatment, ...(kind ? { kind } : {}), targets: [], impacts, revisions: 1 });
function agreed(ui: ReturnType<typeof receipts>["ui"], act?: Actions) {
  for (const [run, id, text, steer] of [
    ["run-1", "a-mail", "别直接发邮件给客户，我自己发", { state: "read", model_claim: said("constraint", ["approach"]) }],
    ["run-1", "a-time", "改到周五下午", { state: "read", model_claim: said("correction", ["objective", "acceptance"]) }],
    ["run-2", "a-no", "顺便把缓存删了", { state: "read", model_claim: said("constraint", ["constraint"], "not-adopted") }],
    ["run-2", "a-ask", "预算问题也要准备", { state: "read", model_claim: said("request", ["acceptance"], "needs-clarification") }],
    ["run-2", "a-back", "不要动数据库", { state: "withdrawn", model_claim: said("constraint", ["constraint"]) }],
    ["run-2", "a-scope", "议程里加一项续约报价", { state: "read", model_claim: said("supplement", ["scope", "outputs"]) }],
    ["run-2", "a-bare", "只说一句", { state: "read" }],
  ] as const) ui.line(here, { turn_id: id, kind: "user", text, steer: { id, ...steer } }, { run_id: run }, act);
}

test("RCPT-358, 3e-1: AI 记下的约定 lists, in the order sent, what the AI says it takes as a constraint, goal or acceptance condition, as the AI's word only", () => {
  const { ui } = receipts();
  agreed(ui);
  const kept = ui.agreements(here, ["run-1", "run-2"])!;
  assert.deepEqual(kept.all("mw-tray__list")[0]!.children.map(item => [item.buttons().map(node => node.text), item.all("mw-receipt__claim").map(node => node.text)]), [
    [["别直接发邮件给客户，我自己发"], ["AI 说采纳为约束"]],
    [["改到周五下午"], ["AI 说采纳为目标、验收条件"]],
  ], "RCPT-358 the person's whole words, then the AI's claim on the receipt's dashed 「AI 说」 line; not adopted, to clarify, withdrawn, other impacts and no statement are left out");
  assert.match(kept.text, /AI 自己说的，Molis 没有核对；要改，打开那条发更正。只看了最近 2 轮$/u, "RCPT-358 said to be unchecked, changed by a correction from its receipt, and what it looked at");
  assert.doesNotMatch(kept.text, /已生效|已遵循|已核对/u, "RCPT-358 nothing reads as in force or checked");
  assert.equal(ui.agreements(here, ["run-9"]), null, "none in the rounds shown, no block");
});

test("RCPT-359, 3e-1: only the rounds the surface shows now count; a later correction is said beside the one it names; each opens its receipt", () => {
  const { ui } = receipts(), { act } = actions();
  agreed(ui, act);
  assert.deepEqual(ui.agreements(here, ["run-2"]), null, "another work's rounds drawn earlier on the same surface are not this one's");
  ui.line(here, { turn_id: "a-fix", kind: "user", text: "邮件可以由你发，但先给我看", steer: { id: "a-fix", state: "received", about: "a-mail" } }, { run_id: "run-2" }, act);
  const kept = ui.agreements(here, ["run-1", "run-2"])!, first = kept.all("mw-tray__list")[0]!.children[0]!;
  assert.match(first.text, /后来有一条更正指向它$/u, "RCPT-359 the person's own link on the ledger is said, not what the correction changed");
  first.button("别直接发邮件给客户，我自己发").click();
  const receipt = ui.line(here, { turn_id: "a-mail", kind: "user", text: "别直接发邮件给客户，我自己发", steer: { id: "a-mail", state: "read", model_claim: said("constraint", ["approach"]) } }, { run_id: "run-1" }, act)!;
  assert.equal(receipt.open, true, "RCPT-359 it opens its receipt, where 更正… is");
  assert.ok(receipt.buttons().some(node => node.text === "更正…"));
  // A list that reads the same is not drawn again; its button still opens the latest drawing, here in the round it was carried into (D28).
  const carried = ui.line(here, { turn_id: "a-time", kind: "user", text: "改到周五下午", steer: { id: "a-time", state: "read", model_claim: said("correction", ["objective", "acceptance"]) } }, { run_id: "run-2" }, act)!;
  receipt.open = false;
  kept.all("mw-tray__list")[0]!.children[1]!.button("改到周五下午").click();
  assert.equal(carried.open, true, "RCPT-359 an item kept from an earlier drawing opens the input's latest receipt, not the one it was drawn from");
});

test("RCPT-367, 3e-1: the list's closing words are whole sentences, the count's with its own for one round, so they translate whole; the AI's notes are not a Goal's agreement", () => {
  const read = (catalog: Readonly<Record<string, string>> | undefined, runs: string[]) => {
    const { ui } = receipts(catalog);
    agreed(ui);
    return ui.agreements(here, runs)!.all("mw-receipt__note").at(-1)!.text;
  };
  assert.equal(read(undefined, ["run-1"]), "AI 自己说的，Molis 没有核对；要改，打开那条发更正。只看了最近 1 轮");
  assert.equal(read(undefined, ["run-1", "run-2"]), "AI 自己说的，Molis 没有核对；要改，打开那条发更正。只看了最近 2 轮");
  assert.equal(read(INPUT_RECEIPTS_EN, ["run-1"]), "What the AI says itself; Molis has not checked it. To change one, open it and send a correction. Only the latest round was read.",
    "RCPT-367 one round reads as one round");
  assert.equal(read(INPUT_RECEIPTS_EN, ["run-1", "run-2"]), "What the AI says itself; Molis has not checked it. To change one, open it and send a correction. Only the latest 2 rounds were read.",
    "RCPT-367 the count is filled into the translated sentence, not glued to pieces of it");
  assert.equal(INPUT_RECEIPTS_EN[" 轮"], undefined, "RCPT-367 no fragment is left to translate on its own");
  assert.equal(INPUT_RECEIPTS_EN["AI 自己说的，Molis 没有核对；要改，打开那条发更正。只看了最近 "], undefined, "RCPT-367 nor the sentence cut before its count");
  assert.equal(INPUT_RECEIPTS_EN["当前约定"], undefined, "RCPT-367 the shared receipt does not name the Assistant's block, least of all with the Goal's word for a confirmed agreement");
});
