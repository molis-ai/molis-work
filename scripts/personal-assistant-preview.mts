import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assistantFixture, assistantCaller } from '../tests/personal-assistant-fixture.js';
import { handlePersonalAssistantHttp } from '../apps/local-host/src/personal-assistant-http.js';
import { renderPersonalAssistantPanel, PERSONAL_ASSISTANT_STYLES, PERSONAL_ASSISTANT_CLIENT_SCRIPT } from '../apps/workbench/src/personal-assistant-ui.js';
const home=mkdtempSync(join(tmpdir(),'assistant-preview-')),f=assistantFixture(join(home,'assistant.sqlite'));f.advance(Date.now()-Date.parse('2026-09-26T05:00:00Z'));
await f.service.evaluate(assistantCaller,f.input);
const server=createServer(async(req,res)=>{
 const url=new URL(req.url??'/', 'http://127.0.0.1');
 if(await handlePersonalAssistantHttp(req,res,url,{service:f.service,caller:assistantCaller}))return;
 if(url.pathname==='/draft'){const row=f.db.prepare('SELECT body FROM drafts LIMIT 1').get();res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<h1>隔离测试成果</h1><textarea style="width:85vw;height:60vh">'+String(row?.body??'尚未保存').replaceAll('<','&lt;')+'</textarea>');return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>工作助理 · 隔离交互预览</title><style>
 :root{--page:#f3f4f5;--paper:#fff;--ink:#222326;--ink-soft:#3c3f44;--muted:#6b6f76;--hairline:#e2e4e7;--accent:#5e6ad2}body{margin:0;background:var(--page);color:var(--ink);font:13px/1.5 Inter,'PingFang SC',sans-serif}main{max-width:960px;margin:60px auto;padding:0 24px}main>p{color:#6b6f76;margin-bottom:24px}nav{padding:16px 24px;border-bottom:1px solid #e2e4e7;background:#fff}.mw-btn{border:0;border-radius:8px;padding:8px 12px;font:inherit;cursor:pointer}.mw-btn--primary{background:#222326;color:white}.mw-btn--secondary{background:#eceef0;color:#222326}.mw-btn--ghost{background:transparent;color:#3c3f44}.mw-btn:hover{filter:brightness(.95)}${PERSONAL_ASSISTANT_STYLES}</style><nav>Molis Work <span style="color:#6b6f76"> / 九月工作台发布计划</span></nav><main><p>隔离交互预览 · 示例 RSS / 视频内容 · 固定模型响应，真实 SQLite 与动作服务</p>${renderPersonalAssistantPanel()}</main><script>
 const api=async(path,method='GET',body)=>{const response=await fetch('/api/personal-assistant/'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;};
 window.assistant=(${PERSONAL_ASSISTANT_CLIENT_SCRIPT})({root:document.querySelector('[data-personal-assistant]'),api,openSubject(subject){document.querySelector('[data-pa-notice]').textContent='示例材料：'+subject.id;},openResult(){location.href='/draft';}});
 </script></html>`);
});
server.listen(0,'127.0.0.1',()=>console.log('Personal assistant preview: http://127.0.0.1:'+String((server.address() as {port:number}).port)));
const close=()=>{server.close();f.close();rmSync(home,{recursive:true,force:true});process.exit(0);};process.on('SIGINT',close);process.on('SIGTERM',close);
