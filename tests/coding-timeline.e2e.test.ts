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
    const result = await page.evaluate<Record<"waiting" | "running" | "done" | "stopped" | "failed", Reading>>(`(()=>{
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
        stopped:read({...base,phase:'stopped',stop_reason:'已停止',ended_at:new Date().toISOString(),activity:[]}),
        failed:read({...base,phase:'failed',stop_reason:'模型请求超时',ended_at:new Date().toISOString(),activity:[]}),
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
    assert.doesNotMatch(result.stopped.footer, /已停止.*已停止/, "只复述标题的停止原因不再重复一遍");
    assert.match(result.failed.footer, /模型请求超时/, "真正的失败原因保留");
    const thinking = await page.evaluate<{ live: string; done: string; rows: string[]; preview: string; body: string }>(`(()=>{
      const timeline=(${createCodingTimeline.toString()})();
      const detail=document.createElement('details');detail.dataset.codingActivity='t:0';document.body.append(detail);
      const text=()=>detail.querySelector('summary').textContent.trim();
      const thought={call_id:'reasoning-2',name:'reasoning',target:'',state:'started',output:'先确认入口在哪里。\\n然后看会话校验。'};
      timeline.renderGroup(detail,[thought],{ref:{run_id:'t'},phase:'running',activity:[]},true);const live=text();
      timeline.renderGroup(detail,[{...thought,state:'completed'},{call_id:'c',name:'read',target:'src/login.ts',state:'completed'}],{ref:{run_id:'t'},phase:'completed',activity:[]},true);
      return {live,done:text(),rows:[...detail.querySelectorAll('.coding-tool-state')].map(node=>node.textContent.trim()),preview:detail.querySelector('[data-kind=reasoning] .coding-tool-preview')?.textContent,body:detail.querySelector('[data-kind=reasoning] .coding-tool-output')?.textContent};
    })()`);
    assert.equal(thinking.live, "正在思考");
    assert.equal(thinking.done, "思考 · 读取 1 个文件", "思考不计成工具次数");
    assert.equal(thinking.preview, "先确认入口在哪里。", "折叠时预览第一行");
    assert.match(thinking.body, /然后看会话校验/);
    assert.deepEqual(thinking.rows, ["", ""], "思考完成不打勾，读取也没有退出码");
    const resume = await page.evaluate<Record<string, string>>(`(()=>{
      const timeline=(${createCodingTimeline.toString()})();
      const card=(run,latest)=>{const block=document.createElement('section');document.body.append(block);timeline.renderFooter(block,{ref:{run_id:run.id},started_at:null,ended_at:null,activity:[],...run},0,latest);
        const b=block.querySelector('[data-coding-continue],[data-coding-recover-continue],[data-coding-nudge]');return (b?b.textContent.trim()+'|':'none|')+block.querySelector('header strong')?.textContent.trim()+'|'+block.querySelector('.coding-run-reason')?.textContent.trim();};
      return {
        stopped:card({id:'a',phase:'stopped',stop_reason:'已停止'},true),
        older:card({id:'b',phase:'stopped',stop_reason:'已停止'},false),
        network:card({id:'c',phase:'failed',stop_reason:'MODEL_NETWORK_FAILED: fetch failed'},true),
        interrupted:card({id:'d',phase:'reconcile-required',stop_reason:'运行中断'},true),
        done:card({id:'e',phase:'completed'},true),
        stalled:card({id:'f',phase:'completed',turns:[{kind:'user',text:'改 README'},{kind:'assistant',text:'我先读 README.md 确认小节位置。'}]},true),
        answered:card({id:'g',phase:'completed',turns:[{kind:'user',text:'解释一下'},{kind:'assistant',text:'这个函数统计区间内的打卡次数。'}]},true),
      };
    })()`);
    assert.match(resume.stopped, /^从断点继续\|/, "最新一轮停下后可一键继续");
    assert.match(resume.older, /^none\|/, "更早的轮次不提供继续，避免从旧断点重来");
    assert.match(resume.network, /^从断点继续\|这一轮没有完成\|连不上模型服务：检查网络或代理后，从断点继续即可。\s*MODEL_NETWORK_FAILED/, "失败原因翻成人话，原始错误码仍保留");
    assert.match(resume.interrupted, /^核对并继续\|/, "中断的轮次先核对再继续");
    assert.match(resume.done, /^none/, "完成的轮次没有继续按钮");
    assert.match(resume.stalled, /^让它继续\|这一轮只说了下一步就结束了\|模型说了要做什么，但没有调用任何工具就结束了/, "只宣布下一步就结束的一轮不算完成，由你一键让它继续");
    assert.match(resume.answered, /^none\|这一轮完成/, "直接作答的讨论不被误判");
    // A restart leaves an interrupted round without an end time: its duration stops at the last recorded moment, so
    // redrawing the card later changes nothing and the 核对并继续 button under the pointer is not replaced.
    const cutOff = await page.evaluate<{ facts: string; same: boolean; kept: boolean; bare: string }>(`(async()=>{
      const timeline=(${createCodingTimeline.toString()})();
      const block=document.createElement('section');document.body.append(block);
      const run={ref:{run_id:'r'},phase:'reconcile-required',stop_reason:'运行中断',started_at:'2026-09-25T10:00:00Z',ended_at:null,
        activity:[{call_id:'e1',name:'edit',target:'src/a.ts',state:'completed',at:'2026-09-25T10:01:05Z'}],turns:[{kind:'user',text:'改',at:'2026-09-25T10:00:00Z'}]};
      timeline.renderFooter(block,run,0,true);const first=block.querySelector('.coding-run-footer').dataset.html,button=block.querySelector('[data-coding-recover-continue]');
      await new Promise(resolve=>setTimeout(resolve,1100));timeline.renderFooter(block,run,0,true);
      const bare=document.createElement('section');document.body.append(bare);
      timeline.renderFooter(bare,{...run,ref:{run_id:'s'},activity:[{...run.activity[0],at:null}]},0,true);
      return {facts:block.querySelector('.coding-run-facts').textContent,same:block.querySelector('.coding-run-footer').dataset.html===first,kept:block.querySelector('[data-coding-recover-continue]')===button,
        bare:bare.querySelector('.coding-run-facts').textContent};
    })()`);
    assert.match(cutOff.facts, /用时 1 分 5 秒/, "a cut-off round is timed to its last recorded moment, not to now");
    assert.equal(cutOff.same, true);
    assert.equal(cutOff.kept, true, "the recovery button survives a later redraw");
    assert.doesNotMatch(cutOff.bare, /用时/, "with nothing recorded after its start, a recovered round claims no duration");
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
