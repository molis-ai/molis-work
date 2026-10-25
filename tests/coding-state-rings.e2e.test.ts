import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { codingTimelineWords, createCodingTimeline, createCodingTurnChanges, renderCodingWorkbench } from "@molis-ai/molis-work-plugin-coding";
import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { INPUT_RECEIPTS_CLIENT_SCRIPT, STATE_RING_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";
import { pageText, pageTextScript } from "./fixtures/page-text.js";

// Exercise the production factories from the program the build ships; no second implementation or new API. The page is one bundle
// of typed modules; each part it is made of is also built alone (plugins/native/coding package.json "build" and scripts/build-test-pieces.mjs) as a factory `(ports) => …`.
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const pieceFile: Record<string, string> = {
  taskboard: "taskboard", planProgress: "plan-progress", cooperationUi: "cooperation", subagentCards: "subagent-cards", subagents: "subagents",
  usageMeter: "usage-meter", writerDirectories: "writers", integrations: "writer-integration", stepReports: "steps", changeReview: "changeset",
  composerModels: "composer-model", commandsUi: "commands",
};
// The two factories the page calls without keeping the result, named by the dialog they hold.
const pieceHolding: Record<string, string> = { "data-coding-character-dialog": "characters", "data-coding-actions-dialog": "actions" };

function pieceBundle(file: string | undefined): string {
  assert.ok(file, "a built part of the Coding page");
  return readFileSync(join(repoRoot, "plugins/native/coding/dist", `${file}-bundle.js`), "utf8").trim();
}

const embeddedFactoryHolding = (marker: string): string => pieceBundle(pieceHolding[marker]);
const embeddedFactory = (name: string): string => pieceBundle(pieceFile[name]);

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
      const ports={lifetime,translate:L,api:async()=>({}),current:()=>'session',status:message=>errors.push(message),refresh:async()=>{},openStep:()=>{}};
      // The plan card numbers and settles steps with the TaskBoard's own helpers, as the client hands them over (3d-3).
      const taskboard=(${embeddedFactory("taskboard")})({...ports,board:root.querySelector('[data-coding-board]'),ownTask:text=>text,from:()=>null,roleName:id=>id,navigate:async()=>{},amend:async()=>{}});
      const progress=(${embeddedFactory("planProgress")})({...ports,roleLabel:id=>id,from:()=>null,stepOf:taskboard.stepOf,skipped:taskboard.skipped,settled:taskboard.settled,word:(${INPUT_RECEIPTS_CLIENT_SCRIPT})(text=>text).step});
      const nodes=['succeeded','running','not-started','blocked','cancelled','ready'].map((state,i)=>({id:'step-'+(i+1),state,reports:[]}));
      const board={version:1,terminal:false,nodes},entry={board,verdicts:{},plan:{content:{title:'验证状态',steps:nodes.map(n=>({title:n.id,acceptance:'保留事实'}))}}};
      const run={ref:{run_id:'round'},phase:'running',frozen:{role_id:'builder'}};
      const draw=async()=>{root.append(progress.render(run,entry,true));await Promise.resolve();return [...root.querySelectorAll('.coding-plan-state .mw-state-ring')].map(n=>n.dataset.mwState);};
      const running=await draw();run.phase='paused';const paused=await draw();
      run.phase='running';nodes[1].owner={kind:'person',label:'用户'};board.version++;const person=(await draw())[1];
      entry.verdicts['step-2']={status:'accepted',board_version:board.version};const accepted=(await draw())[1];
      const labels=[...root.querySelectorAll('.coding-plan-state')].map(n=>n.textContent);
      const cooperation=(${embeddedFactory("cooperationUi")})({...ports,q:selector=>root.querySelector(selector),rounds:()=>[],openSession(){},refreshSessions:async()=>{},prefill(){},materialsChanged:async()=>{},
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
      // The page names a role from its id and falls back to the id (client.ts ROLE_NAMES); the cards and results take that port.
      const roleName=id=>({builder:'Builder',reader:'Reader',reviewer:'Reviewer',coordinator:'Coordination'})[id]||id||'Agent';
      const ports={lifetime,translate:L,q,api:async()=>({}),current:()=>'session',status:message=>errors.push(message),refresh:async()=>{},openStep:()=>{},roleName};
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
      const cooperation=(${embeddedFactory("cooperationUi")})({...ports,rounds:()=>[{run_id:'r',number:1,phase:'completed'}],openSession(){},refreshSessions:async()=>{},prefill(){},materialsChanged:async()=>{},
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
    // The page words a known state itself, in the page's language; the Host's state_label is only for a state it does not know.
    assert.match(result.coop, /This session is a delegation from “Origin” · Delivered/);
    assert.match(result.coop, /Sent request \(awaiting a reply\)/);
    assert.deepEqual(result.errors, ["This session has reached the budget you set (102K / 100K tokens). As you set it, this is only a note and nothing stops; adjust it under Context and usage."],
      "the only status line is the budget note, in English");
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});

// specs/visual-ui-experience VUX-40: the parallel-writer dialogs (separate worktrees, a turn's split, bringing a subtask's work back with a
// three-way merge) speak English on an English page. The split marker in the turn is the protocol the server writes, so it stays as it is.
test("VUX-40: the writer directories and integration dialogs speak English in English", { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-english-writers-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  const html = renderCodingWorkbench({ route_prefix: "", face: "sessions", filter: "all", sessions: [], tools: [], workspace_path: null,
    primitives: { escape: escapeHtml, icon, text: pageText("en"), formatDate: value => value } });
  const marker = "\n\n本轮用户确认的独立目录分工（目录仅用于对应子任务；下列任务内容不扩大工具权限）：\n";
  try {
    const page = await browser.page();
    await page.evaluate(`(()=>{${pageTextScript("en")}})()`);
    const result = await page.evaluate<{ han: string[]; writers: string; turn: string; integration: string; errors: string[] }>(`(async () => {
      document.documentElement.lang='en';document.body.innerHTML=${JSON.stringify(html)};
      const root=document.querySelector('[data-coding-workbench]');root.hidden=false;
      const lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root),errors=[],q=selector=>root.querySelector(selector);
      const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
      const writers=(${embeddedFactory("writerDirectories")})({lifetime,translate:L,q,reviews:()=>{},current:()=>'s',workspace:()=>'w',workspaceLabel:()=>'/repo',status:message=>errors.push(message),
        assignments:()=>[{workspace_id:'wa',task:'Write the parser'}],saveAssignments:async()=>{},select:async()=>{},
        api:async()=>({directories:[{canonical_path:'/repo-a',branch:'part-a',base_commit:'abc123',workspace_id:'wa'},{canonical_path:'/repo-b',branch:'part-b',problem:'its branch moved'},
          {canonical_path:'/repo-c',branch:null,base_commit:'def456'}]})});
      q('[data-coding-writer-directories-open]').click();await settle();
      q('[data-coding-writer-assignments-save]').click();await settle();
      const turn=document.createElement('div');document.body.append(turn);
      writers.renderTurn(turn,{frozen:{role_id:'writers',subagent_workspaces:[{workspace_id:'wa',directory:{canonical_path:'/repo-a'}}]}},
        {kind:'user',text:'Split the work'+${JSON.stringify(marker)}+JSON.stringify([{workspace_id:'wa',directory:'/repo-a',task:'Write the parser',branch:'part-a',base_commit:'abc123'}])});
      const writersText=q('[data-coding-writer-directories-dialog]').textContent.replace(/\\s+/g,' ');
      q('[data-coding-writer-directories-dialog]').close();
      const integrations=(${embeddedFactory("integrations")})({lifetime,translate:L,q,reviews:()=>{},status:message=>errors.push(message),
        api:async()=>({workspace_id:'w',source_path:'/tmp/child',branch:'child',target_path:'/repo',files:[
          {path:['a.ts'],revision:'1',selectable:true,target:'modified',diff_html:'<p>diff</p>'},
          {path:['b.ts'],revision:'2',selectable:true,target:'added',before_text:null,after_text:''},
          {path:['c.ts'],revision:'3',selectable:true,target:'modified',conflict:{clean:false,merged_text:'<<<<<<< main\\nx\\n=======\\ny\\n>>>>>>> child\\n'}}]})});
      await integrations.open('s','r',{subagent_id:'c'});
      [...q('[data-coding-integration-files]').querySelectorAll('button')].find(button=>/three ways/.test(button.textContent)).click();
      const dialog=q('[data-coding-integration-dialog]');dialog.querySelectorAll('details').forEach(node=>{node.open=true;});
      const nodes=[root,...root.querySelectorAll('*'),turn,...turn.querySelectorAll('*')].filter(node=>!node.closest('template'));
      const han=nodes.flatMap(node=>[...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent).concat([...node.attributes].map(attr=>attr.value)))
        .filter(value=>/[\\u3400-\\u9fff]/.test(value));
      return {han:[...new Set(han)],writers:writersText,turn:turn.textContent.replace(/\\s+/g,' '),integration:dialog.textContent.replace(/\\s+/g,' '),errors};
    })()`);
    assert.deepEqual(result.han, [], "no Chinese in what these dialogs draw");
    assert.match(result.writers, /Main repository: \/repo/);
    assert.match(result.writers, /Branch: part-a.*Started from: abc123.*Include in the parallel split/);
    assert.match(result.writers, /Can no longer be used as a separate worktree: its branch moved\./);
    assert.match(result.writers, /The directory exists but isn't authorized for this project/);
    assert.match(result.writers, /Split saved, not sent yet\./);
    assert.match(result.turn, /^Split the work.*This turn's split · separate directories: 1.*Branch: part-a · started from: abc123/);
    assert.match(result.integration, /From: \/tmp\/child · child.*Back into: \/repo/);
    assert.match(result.integration, /b\.ts · added.*The file doesn't exist yet.*\(empty file\)/);
    assert.match(result.integration, /Conflict 1 · lines: main workspace 1, subtask 1.*Use the main workspace.*Keep both/);
    assert.match(result.integration, /Unresolved conflicts: 1/);
    assert.deepEqual(result.errors, []);
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});

// specs/visual-ui-experience VUX-40: a step's report dialog and the change set reader (files and writes, write states, the fixed
// version, line comments) speak English on an English page.
test("VUX-40: the step report dialog and the change set reader speak English in English", { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-english-changes-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  const html = renderCodingWorkbench({ route_prefix: "", face: "sessions", filter: "all", sessions: [], tools: [], workspace_path: null,
    primitives: { escape: escapeHtml, icon, text: pageText("en"), formatDate: value => value } });
  try {
    const page = await browser.page();
    await page.evaluate(`(()=>{${pageTextScript("en")}})()`);
    const result = await page.evaluate<{ han: string[]; step: string; stepStatus: string; files: string; reader: string; comments: string }>(`(async () => {
      document.documentElement.lang='en';document.body.innerHTML=${JSON.stringify(html)};
      const root=document.querySelector('[data-coding-workbench]');root.hidden=false;
      const lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root),errors=[],q=selector=>root.querySelector(selector);
      const steps=(${embeddedFactory("stepReports")})({lifetime,translate:L,q,current:()=>'s',status:message=>errors.push(message),refresh:async()=>{},prepareRework:()=>{},receipts:{link:()=>null},
        api:async()=>({runs:[{ref:{run_id:'r'},phase:'completed'}],taskboard_plans:[{run_id:'r',revision:2,plan:{content:{steps:[{title:'Write the parser',acceptance:'Tests pass'}]}},
          board:{project_id:'p',version:3,nodes:[{id:'step-1',state:'succeeded',owner:{kind:'person'},reports:[{by:{kind:'subtask',title:'Builder'},note:'Done it'}]}]},
          verdicts:{'step-1':{status:'needs-work',notes:'Missing an edge case',project_id:'p',board_version:2,revision:1}}}]})});
      await steps.open('s','r','step-1');
      const step=q('[data-coding-step-detail]').textContent.replace(/\\s+/g,' '),stepStatus=q('[data-coding-step-status]').textContent;
      q('[data-coding-step-dialog]').close();
      const changes=(${embeddedFactory("changeReview")})({lifetime,translate:L,root,q,turns:q('[data-coding-turns]'),current:()=>'s',closeReport:()=>{},returnToTask:()=>{},onRunOpen:()=>{},appendDraft:async()=>{},focusDraft:()=>{},
        api:async()=>({view_mode:'write',html:'<ol class="diff-rows"><li><button type="button" data-coding-line="3" data-coding-line-side="after">3</button></li></ol>',patch:'diff',
          reference:{artifact_id:'a',version:2},saved_at:Date.UTC(2026,9,20,9,30),output:null,net_groups:[{path:'a.ts',available:true,indices:[0,1]}],
          change:{files:[{path:'a.ts',kind:'modified',added_lines:2,removed_lines:1,review:{decision:'approved',execution:'applied'}},
            {path:'a.ts',kind:'modified',added_lines:1,removed_lines:0,review:{decision:'approved',execution:'failed'}},
            {path:'src/b.ts',kind:'added',added_lines:4,removed_lines:0,review:{decision:'rejected'}},{path:'c.ts',kind:'modified',added_lines:1,removed_lines:1}]}})});
      const opener=document.createElement('button');opener.dataset.codingChangeOpen='r';root.append(opener);opener.click();
      await new Promise(resolve=>setTimeout(resolve,20));
      q('[data-coding-line]').click();
      const reader=q('[data-coding-change-reader]');
      const nodes=[reader,...reader.querySelectorAll('*'),q('[data-coding-step-dialog]'),...q('[data-coding-step-dialog]').querySelectorAll('*')];
      const han=nodes.flatMap(node=>[...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent).concat([...node.attributes].map(attr=>attr.value)))
        .filter(value=>/[\\u3400-\\u9fff]/.test(value));
      return {han:[...new Set(han)],step,stepStatus,files:q('[data-coding-change-files]').textContent.replace(/\\s+/g,' '),reader:reader.textContent.replace(/\\s+/g,' '),
        comments:q('[data-coding-feedback-list]').querySelector('textarea').getAttribute('aria-label')};
    })()`);
    assert.deepEqual(result.han, [], "no Chinese in what the dialog and the reader draw");
    assert.match(result.step, /Run r · plan revision 2.*Write the parser.*Done when: Tests pass.*The model reports success; for you to check.*Held by: You.*Subtask “Builder”: Done it/);
    assert.match(result.step, /You asked for rework.*Missing an edge case.*This assessment is for an earlier report/);
    assert.equal(result.stepStatus, "The run has ended; the step reports keep their states, so check each one.");
    assert.match(result.files, /a\.ts\s*Writes: 2\s*Net change this turn.*Write 1.*Written.*Write 2.*Write failed/);
    assert.match(result.files, /b\.ts\s*new.*Rejected.*c\.ts\s*modified.*Older record/);
    assert.match(result.reader, /Fixed v2/);
    assert.match(result.reader, /Files: 3 · writes: 4/);
    assert.match(result.reader, /Click a line number to leave a comment/);
    assert.equal(result.comments, "Comment on a.ts · write 1 · line 3 after");
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});

// specs/visual-ui-experience VUX-40: the composer's model note, a turn's written files, the command palette, and the character
// and capability dialogs speak English on an English page.
test("VUX-40: the model note, a turn's changes, the palette and the character and capability dialogs speak English", { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-english-composer-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("没有可用的 Chrome"); return; }
  const html = renderCodingWorkbench({ route_prefix: "", face: "sessions", filter: "all", sessions: [], tools: [], workspace_path: null,
    primitives: { escape: escapeHtml, icon, text: pageText("en"), formatDate: value => value } });
  try {
    const page = await browser.page();
    await page.evaluate(`(()=>{${pageTextScript("en")}})()`);
    const result = await page.evaluate<{ han: string[]; note: string; changes: string; palette: string; shortcuts: string[]; characters: string; actions: string; statuses: string[] }>(`(async () => {
      document.documentElement.lang='en';document.body.innerHTML=${JSON.stringify(html)};
      const root=document.querySelector('[data-coding-workbench]');root.hidden=false;
      const lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root),statuses=[],q=selector=>root.querySelector(selector),status=message=>statuses.push(message);
      const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
      const models=(${embeddedFactory("composerModels")})({q,lifetime,translate:L,status,switchModel:async()=>{}});
      models.fill([]);models.fill([{provider_id:'p',model_id:'m1',label:'Model One',reasoning_effort:true},{provider_id:'p',model_id:'m2',label:'Model Two'}]);
      models.controls({active:true,sending:false,run:{ref:{run_id:'r'},frozen:{model_id:'m1',reasoning_effort:'high',thinking:true},model_switch:{requested:'m2'}}});
      const changes=(${createCodingTurnChanges.toString()})(globalThis.L).place(document.createElement('section'),
        {turn:1,sequence:1,files:['a.ts','b.ts','c.ts','d.ts'].map((path,n)=>({path:'src/'+path,byte_length:10+n,digest:'d'+n,checkpoint_id:'cp'+n}))},{ref:{run_id:'r'},phase:'completed',activity:[]},true);
      root.append(changes);changes.querySelector('details').open=true;
      const commands=(${embeddedFactory("commandsUi")})({lifetime,translate:L,q,input:q('[data-coding-task]'),status,commands:()=>[{slash:'new',label:'New session',keys:'Mod+Alt+N',run:()=>{}}],current:()=>'s',
        workspace:()=>'',files:async()=>({files:[]}),symbols:async()=>({symbols:[]}),sessions:()=>[{session_id:'o',title:'Other session',state_label:'Running'}],openSession:()=>{}});
      commands.openPalette();const field=q('[data-coding-palette-input]');field.value='zzz';field.dispatchEvent(new Event('input'));
      const palette=q('[data-coding-palette-list]').textContent;q('[data-coding-palette]').close();
      const characters=new Map(),skills=new Map(),titles=new Map();
      (${embeddedFactoryHolding("data-coding-character-dialog")})({lifetime,translate:L,refresh:async()=>{},q,current:()=>'s',selections:characters,titles,skillSelections:skills,save:async()=>{},controls:()=>{},status,
        api:async()=>({runtime_id:'other',characters:[{reference:{artifact_id:'c',version:1},title:'Reviewer',available:true,instructions:'Review.',host_tools:[],imported_skills:[{id:'k',name:'Lint',compatibility:'native'}]}]})});
      q('[data-coding-character-open]').disabled=false;q('[data-coding-character-open]').click();await settle();
      root.querySelectorAll('[data-coding-character-dialog] details').forEach(node=>{node.open=true;});
      const charactersText=q('[data-coding-character-dialog]').textContent.replace(/\\s+/g,' ');q('[data-coding-character-dialog]').close();
      (${embeddedFactoryHolding("data-coding-actions-dialog")})({lifetime,translate:L,refresh:async()=>{},q,current:()=>'s',selections:new Map([['s',[{capability_id:'gone.action',version:1,provider_id:'x'}]]]),save:async()=>{},controls:()=>{},status,
        interaction:()=>{},make:()=>{},sessionPath:()=>'',readCurrent:async()=>{},
        api:async()=>({actions:[{capability_id:'todo.add',version:2,operation:'write',provider:{provider_id:'todo',title:'Todo'},action:{title:'Add a todo',description:'Adds one',audiences:['agent'],kind:'action'},availability:{available:true}}]})});
      q('[data-coding-actions-open]').disabled=false;q('[data-coding-actions-open]').click();await settle();
      const actionsText=q('[data-coding-actions-dialog]').textContent.replace(/\\s+/g,' ');q('[data-coding-actions-dialog]').close();
      const nodes=[root,...root.querySelectorAll('*')].filter(node=>!node.closest('template'));
      const han=nodes.flatMap(node=>[...node.childNodes].filter(child=>child.nodeType===3).map(child=>child.textContent).concat([...node.attributes].map(attr=>attr.value)))
        .filter(value=>/[\\u3400-\\u9fff]/.test(value));
      return {han:[...new Set(han)],note:q('[data-coding-model-note]').textContent,changes:changes.textContent.replace(/\\s+/g,' '),palette,shortcuts:commands.shortcuts().map(row=>row[1]),
        characters:charactersText,actions:actionsText,statuses};
    })()`);
    assert.deepEqual(result.han, [], "no Chinese in what these draw");
    assert.equal(result.note, "This turn: m1 · Thinking effort Thorough · Thinking on · Asked to switch to m2, from the next model call");
    assert.match(result.changes, /Files written this turn: 4.*a\.ts · b\.ts · c\.ts · 4 in all.*10 bytes.*Preview rewind.*What the write receipts recorded.*See this turn's changes/);
    assert.equal(result.palette, "No matching commands or sessions");
    assert.deepEqual(result.shortcuts, ["Command palette", "Previous / next session", "Open commands in the input box", "Send", "Stop this turn"]);
    assert.match(result.characters, /No character.*Reviewer · v1.*The current runtime doesn't support character limits yet/);
    assert.match(result.characters, /Built-in tools: none\. MCP is still chosen.*Lint · needs a native Agent/);
    assert.match(result.actions, /Add a todo · v2.*Todo · The current way of running only allows queries.*gone\.action · v1.*The original capability, version or authorization isn't available/);
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});

// RAC-658-UI-01..03: real built step details word identities locally and keep task titles as data.
test("RAC-658-UI-01..03: step details localize holders and authors while preserving whole subtask titles", { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "coding-step-identity-"));
  const browser = await openStudioChrome(directory);
  if (!browser) { rmSync(directory, { recursive: true, force: true }); t.skip("No test Chrome"); return; }
  const html = renderCodingWorkbench({ route_prefix: "", face: "sessions", filter: "all", sessions: [], tools: [], workspace_path: null,
    primitives: { escape: escapeHtml, icon, text: value => value, formatDate: value => value } });
  try {
    const page = await browser.page();
    for (const locale of ["zh", "en"] as const) {
      const result = await page.evaluate<{ rows: Array<{ kind: string; title: string | null; owner: string; reports: string[]; markup: boolean }>; leaked: boolean; errors: string[] }>(`(async () => {
        ${pageTextScript(locale)}
        document.documentElement.lang=${JSON.stringify(locale)};document.body.innerHTML=${JSON.stringify(html)};
        const root=document.querySelector("[data-coding-workbench]");root.hidden=false;
        const lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root),q=selector=>root.querySelector(selector),rows=[],errors=[];
        const titles=["Parser「two」 / café [x]",'Δ ["a"]:مرحبا <b>x & y</b>',null],authors=["session","person","other","handover","subtask"];
        const node={id:"step-1",state:"succeeded",reports:[]};
        const data={runs:[{ref:{run_id:"r"},phase:"completed"}],taskboard_plans:[{run_id:"r",revision:1,
          plan:{content:{steps:[{title:"Review",acceptance:"Keep identities"}]}},board:{project_id:"p",version:1,nodes:[node]}}]};
        const steps=(${embeddedFactory("stepReports")})({lifetime,translate:L,q,current:()=>"s",api:async()=>data,
          status:message=>errors.push(message),refresh:async()=>{},prepareRework(){},receipts:{link:()=>null}});
        for (const title of titles) for (const kind of ["session","person","none","other","subtask"]) {
          const identity=kind=>({kind,label:"宿主中文原话不能作为页面身份",...(title===null?{}:{title})});
          node.owner=identity(kind);node.reports=authors.map(kind=>({by:identity(kind),note:"report-"+kind}));
          await steps.open("s","r","step-1");
          const detail=q("[data-coding-step-detail]");
          rows.push({kind,title,owner:detail.querySelectorAll("p")[3].textContent,
            reports:[...detail.querySelectorAll("ol > li")].map(li=>li.textContent),markup:Boolean(detail.querySelector("b"))});
        }
        const leaked=q("[data-coding-step-detail]").textContent.includes("宿主中文原话不能作为页面身份");
        q("[data-coding-step-dialog]").close();
        return {rows,leaked,errors};
      })()`);
      for (const row of result.rows) {
        const subtask = row.title === null ? (locale === "en" ? "Subtask" : "子任务") : locale === "en" ? `Subtask “${row.title}”` : `子任务「${row.title}」`;
        const names: Record<string, string> = locale === "en"
          ? { session: "this session", person: "You", none: "Unclaimed", other: "Other holder", handover: "Reassigned", subtask }
          : { session: "本会话", person: "你", none: "没人认领", other: "其他负责人", handover: "改派", subtask };
        assert.equal(row.owner, (locale === "en" ? "Held by: " : "负责：") + names[row.kind], `${locale} owner ${row.kind}`);
        assert.deepEqual(row.reports, ["session", "person", "other", "handover", "subtask"].map(kind => names[kind] + (locale === "en" ? ": " : "：") + "report-" + kind));
        assert.equal(row.markup, false, "a title is preserved as text, including its angle brackets");
        assert.ok(!row.owner.includes("宿主中文原话"), "the owner never uses the Host label");
        assert.ok(row.reports.every(text => !text.includes("宿主中文原话")), "reports never use the Host label");
      }
      assert.equal(result.leaked, false);
      assert.deepEqual(result.errors, []);
    }
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
