import { createServer } from "node:http";
import { fixture } from "../../../../plugins/native/alchemist/tests/work-reuse/fixture.ts";
import { alchemistActions as a } from "../../../../plugins/native/alchemist/src/studio/shared/contracts/actions.ts";
import { renderAlchemistWorkbench } from "../../../../plugins/native/alchemist/src/ui.ts";
import { ALCHEMIST_CLIENT_FACTORY_SCRIPT } from "../../../../plugins/native/alchemist/src/client.ts";
import { ALCHEMIST_STYLES } from "../../../../plugins/native/alchemist/src/styles.ts";
import { PLUGIN_STAGE_STYLES } from "../../../../apps/workbench/src/styles/plugin-stage.ts";
import { VISUAL_FOUNDATION_STYLES, COSS_CONTROL_STYLES, PRIMITIVE_STYLES, renderIconSprite } from "@molis-ai/molis-work-design-system";
const f=await fixture();
const {plan}=await f.plan();const first=await f.run(plan.id);const report=first.workspace.lenses.market_space.report!;
await f.call(a.reusePublish,{reportId:report.id});await f.confirmMethod(report.id,report.summary);
f.runtime.start();
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const html=`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>工作复用 · 隔离数据实操</title><style>${VISUAL_FOUNDATION_STYLES}${COSS_CONTROL_STYLES}${PRIMITIVE_STYLES}${PLUGIN_STAGE_STYLES}${ALCHEMIST_STYLES}body{margin:0;background:var(--paper);color:var(--ink);font:13px/1.6 system-ui}.preview-label{padding:8px 14px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)}.tab-pane-body{position:absolute;inset:40px 0 0;--tree-width:290px}.plugin-stage-shell{position:absolute;inset:0}.plugin-stage-detail-bar svg,.plugin-stage-chrome svg{width:16px;height:16px}</style><body><div class="preview-label">隔离数据实操 · 真实 SQLite / Artifact / Context Ledger · 模型为受控测试响应</div>${renderIconSprite()}<div class="tab-pane-body">${renderAlchemistWorkbench({primitives:{escape,text:s=>s}}).replace(' hidden data-alchemist="workbench"',' data-alchemist="workbench"')}</div><script>window.molisWorkControlHeaders=()=>({'content-type':'application/json'});(${ALCHEMIST_CLIENT_FACTORY_SCRIPT})({translate:s=>s,route:s=>s,projectId:()=>"work-reuse-isolated"});</script></body></html>`;
const server=createServer(async(req,res)=>{try{
  if(req.url?.startsWith('/api/alchemist/studio')){let raw='';for await(const part of req)raw+=part;const request=new Request('http://localhost'+req.url.slice('/api/alchemist/studio'.length),{method:req.method,headers:{'content-type':'application/json'},...(!['GET','HEAD'].includes(req.method||'GET')?{body:raw}: {})});const response=await f.runtime.app.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;}
  res.writeHead(200,{'content-type':'text/html;charset=utf-8'});res.end(html);
}catch{res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'隔离服务请求失败'}));}});
server.listen(43187,'127.0.0.1',()=>console.log('http://127.0.0.1:43187'));
for(const event of ['SIGINT','SIGTERM'] as const)process.on(event,()=>server.close(async()=>{await f.close();process.exit(0)}));
