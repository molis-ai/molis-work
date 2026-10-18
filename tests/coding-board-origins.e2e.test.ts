import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { STATE_RING_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT, CODING_STYLES, CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";

// specs/ai-input-receipts §4.5, D2, stage 3d-3: a supplement the AI calls a new task shows on the plan card as the AI's
// words, dashed, until the person adds it; the step added for it, on the card and on the TaskBoard, links back to its receipt.
test("RCPT-352/353 the AI's new task waits on the plan card for the person; the step added for a supplement links back to it on both boards", { timeout: 30000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-board-origins-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  try {
    const page = await browser.page();
    const result = await page.evaluate<{ offers: string[]; steps: string[][]; dashed: string; prefilled: string; posted: unknown[]; endedOffers: number; badges: string[][]; opened: string[] }>(`(async()=>{
      document.body.innerHTML='<section data-coding-board><h2 data-coding-board-title></h2><p data-coding-board-meta></p><div data-coding-board-list></div><p data-coding-board-status></p></section>';
      ${STATE_RING_CLIENT_SCRIPT}
      const sheet=document.createElement('style');sheet.textContent=${JSON.stringify(CODING_STYLES)};document.head.append(sheet);document.documentElement.style.setProperty('--line','#ccc');
      const board=document.querySelector('[data-coding-board]'),lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(document.body),posted=[],opened=[];
      // The shared receipt's link as Coding hands it on: a button only for a step pointing at a supplement.
      const from=(node,first)=>{const one=node?.origins?.[0];if(!one)return null;const button=document.createElement('button');button.className='mw-btn--link';button.textContent='来自补充「'+one.input_id+'」';button.onclick=()=>{first?.();opened.push(one.input_id);};return button;};
      const taskboard=(${CODING_TASKBOARD_CLIENT_FACTORY_SCRIPT})({lifetime,board,current:()=>'s',status:()=>{},ownTask:text=>text,roleName:id=>id,navigate:async()=>{},amend:async()=>{},
        from:node=>from(node,()=>opened.push('board closed'))});
      const card=(${CODING_PLAN_PROGRESS_CLIENT_FACTORY_SCRIPT})({lifetime,api:async(path,method,body)=>{posted.push({path,method,body});return {board:{terminal:false},steered:true};},current:()=>'s',status:()=>{},refresh:async()=>{},openStep:()=>{},
        from:node=>from(node),stepOf:taskboard.stepOf,skipped:taskboard.skipped,settled:taskboard.settled});
      const claim=(id,treatment,text)=>({turn_id:id,kind:'user',text,steer:{id,state:'read',model_claim:{treatment,targets:[],impacts:['scope'],revisions:1}}});
      const turns=[claim('in-1','new-task','顺便把注册接口也覆盖一下'),claim('in-2','apply-now','日志改成中文'),claim('in-3','new-task','再加一个导出')];
      const plan={revision:2,content:{title:'改登录',steps:[{title:'改登录接口',acceptance:'测试通过'}]}};
      const nodes=[{id:'step-1',state:'running',reports:[{note:'开始',at_ms:1}]},{id:'user-1',state:'not-started',inserted:true,title:'导出',depends_on:['step-1'],origins:[{session_id:'s',input_id:'in-3'}],reports:[{note:'用户插入：导出；完成条件：能导出',at_ms:2}]}];
      const run={ref:{run_id:'r1'},phase:'running',started_at:new Date(0).toISOString(),frozen:{role_id:'builder'},turns};
      const entry={run_id:'r1',revision:2,plan,board:{project_id:'b',version:3,terminal:false,nodes},verdicts:{}};
      const shown=card.render(run,entry,true,true);document.body.append(shown);
      const offers=[...shown.querySelectorAll('.coding-plan-offer')].map(row=>row.textContent);
      const steps=[...shown.querySelectorAll('.coding-plan-step')].map(row=>[row.dataset.step,row.querySelector('.mw-btn--link')?.textContent||'']);
      const dashed=getComputedStyle(shown.querySelector('.coding-plan-offer')).borderStyle;
      shown.querySelector('.coding-plan-offer button').click();
      const form=shown.querySelector('.coding-plan-form'),[title,acceptance]=form.querySelectorAll('input'),prefilled=title.value;
      acceptance.value='注册的测试通过';form.requestSubmit();await new Promise(resolve=>setTimeout(resolve,0));
      const ended=card.render(run,{...entry,board:{...entry.board,version:4,terminal:true}},false,true);
      taskboard.update('s',{session:{title:'会话'},plan:{...plan,confirmed:{artifact_id:'x',version:1}},runs:[run],taskboard_plans:[entry]});board.hidden=false;taskboard.show();await Promise.resolve();
      const badges=[...board.querySelectorAll('.coding-board-entry')].flatMap(row=>{const link=row.querySelector('.mw-btn--link');return link?[[row.querySelector('.coding-board-node strong').textContent,link.textContent]]:[];});
      board.querySelector('.coding-board-entry .mw-btn--link').click();
      return {offers,steps,dashed,prefilled,posted,endedOffers:ended.querySelectorAll('.coding-plan-offer').length,badges,opened};
    })()`);
    assert.deepEqual(result.offers, ["AI 说这是新任务，待你确认顺便把注册接口也覆盖一下加进计划"], "RCPT-352 only a new task no step points at yet, as the AI's words; an applied one and one already added are not offered");
    assert.equal(result.dashed, "dashed", "RCPT-352 it is drawn dashed, apart from the steps");
    assert.deepEqual(result.steps, [["step-1", ""], ["user-1", "来自补充「in-3」"]], "RCPT-352 the claim alone adds no step; RCPT-353 the step added for a supplement links back to it");
    assert.equal(result.prefilled, "顺便把注册接口也覆盖一下", "the supplement's words start the title");
    assert.deepEqual(result.posted, [{ path: "/sessions/s/runs/r1/plan-amendments", method: "POST",
      body: { amendment: { kind: "insert", after: "user-1", title: "顺便把注册接口也覆盖一下", acceptance: "注册的测试通过", origin: "in-1" }, expected_version: 3 } }], "RCPT-352 only the person's 「加进计划」 adds it, through the person's insert, naming the supplement");
    assert.equal(result.endedOffers, 0, "a finished plan offers nothing");
    assert.deepEqual(result.badges, [["导出", "来自补充「in-3」"]], "RCPT-353 the TaskBoard shows the same link on the same step");
    assert.deepEqual(result.opened, ["board closed", "in-3"], "RCPT-353 from the TaskBoard, the board closes before the receipt opens");
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
