import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { renderCodingWorkbench } from "@molis-ai/molis-work-plugin-coding";
import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { pageTextScript, pageText, withPageText } from "./fixtures/page-text.js";

test("SAI-02/11/14: Coding's original TaskBoard child row opens the float without selecting or rewriting the main conversation", { timeout: 60_000 }, async t => {
  const bundle = await build({ entryPoints: ["plugins/native/coding/src/browser/main/mount-board.ts"], bundle: true, write: false, format: "iife", globalName: "CodingBoardMount", platform: "browser" });
  const html = withPageText("en", ["coding"], () => renderCodingWorkbench({ route_prefix: "", face: "sessions", filter: "all", sessions: [], tools: [], workspace_path: null,
    primitives: { escape: escapeHtml, icon, text: pageText("en", "coding"), formatDate: value => value } }));
  const b = await openBoardBrowser(t, "empty"); if (!b) return;
  await b.navigate(() => b.command("Page.navigate", { url: "about:blank" }, b.sessionId));
  await b.evaluate(pageTextScript("en", "coding"));
  await b.evaluate(bundle.outputFiles[0]!.text);
  await b.evaluate(`(() => {
    const root=document.createElement('section');root.id='coding-entry-probe';root.style.cssText='position:fixed;inset:20px;z-index:2000;background:var(--surface);overflow:auto';
    root.innerHTML=${JSON.stringify(html)};const mainInput=document.createElement('textarea');mainInput.dataset.mainInput='';mainInput.value='Keep the main draft';root.prepend(mainInput);
    root.dataset.codingBoardOpen='true';document.body.append(root);
    const lifetime=(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()(root), q=selector=>root.querySelector(selector), directory=document.createElement('div'), refs={integrations:{open(){}}, inputReceipts:{from(){}}};
    const s={current:'original-session',state:{sessions:[{session_id:'original-session',title:'Original'}]},ROLE_NAMES:{},ports:{q,lifetime,translate:t.text,status:error=>probe.errors.push(error),api:async()=>{throw new Error('Unexpected request');}}};
    const host={view:{openTask:async input=>{probe.opened.push(input);}},openItem:()=>{throw new Error('Main conversation must stay unchanged');},receipts:{step:value=>value}};
    globalThis.probe={root,lifetime,refs,s,opened:[],errors:[]};
    CodingBoardMount.mountBoard({root,host,lifetime,q,refs,s,directory,readText:t.text});s.sessionOnShow=true;q('[data-coding-workbench]').hidden=false;
    const run={ref:{run_id:'original-parent-run'},phase:'completed',started_at:new Date().toISOString(),frozen:{role_id:'coordinator',model_id:'fixture'},turns:[],activity:[]};
    refs.taskboard.update('original-session',{session:{title:'Original'},runs:[run],taskboard_plans:[],subagents:[{run_id:run.ref.run_id,children:[{subagent_id:'original-child',role_id:'coding-reader',role_name:'Reader',task:'Inspect the original files',state:'completed'}]}]});q('[data-coding-board]').hidden=false;refs.taskboard.show();
  })()`);
  const row = "#coding-entry-probe [data-board-key=child-original-child] .coding-board-node";
  await b.waitFor(`Boolean(document.querySelector(${JSON.stringify(row)}))`);
  await b.click(row); await b.waitFor("probe.opened.length===1 || probe.errors.length>0");
  assert.deepEqual(await b.evaluate("probe.errors"), []);
  assert.deepEqual(await b.evaluate("probe.opened"), [{ session: "original-session", run: "original-parent-run", child: "original-child" }]);
  assert.deepEqual(await b.evaluate("[probe.s.current,probe.root.dataset.codingBoardOpen,probe.root.querySelector('[data-main-input]').value]"), ["original-session", "true", "Keep the main draft"]);
  await b.evaluate("probe.lifetime.dispose();probe.root.remove()");
});
