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
  querySelector(selector: string) { const name = /^:scope > \.([\w-]+)$/u.exec(selector)![1]!; return this.children.find(child => child.className.split(" ").includes(name)) ?? null; }
}

type Act = { withdraw(inputId: string): Promise<string>; correct(about: string, text: string, key: string): Promise<string> };
function page(reply: (path: string, body: Record<string, unknown>) => Promise<unknown> = async () => ({})) {
  const chip = new Node("button"), thread = new Node("div"), calls: Array<[string, string, Record<string, unknown>]> = [], acts: Array<Act | undefined> = [];
  let reloads = 0;
  // The receipt itself is the design system's shared one (tests/input-receipts-client.test.ts); here it is a stand-in that
  // keeps one element per turn, as the shared one does.
  const made = new Map<string, Node>(), trays: unknown[][] = [], owners: Node[] = [], tray = new Node("details", "mw-receipt mw-tray");
  // 「当前约定」 as the shared receipt would make it: what it is asked for, and a block whose words are those runs.
  const asked: unknown[][] = [], pacts: Array<[Node | null, string]> = [];
  const agreements = (owner: Node, runs: string[]) => (asked.push([owner, runs]), runs.length ? Object.assign(new Node("div"), { textContent: runs.join(" "), querySelectorAll: () => runs }) : null);
  const shared = { agreements, tray: (owner: Node, queued: unknown, round: object, act?: Act) => (trays.push([owner, queued, round, act]), Array.isArray(queued) && !queued.length ? null : tray), line: (owner: Node, turn: { turn_id: string; kind: string; steer?: { state: string } }, _round: object, act?: Act) =>
    (acts.push(act), owners.push(owner), turn.kind === "user" && turn.steer ? made.get(turn.turn_id) ?? made.set(turn.turn_id, new Node("details", "mw-receipt")).get(turn.turn_id)! : null) };
  const api = (path: string, method: string, body: Record<string, unknown>) => { calls.push([path, method, body]); return reply(path, body); };
  const ui = vm.runInNewContext(`(${ASSISTANT_RECEIPTS_FACTORY_SCRIPT})`, { Error, encodeURIComponent })({ L: (text: string) => text, shared, chip, api, work: () => "work 1", reload: () => { reloads++; },
    pact: (content: Node | null, badge: string) => { pacts.push([content, badge]); } }) as {
    line(thread: Node, node: Node, put: (node: Node) => void, turn: object, round: object): void; paint(round: object | undefined): void; target(): string | undefined; into(): { pending_id: string; draft_from_composer?: string } | null;
    after(thread: Node, put: (node: Node) => void, view: object | null): void;
  };
  const put = (node: Node) => { if (node.parent !== thread) { node.parent = thread; thread.children.push(node); } };
  return { ui, chip, thread, put, calls, acts, owners, trays, tray, asked, pacts, reloads: () => reloads };
}
const steer = (state: string) => ({ turn_id: "t1", kind: "user", text: "顺便看一下截图", steer: { id: "steer-1", state } });
const asking = (revision = 1) => ({ phase: "awaiting-input", awaiting_input: [{ pending_id: "q1", pending_revision: revision, allows_free_text: true, from_composer: true }] });
const running = { phase: "running", awaiting_input: [] };

test("RC-14, RCPT-313: under a supplement the Assistant places the shared receipt, one per supplement, and removes it when the turn has none", () => {
  const { ui, thread, put, owners } = page();
  ui.line(thread, new Node("section", "assistant-round"), put, steer("applied"), running);
  ui.line(thread, thread, put, steer("read"), asking());
  assert.equal(owners[0], thread, "RCPT-348 the thread is the receipt's surface, not the round it sits in");
  assert.equal(thread.children.length, 1, "one receipt per supplement, never a second");
  assert.equal(thread.children[0]!.className, "mw-receipt"); assert.equal(thread.children[0]!.dataset.entry, "receipt:t1");
  ui.line(thread, thread, put, { turn_id: "t1", kind: "user", text: "顺便看一下截图" }, running);
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

test("AC-03, R4: a questionnaire with its text question among others starts the chip at writing into that field; Send then targets nothing, and one click switches to adding to the round", () => {
  const { ui, chip, calls } = page();
  const form = (revision = 1) => ({ phase: "awaiting-input", awaiting_input: [{ pending_id: "q3", pending_revision: revision, questions: [{ index: 0, prompt: "选哪个？", type: "choice" }, { index: 1, prompt: "补充要求", type: "text" }], draft_from_composer: "t1" }] });
  ui.paint(form());
  assert.equal(chip.hidden, false); assert.equal(chip.textContent, "写进问卷", "the default is on the chip");
  assert.match(chip.title, /补充这一轮/u);
  assert.equal(ui.target(), undefined, "nothing is sent as an answer or a supplement"); assert.equal(ui.into()?.pending_id, "q3"); assert.equal(ui.into()?.draft_from_composer, "t1");
  chip.click();
  assert.equal(chip.textContent, "补充这一轮"); assert.match(chip.title, /写进问卷/u, "the way back names the form, not answering");
  assert.equal(ui.target(), "steer"); assert.equal(ui.into(), null);
  chip.click();
  assert.equal(ui.into()?.pending_id, "q3", "one click back"); assert.equal(ui.target(), undefined);
  chip.click(); ui.paint(form(2));
  assert.equal(ui.into()?.pending_id, "q3", "a new question starts again at its default");
  ui.paint(running);
  assert.equal(chip.hidden, true); assert.equal(ui.into(), null, "nothing waiting, nothing to fill");
  assert.equal(calls.length, 0, "the chip itself writes nothing");
});

test("RCPT-326: from a receipt, the Assistant takes a supplement back through the work's control and sends a correction as a Send naming it", async () => {
  const outcomes = [{}, { outcome: "steered" }, { outcome: "queued" }];
  const { ui, thread, put, calls, acts, reloads } = page(async (_path, body) => {
    if (body.request_id === "lost") throw Object.assign(new Error("ui_host"), { code: "ui_host.outcome_unknown" });
    if (body.request_id === "refused") throw Object.assign(new Error("这一轮已经结束"), { code: "assistant.stale" });
    return outcomes.shift();
  });
  ui.line(thread, thread, put, steer("received"), { ...running, run_id: "run-1" });
  ui.line(thread, thread, put, steer("received"), running);
  const [act, none] = acts;
  assert.equal(none, undefined, "a round the page cannot name gets no actions");
  assert.equal(await act!.withdraw("steer-1"), "");
  assert.equal(await act!.correct("steer-1", "只看失败路径", "k1"), "", "the receipt of the correction says the rest");
  assert.equal(await act!.correct("steer-1", "只看失败路径", "k1"), "已保存，下一轮开始生效", "a correction to an ended round waits for the next");
  await assert.rejects(act!.correct("steer-1", "只看失败路径", "lost"), /没确认送到：再按一次，同一条不会重复。/u);
  await assert.rejects(act!.correct("steer-1", "只看失败路径", "refused"), /这一轮已经结束/u, "a refusal keeps its own words");
  assert.deepEqual(JSON.parse(JSON.stringify(calls.slice(0, 2))), [["/works/work%201/control", "POST", { kind: "withdraw", run_id: "run-1", input_id: "steer-1" }],
    ["/send", "POST", { work_id: "work 1", text: "只看失败路径", about: "steer-1", request_id: "k1" }]], "RCPT-326 the receipt's key is the Send's request id");
  assert.equal(reloads(), 5, "the work is read again after each");
});

test("RCPT-335, 3b-2c: after the rounds the Assistant places the shared tray of its latest round, says when its queue was not read, and takes one back through the work's control", async () => {
  const { ui, thread, put, calls, trays, tray } = page();
  const rounds = [{ run_id: "run-1", phase: "completed" }, { run_id: "run-2", phase: "running" }];
  ui.after(thread, put, { rounds });
  assert.equal(thread.children.includes(tray), true, "RCPT-335 the tray follows the rounds");
  assert.equal(trays[0]![0], thread, "RCPT-335 the thread is the surface that draws it, so its tray is its own");
  assert.equal(trays[0]![1], undefined, "RCPT-335 a view without queued_inputs hands no queue on: not read, not empty");
  assert.equal((trays[0]![2] as { run_id: string }).run_id, "run-2", "the latest round's");
  ui.after(thread, put, { rounds, queued_inputs: [] });
  assert.deepEqual(trays[1]![1], [], "read and empty is handed on as such");
  assert.equal(thread.children.includes(tray), false, "nothing open: the tray goes");
  ui.after(thread, put, null);
  assert.equal(trays.length, 2, "no work, no tray");
  await (trays[0]![3] as Act).withdraw("q-1");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["/works/work%201/control", "POST", { kind: "withdraw", run_id: "run-2", input_id: "q-1" }]], "RCPT-335 the work's own control");
});

test("RCPT-360, 3e-1: after the rounds the Assistant puts 当前约定 in its side block, from the thread's receipts of the rounds it shows, redrawn only when it reads differently", () => {
  const { ui, thread, put, asked, pacts } = page();
  const rounds = [{ run_id: "run-1", phase: "completed" }, { run_id: "run-2", phase: "running" }];
  ui.after(thread, put, { rounds });
  assert.deepEqual(asked[0], [thread, ["run-1", "run-2"]], "RCPT-360 the thread is its surface, and only this work's rounds count");
  assert.deepEqual(pacts.map(([content, badge]) => [content?.textContent, badge]), [["run-1 run-2", "2"]], "RCPT-360 the side block gets it, with how many it lists");
  ui.after(thread, put, { rounds: rounds.map(round => ({ ...round })) });
  assert.equal(pacts.length, 1, "RCPT-360 the same words are not drawn again, so focus in the block stays");
  ui.after(thread, put, null);
  assert.deepEqual(pacts.at(-1), [null, ""], "RCPT-360 no work, no block");
});
