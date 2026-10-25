import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { createUiRequest } from "@molis-ai/molis-work-ui-host";
import { pageText } from "./fixtures/page-text.js";

// specs/ai-input-receipts §3.3, §4.1, §4.2, §7 (stage 1d): what the Coding page shows for a supplement it sends to a round
// under way. The receipt under it is the shared one (tests/input-receipts-client.test.ts, RC-12, RC-15). The shipped script
// runs here against a small DOM port.
class Node {
  className = ""; textContent = ""; title = ""; type = ""; onclick: (() => unknown) | null = null;
  dataset: Record<string, string> = {}; classes = new Set<string>(); classList = { add: (name: string) => this.classes.add(name) };
  children: Array<Node | string> = [];
  append(...nodes: Array<Node | string>) { this.children.push(...nodes); }
  get text(): string { return this.textContent + this.children.map(child => typeof child === "string" ? child : child.text).join(""); }
  find(className: string): Node | undefined {
    for (const child of this.children) if (typeof child !== "string") { if (child.className.includes(className)) return child; const inner = child.find(className); if (inner) return inner; }
    return undefined;
  }
}

type Reply = { receipt: { input_id: string; replayed: boolean; delivered: "run" | "queued" } };
function receipts(reply: (body: Record<string, unknown>) => Promise<Reply>, ports: { find?: (selector: string) => Node | null; landed?: (sent: { text: string }, said: string) => void } = {}) {
  const sent: Array<Record<string, unknown>> = [];
  let uuid = 0;
  const factory = vm.runInNewContext(`(${CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT})`, {
    document: { createElement: () => new Node() }, crypto: { randomUUID: () => `u${++uuid}` },
  }) as (ports: object) => {
    steer(id: string, run: string, text: string, mode: string): Promise<string>; bubble(id: string, run: { turns: object[] }): Node | null;
    act(id: string, run: string): { withdraw(inputId: string): Promise<string>; correct(about: string, text: string, key: string): Promise<string> };
  };
  const paths: string[] = [];
  let refreshed = 0;
  const api = (path: string, _method: string, body: Record<string, unknown>) => { paths.push(path); sent.push(body); return reply(body); };
  return { ui: factory({ api, translate: pageText("zh"), refresh: () => { refreshed++; }, q: () => null, find: () => null, landed: () => {}, ...ports }), sent, paths, refreshed: () => refreshed };
}
/** The round's record before it shows the supplement. */
const nothing = { turns: [] };
const taken = (delivered: "run" | "queued" = "run", replayed = false): Promise<Reply> => Promise.resolve({ receipt: { input_id: "steer-1", replayed, delivered } });

test("the shared request helper keeps a failed supplement's original identity until the person retries it", async () => {
  for (const failure of ["network", "malformed"] as const) {
    let attempts = 0;
    const request = createUiRequest({ origin: "http://127.0.0.1", token: () => "fixture", newKey: () => "request-key", translate: pageText("zh"),
      fetch: async () => {
        if (++attempts === 1) {
          if (failure === "network") throw new TypeError("Failed to fetch");
          return new Response("not JSON", { status: 200 });
        }
        return Response.json(await taken("run", true));
      } });
    const { ui, sent } = receipts(body => request<Reply>("/sessions/s/control", { method: "POST", body }));
    await assert.rejects(ui.steer("s", "r", "保留原输入", "interrupt"), /没确认送到/u);
    assert.equal(ui.bubble("s", nothing)!.dataset.lost, "1");
    assert.equal(attempts, 1, "an unknown write is not replayed automatically");
    assert.equal(await ui.steer("s", "r", "保留原输入", "interrupt"), "之前已送到，没有重复发送。");
    assert.deepEqual(sent[1], sent[0], "the explicit retry keeps the entire original request");
    assert.equal(ui.bubble("s", nothing), null);
  }
});

test("RC-10: a supplement goes with its send mode and a key, and the page says what each mode does, in the runtime's words", async () => {
  const { ui, sent } = receipts(() => taken());
  assert.equal(await ui.steer("s", "r", "别改 fixture", "next-boundary"), "已送达，当前回复或这批工具结束后交给 AI。");
  assert.match(await ui.steer("s", "r", "改用新接口", "interrupt"), /正在写的回复已丢掉.*已执行的操作不撤销/u, "interrupting says what it costs");
  assert.deepEqual(sent.map(body => [body.kind, body.run_id, body.mode, body.key]), [["steer", "r", "next-boundary", "send.u1"], ["steer", "r", "interrupt", "send.u2"]]);
  assert.deepEqual(JSON.parse(JSON.stringify(sent.map(body => body.original_input))), [
    { input_id: "u1", text: "别改 fixture", use: "supplement" }, { input_id: "u2", text: "改用新接口", use: "supplement" },
  ], "each protected request carries the complete words under the same input identity as its retry key");
  const queued = receipts(() => taken("queued"));
  assert.equal(await queued.ui.steer("s", "r", "顺便改文档", "after-run"), "已存好，下一轮开始时带上。");
  assert.equal(await queued.ui.steer("s", "r", "还要这个", "next-boundary"), "这一轮刚结束，已存好，下一轮开始时带上。", "a supplement that missed its round never reads as taken by it");
  assert.equal(await receipts(() => taken("run", true)).ui.steer("s", "r", "同一条", "next-boundary"), "之前已送到，没有重复发送。");
});

test("RC-11: while a supplement is on its way it shows as sending; after a lost answer, the same words in the same mode go again under the same key", async () => {
  let attempt = 0, release!: () => void;
  const { ui, sent } = receipts(() => {
    attempt++;
    if (attempt === 1) return Promise.reject(Object.assign(new Error("Failed to fetch"), { code: "ui_host.outcome_unknown" }));
    return new Promise<Reply>(resolve => { release = () => resolve({ receipt: { input_id: "steer-1", replayed: true, delivered: "run" } }); });
  });
  await assert.rejects(ui.steer("s", "r", "补上测试", "next-boundary"), /没确认送到：连接断了，或回复读不出。/u);
  const lost = ui.bubble("s", nothing)!;
  assert.equal(lost.dataset.kind, "user");
  assert.match(lost.text, /补上测试.*没确认送到 · 再按发送，同一条不会重复/su);
  assert.equal(ui.bubble("s", nothing), lost, "a redraw keeps the same bubble");
  assert.equal(ui.bubble("other-session", nothing), null, "the bubble belongs to its session");
  const again = ui.steer("s", "r", "补上测试", "next-boundary");
  const sending = ui.bubble("s", nothing)!;
  assert.notEqual(sending, lost);
  assert.match(sending.text, /发送中…/u);
  assert.equal(sent[1]!.key, sent[0]!.key, "the same words in the same mode are the same supplement");
  assert.deepEqual(sent[1]!.original_input, sent[0]!.original_input, "a lost answer cannot mint a second original");
  release();
  assert.equal(await again, "之前已送到，没有重复发送。");
  assert.equal(ui.bubble("s", nothing), null, "once the Host has it, the round's own record shows it");
  // Changed words, or another mode, are a new supplement; so is anything sent after a refusal.
  let calls = 0;
  const changed = receipts(() => ++calls === 1 ? Promise.reject(Object.assign(new Error("offline"), { code: "ui_host.outcome_unknown" })) : taken());
  await assert.rejects(changed.ui.steer("s", "r", "看日志", "next-boundary"));
  await changed.ui.steer("s", "r", "看日志", "interrupt");
  assert.notEqual(changed.sent[1]!.key, changed.sent[0]!.key);
  const refused = receipts(body => body.key === "send.u1" ? Promise.reject(new Error("这一轮已经结束")) : taken());
  await assert.rejects(refused.ui.steer("s", "r", "看日志", "next-boundary"), /已经结束/u);
  assert.equal(refused.ui.bubble("s", nothing), null, "a refusal clears the bubble; the words stay in the composer");
  await refused.ui.steer("s", "r", "看日志", "next-boundary");
  assert.equal(refused.sent[1]!.key, "send.u2");
});

test("RC-17: after a lost answer, once the run's record shows that key, the bubble goes and the page says once that it arrived", async () => {
  const landed: string[] = [];
  const { ui, sent } = receipts(() => Promise.reject(Object.assign(new Error("Failed to fetch"), { code: "ui_host.outcome_unknown" })), { landed: (one, said) => landed.push(one.text + "｜" + said) });
  await assert.rejects(ui.steer("s", "r", "补上测试", "next-boundary"));
  const key = sent[0]!.key;
  assert.ok(ui.bubble("s", { turns: [{ kind: "user", steer: { id: "steer-2", state: "received", key: "send.other" } }] }), "another supplement is not this one");
  assert.deepEqual(landed, []);
  const record = { turns: [{ kind: "user", text: "补上测试", steer: { id: "steer-1", state: "received", key } }] };
  assert.equal(ui.bubble("s", record), null, "the record's turn is the one shown; the lost bubble goes");
  assert.deepEqual(landed, ["补上测试｜之前已送到，没有重复发送。"], "said once, in the words a recognised resend gets");
  assert.equal(ui.bubble("s", record), null);
  assert.equal(landed.length, 1, "a later repaint says nothing more");
  await assert.rejects(ui.steer("s", "r", "补上测试", "next-boundary"));
  assert.notEqual(sent[1]!.key, key, "sent again after it arrived, the same words are a new supplement");
});

// RC-18's strip became the shared tray (D38): what waits, and the words behind its count, are tested in
// input-receipts-client.test.ts (RCPT-331 to RCPT-333); Coding draws no list of its own.
test("RC-18, D38: what waits for the next round is in the shared tray; Coding has no strip of its own", () => {
  const { ui } = receipts(() => taken());
  assert.equal("waiting" in ui, false, "D38 one list, in the shared tray");
  assert.equal(CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT.includes("coding-queued-inputs"), false);
  assert.equal(CODING_INPUT_RECEIPTS_CLIENT_FACTORY_SCRIPT.includes("排着"), false);
});

test("RC-16: interrupting dims the reply being written and says it was dropped; nothing else is marked", async () => {
  const marked = async (mode: string, delivered: "run" | "queued" = "run", replayed = false) => {
    const node = new Node();
    await receipts(() => taken(delivered, replayed), { find: selector => selector === ".coding-turn.is-writing" ? node : null }).ui.steer("s", "r", "改用新接口", mode);
    return node.classes.has("is-dropped") && /这段回复已丢掉（你打断了它）/u.test(node.text);
  };
  assert.equal(await marked("interrupt"), true);
  assert.equal(await marked("next-boundary"), false, "a supplement read at the next boundary drops nothing");
  assert.equal(await marked("interrupt", "queued"), false, "words that missed the round dropped nothing in it");
  assert.equal(await marked("interrupt", "run", true), false, "a repeat that the runtime already had marks nothing again");
  assert.equal(await receipts(() => taken()).ui.steer("s", "r", "改用新接口", "interrupt"), "已送达：正在写的回复已丢掉，按你的话接着做；已执行的操作不撤销。", "with no reply being written, nothing is marked");
});

test("RCPT-326: from a receipt, the page takes a supplement back and sends a correction naming it, both through the round's control", async () => {
  const replies: Array<() => Promise<unknown>> = [
    async () => ({ accepted: true, withdrawn: { input_id: "steer-1", from: "run" } }),
    async () => ({ accepted: true, withdrawn: { input_id: "steer-1", from: "queued" } }),
    async () => ({ accepted: true, receipt: { input_id: "steer-2", replayed: false, delivered: "run" } }),
    async () => ({ accepted: true, receipt: { input_id: "steer-2", replayed: false, delivered: "queued" } }),
    async () => { throw Object.assign(new Error("Failed to fetch"), { code: "ui_host.outcome_unknown" }); },
    async () => ({ accepted: true, receipt: { input_id: "steer-2", replayed: true, delivered: "run" } }),
  ];
  const { ui, sent, paths, refreshed } = receipts(() => replies.shift()!() as Promise<Reply>);
  const act = ui.act("s 1", "run-1");
  assert.equal(await act.withdraw("steer-1"), "", "the receipt itself says 已撤回 once the round's record does");
  assert.equal(await act.withdraw("steer-1"), "已撤回，下一轮不会带上它。", "one the round had already left for the session says where it was taken from");
  assert.equal(await act.correct("steer-1", "只测失败路径", "k1"), "更正已送达。");
  assert.equal(await act.correct("steer-1", "只测失败路径", "k1"), "已存好，下一轮开始时带上。", "a correction to an ended round waits for the next one");
  await assert.rejects(act.correct("steer-1", "只测失败路径", "k1"), /没确认送到：再按一次，同一条不会重复。/u);
  assert.equal(await act.correct("steer-1", "只测失败路径", "k1"), "之前已送到，没有重复发送。");
  assert.deepEqual(JSON.parse(JSON.stringify(sent.slice(0, 3))), [{ kind: "withdraw", run_id: "run-1", input_id: "steer-1" }, { kind: "withdraw", run_id: "run-1", input_id: "steer-1" },
    { kind: "steer", run_id: "run-1", text: "只测失败路径", about: "steer-1", key: "send.k1", original_input: { input_id: "k1", text: "只测失败路径", use: "supplement" } }], "RCPT-326 the person's words, the input they correct, and the receipt's key");
  assert.ok(sent.slice(2).every(body => body.key === "send.k1"), "RCPT-326 sent again, the same key");
  for (const body of sent.slice(3)) assert.deepEqual(body.original_input, sent[2]!.original_input, "correction retries preserve the original, too");
  assert.ok(paths.every(path => path === "/sessions/s%201/control"));
  assert.equal(refreshed(), 6, "the page reads the round again after each");
});
