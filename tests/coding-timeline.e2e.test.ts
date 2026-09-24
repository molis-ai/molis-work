import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCodingTimeline } from "@molis-ai/molis-work-plugin-coding";
import { ChromeHarness } from "./fixtures/plugin-builder-browser.js";

interface Reading { summary: string; rows: string[]; footer: string }

test("时间线在等审查时只让要审批的操作显示“等你批准”，完成后如实收尾", { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-timeline-"));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    // The factory is injected into the page by toString in production, so it runs here the same way.
    const result = await page.evaluate<Record<"waiting" | "running" | "done", Reading>>(`(()=>{
      const timeline=(${createCodingTimeline.toString()})();
      const block=document.createElement('section'),detail=document.createElement('details');detail.dataset.codingActivity='r:0';block.append(detail);document.body.append(block);
      const items=[{call_id:'a',name:'run-command',target:'ls -la',state:'started'},{call_id:'b',name:'grep',target:'completionRate',state:'started'}];
      const read=(run)=>{timeline.renderGroup(detail,run.activity,run,true);timeline.renderFooter(block,run,0);
        return {summary:detail.querySelector('summary').textContent.trim(),rows:[...detail.querySelectorAll('.coding-tool-state')].map(node=>node.textContent.trim()),footer:block.querySelector('.coding-run-footer').textContent.replace(/\\s+/g,' ').trim()};};
      const base={ref:{run_id:'r'},started_at:new Date(Date.now()-5000).toISOString(),activity:items};
      return {
        waiting:read({...base,phase:'awaiting-review'}),
        running:read({...base,phase:'running'}),
        done:read({...base,phase:'completed',ended_at:new Date().toISOString(),activity:[{...items[0],state:'completed',output:'exit 0\\nok'},{...items[1],state:'completed'}]}),
      };
    })()`);
    assert.equal(result.waiting.summary, "等你批准：运行 ls -la", "等审查时概要指向真正要批准的命令");
    assert.deepEqual(result.waiting.rows, ["等你批准", "等待中"], "并行的搜索不需要批准，只是等这一轮继续");
    assert.match(result.waiting.footer, /^等你决定上面这一步/, "审查卡在底部提示的上方");
    assert.deepEqual(result.running.rows, ["进行中", "进行中"]);
    assert.match(result.running.summary, /^正在/);
    assert.match(result.done.summary, /运行 1 条命令/);
    assert.deepEqual(result.done.rows, ["exit 0", ""], "退出码只来自命令回执，其他操作不虚标");
    assert.match(result.done.footer, /这一轮完成/);
    assert.match(result.done.footer, /最后一条 ls -la → exit 0/);
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
