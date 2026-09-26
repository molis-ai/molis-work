import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { ChromeHarness } from "./fixtures/plugin-builder-browser.js";

// The TaskBoard reads like the Goal list: rounds, their steps and subagents nested, each with its state, progress,
// prerequisites, time and the Agent doing it. Rounds continuing one step graph are one task.
test("TaskBoard：像 Goal 列表一样分层；接续的轮次合成一行；前置、验收、执行者和子代理都看得见", { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-taskboard-"));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    const result = await page.evaluate<any>(`(async()=>{
      document.body.innerHTML='<section data-coding-board><h2 data-coding-board-title></h2><p data-coding-board-meta></p><div data-coding-board-list></div><p data-coding-board-status></p></section>';
      const board=document.querySelector('[data-coding-board]'),went=[],amended=[];
      const names={builder:'构建者','coding-reviewer':'独立评审'};
      const api=(${CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT})({board,current:()=>'s',status:()=>{},ownTask:text=>text,roleName:id=>names[id]||id,
        navigate:async(id,target)=>{went.push(target);},amend:async(runId,version,amendment)=>{amended.push({runId,version,amendment});}});
      const t0=Date.parse('2026-09-25T07:00:00Z');
      const plan={revision:2,content:{title:'让 @ 引用支持裸名字',steps:[{title:'放行裸名字',acceptance:'a'},{title:'读不到就丢弃',acceptance:'b'},{title:'跑测试',acceptance:'c'}],blockers:'',change_reason:''}};
      const nodes=[{id:'step-1',state:'succeeded',reports:[{note:'改好了',at_ms:t0+60000}]},{id:'step-2',state:'running',depends_on:['step-1'],reports:[{note:'开始',at_ms:t0+120000}]},{id:'step-3',state:'not-started',depends_on:['step-2'],reports:[]}];
      const entry=(run_id)=>({run_id,revision:2,plan,board:{board_id:'b1',version:5,terminal:false,nodes},verdicts:{'step-1':{status:'accepted',board_version:5}}});
      const frozen={role_id:'builder',model_id:'m',character:{title:'审慎的构建者'},directory:{canonical_path:'/w'}};
      api.update('s',{session:{title:'会话'},plan:{...plan,revision:3,confirmed:{artifact_id:'x',version:1}},
        runs:[{ref:{run_id:'r1'},phase:'stopped',started_at:new Date(t0).toISOString(),frozen,task:'按计划执行'},{ref:{run_id:'r2'},phase:'running',started_at:new Date(t0+90000).toISOString(),frozen,task:'继续'}],
        taskboard_plans:[entry('r1'),entry('r2')],
        subagents:[{run_id:'r2',children:[{subagent_id:'c1',role_id:'coding-reviewer',role_name:'独立评审',task:'运行测试\\n并报告',state:'running',activity:[{at:new Date(t0+130000).toISOString()}],workspace_path:'/w'},
          {subagent_id:'c2',role_id:'coding-reviewer',role_name:'独立评审',task:'核对边界',state:'failed',activity:[],workspace_path:'/w'}]}]});
      board.hidden=false;api.show();
      const rows=[...board.querySelectorAll('.coding-board-entry')].map(entry=>({depth:Number(entry.parentElement.style.getPropertyValue('--board-depth')),
        key:entry.querySelector('.coding-board-key')?.textContent,title:entry.querySelector('.coding-board-node strong').textContent,state:entry.querySelector('.coding-board-state').textContent,
        progress:entry.querySelector('.coding-board-progress:not(.is-empty) > span')?.textContent||'',deps:(entry.querySelector('.coding-board-deps > summary')||entry.querySelector('.coding-board-deps.is-note'))?.textContent||'',
        agent:entry.querySelector('.coding-board-agent').textContent,avatar:entry.querySelector('.coding-board-avatar').title,tools:entry.querySelectorAll('.coding-board-tools button').length}));
      const groups=[...board.querySelectorAll('.coding-board-fold > summary')].map(summary=>summary.textContent);
      board.querySelector('[data-board-key="step-r2-step-2"] .coding-board-node').click();
      board.querySelector('[data-board-key="run-r2"] .coding-board-toggle').click();
      const afterCollapse=board.querySelectorAll('.coding-board-entry').length;
      board.querySelector('[data-board-key="run-r2"] .coding-board-toggle').click();
      const skip=[...board.querySelectorAll('[data-board-key="step-r2-step-3"] .coding-board-tools button')].find(button=>button.title==='跳过');skip.click();
      const form=board.querySelector('.coding-board-form');form.querySelector('input').value='先不跑';form.requestSubmit();await new Promise(r=>setTimeout(r,50));
      return {rows,groups,went,afterCollapse,amended,meta:board.querySelector('[data-coding-board-meta]').textContent};
    })()`);
    assert.deepEqual(result.groups.map((text: string) => text.replace(/\s+/g, "")), ["当前计划修订3", "执行1轮"], "an unexecuted revision is its own group; two rounds of one graph are one task");
    const [plan, ...planSteps] = result.rows.slice(0, 4);
    assert.equal(plan.state, "已确认"); assert.equal(planSteps.length, 3); assert.ok(planSteps.every((row: any) => row.depth === 1 && row.state === "待执行"));
    const rows = result.rows.slice(4);
    assert.deepEqual(rows.map((row: any) => [row.depth, row.key]), [[0, "#1–2"], [1, "S1"], [1, "S2"], [2, "子任务"], [1, "S3"], [1, "子任务"]], "the child that started during S2 sits under it; one without a start time sits under the round");
    assert.equal(rows[0].progress, "1/3"); assert.equal(rows[0].state, "进行中");
    assert.equal(rows[1].state, "你已验收", "the person's acceptance shows over the model's report");
    assert.equal(rows[2].deps, "1 个前置 · 已就绪"); assert.equal(rows[4].deps, "1 个前置 · 1 个未完成");
    assert.equal(rows[1].agent, "审慎的构建者"); assert.match(rows[1].avatar, /Character「审慎的构建者」/, "who does the step: the round's Character");
    assert.equal(rows[3].agent, "独立评审"); assert.equal(rows[3].title, "运行测试 并报告"); assert.equal(rows[5].state, "失败");
    assert.ok(rows[4].tools >= 2, "a live step waiting to start can be moved, skipped or followed by an inserted step");
    assert.deepEqual(result.went, [{ kind: "step", run_id: "r2", step_id: "step-2" }]);
    assert.equal(result.afterCollapse, 4 + 1, "collapsing a round hides its steps and subagents");
    assert.deepEqual(result.amended, [{ runId: "r2", version: 5, amendment: { kind: "skip", node: "step-3", reason: "先不跑" } }]);
    assert.match(result.meta, /计划修订 3 · 已确认 · 1\/3 步完成/);
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});

// Every step shows who holds it on the graph: this session, a subtask it was handed to, you, or no one; and a person
// can take a step on, hand it back, record the result of their own step, or add a step for themselves.
test("TaskBoard：每一步显示负责人（本会话/子任务/你/没人认领），可以认领、交回、标记自己那一步的结果", { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-taskboard-owner-"));
  const browser = await ChromeHarness.start(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    const result = await page.evaluate<any>(`(async()=>{
      document.body.innerHTML='<section data-coding-board><h2 data-coding-board-title></h2><p data-coding-board-meta></p><div data-coding-board-list></div><p data-coding-board-status></p></section>';
      const board=document.querySelector('[data-coding-board]'),amended=[];
      const api=(${CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT})({board,current:()=>'s',status:()=>{},ownTask:text=>text,roleName:id=>id==='coding-builder'?'构建者':id,
        navigate:async()=>{},amend:async(runId,version,amendment)=>{amended.push(amendment);}});
      const t0=Date.parse('2026-09-26T07:00:00Z');
      const plan={revision:1,content:{title:'四步',steps:[{title:'改 a',acceptance:'a'},{title:'改 b',acceptance:'b'},{title:'看页面',acceptance:'c'},{title:'写说明',acceptance:'d'}],blockers:'',change_reason:''}};
      const nodes=[
        {id:'step-1',state:'succeeded',owner:{kind:'session',label:'本会话'},reports:[{note:'a 改好了',at_ms:t0+1000,by:'本会话'}]},
        {id:'step-2',state:'running',depends_on:[],owner:{kind:'subtask',label:'子任务「two」',subagent_id:'c1'},reports:[{note:'本会话 → 子任务「two」（派出子任务时交给它）',at_ms:t0+2000,by:'改派',handover:true},{note:'开始改 b',at_ms:t0+3000,by:'子任务「two」'}]},
        {id:'step-3',state:'ready',depends_on:['step-1'],owner:{kind:'person',label:'用户',actor_id:'user'},reports:[{note:'本会话 → 用户（用户改派给自己处理）',at_ms:t0+4000,by:'改派',handover:true}]},
        {id:'step-4',state:'ready',depends_on:[],owner:{kind:'none',label:'没人认领'},reports:[]},
      ];
      api.update('s',{session:{title:'会话'},plan:{...plan,confirmed:{artifact_id:'x',version:1}},
        runs:[{ref:{run_id:'r1'},phase:'running',started_at:new Date(t0).toISOString(),frozen:{role_id:'writers',directory:{canonical_path:'/w'}},task:'按计划执行'}],
        taskboard_plans:[{run_id:'r1',revision:1,plan,board:{board_id:'b1',version:7,terminal:false,nodes},verdicts:{}}],
        // The subtask started before any report, so only its hold on step-2 places it there.
        subagents:[{run_id:'r1',children:[{subagent_id:'c1',role_id:'coding-builder',role_name:'构建者',task:'改 b',state:'running',activity:[{at:new Date(t0).toISOString()}],workspace_path:'/w/writer-0'}]}]});
      board.hidden=false;api.show();
      const row=(key)=>board.querySelector('[data-board-key="'+key+'"] > .coding-board-entry');
      const view=(key)=>{const entry=row(key);return {agent:entry.querySelector('.coding-board-agent').textContent,avatar:entry.querySelector('.coding-board-avatar').title,
        owner:entry.querySelector('.coding-board-meta').dataset.owner||'',tools:[...entry.querySelectorAll('.coding-board-tools button')].map(button=>button.title)};};
      const steps={one:view('step-r1-step-1'),two:view('step-r1-step-2'),three:view('step-r1-step-3'),four:view('step-r1-step-4')};
      const under=[...board.querySelectorAll('[data-board-key="step-r1-step-2"] .coding-board-children [data-board-key]')].map(item=>item.dataset.boardKey);
      const press=(key,title)=>[...row(key).querySelectorAll('.coding-board-tools button')].find(button=>button.title===title).click();
      press('step-r1-step-4','由我处理');await new Promise(r=>setTimeout(r,20));
      press('step-r1-step-3','标记完成');let form=board.querySelector('.coding-board-form');form.querySelector('input').value='页面正常，截图已看';form.requestSubmit();await new Promise(r=>setTimeout(r,20));
      press('step-r1-step-1','在后面插入一步');form=board.querySelector('.coding-board-form');const [title,acceptance,mine]=form.querySelectorAll('input');
      title.value='手工核对';acceptance.value='没有报错';mine.checked=true;form.requestSubmit();await new Promise(r=>setTimeout(r,20));
      return {steps,under,amended,meta:board.querySelector('[data-coding-board-meta]').textContent};
    })()`);
    assert.equal(result.steps.one.agent, "writers"); assert.match(result.steps.one.avatar, /负责：本会话/);
    assert.equal(result.steps.two.agent, "子任务「two」"); assert.match(result.steps.two.avatar, /子代理 构建者/);
    assert.deepEqual(result.under, ["child-c1"], "the subtask sits under the step it holds");
    assert.equal(result.steps.three.agent, "你"); assert.equal(result.steps.three.owner, "person");
    assert.ok(result.steps.three.tools.includes("标记完成") && result.steps.three.tools.includes("标记失败") && result.steps.three.tools.includes("交回本会话"));
    assert.ok(!result.steps.three.tools.includes("由我处理"));
    assert.equal(result.steps.four.agent, "没人认领"); assert.equal(result.steps.four.owner, "none");
    assert.ok(result.steps.four.tools.includes("由我处理") && result.steps.four.tools.includes("交给本会话"));
    assert.ok(result.steps.two.tools.includes("由我处理") && result.steps.two.tools.includes("交回本会话") && !result.steps.two.tools.includes("标记完成"));
    assert.deepEqual(result.amended, [
      { kind: "assign", node: "step-4", to: "me" },
      { kind: "resolve", node: "step-3", state: "succeeded", note: "页面正常，截图已看" },
      { kind: "insert", after: "step-1", title: "手工核对", acceptance: "没有报错", mine: true },
    ]);
    assert.match(result.meta, /1 步在子任务手上 · 你负责 1 步 · 没人认领 1 步/);
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
