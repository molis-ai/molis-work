import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { INPUT_RECEIPTS_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";

// specs/ai-input-receipts §3.3, §3.6, §4.2, §4.3 (stage 3c): the one receipt Coding and the Assistant show under a
// supplement. The shipped program runs here on a small DOM port.
class Node {
  className = ""; textContent = ""; parent: Node | null = null; children: Node[] = []; dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  constructor(public tag: string) {}
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

type Turn = { turn_id: string; kind: string; text: string; steer?: Record<string, unknown> };
function receipts() {
  const body = new Node("body");
  const program = vm.runInNewContext(`(${INPUT_RECEIPTS_CLIENT_SCRIPT})`, {
    document: { createElement: (tag: string) => new Node(tag), body }, queueMicrotask,
  }) as (L: (text: string) => string) => { line(turn: Turn, round?: object): Node | null };
  const ui = program(text => text);
  const said = () => new Promise<string[]>(resolve => setTimeout(() => resolve(body.children.map(node => node.textContent)), 0));
  return { ui, body, said };
}
const claim = { treatment: "later-step", kind: "request", targets: [{ kind: "board-node", board: "plan", id: "n4" }], impacts: ["scope", "acceptance"],
  note: "放到第 4 步一起测", tool_call_id: "call-9", revisions: 2 };
const supplement = (steer: Record<string, unknown>): Turn => ({ turn_id: "t1", kind: "user", text: "顺便把注册接口也覆盖一下", steer: { id: "steer-1", ...steer } });

test("RCPT-311, RC-12: the fact line says only the ledger's state, and the model's claim is a separate line marked as what the AI says", () => {
  const { ui } = receipts();
  const facts = ["received", "applied", "read", "unread", "withdrawn"].map(state => ui.line({ ...supplement({ state }), turn_id: state })!.all("mw-receipt__fact")[0]!.text);
  assert.deepEqual(facts, ["已送达", "已放进上下文，等 AI 回应", "AI 已读到", "这一轮结束时 AI 没读到，留给下一轮", "已撤回"]);
  const root = ui.line(supplement({ state: "read", model_claim: claim }))!;
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
  assert.equal(ui.line(supplement({ state: "applied" }), { awaiting_input: [{}] })!.all("mw-receipt__fact")[0]!.text, "已补充到这一轮；问题仍在等你回答");
  const asked = ui.line({ ...supplement({ state: "read", questions: [{ pending_id: "pend-2", state: "open" }] }), turn_id: "t2" })!;
  assert.equal(asked.all("mw-receipt__ask")[0]!.text, "为这条问了你问题，等你回答");
  const ended = ui.line({ ...supplement({ state: "unread", questions: [{ pending_id: "pend-2", state: "unresolved" }] }), turn_id: "t3" })!;
  assert.equal(ended.all("mw-receipt__ask")[0]!.text, "为这条问的问题没等到回答");
});

test("RCPT-311, RC-12: the Host's note gets the Host's mark, never a receipt; turns without a supplement get nothing", () => {
  const { ui } = receipts();
  const note = ui.line({ turn_id: "n", kind: "notice", text: "宿主说明", steer: { id: "s", state: "read" } })!;
  assert.equal(note.text, "Molis 的说明，不是你发的话");
  assert.equal(note.all("mw-receipt__fact").length, 0);
  assert.equal(ui.line({ turn_id: "u", kind: "user", text: "任务" }), null);
  assert.equal(ui.line({ turn_id: "h", kind: "notice", text: "其他宿主说明" }), null, "other Host notices stay as they are");
  assert.equal(ui.line({ turn_id: "a", kind: "assistant", text: "好的", steer: { id: "s", state: "read" } }), null);
});

test("RCPT-312, RC-15: a change is made in place and said once on the page's status region, naming the supplement; the first paint says nothing", async () => {
  const { ui, said } = receipts();
  const first = ui.line(supplement({ state: "applied" }))!;
  assert.equal(first.getAttribute("aria-live"), "off", "the receipt does not speak through a surrounding log");
  assert.deepEqual(await said(), [], "the first paint is not news");
  first.setAttribute("open", "");
  assert.equal(ui.line(supplement({ state: "applied" })), first);
  assert.deepEqual(await said(), [], "an unchanged redraw is not news");
  assert.equal(ui.line(supplement({ state: "read", model_claim: claim })), first, "the same element, so an open detail stays open");
  assert.equal(first.getAttribute("open"), "");
  assert.deepEqual(await said(), ["你的补充「顺便把注册接口也覆盖一下」：AI 已读到；AI 说你的补充「顺便把注册接口也覆盖一下」：留到后面某一步 · 影响范围、验收条件"]);
});

test("RCPT-312, RC-15, D28: a receipt is known by its round and input; turn ids repeat in every round", async () => {
  const { ui, said } = receipts();
  const turn = (input: string, state: string): Turn => ({ turn_id: "user-4", kind: "user", text: "补一条回归测试", steer: { id: input, state } });
  // One repaint draws the old round, then the new one, whose supplement has the same turn id.
  const paint = (state: string) => [ui.line(turn("steer-1", "read"), { run_id: "run-1" }), ui.line(turn("steer-9", state), { run_id: "run-2" })];
  const [old, fresh] = paint("received");
  assert.notEqual(old, fresh, "two supplements, two receipts");
  assert.deepEqual(await said(), [], "a new supplement's first receipt is not a change");
  paint("received"); paint("read");
  assert.deepEqual(await said(), ["你的补充「补一条回归测试」：AI 已读到"], "the new supplement moving on is said once, and 已送达 is never said");
});

test("RCPT-312, D28: a supplement carried into the next round under the same input id has a receipt in each round, and they never take turns being said", async () => {
  const { ui, said } = receipts();
  const turn = (state: string): Turn => ({ turn_id: "user-2", kind: "user", text: "改完补一条回归测试", steer: { id: "steer-6", state } });
  const paint = (carried: string) => [ui.line(turn("unread"), { run_id: "run-1" }), ui.line(turn(carried), { run_id: "run-2" })];
  const [old, carried] = paint("applied");
  assert.notEqual(old, carried, "the round that did not read it and the round that carried it each keep their own receipt");
  paint("applied");
  assert.deepEqual(await said(), [], "repaints say nothing");
  paint("read");
  assert.deepEqual(await said(), ["你的补充「改完补一条回归测试」：AI 已读到"], "only the carrying round's move is said");
});
