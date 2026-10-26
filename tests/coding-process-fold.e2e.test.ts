import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codingTimelineWords, createCodingTimeline } from "@molis-ai/molis-work-plugin-coding";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";
import { pageTextScript } from "./fixtures/page-text.js";
import { renderMolisWorkWorkbenchWithPluginStylesheets } from "./workbench-renderer-fixture.js";

/**
 * VUX-13 in the Coding timeline: a round's steps stream into one group that the round never opens or closes by itself; each
 * step is one line (operation, object, result) with what came back behind its own disclosure; what the person opened stays
 * the same node, open, focused and scrolled while later steps stream in and after the round ends; the folds are the
 * Assistant's process folds (same chevron, type, row and natural-height motion).
 */
test("VUX-13 the Coding timeline folds a round's steps like the Assistant's process and keeps what the person opened", { timeout: 60000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-process-fold-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    await page.command("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.evaluate(`(()=>{${pageTextScript("zh")}})()`);
    // The workbench sheet the Coding frame and the Assistant both draw with; the Assistant's process rules live under the workbench body.
    await page.evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(renderMolisWorkWorkbenchWithPluginStylesheets())};document.head.append(style);
      document.body.className='immersive-workbench';document.body.innerHTML='<main style="width:760px;padding:24px"><section data-coding-block></section><div data-assistant-fixture></div></main>';})()`);
    // The factory reaches the page by toString in production, so it does here.
    await page.evaluate(`(()=>{
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
      const detail=document.createElement('details');detail.className='coding-activity';detail.dataset.codingActivity='r:a';document.querySelector('[data-coding-block]').append(detail);
      const lines=(n,from=1)=>Array.from({length:n},(_,i)=>'line '+(i+from)).join('\\n');
      const read={call_id:'a',name:'read',target:'src/login.ts',state:'completed',output:'export function login() {}'};
      const command={call_id:'b',name:'run-command',target:'npm test',state:'started',output:lines(40)};
      window.__fold={timeline,detail,lines,read,command,draw:(phase,activity)=>timeline.renderGroup(detail,activity,{ref:{run_id:'r'},phase,started_at:new Date(Date.now()-4000).toISOString(),activity},true)};
      window.__fold.draw('running',[read,command]);
    })()`);
    const first = await page.evaluate<{ open: boolean; summary: string; tools: string[] }>(`(()=>{const {detail}=window.__fold;
      return {open:detail.open,summary:detail.querySelector(':scope > summary').textContent.trim(),tools:[...detail.querySelectorAll('.coding-tool')].map(node=>node.dataset.tool)};})()`);
    assert.equal(first.open, false, "VUX-13: the round streaming in does not open the group by itself");
    assert.equal(first.summary, "正在运行 npm test", "the folded group says what is happening now, from the step itself");
    assert.deepEqual(first.tools, ["a", "b"]);

    // The person opens the group and the running command, focuses it and scrolls its output.
    await page.click(".coding-activity > summary");
    // The group opens to its natural height first; the step is reachable once it has.
    await page.evaluate(`new Promise(done=>setTimeout(done,400))`);
    await page.click(".coding-tool[data-tool=b] > summary");
    await page.evaluate(`new Promise(done=>setTimeout(done,400))`);
    await page.evaluate(`(()=>{const node=document.querySelector('.coding-tool[data-tool=b]');window.__b=node;window.__bPre=node.querySelector('.coding-tool-output');
      node.querySelector('summary').focus();window.__bPre.scrollTop=60;window.__a=document.querySelector('.coding-tool[data-tool=a]');})()`);
    const opened = await page.evaluate<{ group: boolean; step: boolean; scrolled: number }>(`({group:window.__fold.detail.open,step:window.__b.open,scrolled:window.__bPre.scrollTop})`);
    assert.deepEqual(opened, { group: true, step: true, scrolled: 60 });

    // More output and a later step stream in, then the command ends and the round finishes.
    await page.evaluate(`(()=>{const f=window.__fold;f.draw('running',[f.read,{...f.command,output:f.lines(60)},{call_id:'c',name:'edit',target:'src/login.ts',state:'started'}]);window.__c=document.querySelector('.coding-tool[data-tool=c]');})()`);
    const streaming = await page.evaluate<{ same: boolean; open: boolean; focused: boolean; pre: boolean; scrolled: number; summary: string }>(`({same:document.querySelector('.coding-tool[data-tool=b]')===window.__b,open:window.__b.open,
      focused:document.activeElement===window.__b.querySelector('summary'),pre:window.__b.querySelector('.coding-tool-output')===window.__bPre,scrolled:window.__bPre.scrollTop,summary:window.__fold.detail.querySelector(':scope > summary').textContent.trim()})`);
    assert.deepEqual(streaming, { same: true, open: true, focused: true, pre: true, scrolled: 60, summary: "正在修改 src/login.ts" },
      "VUX-13: the opened step is changed in place while a later step streams in: same node, open, focused, scrolled where the person left it");
    await page.evaluate(`(()=>{const f=window.__fold;const done=[f.read,{...f.command,state:'completed',output:'exit 2\\n'+f.lines(30)},{call_id:'c',name:'edit',target:'src/login.ts',state:'completed'}];
      f.draw('running',done);f.draw('completed',done);})()`);
    const settled = await page.evaluate<{ group: boolean; groupSame: boolean; b: boolean; focused: boolean; a: boolean; c: boolean; tools: string[]; summary: string; state: string; lines: Array<{ verb: string; object: string; result: string; tone: string; control: boolean }> }>(`(()=>{const f=window.__fold;
      return {group:f.detail.open,groupSame:document.querySelector('[data-coding-activity="r:a"]')===f.detail,b:document.querySelector('.coding-tool[data-tool=b]')===window.__b && window.__b.open,focused:document.activeElement===window.__b.querySelector('summary'),
        a:document.querySelector('.coding-tool[data-tool=a]')===window.__a && !window.__a.open,c:document.querySelector('.coding-tool[data-tool=c]')===window.__c,
        tools:[...f.detail.querySelectorAll('.coding-tool')].map(node=>node.dataset.tool),summary:f.detail.querySelector(':scope > summary').textContent.trim(),state:f.detail.dataset.state,
        lines:[...f.detail.querySelectorAll('.coding-tool')].map(node=>({verb:node.querySelector('.coding-tool-verb').textContent,object:node.querySelector('code')?.textContent??'',result:node.querySelector('.coding-tool-state').textContent.trim(),tone:node.dataset.tone,control:node.matches('details')}))};})()`);
    assert.deepEqual({ group: settled.group, groupSame: settled.groupSame, b: settled.b, focused: settled.focused, a: settled.a, c: settled.c },
      { group: true, groupSame: true, b: true, focused: true, a: true, c: true }, "VUX-13: the round ending neither closes nor replaces what the person opened, nor opens what they did not");
    assert.deepEqual(settled.tools, ["a", "b", "c"], "every step once, in the run's order; nothing added");
    assert.equal(settled.summary, "读取 1 个文件 · 运行 1 条命令 · 修改 1 个文件 · 1 项未成功", "the group counts what the run recorded");
    assert.equal(settled.state, "failed");
    // Each line: operation, object, result; the exit code is read from the command's own receipt (BL-222 note), nothing else is marked.
    assert.deepEqual(settled.lines, [
      { verb: "读取", object: "src/login.ts", result: "", tone: "ok", control: true },
      { verb: "运行", object: "npm test", result: "exit 2", tone: "failed", control: true },
      { verb: "修改", object: "src/login.ts", result: "", tone: "ok", control: false },
    ], "a step with nothing behind it is a plain line, not a control that opens nothing");
    const technical = await page.evaluate<{ closed: number; behind: string }>(`({closed:Math.round(window.__a.querySelector('.coding-tool-body').getBoundingClientRect().height),behind:window.__a.querySelector('.coding-tool-output').textContent})`);
    assert.deepEqual(technical, { closed: 0, behind: "export function login() {}" }, "what came back sits behind the step's own disclosure");

    // The same folds as the Assistant's process: chevron, type, row, motion.
    await page.evaluate(`(()=>{document.querySelector('[data-assistant-fixture]').innerHTML='<details class="assistant-steps" open><summary class="assistant-steps-summary">读取 Goals · 2 步</summary><div class="assistant-steps-body"><p class="assistant-activity"><span>已读取 Goals</span></p><details class="assistant-activity-fold" open><summary class="assistant-activity"><span>读取 Goals — 没有完成</span></summary><div class="assistant-activity-detail"><p>goals.document.read</p></div></details></div></details>';})()`);
    await page.evaluate(`new Promise(done=>setTimeout(done,400))`);
    const look = await page.evaluate<Record<"coding" | "assistant", Record<string, string>>>(`(()=>{
      const read=(group,step,plain)=>{const g=getComputedStyle(group),gs=group.querySelector(':scope > summary'),ss=step.querySelector(':scope > summary');
        return {groupFont:g.fontSize,groupColor:g.color,groupChevron:getComputedStyle(gs,'::before').content,groupChevronTurn:getComputedStyle(gs,'::before').transform,groupPadding:getComputedStyle(gs).padding,groupRadius:getComputedStyle(gs).borderRadius,
          stepChevron:getComputedStyle(ss,'::after').content,stepChevronTurn:getComputedStyle(ss,'::after').transform,stepPadding:getComputedStyle(ss).padding,lineFont:getComputedStyle(plain.querySelector('.coding-tool-head')??plain).fontSize,
          rowHeight:String(Math.round(plain.getBoundingClientRect().height)),rowGap:getComputedStyle(plain).paddingTop,
          groupMotion:getComputedStyle(group,'::details-content').transitionProperty+' '+getComputedStyle(group,'::details-content').transitionDuration,stepMotion:getComputedStyle(step,'::details-content').transitionProperty+' '+getComputedStyle(step,'::details-content').transitionDuration};};
      const assistant=document.querySelector('.assistant-steps');
      return {coding:read(window.__fold.detail,window.__b,window.__c),assistant:read(assistant,assistant.querySelector('.assistant-activity-fold'),assistant.querySelector('p.assistant-activity'))};})()`);
    assert.match(look.coding.groupMotion!, /grid-template-rows/, "VUX-13: the group opens to its natural height (disclosure-segmented)");
    assert.match(look.coding.stepMotion!, /grid-template-rows/, "VUX-13: a step opens to its natural height (disclosure-segmented)");
    assert.deepEqual(look.coding, look.assistant, "VUX-13: the Coding process folds look and move like the Assistant's");

    // For review: the Coding group beside the Assistant's, both open (ignored directory, see docs/system/REPOSITORY-HYGIENE.md).
    const review = join(process.cwd(), ".impeccable/qa/review/coding-process-fold"); mkdirSync(review, { recursive: true });
    await page.screenshot(join(review, "coding-and-assistant.png"));
    // The group grows over frames when opened, and only grows.
    await page.evaluate("window.__fold.detail.open=false"); await page.evaluate(`new Promise(done=>setTimeout(done,500))`);
    const opening = await page.evaluate<number[]>(`new Promise(done=>{const group=window.__fold.detail,body=group.querySelector('.coding-tool-list'),heights=[];group.open=true;const start=performance.now();
      const step=()=>{heights.push(Math.round(body.getBoundingClientRect().height));if(performance.now()-start<450)requestAnimationFrame(step);else done(heights);};requestAnimationFrame(step);})`);
    const full = opening.at(-1)!;
    assert.ok(full > 40 && opening[0]! < full && opening.some(height => height > opening[0]! && height < full), `the group grows to its height over frames: ${opening.join(",")}`);
    assert.ok(opening.every((height, index) => index === 0 || height >= opening[index - 1]!), "it only grows while it opens");
    // Reduced motion: the same folds open at once, and still turn their chevron.
    await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const still = await page.evaluate<{ group: string; step: string; chevron: string }>(`({group:getComputedStyle(window.__fold.detail,'::details-content').transitionDuration,step:getComputedStyle(window.__b,'::details-content').transitionDuration,
      chevron:getComputedStyle(window.__fold.detail.querySelector(':scope > summary'),'::before').transform})`);
    assert.match(still.group, /^0s/);
    assert.match(still.step, /^0s/);
    assert.notEqual(still.chevron, "none", "the chevron still says it is open");
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
