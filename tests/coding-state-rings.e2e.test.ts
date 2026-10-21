import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { CODING_CLIENT_FACTORY_SCRIPT, codingTimelineWords, createCodingTimeline, renderCodingWorkbench } from "@molis-ai/molis-work-plugin-coding";
import { escapeHtml, icon, INPUT_RECEIPTS_CLIENT_SCRIPT, STATE_RING_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";
import { pageText, pageTextScript } from "./fixtures/page-text.js";

// Exercise the embedded production factories from the public, shipped program; no second implementation or new API.
function embeddedFactory(name: string): string {
  const source = ts.createSourceFile("coding.js", `(${CODING_CLIENT_FACTORY_SCRIPT})`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let result = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && ts.isCallExpression(node.initializer)) {
      result = node.initializer.expression.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, `embedded production factory ${name}`);
  return result;
}

test("RING-07 Coding plan and cooperation render actual rings and preserve receipt meanings", { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-state-rings-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  const html = renderCodingWorkbench({ route_prefix: "", face: "sessions", filter: "all", sessions: [], tools: [], workspace_path: null,
    primitives: { escape: escapeHtml, icon, text: value => value, formatDate: value => value } });
  try {
    const page = await browser.page();
    await page.evaluate(`(()=>{${pageTextScript("zh")}})()`); // the scripts read the page's translator, `L`
    const result = await page.evaluate<{
      running: string[]; paused: string[]; person: string; accepted: string; labels: string[];
      commands: string[]; letters: string[]; delegation: string; errors: string[];
    }>(`(async () => {
      document.body.innerHTML=${JSON.stringify(html)};
      ${STATE_RING_CLIENT_SCRIPT}
      const root=document.querySelector('[data-coding-workbench]');root.hidden=false;
      const lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root), errors=[];
      const ports={lifetime,current:()=>'session',status:message=>errors.push(message),refresh:async()=>{},openStep:()=>{}};
      // The plan card numbers and settles steps with the TaskBoard's own helpers, as the client hands them over (3d-3).
      const taskboard=(${embeddedFactory("taskboard")})({...ports,board:root.querySelector('[data-coding-board]'),ownTask:text=>text,from:()=>null,roleName:id=>id,navigate:async()=>{},amend:async()=>{}});
      const progress=(${embeddedFactory("planProgress")})({...ports,from:()=>null,stepOf:taskboard.stepOf,skipped:taskboard.skipped,settled:taskboard.settled,word:(${INPUT_RECEIPTS_CLIENT_SCRIPT})(text=>text).step});
      const nodes=['succeeded','running','not-started','blocked','cancelled','ready'].map((state,i)=>({id:'step-'+(i+1),state,reports:[]}));
      const board={version:1,terminal:false,nodes},entry={board,verdicts:{},plan:{content:{title:'验证状态',steps:nodes.map(n=>({title:n.id,acceptance:'保留事实'}))}}};
      const run={ref:{run_id:'round'},phase:'running',frozen:{role_id:'builder'}};
      const draw=async()=>{root.append(progress.render(run,entry,true));await Promise.resolve();return [...root.querySelectorAll('.coding-plan-state .mw-state-ring')].map(n=>n.dataset.mwState);};
      const running=await draw();run.phase='paused';const paused=await draw();
      run.phase='running';nodes[1].owner={kind:'person',label:'用户'};board.version++;const person=(await draw())[1];
      entry.verdicts['step-2']={status:'accepted',board_version:board.version};const accepted=(await draw())[1];
      const labels=[...root.querySelectorAll('.coding-plan-state')].map(n=>n.textContent);
      const cooperation=(${embeddedFactory("cooperationUi")})({...ports,q:selector=>root.querySelector(selector),rounds:()=>[],
        api:async path=>path.endsWith('/background')?{commands:['running','succeeded','failed','stopped','interrupted'].map(state=>({state,summary:'command '+state}))}
          :path.endsWith('/messages')?{messages:[{state:'queued',kind:'request',body:'请检查',outgoing:true},{state:'cancelled',kind:'request',body:'请检查',history:[{event:'failed'}]}]}
          :{incoming:null,related:[],outgoing:[{delegation_id:'d',state:'accepted',state_label:'已接受，等待发送',title:'检查',deliveries:[],receipts:[]}]}});
      await cooperation.refresh(true);await Promise.resolve();
      const states=selector=>[...root.querySelectorAll(selector+' .mw-state-ring')].map(n=>n.dataset.mwState);
      return {running,paused,person,accepted,labels,commands:states('.coding-background-list .mw-status'),letters:states('[data-coding-cooperation] .coding-coop-mail .mw-status'),delegation:states('.coding-coop-card .mw-status')[0],errors};
    })()`);
    assert.deepEqual(result.running, ["done", "running", "waiting", "blocked", "cancelled", "ready"]);
    assert.deepEqual(result.paused, ["done", "paused", "waiting", "blocked", "cancelled", "ready"]);
    assert.equal(result.person, "doing", "a person's step never pretends the Agent is executing");
    assert.equal(result.accepted, "done");
    // RCPT-356: the plan card says each state in the receipt's words (host.receipts.step), handed through its port.
    assert.deepEqual(result.labels, ["模型报告完成", "你已验收", "等待前一步", "受阻，等你决定", "已取消", "可以开始"]);
    assert.deepEqual(result.commands, ["interrupted", "stopped", "failed", "done", "running"]);
    assert.deepEqual(result.letters, ["failed", "queued"], "failed receiving rounds are not voluntary cancellations");
    assert.equal(result.delegation, "ready", "accepting a delegation does not start execution");
    assert.deepEqual(result.errors, []);
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});

// VUX-40: Coding's cooperation panel, the subagent cards in the conversation, the subagent results and the usage meter draw
// no Chinese of their own through the English translator (the data below is English, as a person's would be).
test("VUX-40: cooperation, subagents and the usage meter speak English in English", { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-english-panels-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  const html = renderCodingWorkbench({ route_prefix: "", face: "sessions", filter: "all", sessions: [], tools: [], workspace_path: null,
    primitives: { escape: escapeHtml, icon, text: pageText("en"), formatDate: value => value } });
  try {
    const page = await browser.page();
    await page.evaluate(`(()=>{${pageTextScript("en")}})()`);
    const result = await page.evaluate<{ han: string[]; meter: string; cards: string; coop: string; errors: string[] }>(`(async () => {
      document.documentElement.lang='en';document.body.innerHTML=${JSON.stringify(html)};
      ${STATE_RING_CLIENT_SCRIPT}
      const root=document.querySelector('[data-coding-workbench]');root.hidden=false;
      const lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root),errors=[],q=selector=>root.querySelector(selector);
      const ports={lifetime,q,current:()=>'session',status:message=>errors.push(message),refresh:async()=>{},openStep:()=>{}};
      const timeline=(${createCodingTimeline.toString()})((${codingTimelineWords.toString()})(globalThis.L));
      const children=[{subagent_id:'c1',role_id:'builder',role_name:'Builder',state:'running',task:'Write the parser',usage:{tokens:{input:1200,output:300}}},
        {subagent_id:'c2',role_id:'reader',role_name:'Reader',state:'failed',task:'Read the docs',error:'MODEL_NETWORK_FAILED: fetch failed',integration_available:true,workspace_path:'/tmp/w/c2',
          activity:[{call_id:'e',name:'edit',target:'a.ts',state:'completed'}]},
        {subagent_id:'c3',role_id:'reviewer',role_name:'Reviewer',state:'completed',task:'Review',result:'Looks fine.',verdict:{status:'accepted',notes:'ok'}}];
      const run={ref:{run_id:'r'},phase:'running',frozen:{role_id:'coordinator'}};
      const cards=(${embeddedFactory("subagentCards")})({...ports,api:async()=>({}),timeline,showReviews:()=>{},sessionId:()=>'s',openInPanel:()=>{},parentLive:()=>true,prefill:()=>{}});
      const section=cards.render(run,{run_id:'r',children});document.body.append(section);
      const subagents=(${embeddedFactory("subagents")})({...ports,api:async()=>({}),usageSummary:usage=>'Input '+usage.tokens.input,prepareRework:async()=>{},openIntegration:()=>{}});
      subagents.update('session',[{run_id:'r',children},{run_id:'r2',children:[]}]);
      const meter=(${embeddedFactory("usageMeter")})({...ports,api:async()=>({})});
      meter.render({run_count:2,usage_total:{rounds:2,tokens:{input:90000,output:12000,cached_input:500},digests:{calls:1,tokens:{input:10,output:5}},uncertain_rounds:1},budget:{tokens:100000},next_history:{history:'digest',reason:'over 60%'}},
        {ref:{run_id:'r'},frozen:{model_context:{window_tokens:200000}},usage:{context:{tokens:50000,coverage:'partial'}}});
      q('[data-coding-meter-toggle]').click();
      const cooperation=(${embeddedFactory("cooperationUi")})({...ports,rounds:()=>[{run_id:'r',number:1,phase:'completed'}],
        api:async path=>path.endsWith('/background')?{commands:[{task_id:'t',state:'running',summary:'npm test',started_at_ms:Date.now()}]}
          :path.endsWith('/messages')?{messages:[{message_id:'m',state:'queued',kind:'request',body:'Check this',outgoing:true,await_reply:true,to_title:'Other',sent_at_ms:Date.now()}]}
          :{incoming:{delegation_id:'i',state:'delivered',state_label:'Waiting for you',title:'Fix it',task:'Fix the bug',revision:1,from:{session_id:'o',title:'Origin'},deliveries:[],receipts:[{event:'submitted',at:Date.now()}]},
            related:[{session_id:'x',title:'Sibling',relation:['same goal'],state:'running'}],
            outgoing:[{delegation_id:'d',state:'accepted',state_label:'Accepted',title:'Check',to:{session_id:'y',title:'Helper',state:'running'},revision:1,
              deliveries:[{delivery_id:'v',kind:'report',title:'Report',state:'sent',sent_at:Date.now()}],receipts:[{event:'accepted',at:Date.now()}]}]}});
      await cooperation.refresh(true);await Promise.resolve();
      root.querySelectorAll('details').forEach(node=>{node.open=true;});
      const nodes=[root,...root.querySelectorAll('*'),section,...section.querySelectorAll('*')].filter(node=>!node.closest('template'));
      const han=nodes.flatMap(node=>[...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent).concat([...node.attributes].map(attr=>attr.value)))
        .filter(value=>/[\\u3400-\\u9fff]/.test(value));
      const text=node=>node.textContent.replace(/\\s+/g,' ');
      return {han:[...new Set(han)],meter:text(q('[data-coding-meter-panel]')),cards:text(section),coop:text(root),errors};
    })()`);
    assert.deepEqual(result.han, [], "no Chinese in what these panels draw");
    assert.match(result.cards, /Dispatched 3 subtasks|Subtasks dispatched: 3/);
    assert.match(result.cards, /You accepted the conclusion/);
    assert.match(result.meter, /This session's usage/);
    assert.match(result.meter, /Used 102K \/ 100K tokens \(102%\)/, "compact numbers follow the page's language");
    assert.match(result.coop, /A delegation from another session/);
    assert.match(result.coop, /Accept and put it in the input box/);
    assert.match(result.coop, /This session is a delegation from “Origin” · Waiting for you/);
    assert.match(result.coop, /Sent request \(awaiting a reply\)/);
    assert.deepEqual(result.errors, ["This session has reached the budget you set (102K / 100K tokens). As you set it, this is only a note and nothing stops; adjust it under Context and usage."],
      "the only status line is the budget note, in English");
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
