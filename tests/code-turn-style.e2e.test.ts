import assert from "node:assert/strict";
import test from "node:test";
import { coding, openCoding } from "./fixtures/coding-browser.js";

type Metrics = { metrics: Array<{ name: string; value: number }> };
const seconds = ({ metrics }: Metrics, name: string) => {
  const metric = metrics.find(metric => metric.name === name);
  assert.ok(metric, `Chrome reports ${name}`);
  return metric.value;
};

test("VUX-36 / LTP-01/02/03: one node in a long turn has local style cost; a broad :has() regression exceeds the same budget", { timeout: 120_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { start, evaluate, command, sessionId } = opened;
  await start("长对话的单节点样式开销");
  await evaluate(`(() => { const pre = document.createElement('pre'); pre.id = 'long-turn-style';
    for (let i = 0; i < 30000; i++) { const span = document.createElement('span'); span.className = 'tok-keyword'; span.textContent = 'x '; pre.append(span); }
    document.querySelector('${coding} [data-coding-turns]').append(pre); pre.offsetHeight; })()`);
  await command("Performance.enable", {}, sessionId);
  try {
    for (const broadSelector of [false, true]) {
      if (broadSelector) await evaluate(`(() => { const style = document.createElement('style'); style.id = 'long-turn-bad-selector';
        style.textContent = '.coding-stage:has([data-coding-change-reader]:not([hidden])) span { color: inherit; }';
        document.head.append(style); document.body.offsetHeight; })()`);
      // getComputedStyle also lays out the 60,000-character inline formatting context. Keep that work, but measure the
      // intended regression (restyling the whole subtree) independently of line layout. CDP durations are in seconds.
      const before = await command<Metrics>("Performance.getMetrics", {}, sessionId);
      const wall = await evaluate<number>(`(() => { const pre = document.querySelector('#long-turn-style'), start = performance.now();
        const span = document.createElement('span'); span.id = 'long-turn-new-span'; span.className = 'tok-keyword'; span.textContent = 'x';
        pre.append(span); getComputedStyle(span).color; return performance.now() - start; })()`);
      const after = await command<Metrics>("Performance.getMetrics", {}, sessionId);
      const style = 1000 * (seconds(after, "RecalcStyleDuration") - seconds(before, "RecalcStyleDuration"));
      const layout = 1000 * (seconds(after, "LayoutDuration") - seconds(before, "LayoutDuration"));
      t.diagnostic(`${broadSelector ? "broad selector" : "production styles"}: style ${style.toFixed(1)} ms, layout ${layout.toFixed(1)} ms, insertion ${wall.toFixed(1)} ms`);
      if (broadSelector) assert.ok(style >= 50, `negative control must fail the 50 ms style budget: ${style.toFixed(1)} ms`);
      else assert.ok(style < 50, `one node put in a long turn, style only: ${style.toFixed(1)} ms`);
      await evaluate("document.querySelector('#long-turn-new-span').remove(); document.body.offsetHeight");
    }
  } finally {
    await evaluate("document.querySelector('#long-turn-style')?.remove(); document.querySelector('#long-turn-bad-selector')?.remove()");
    await command("Performance.disable", {}, sessionId);
  }
});
