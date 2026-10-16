import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { ASSISTANT_RECEIPTS_FACTORY_SCRIPT } from "@molis-ai/molis-work-app-workbench";

// specs/ai-input-receipts §3.3, §4.1, §4.2, D14 (stage 1e): the receipt line under the person's supplements in the
// Assistant, and the chip that says what Send does while a question waits. The shipped script runs here on a small DOM port.
class Node {
  textContent = ""; title = ""; hidden = true; dataset: Record<string, string> = {}; children: Node[] = []; parent: Node | null = null;
  listeners: Array<() => void> = [];
  constructor(public tag = "", public className = "") {}
  addEventListener(_type: string, listener: () => void) { this.listeners.push(listener); }
  click() { for (const listener of this.listeners) listener(); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
}

function page() {
  const chip = new Node("button"), thread = new Node("div");
  const el = (tag: string, className: string, text: string) => Object.assign(new Node(tag, className), { textContent: text });
  const ui = vm.runInNewContext(`(${ASSISTANT_RECEIPTS_FACTORY_SCRIPT})`, {})({ L: (text: string) => text, el, chip }) as {
    line(node: Node, put: (node: Node) => void, turn: object, round: object): void; paint(round: object | undefined): void; target(): string | undefined;
  };
  const put = (node: Node) => { if (node.parent !== thread) { node.parent = thread; thread.children.push(node); } };
  return { ui, chip, thread, put };
}
const steer = (state: string) => ({ turn_id: "t1", kind: "user", text: "顺便看一下截图", steer: { id: "steer-1", state } });
const asking = (revision = 1) => ({ phase: "awaiting-input", awaiting_input: [{ pending_id: "q1", pending_revision: revision, allows_free_text: true }] });
const running = { phase: "running", awaiting_input: [] };

test("RC-14: the line under a supplement says only what the runtime's record says, and a supplement sent to a waiting question says it still waits", () => {
  const { ui, thread, put } = page();
  const words = (state: string, round: object = running) => { ui.line(thread, put, steer(state), round); return thread.children.map(node => node.textContent); };
  assert.deepEqual(["received", "applied", "read", "unread", "withdrawn"].map(state => words(state)[0]),
    ["已送达", "已放进上下文，等 AI 回应", "AI 已读到", "这一轮结束时 AI 没读到，留给下一轮", "已撤回"]);
  assert.deepEqual(words("received", asking()), ["已补充到这一轮；上面的问题仍在等你"], "one line per supplement, never a second");
  assert.deepEqual(words("read", asking()), ["AI 已读到"], "once read, the line says so even while the question waits");
  assert.match(thread.children[0]!.title, /读到不代表已遵循.*补充要求不代替回答问题/u);
  const { ui: other, thread: own, put: place } = page();
  other.line(own, place, { turn_id: "t2", kind: "user", text: "帮我记一个问题" }, running);
  other.line(own, place, { turn_id: "t3", kind: "notice", text: "Molis 的说明", steer: { id: "s", state: "read" } }, running);
  assert.equal(own.children.length, 0, "the person's own task and the Host's notes have no receipt");
});

test("RC-15: a changed receipt is a new line, so the thread's live region reads it; a redraw keeps the same line", () => {
  const { ui, thread, put } = page();
  ui.line(thread, put, steer("applied"), running);
  const first = thread.children[0]!;
  ui.line(thread, put, steer("applied"), running);
  assert.equal(thread.children[0], first, "an unchanged receipt is not news");
  ui.line(thread, put, steer("read"), running);
  assert.notEqual(thread.children[0], first);
  assert.deepEqual(thread.children.map(node => node.textContent), ["AI 已读到"]);
});

test("RC-14: the chip shows only while the round waits on its one free-text question, starts at answering it, and one click switches", () => {
  const { ui, chip } = page();
  ui.paint(running);
  assert.equal(chip.hidden, true); assert.equal(ui.target(), undefined, "with nothing waiting, Send adds to the round");
  ui.paint(asking());
  assert.equal(chip.hidden, false); assert.equal(chip.textContent, "回答上面的问题"); assert.equal(ui.target(), "answer");
  chip.click();
  assert.equal(chip.textContent, "补充这一轮"); assert.match(chip.title, /回答上面的问题/u); assert.equal(ui.target(), "steer");
  ui.paint(asking());
  assert.equal(ui.target(), "steer", "a redraw keeps the person's choice");
  ui.paint(asking(2));
  assert.equal(ui.target(), "answer", "a new question starts again at answering it");
  ui.paint({ phase: "awaiting-input", awaiting_input: [{ pending_id: "q2", pending_revision: 1, allows_free_text: true, questions: [{ prompt: "选哪个？" }] }] });
  assert.equal(chip.hidden, true, "a questionnaire is answered on its own card, not from the composer");
  ui.paint(undefined);
  assert.equal(ui.target(), undefined);
});
