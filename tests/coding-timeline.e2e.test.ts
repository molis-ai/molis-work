import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codingTimelineWords, createCodingTimeline, createCodingTurnChanges } from "@molis-ai/molis-work-plugin-coding";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";
import { pageTextScript } from "./fixtures/page-text.js";
import { NUMBER_STYLES } from "@molis-ai/molis-work-design-system";

interface Reading { summary: string; rows: string[]; footer: string }

test("时间线在等审查时只让要审批的操作显示“等你批准”，完成后如实收尾", { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-timeline-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    // The words come through the page's translator, as on the Coding page (`host.translate`).
    await page.evaluate(`(()=>{${pageTextScript("zh", "coding")}})()`);
    // The factory is injected into the page by toString in production, so it runs here the same way.
    const result = await page.evaluate<Record<"waiting" | "running" | "done" | "stopped" | "failed", Reading>>(`(()=>{
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
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
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
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
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
      const card=(run,latest)=>{const block=document.createElement('section');document.body.append(block);timeline.renderFooter(block,{ref:{run_id:run.id},started_at:null,ended_at:null,activity:[],...run},0,latest);
        const b=block.querySelector('[data-coding-continue],[data-coding-recover-continue],[data-coding-nudge]');return (b?b.textContent.trim()+'|':'none|')+block.querySelector('header strong')?.textContent.trim()+'|'+block.querySelector('.coding-run-reason')?.textContent.trim();};
      return {
        stopped:card({id:'a',phase:'stopped',stop_reason:'已停止'},true),
        older:card({id:'b',phase:'stopped',stop_reason:'已停止'},false),
        network:card({id:'c',phase:'failed',stop_reason:'MODEL_NETWORK_FAILED: fetch failed'},true),
        timeout:card({id:'c2',phase:'failed',stop_reason:'MODEL_NETWORK_FAILED: The operation was aborted due to timeout'},true),
        dropped:card({id:'c3',phase:'failed',stop_reason:'MODEL_NETWORK_FAILED: terminated'},true),
        server:card({id:'c4',phase:'failed',stop_reason:'MODEL_HTTP_ERROR: The model provider rejected the request (500).'},true),
        denied:card({id:'c5',phase:'failed',stop_reason:'MODEL_HTTP_ERROR: The model provider rejected the request (401).'},true),
        refused:card({id:'c6',phase:'failed',stop_reason:'EFFECT_NOT_AUTHORIZED: The App refused this model dispatch before sending: Character disabled'},true),
        interrupted:card({id:'d',phase:'reconcile-required',stop_reason:'运行中断'},true),
        done:card({id:'e',phase:'completed'},true),
        stalled:card({id:'f',phase:'completed',turns:[{kind:'user',text:'改 README'},{kind:'assistant',text:'我先读 README.md 确认小节位置。'}]},true),
        answered:card({id:'g',phase:'completed',turns:[{kind:'user',text:'解释一下'},{kind:'assistant',text:'这个函数统计区间内的打卡次数。'}]},true),
        thoughtOnly:card({id:'h',phase:'completed',activity:[{call_id:'r1',name:'reasoning',state:'completed',output:'先看看任务图',at:null}],turns:[{kind:'user',text:'继续'},{kind:'assistant',text:'我来从断点继续。先核对任务图和 README.md 的当前状态。'}]},true),
      };
    })()`);
    assert.match(resume.stopped, /^从断点继续\|/, "最新一轮停下后可一键继续");
    assert.match(resume.older, /^none\|/, "更早的轮次不提供继续，避免从旧断点重来");
    assert.match(resume.network, /^从断点继续\|这一轮没有完成\|连不上模型服务：检查网络或代理后，从断点继续即可。\s*MODEL_NETWORK_FAILED/, "失败原因翻成人话，原始错误码仍保留");
    // Each real interruption (injected on the transport while running MiniMax) reads as what it was, not as a settings problem.
    assert.match(resume.timeout, /^从断点继续\|这一轮没有完成\|模型服务长时间没有回应：/, "超时不说成连不上");
    assert.match(resume.dropped, /^从断点继续\|这一轮没有完成\|和模型服务的连接中断了：/, "流到一半断开说成连接中断");
    assert.match(resume.server, /^从断点继续\|这一轮没有完成\|模型服务暂时出错：这是服务方的问题，不是你的设置/, "5xx 不让人去查自己的设置");
    assert.match(resume.denied, /^从断点继续\|这一轮没有完成\|模型服务拒绝了凭据：/, "401 指向密钥");
    assert.match(resume.refused, /^从断点继续\|这一轮没有完成\|这一轮的授权已失效：.*没有发出任何内容.*\s*EFFECT_NOT_AUTHORIZED/, "发出前被拒不说成网络问题");
    const quiet = await page.evaluate<{ early: boolean; late: string; tool: boolean; heard: boolean }>(`(()=>{
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
      const block=document.createElement('section');document.body.append(block);
      const run={ref:{run_id:'q'},phase:'running',started_at:new Date(Date.now()-90000).toISOString(),ended_at:null,activity:[{call_id:'r',name:'reasoning',state:'started',output:'想一想',at:null}],turns:[]};
      timeline.renderFooter(block,run,0,true);
      const footer=block.querySelector('.coding-run-footer'),note=()=>block.querySelector('[data-coding-quiet]');
      const early=note().hidden;
      footer.dataset.heard=String(Date.now()-35000);timeline.tick(block);
      const late=note().hidden?'':note().textContent;
      // A command that is still running is allowed to take its time.
      timeline.renderFooter(block,{...run,activity:[...run.activity,{call_id:'c',name:'run-command',target:'npm test',state:'started',at:null}]},0,true);
      footer.dataset.heard=String(Date.now()-35000);timeline.tick(block);
      const tool=note().hidden;
      // New output resets the clock.
      timeline.renderFooter(block,{...run,activity:[{...run.activity[0],output:'想一想，再想一想'}]},0,true);timeline.tick(block);
      return {early,late,tool,heard:note().hidden};
    })()`);
    assert.equal(quiet.early, true, "刚开始不提示");
    assert.match(quiet.late, /^模型已 3\d 秒没有新输出.*可以从断点继续/, "模型一直没动静时如实说出来");
    assert.equal(quiet.tool, true, "命令还在跑不算模型没动静");
    assert.equal(quiet.heard, true, "有新输出就收起提示");
    assert.match(resume.interrupted, /^核对并继续\|/, "中断的轮次先核对再继续");
    assert.match(resume.done, /^none/, "完成的轮次没有继续按钮");
    assert.match(resume.stalled, /^让它继续\|这一轮只说了下一步就结束了\|模型说了要做什么，但没有调用任何工具就结束了/, "只宣布下一步就结束的一轮不算完成，由你一键让它继续");
    assert.match(resume.answered, /^none\|这一轮完成/, "直接作答的讨论不被误判");
    assert.match(resume.thoughtOnly, /^让它继续\|这一轮只说了下一步就结束了/, "只思考了一下、没有调用任何工具的一轮同样算没做事");
    // A restart leaves an interrupted round without an end time: its duration stops at the last recorded moment, so
    // redrawing the card later changes nothing and the 核对并继续 button under the pointer is not replaced.
    const cutOff = await page.evaluate<{ facts: string; same: boolean; kept: boolean; bare: string }>(`(async()=>{
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
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
    // A TASKBOARD_CONFLICT on a board-report that is later overridden by a successful board-report in the same
    // group is a version-conflict retry, not a real failure. The host records board-report's activity target as
    // "" (it only takes path/file_path/command/pattern/query from tool args), so matching retries by target would
    // be vacuous; matching by "any later completed board-report" is what the data actually supports.
    const retry = await page.evaluate<{ row: string; tone: string; summary: string }>(`(()=>{
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
      const detail=document.createElement('details');detail.dataset.codingActivity='r:retry';document.body.append(detail);
      const items=[
        {call_id:'br1',name:'board-report',target:'',state:'failed',output:'TASKBOARD_CONFLICT: stale version'},
        {call_id:'br2',name:'board-report',target:'',state:'completed'},
      ];
      timeline.renderGroup(detail,items,{ref:{run_id:'retry'},phase:'completed',activity:items},true);
      const row=detail.querySelector('[data-tool=br1] .coding-tool-state');
      return {row:row.textContent.trim(),tone:row.dataset.tone,summary:detail.querySelector('summary').textContent.trim()};
    })()`);
    assert.equal(retry.row, "已重试", "TASKBOARD_CONFLICT 后被同组后续成功的 board-report 覆盖,失败条目标为已重试");
    assert.equal(retry.tone, "retry");
    assert.doesNotMatch(retry.summary, /未成功/, "重试不计入未成功,摘要里没有'项未成功'");
    const plain = await page.evaluate<{ row: string; tone: string; summary: string }>(`(()=>{
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
      const detail=document.createElement('details');detail.dataset.codingActivity='r:plain';document.body.append(detail);
      const items=[{call_id:'br3',name:'board-report',target:'',state:'failed',output:'some other error'}];
      timeline.renderGroup(detail,items,{ref:{run_id:'plain'},phase:'failed',activity:items},true);
      const row=detail.querySelector('[data-tool=br3] .coding-tool-state');
      return {row:row.textContent.trim(),tone:row.dataset.tone,summary:detail.querySelector('summary').textContent.trim()};
    })()`);
    assert.equal(plain.row, "失败", "非 TASKBOARD_CONFLICT 的失败保持'失败'标");
    assert.equal(plain.tone, "failed");
    assert.match(plain.summary, /1 项未成功/, "普通失败仍然计入'未成功'摘要");
    // What a turn really wrote (specs/prologue-adoption §4.4), and a write the runtime refused because it carried a key.
    // PA-24: the per-turn changes row shows the round's real writes, and each can be rewound once the round is idle.
    const changes = await page.evaluate<{ summary: string; files: string[]; open: string; rewinds: string[]; idle: number; kept: boolean; hint: string }>(`(()=>{
      const rows=(${createCodingTurnChanges.toString()})(globalThis.L),block=document.createElement('section');document.body.append(block);
      const turn={turn:2,sequence:9,files:[{path:'src/a.ts',byte_length:120,digest:'d1',checkpoint_id:'cp-1'},{path:'docs/b.md',byte_length:40,digest:'d2',checkpoint_id:'cp-2'}]};
      const run={ref:{run_id:'w'},phase:'running',activity:[]};
      const live=rows.place(block,turn,run,false);block.append(live);
      const idle=live.querySelectorAll('[data-coding-rewind]').length;
      live.querySelector('details').open=true;
      const ended=rows.place(block,turn,{...run,phase:'completed'},true);
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
      const detail=document.createElement('details');document.body.append(detail);
      const items=[{call_id:'w1',name:'write',target:'config.ts',state:'failed',output:'WORKSPACE_SECRET_DETECTED: "config.ts" line 3 looks like a aws-access-key-id; nothing was proposed or written.'}];
      timeline.renderGroup(detail,items,{ref:{run_id:'s'},phase:'running',activity:items},true);
      return {summary:ended.querySelector('summary').textContent.trim(),files:[...ended.querySelectorAll('code')].map(node=>node.textContent),
        open:ended.querySelector('[data-coding-change-open]').dataset.codingChangeOpen,rewinds:[...ended.querySelectorAll('[data-coding-rewind]')].map(node=>node.dataset.codingRewind),
        idle,kept:ended===live && ended.querySelector('details').open,hint:detail.querySelector('.coding-tool-hint')?.textContent||''};
    })()`);
    assert.match(changes.summary, /本轮写入 2 个文件/);
    assert.deepEqual(changes.files, ["src/a.ts", "docs/b.md"]);
    assert.equal(changes.open, "w", "the row opens the round's changes");
    assert.equal(changes.idle, 0, "no rewind while the round runs");
    assert.deepEqual(changes.rewinds, ["cp-1", "cp-2"], "once idle, each write can be rewound through the reviewed preview");
    assert.equal(changes.kept, true, "the same row is redrawn in place and stays open");
    assert.match(changes.hint, /像密钥的一段，没有写入/, "a refused secret write reads in words above its raw code");
    // VUX-40: the same timeline through the English translator draws no Chinese: rows, summary, live line and cards.
    await page.evaluate(`(()=>{${pageTextScript("en", "coding")}})()`);
    const english = await page.evaluate<{ summary: string; rows: string[]; footer: string; failed: string; quiet: string; han: string[] }>(`(()=>{
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
      const block=document.createElement('section'),detail=document.createElement('details');detail.dataset.codingActivity='en:0';block.append(detail);document.body.append(block);
      const items=[{call_id:'a',name:'run-command',target:'npm test',state:'completed',output:'exit 1\\nfail'},{call_id:'b',name:'read',target:'src/a.ts',state:'completed'},
        {call_id:'c',name:'edit',target:'src/a.ts',state:'completed'},{call_id:'d',name:'reasoning',target:'',state:'completed',output:'Look first.'}];
      const run={ref:{run_id:'en'},phase:'completed',started_at:new Date(Date.now()-65000).toISOString(),ended_at:new Date().toISOString(),activity:items};
      timeline.renderGroup(detail,items,run,true);timeline.renderFooter(block,run,1,true);
      const failed=document.createElement('section');document.body.append(failed);
      timeline.renderFooter(failed,{ref:{run_id:'f'},phase:'failed',stop_reason:'MODEL_NETWORK_FAILED: fetch failed',started_at:null,ended_at:null,activity:[]},0,true);
      const live=document.createElement('section');document.body.append(live);
      timeline.renderFooter(live,{ref:{run_id:'l'},phase:'running',started_at:new Date(Date.now()-90000).toISOString(),ended_at:null,activity:[{call_id:'r',name:'reasoning',state:'started',output:'x',at:null}],turns:[]},0,true);
      live.querySelector('.coding-run-footer').dataset.heard=String(Date.now()-35000);timeline.tick(live);
      const text=node=>node.textContent.replace(/\\s+/g,' ').trim();
      const han=[block,failed,live].flatMap(node=>[node,...node.querySelectorAll('*')]).flatMap(node=>[...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent).concat([...node.attributes].map(attr=>attr.value))).filter(value=>/[\\u3400-\\u9fff]/.test(value));
      return {summary:detail.querySelector('summary').textContent.trim(),rows:[...detail.querySelectorAll('.coding-tool-state')].map(node=>node.textContent.trim()),
        footer:text(block.querySelector('.coding-run-footer')),failed:text(failed),quiet:text(live),han};
    })()`);
    assert.equal(english.summary, "Commands run: 1 · Files read: 1 · Files edited: 1 · Thought · 1 did not succeed");
    assert.deepEqual(english.rows, ["exit 1", "", "", ""]);
    assert.match(english.footer, /^This turn is done\s*Turn 2 Took 1m \d+s · Files edited: 1 · Commands run: 1 · Last: npm test → exit 1/);
    assert.match(english.footer, /View changes\s*Commit these changes…\s*Run report/);
    assert.match(english.failed, /This turn did not finish.*Can't reach the model service: Check the network or proxy, then continue from where it stopped\.\s*MODEL_NETWORK_FAILED/);
    assert.match(english.quiet, /^Working\s*\d+m \d+s\s*The model has had no new output for 3\d seconds/);
    assert.deepEqual(english.han, [], "no Chinese in the timeline's text or attributes");
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});

test("VUX-43 a live round's time keeps one format per range and one box across 9 → 10 s, 59 s → 1 min, 59 min → 1 h and up to 99 h", { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-timeline-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    const read = async (locale: "zh" | "en") => {
      await page.evaluate(`(()=>{${pageTextScript(locale, "coding")}})()`);
      return page.evaluate<Array<{ text: string; box: string; text_width: number }>>(`(()=>{
        document.body.innerHTML = ""; const style = document.createElement("style"); style.textContent = ${JSON.stringify(NUMBER_STYLES)}; document.head.append(style);
        const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
        const out = [];
        for (const seconds of [9, 10, 59, 60, 599, 600, 3599, 3600, 35999, 359940]) {
          const block=document.createElement('section');document.body.append(block);
          timeline.renderFooter(block,{ref:{run_id:'t'+seconds},phase:'running',started_at:new Date(Date.now()-seconds*1000).toISOString(),ended_at:null,activity:[],turns:[]},0,true);
          const time = block.querySelector('[data-coding-elapsed]'); time.style.fontFamily = 'system-ui';
          const range = document.createRange(); range.selectNodeContents(time);
          out.push({ text: time.textContent, box: time.getBoundingClientRect().width.toFixed(2), text_width: range.getBoundingClientRect().width });
          block.remove();
        }
        return out; })()`);
    };
    const zh = await read("zh"), en = await read("en");
    assert.deepEqual(zh.map((row) => row.text), ["9 秒", "10 秒", "59 秒", "1 分 0 秒", "9 分 59 秒", "10 分 0 秒", "59 分 59 秒", "1 小时 0 分", "9 小时 59 分", "99 小时 59 分"]);
    assert.deepEqual(en.map((row) => row.text), ["9s", "10s", "59s", "1m 0s", "9m 59s", "10m 0s", "59m 59s", "1h 0m", "9h 59m", "99h 59m"]);
    for (const [name, rows] of [["zh", zh], ["en", en]] as const) {
      assert.equal(new Set(rows.map((row) => row.box)).size, 1, `${name}: one box from 9 s to 99 h 59 m (${rows.map((row) => row.box).join(", ")})`);
      assert.ok(rows.every((row) => row.text_width <= Number(row.box) + 0.5), `${name}: every value shows whole`);
    }
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
