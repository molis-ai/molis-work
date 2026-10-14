import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { CODING_CLIENT_FACTORY_SCRIPT, renderCodingWorkbench } from "@molis-ai/molis-work-plugin-coding";
import { escapeHtml, icon, STATE_RING_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { openStudioChrome } from "./fixtures/plugin-builder-browser.js";

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
    const result = await page.evaluate<{
      running: string[]; paused: string[]; person: string; accepted: string; labels: string[];
      commands: string[]; letters: string[]; delegation: string; errors: string[];
    }>(`(async () => {
      document.body.innerHTML=${JSON.stringify(html)};
      ${STATE_RING_CLIENT_SCRIPT}
      const root=document.querySelector('[data-coding-workbench]');root.hidden=false;
      const lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root), errors=[];
      const ports={lifetime,current:()=>'session',status:message=>errors.push(message),refresh:async()=>{},openStep:()=>{}};
      const progress=(${embeddedFactory("planProgress")})(ports);
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
    assert.deepEqual(result.labels, ["模型报告完成", "你已验收", "等待前一步", "受阻，等你决定", "已取消", "可以开始"]);
    assert.deepEqual(result.commands, ["interrupted", "stopped", "failed", "done", "running"]);
    assert.deepEqual(result.letters, ["failed", "queued"], "failed receiving rounds are not voluntary cancellations");
    assert.equal(result.delegation, "ready", "accepting a delegation does not start execution");
    assert.deepEqual(result.errors, []);
  } finally { await browser.close(); rmSync(directory, { recursive: true, force: true }); }
});
