import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";

// specs/ai-input-receipts §3.3, §4.1, §4.2, §7 (stage 1d): what the Coding page shows for a supplement it sends to a round
// under way. The shipped script runs here against a small DOM port.
class Node {
  className = ""; textContent = ""; title = ""; type = ""; onclick: (() => unknown) | null = null;
  dataset: Record<string, string> = {};
  children: Array<Node | string> = [];
  append(...nodes: Array<Node | string>) { this.children.push(...nodes); }
  get text(): string { return this.textContent + this.children.map(child => typeof child === "string" ? child : child.text).join(""); }
  find(className: string): Node | undefined {
    for (const child of this.children) if (typeof child !== "string") { if (child.className.includes(className)) return child; const inner = child.find(className); if (inner) return inner; }
    return undefined;
  }
}

type Reply = { receipt: { input_id: string; replayed: boolean; delivered: "run" | "queued" } };
function receipts(reply: (body: Record<string, unknown>) => Promise<Reply>) {
  const sent: Array<Record<string, unknown>> = [];
  let uuid = 0;
  const factory = vm.runInNewContext(`(${CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT})`, {
    document: { createElement: () => new Node() }, crypto: { randomUUID: () => `u${++uuid}` }, TypeError,
  }) as (ports: object) => {
    receipt(turn: object): Node | undefined; steer(id: string, run: string, text: string, mode: string): Promise<string>; bubble(id: string): Node | null;
  };
  const api = (_path: string, _method: string, body: Record<string, unknown>) => { sent.push(body); return reply(body); };
  return { ui: factory({ api, refresh: () => {} }), sent };
}
const taken = (delivered: "run" | "queued" = "run", replayed = false): Promise<Reply> => Promise.resolve({ receipt: { input_id: "steer-1", replayed, delivered } });

test("RC-10: a supplement goes with its send mode and a key, and the page says what each mode does, in the runtime's words", async () => {
  const { ui, sent } = receipts(() => taken());
  assert.equal(await ui.steer("s", "r", "别改 fixture", "next-boundary"), "已送达，当前回复或这批工具结束后交给 AI。");
  assert.match(await ui.steer("s", "r", "改用新接口", "interrupt"), /正在写的回复已丢掉.*已执行的操作不撤销/u, "interrupting says what it costs");
  assert.deepEqual(sent.map(body => [body.kind, body.run_id, body.mode, body.key]), [["steer", "r", "next-boundary", "send.u1"], ["steer", "r", "interrupt", "send.u2"]]);
  const queued = receipts(() => taken("queued"));
  assert.equal(await queued.ui.steer("s", "r", "顺便改文档", "after-run"), "已存好，下一轮开始时带上。");
  assert.equal(await queued.ui.steer("s", "r", "还要这个", "next-boundary"), "这一轮刚结束，已存好，下一轮开始时带上。", "a supplement that missed its round never reads as taken by it");
  assert.equal(await receipts(() => taken("run", true)).ui.steer("s", "r", "同一条", "next-boundary"), "之前已送到，没有重复发送。");
});

test("RC-11: while a supplement is on its way it shows as sending; after a lost answer, the same words in the same mode go again under the same key", async () => {
  let attempt = 0, release!: () => void;
  const { ui, sent } = receipts(() => {
    attempt++;
    if (attempt === 1) return Promise.reject(new TypeError("Failed to fetch"));
    return new Promise<Reply>(resolve => { release = () => resolve({ receipt: { input_id: "steer-1", replayed: true, delivered: "run" } }); });
  });
  await assert.rejects(ui.steer("s", "r", "补上测试", "next-boundary"), /没确认送到：连接断了，或回复读不出。/u);
  const lost = ui.bubble("s")!;
  assert.equal(lost.dataset.kind, "user");
  assert.match(lost.text, /补上测试.*没确认送到 · 再按发送，同一条不会重复/su);
  assert.equal(ui.bubble("s"), lost, "a redraw keeps the same bubble");
  assert.equal(ui.bubble("other-session"), null, "the bubble belongs to its session");
  const again = ui.steer("s", "r", "补上测试", "next-boundary");
  const sending = ui.bubble("s")!;
  assert.notEqual(sending, lost);
  assert.match(sending.text, /发送中…/u);
  assert.equal(sent[1]!.key, sent[0]!.key, "the same words in the same mode are the same supplement");
  release();
  assert.equal(await again, "之前已送到，没有重复发送。");
  assert.equal(ui.bubble("s"), null, "once the Host has it, the round's own record shows it");
  // Changed words, or another mode, are a new supplement; so is anything sent after a refusal.
  let calls = 0;
  const changed = receipts(() => ++calls === 1 ? Promise.reject(new TypeError("offline")) : taken());
  await assert.rejects(changed.ui.steer("s", "r", "看日志", "next-boundary"));
  await changed.ui.steer("s", "r", "看日志", "interrupt");
  assert.notEqual(changed.sent[1]!.key, changed.sent[0]!.key);
  const refused = receipts(body => body.key === "send.u1" ? Promise.reject(new Error("这一轮已经结束")) : taken());
  await assert.rejects(refused.ui.steer("s", "r", "看日志", "next-boundary"), /已经结束/u);
  assert.equal(refused.ui.bubble("s"), null, "a refusal clears the bubble; the words stay in the composer");
  await refused.ui.steer("s", "r", "看日志", "next-boundary");
  assert.equal(refused.sent[1]!.key, "send.u2");
});

test("RC-12: the receipt line says only what the run's ledger says, and a note the Host sent reads as the Host's, without a receipt", () => {
  const { ui } = receipts(() => taken());
  const line = (state: string) => ui.receipt({ kind: "user", steer: { id: "steer-1", state } })!;
  assert.deepEqual(["received", "applied", "read", "unread", "withdrawn"].map(state => line(state).textContent),
    ["已送达", "已放进上下文，等 AI 回应", "AI 已读到", "这一轮结束时 AI 没读到，留给下一轮", "已撤回"]);
  assert.match(line("read").title, /读到不代表已遵循/u);
  assert.equal(ui.receipt({ kind: "user" }), undefined, "the person's own task has no receipt");
  assert.equal(ui.receipt({ kind: "notice", steer: { id: "steer-2", state: "read" } })!.textContent, "Molis 的说明，不是你发的话");
  assert.ok(!ui.receipt({ kind: "notice" }), "other Host notices stay as they are");
});
