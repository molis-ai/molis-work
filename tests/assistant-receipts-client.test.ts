import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { ASSISTANT_RECEIPTS_FACTORY_SCRIPT } from "@molis-ai/molis-work-app-workbench";

// specs/ai-input-receipts §3.3, §4.1, §4.2, D14 (stages 1e, 3c): where the Assistant puts the shared receipt under the
// person's supplements, and the chip that says what Send does while a question waits. The shipped script runs here on a small DOM port.
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
  // The receipt itself is the design system's shared one (tests/input-receipts-client.test.ts); here it is a stand-in that
  // keeps one element per turn, as the shared one does.
  const made = new Map<string, Node>();
  const shared = { line: (turn: { turn_id: string; kind: string; steer?: { state: string } }) =>
    turn.kind === "user" && turn.steer ? made.get(turn.turn_id) ?? made.set(turn.turn_id, new Node("details", "mw-receipt")).get(turn.turn_id)! : null };
  const ui = vm.runInNewContext(`(${ASSISTANT_RECEIPTS_FACTORY_SCRIPT})`, {})({ L: (text: string) => text, shared, chip }) as {
    line(node: Node, put: (node: Node) => void, turn: object, round: object): void; paint(round: object | undefined): void; target(): string | undefined;
  };
  const put = (node: Node) => { if (node.parent !== thread) { node.parent = thread; thread.children.push(node); } };
  return { ui, chip, thread, put };
}
const steer = (state: string) => ({ turn_id: "t1", kind: "user", text: "顺便看一下截图", steer: { id: "steer-1", state } });
const asking = (revision = 1) => ({ phase: "awaiting-input", awaiting_input: [{ pending_id: "q1", pending_revision: revision, allows_free_text: true, from_composer: true }] });
const running = { phase: "running", awaiting_input: [] };

test("RC-14, RCPT-313: under a supplement the Assistant places the shared receipt, one per supplement, and removes it when the turn has none", () => {
  const { ui, thread, put } = page();
  ui.line(thread, put, steer("applied"), running);
  ui.line(thread, put, steer("read"), asking());
  assert.equal(thread.children.length, 1, "one receipt per supplement, never a second");
  assert.equal(thread.children[0]!.className, "mw-receipt"); assert.equal(thread.children[0]!.dataset.entry, "receipt:t1");
  ui.line(thread, put, { turn_id: "t1", kind: "user", text: "顺便看一下截图" }, running);
  assert.equal(thread.children.length, 0, "a turn that is not a supplement has no receipt");
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
  ui.paint({ phase: "awaiting-input", awaiting_input: [{ pending_id: "q2", pending_revision: 1, allows_free_text: true, questions: [{ prompt: "选哪个？", type: "choice" }] }] });
  assert.equal(chip.hidden, true, "a question the Host does not mark from_composer is answered on its own card (D34)");
  ui.paint(undefined);
  assert.equal(ui.target(), undefined);
});
