import assert from "node:assert/strict";
import test from "node:test";
import { openWork, readWork, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-11: the context window, this round's tokens, cache, cost and the account's quota are told
// apart, each from the runtime's own report for that round; a share only with both its parts known, an estimate marked,
// an unknown field read as 暂不可用, the model the round really ran on named. The latest round's usage and model are put
// in the view the page reads, in the contract's shape, as the runtime reports them; the round itself is real.
const read = (box: string) => `(() => { const b = ${box}; return { parts: [...b.querySelectorAll('.assistant-usage-part')].map((p) => [p.querySelector('.assistant-block-sub').textContent,
  [...p.querySelectorAll('.assistant-usage-row')].map((r) => [...r.children].map((c) => c.textContent).join('=')), p.querySelector('.assistant-progress')?.getAttribute('aria-label') || '',
  p.querySelector('.assistant-material-origin')?.textContent || '']) }; })()`;

test("VUX-11: the usage box tells the context window, this round, cost and quota apart, from the round's own report", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor } = browser;
  const id = await seedWork(browser, "算一下用量");
  const real = await readWork(browser, id);
  assert.ok(real.rounds.at(-1)?.model?.model_id, "the Host carries the model the round really ran on from the runtime's frozen start");
  await evaluate(`(() => { window.__report = "full"; const fetch0 = window.fetch; window.fetch = async (input, init) => {
    const response = await fetch0(input, init), path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
    if (!/\\/api\\/assistant\\/works\\/${id}$/.test(path) || (init && init.method && init.method !== "GET")) return response;
    const view = await response.json(), round = view.rounds[view.rounds.length - 1];
    const full = () => Object.assign(round, { ended_at: "2026-10-20T09:30:00.000Z", model: { model_id: "MiniMax-M2", window_tokens: 200000 },
      usage: { tokens: { input: 12000, output: 800, cached_input: 9000 }, coverage: { input: "reported", output: "reported", cached_input: "reported", cache_creation: "unknown", cost_usd: "unknown" }, context: { tokens: 52000, coverage: "reported" } } });
    if (window.__report === "full") full();
    // A round just sent after a reported one: the runtime has no report for it yet.
    else if (window.__report === "fresh") { full(); view.rounds.push({ ...round, run_id: "r-fresh", usage: undefined, model: { model_id: "MiniMax-M2.1" }, ended_at: null }); }
    else Object.assign(round, { ended_at: "2026-10-20T09:40:00.000Z", model: { model_id: "MiniMax-M2", now: "MiniMax-M2.1" },
      usage: { tokens: { input: 0, output: 300 }, coverage: { input: "unknown", output: "estimated", cached_input: "unknown", cache_creation: "unknown", cost_usd: "reported" }, cost_usd: 0.0123, context: { tokens: 4000, coverage: "estimated" }, unavailable_reason: "用量含保守估算，不全是服务方报的数" } });
    return new Response(JSON.stringify(view), { status: response.status, headers: response.headers });
  }; })()`);
  await openWork(browser, id);
  const box = `document.querySelector('[data-assistant-usage]')`;
  await waitFor(`${box}?.querySelector('.assistant-usage-part')`, 15_000);
  await evaluate(`${box}.querySelector('details').open = true`);
  const full = await evaluate<{ parts: Array<[string, string[], string, string]> }>(read(box));
  assert.deepEqual(full.parts.map(([title]) => title), ["上下文窗口", "本轮", "账户额度", full.parts[3]?.[0] ?? ""].filter(Boolean));
  const [windowPart, round, quota] = full.parts;
  assert.deepEqual(windowPart![1], ["已用=52,000 / 200,000 · 26%"]);
  assert.equal(windowPart![2], "上下文窗口 52000/200000", "a share is drawn only when the prompt and the window are both known");
  assert.match(windowPart![3], /^MiniMax-M2 · 更新于 /);
  assert.deepEqual(round![1], ["输入=12,000", "输出=800", "缓存读取=9,000", "费用=暂不可用"], "cache read stands apart from input; an unreported cost is not a zero");
  assert.deepEqual(quota![1], ["额度与重置=暂不可用"]);

  // Another report: the window unknown, an estimate, an unknown input, a reported cost, a switched model.
  await evaluate(`window.__report = "partial"`);
  await openWork(browser, id);
  await waitFor(`${box}.textContent.includes('MiniMax-M2.1')`, 15_000);
  await evaluate(`${box}.querySelector('details').open = true`);
  const partial = await evaluate<{ parts: Array<[string, string[], string, string]> }>(read(box));
  assert.deepEqual(partial.parts[0]![1], ["已用=4,000（估算） · 窗口大小暂不可用"]);
  assert.equal(partial.parts[0]![2], "", "no share without the window");
  assert.match(partial.parts[0]![3], /^MiniMax-M2 → MiniMax-M2\.1 · /, "the model it started on and the one its calls went to after the switch");
  assert.deepEqual(partial.parts[1]![1], ["输入=暂不可用", "输出=300（估算）", "费用=$0.0123"]);
  assert.match(await evaluate<string>(`${box}.textContent`), /用量含保守估算，不全是服务方报的数/, "the runtime's reason is said in the interface's words");

  // The latest round has no report yet: 本轮 is that round's, in progress, with its own model; the round before lends nothing.
  await evaluate(`window.__report = "fresh"`);
  await openWork(browser, id);
  await waitFor(`${box}.textContent.includes('进行中')`, 15_000);
  await evaluate(`${box}.querySelector('details').open = true`);
  const fresh = await evaluate<{ parts: Array<[string, string[], string, string]> }>(read(box));
  assert.deepEqual(fresh.parts[0]![1], ["已用=进行中"]);
  assert.match(fresh.parts[0]![3], /^MiniMax-M2\.1 · 进行中$/);
  assert.deepEqual(fresh.parts[1]![1], ["输入=进行中", "输出=进行中"], "never the round before's 12,000 and 800");
});
