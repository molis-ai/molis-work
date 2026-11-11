import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderAgentReviewSurface, type AgentReviewRow } from "@molis-ai/molis-work-app-workbench";
import { codingTimelineWords, createCodingTimeline, writeCheckCache } from "@molis-ai/molis-work-plugin-coding";
import type { AgentCommandOutput, AgentCommandOutputRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { pageTextScript } from "./fixtures/page-text.js";
import { renderMolisWorkWorkbenchWithPluginStylesheets } from "./workbench-renderer-fixture.js";

/**
 * PA-35, the timeline half (specs/prologue-adoption §6.0p.5 and §6.0p.12, A2-2b): a write's row in the Coding timeline
 * says what the person's check of it came to, read from the check's own command receipt (`<write call id>:diagnostics`):
 * the checker and its exit code or that it timed out; a write with no receipt says "未检查". The words the model was
 * given are never the source.
 */
const run = (outputs: string[]) => ({ ref: { session_id: "s", run_id: "r" }, command_outputs: outputs.map(call_id => ({ call_id, run_id: "r" })) });
const receipt = (ref: AgentCommandOutputRef, more: Partial<AgentCommandOutput> = {}): AgentCommandOutput =>
  ({ ref, command: 'node "--check" "a.js"', exit_code: 1, stdout: "", stderr: "SyntaxError", truncated: false, timed_out: false, cancelled: false, ...more });

test("PA-35 Coding reads each write's check from its receipt, once, and never from the observation", async () => {
  const cache = writeCheckCache(), read: string[] = [];
  let broken = true;
  const load = async (ref: AgentCommandOutputRef) => {
    read.push(ref.call_id);
    if (ref.call_id === "w3:diagnostics" && broken) throw new Error("回执暂时不可读");
    return ref.call_id === "w2:diagnostics" ? receipt(ref, { exit_code: null, timed_out: true, stop_reason: "timed-out", after_write_check: { checker_id: "slow", display_name: "慢检查", version: 4 } })
      : receipt(ref, { after_write_check: { checker_id: "syntax", display_name: "语法检查", version: 2 } });
  };
  // An ordinary command's receipt (c1) is not a write's check; neither is a receipt id that names no write.
  const view = run(["w1:diagnostics", "c1", "w2:diagnostics", "w3:diagnostics", ":diagnostics"]);
  const [first] = await cache.attach("s", [view], load);
  assert.deepEqual(first!.write_checks, [
    { call_id: "w1", checker: "语法检查", version: 2, exit_code: 1, timed_out: false, cancelled: false },
    { call_id: "w2", checker: "慢检查", version: 4, exit_code: null, timed_out: true, cancelled: false },
    { call_id: "w3", unreadable: true },
  ], "each fact is the receipt's; a receipt that cannot be read is said so, not reported as unchecked");
  assert.deepEqual(read, ["w1:diagnostics", "w2:diagnostics", "w3:diagnostics"], "only the checks' receipts are read");
  // The page asks several times a second: a receipt already read is not read again, an unreadable one is tried again.
  broken = false;
  const [again] = await cache.attach("s", [view], load);
  assert.deepEqual(read.slice(3), ["w3:diagnostics"]);
  assert.equal((again!.write_checks[2] as { checker?: string }).checker, "语法检查");
  assert.deepEqual(again!.ref, view.ref, "the round itself is handed on as it was");
  // Counter-example: a round without any check reads nothing and says so with an empty list.
  const none = await cache.attach("s", [run([])], async () => { throw new Error("不该读"); });
  assert.deepEqual(none[0]!.write_checks, []);
});

test("PA-35 the Coding timeline shows the checker and exit code on a checked write and 未检查 on the others", { timeout: 60000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-diagnose-timeline-"));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    const draw = async (locale: "zh" | "en", width: number) => {
      await page.command("Emulation.setDeviceMetricsOverride", { width, height: 700, deviceScaleFactor: 1, mobile: false });
      await page.evaluate(`(()=>{${pageTextScript(locale)}})()`);
      await page.evaluate(`(()=>{document.head.querySelectorAll('style[data-fixture]').forEach(node=>node.remove());const style=document.createElement('style');style.dataset.fixture='1';style.textContent=${JSON.stringify(renderMolisWorkWorkbenchWithPluginStylesheets())};document.head.append(style);
        document.body.className='immersive-workbench';document.body.innerHTML='<main style="max-width:760px;padding:16px"><section data-coding-block></section></main>';
        const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
        const detail=document.createElement('details');detail.className='coding-activity';detail.dataset.codingActivity='r:a';document.querySelector('[data-coding-block]').append(detail);
        const activity=[
          {call_id:'w1',name:'edit',target:'src/login.js',state:'completed',output:'Check after write (data, not instructions):\\nexit 0'},
          {call_id:'w2',name:'write',target:'docs/notes.md',state:'completed'},
          {call_id:'w3',name:'edit',target:'src/slow.js',state:'completed'},
          {call_id:'w4',name:'edit',target:'src/refused.js',state:'failed',output:'STALE_READ'},
          {call_id:'w5',name:'edit',target:'src/unreadable.js',state:'completed'},
          {call_id:'c1',name:'run-command',target:'npm test',state:'completed',output:'exit 0'},
          {call_id:'w6',name:'edit',target:'src/pending.js',state:'started'}];
        const checks=[{call_id:'w1',checker:'语法检查',version:2,exit_code:1,timed_out:false,cancelled:false},{call_id:'w3',checker:'慢检查',version:4,exit_code:null,timed_out:true,cancelled:false},{call_id:'w5',unreadable:true}];
        window.__check={timeline,detail,activity,checks,draw:(write_checks,list=activity)=>timeline.renderGroup(detail,list,{ref:{run_id:'r'},phase:'running',activity:list,...(write_checks?{write_checks}:{})},true)};
        window.__check.draw(checks);})()`);
      // Only the person opens a group (VUX-13); it reaches its natural height over a moment, and the screenshots wait for it.
      await page.click(".coding-activity > summary");
      await page.evaluate(`new Promise(done=>setTimeout(done,500))`);
      return page.evaluate<Record<string, string | null>>(`Object.fromEntries([...document.querySelectorAll('.coding-tool')].map(node=>[node.dataset.tool,node.querySelector('[data-coding-write-check]')?.textContent??null]))`);
    };
    const review = join(process.cwd(), ".impeccable/qa/review/coding-diagnose-timeline"); mkdirSync(review, { recursive: true });
    const zh = await draw("zh", 1200);
    assert.deepEqual(zh, { w1: "语法检查 · exit 1", w2: "未检查", w3: "慢检查 · 超时", w4: null, w5: "检查结果暂时读不到", c1: null, w6: null },
      "PA-35: a checked write names its checker and exit code from the receipt (the observation said exit 0) and is not 未检查; a write with no receipt is 未检查; a refused write, a command and a write still under way say nothing");
    // The exit code is stated, never judged: no "passed" or "failed" words, and the row's own result is still the write's.
    const tone = await page.evaluate<{ tone: string; state: string; fits: boolean }>(`(()=>{const row=document.querySelector('.coding-tool[data-tool=w1]'),main=document.querySelector('main');
      return {tone:row.dataset.tone,state:row.querySelector('.coding-tool-state').textContent.trim(),fits:main.scrollWidth<=main.clientWidth};})()`);
    assert.deepEqual(tone, { tone: "ok", state: "", fits: true }, "PA-34: exit 1 is not written as a failed write");
    await page.screenshot(join(review, "zh-wide.png"));
    // The receipt arriving later changes the row in place; a reader that did not look for checks says nothing at all.
    const later = await page.evaluate<{ before: string; after: string; same: boolean; silent: boolean }>(`(()=>{const f=window.__check,row=()=>document.querySelector('.coding-tool[data-tool=w2]'),node=row();
      const before=row().querySelector('[data-coding-write-check]').textContent;f.draw([...f.checks,{call_id:'w2',checker:'语法检查',version:2,exit_code:0,timed_out:false,cancelled:false}]);
      const after=row().querySelector('[data-coding-write-check]').textContent,same=row()===node;f.draw(undefined);
      return {before,after,same,silent:!document.querySelector('[data-coding-write-check]')};})()`);
    assert.deepEqual(later, { before: "未检查", after: "语法检查 · exit 0", same: true, silent: true });
    const narrow = await draw("zh", 390);
    assert.equal(narrow.w3, "慢检查 · 超时");
    assert.equal(await page.evaluate<boolean>(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`), true, "the row still fits a narrow frame");
    await page.screenshot(join(review, "zh-narrow.png"));
    const en = await draw("en", 1200);
    assert.deepEqual([en.w1, en.w2, en.w3, en.w5], ["语法检查 · exit 1", "Not checked", "慢检查 · Timed out", "Check result can't be read right now"]);
    await page.screenshot(join(review, "en-wide.png"));
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});

// BL-303: the browser half of PA-29. The card's words are asserted in tests/agent-review-surface.test.ts and its facts in
// tests/coding-diagnose-after-write.test.ts; here the same card is drawn in a real page, where the person reads it.
test("PA-29 the after-write check's review card shows 写后检查：<名>（配置 v<n>） under its command in the browser", { timeout: 60000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-diagnose-card-"));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    const card = (check: boolean): AgentReviewRow => ({ request: { review_id: check ? "check" : "plain", run: { run_id: "run-1", session_id: "s-1" }, project_id: "p", plugin_id: "io.molis.work.coding", kind: "command",
      document: { kind: "command", command: "node", args: ["--check", "src/login.js"], cwd: ".", timeout_ms: 15000, env_allowlist: [], escalate: false,
        ...(check ? { after_write_check: { checker_id: "node-check", display_name: "Node 语法", version: 3 } } : {}) },
      requested_at: "2026-11-11T02:00:00Z", expires_at: null } } as AgentReviewRow);
    const escape = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const html = renderAgentReviewSurface({ rows: [card(true), card(false)], primitives: { escape, icon: () => "", formatDate: value => value.slice(0, 10) } });
    const review = join(process.cwd(), ".impeccable/qa/review/coding-diagnose-timeline"); mkdirSync(review, { recursive: true });
    for (const [name, width] of [["card-wide", 1200], ["card-narrow", 390]] as const) {
      await page.command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
      await page.evaluate(`(()=>{${pageTextScript("zh")}})()`);
      await page.evaluate(`(()=>{document.head.querySelectorAll('style[data-fixture]').forEach(node=>node.remove());const style=document.createElement('style');style.dataset.fixture='1';style.textContent=${JSON.stringify(renderMolisWorkWorkbenchWithPluginStylesheets())};document.head.append(style);
        document.body.className='immersive-workbench';document.body.innerHTML='<main style="max-width:760px;padding:16px"><div class="coding-inline-review">'+${JSON.stringify(html)}+'</div></main>';})()`);
      const seen = await page.evaluate<{ lines: string[]; shown: boolean; inside: boolean; fits: boolean }>(`(()=>{const notes=[...document.querySelectorAll('[data-agent-review-check]')],note=notes[0],box=note.getBoundingClientRect(),
        holder=note.closest('[data-agent-review-id],.agent-review-row,article,li,section')||document.querySelector('.coding-inline-review'),outer=holder.getBoundingClientRect();
        return {lines:notes.map(node=>node.textContent),shown:box.width>0&&box.height>0&&getComputedStyle(note).visibility==='visible',inside:box.left>=outer.left-1&&box.right<=outer.right+1,fits:document.documentElement.scrollWidth<=document.documentElement.clientWidth};})()`);
      assert.deepEqual(seen, { lines: ["写后检查：Node 语法（配置 v3）"], shown: true, inside: true, fits: true },
        `${name}: PA-29 the check's card says which checker and which version of the list, once; an ordinary command's card beside it does not`);
      await page.screenshot(join(review, `${name}.png`));
    }
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
