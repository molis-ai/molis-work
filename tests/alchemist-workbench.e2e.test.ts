import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createLocalRuntime } from "../plugins/native/alchemist/src/studio/server/bootstrap/local-runtime.js";

// Seed through the production API; only the external model/search are explicit fixtures.
async function seed(home: string, project: string) {
  const directory = join(home, "alchemist/projects", project);
  await mkdir(directory, {recursive:true});
  const runtime = createLocalRuntime({databasePath:join(directory,"studio.sqlite"),pulseSourceMode:"fixture",ai:{
    listModels:async()=>[{id:"test/model",label:"UI 测试模型",runtimeLabel:"显式测试",costVisibility:"unobservable"}],
    generate:async input=>({runtimeLabel:"显式测试",text:JSON.stringify(input.jsonSchema.properties?.summary?{summary:"有有限支持，仍需访谈。"}:input.jsonSchema.properties?.judgments?{judgments: ((input.jsonSchema.properties.judgments as any).items.properties.label.enum as string[]).map(label=>({label,status:"tentative",conclusion:"需要直接验证",rationale:"仅有一个来源",supportingEvidenceIndexes:[0],counterEvidenceIndexes:[],unknowns:["持续使用"],changeConditions:["独立访谈"]}))}:{understanding:{summary:"保留访谈与假设",assumptions:["愿意记录"],unknowns:["使用频率"],concreteness:"direction"},cards:["证据墙","访谈时间线"].map(title=>({title,highlight:"追溯原句与判断",targetUser:"独立开发者",scenario:"访谈结束",problem:"原句散落",mechanism:"关联原句和假设",valueProposition:"可追溯",whyItMayWork:"已有记录习惯",assumptions:["愿意标注"],unknowns:["付费"],mvp:{inScope:["本地文本存储"],outOfScope:["团队协作"]}})),noCardsReason:null})}),
    search:async()=>[{url:"https://docs.example.org/evidence",title:"测试来源",excerpt:"可以保存访谈原句，付费意愿未知。"}],
  }});
  const api=async(path:string,body?:unknown)=>{const r=await runtime.app.request("http://localhost/api/v1"+path,{method:body===undefined?"GET":"POST",...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});const v=await r.json() as any;assert.ok(r.ok,JSON.stringify(v));return v;};
  try {
    const {direction}=await api("/directions",{description:"帮助独立开发者保存访谈原句和假设"});
    const {runId}=await api(`/directions/${direction.id}/explorations`,{});await runtime.runPending();
    const {exploration}=await api(`/explorations/${runId}`);assert.equal(exploration.status,"completed");
    const {idea}=await api(`/idea-cards/${exploration.cards[0].id}/keep`,{});
    for(const lens of ["market_space","build_cost"]){const {plan}=await api(`/ideas/${idea.id}/lenses/${lens}/plans`,{ideaVersion:1,modelPolicy:"fixed",modelId:"test/model",budget:{kind:"calls",limit:3}});await api(`/ideas/${idea.id}/lenses/${lens}/runs`,{planId:plan.id});await runtime.runPending();}
    const research=await api(`/ideas/${idea.id}/versions/1/research`);
    assert.equal(research.lenses.market_space.status,"completed");assert.equal(research.lenses.build_cost.status,"completed");
    await api('/pulse/runs',{});await runtime.runPending();
    return {direction:direction.id,idea:idea.id,card:exploration.cards[1].id};
  } finally {await runtime.close();}
}

test("native Alchemist: candidates, reports, decision, memory, annotations, Pulse and recoverable model failure in host",{timeout:90_000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  const ids=await seed(b.homeDirectory,b.projectId!);
  const {origin,projectId,command,sessionId,navigate,click,waitFor,evaluate}=b;
  const root='[data-alchemist="workbench"]', content='[data-alc-content]';
  const read=async(path:string)=>(await (await fetch(`${origin}/projects/${projectId}/api/alchemist/studio/api/v1${path}`)).json()) as any;
  const text=JSON.stringify;
  const visible=async(s:string)=>waitFor(`document.querySelector(${text(s)})?.getBoundingClientRect().width > 0`,12_000);
  const includes=async(s:string)=>waitFor(`document.querySelector(${text(root)})?.innerText.includes(${text(s)})`,12_000);
  const fill=async(name:string,value:string)=>evaluate(`(()=>{const e=document.querySelector('[data-alc-dialog] [name="${name}"]'); e.value=${text(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false},sessionId);
  await navigate(()=>command("Page.navigate",{url:`${origin}/projects/${projectId}/`},sessionId));
  await click('[data-plugin-strip] [data-plugin-id="alchemist"]');
  await visible(`[data-alchemist-id="${ids.direction}"]`);
  assert.equal(await evaluate(`document.querySelector('${root} iframe')`),null);
  assert.equal(await evaluate(`document.querySelector('${root}').dataset.expanded`),'false');
  await click(`[data-alchemist-id="${ids.direction}"]`);await includes('候选想法');
  await click(`[data-alc-action="card"][data-id="${ids.card}"]`);await includes('访谈时间线');
  await click('[data-alc-action="discard"]');await includes('恢复候选');
  assert.equal((await read(`/idea-cards/${ids.card}`)).model.status,'discarded');
  await click('[data-alc-action="restore"]');await visible('[data-alc-action="discard"]');
  await click('[data-alc-action="keep"]');await visible('[data-alc-action="market"]');
  assert.equal((await read('/bootstrap')).ideas.length,2);
  await click('[data-alc-collection="ideas"]');await click(`[data-alchemist-id="${ids.idea}"]`);await visible('[data-alc-action="market"]');
  await click('[data-alc-action="market"]');await includes('研究摘要');await includes('测试来源');
  await click('[data-alc-action="plan"]');await visible('[data-alc-submit]');await click('[data-alc-submit]');await includes('请先在宿主设置里配置模型。');await click('[data-alc-dialog] [data-alc-action="close"]');
  await click('[data-alc-action="chat"]');await visible('[data-alc-chat-form]');await evaluate(`document.querySelector('[data-alc-chat-form] textarea').value='哪些证据尚未验证？'`);await click('[data-alc-chat-form] button[type="submit"]');await includes('你的消息和上下文已经保存');
  assert.equal((await read('/conversation/messages')).messages.at(-1).context.ideaId,ids.idea);
  await click('[data-alc-action="notice-close"]');await click('[data-alc-action="side-close"]');

  // Select actual content and save an anchored annotation, then verify stored target and quote.
  await evaluate(`(()=>{const block=document.querySelector('[data-alc-block="summary"] p');const r=document.createRange();r.selectNodeContents(block);const s=getSelection();s.removeAllRanges();s.addRange(r);block.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));})()`);
  await click('[data-alc-action="annotations"]');await visible('[data-alc-annotation-form]');
  await evaluate(`document.querySelector('[data-alc-annotation-form] textarea').value='需要独立访谈验证'`);
  await click('[data-alc-annotation-form] button[type="submit"]');await includes('待处理');
  const report=(await read(`/ideas/${ids.idea}/versions/1/research`)).lenses.market_space.report;
  const annotations=await read(`/annotations?kind=lens_report&objectId=${report.id}&revision=${report.revision}`);
  assert.equal(annotations.annotations[0].quotedSnapshot,'有有限支持，仍需访谈。');
  await click('[data-alc-action="calibrate"]');await fill('method','优先使用目标用户的原句');await click('[name="scope"][value="direction"]');await click('[data-alc-submit]');await includes('确认研究方法');await click('[data-alc-submit]');await waitFor(`!document.querySelector('[data-alc-dialog]').open`);
  assert.equal((await read('/memory')).playbook.length,1);
  await click('[data-alc-action="side-close"]');await click('[data-alc-action="cost"]');await includes('研究摘要');
  await click('[data-alc-action="decision"]');await visible('[data-outcome="hold"]');await click('[data-outcome="hold"]');await fill('reason','先验证持续使用再投入');await fill('revisit','完成三次访谈');await click('[data-alc-submit]');await includes('已决定');
  assert.equal((await read(`/ideas/${ids.idea}/versions/1/decision`)).decision.outcome,'hold');
  await click('[data-alc-action="settings"]');await includes('个人判断偏好');await click('[data-alc-action="taste"]');await fill('title','首版边界');await fill('statement','优先单人可用');await fill('appliesTo','新想法');await click('[data-alc-submit]');await includes('首版边界');await click('[data-alc-action="disable-taste"]');await waitFor(`!document.querySelector('[data-alc-action="disable-taste"]')`);
  assert.equal((await read('/memory')).taste[0].status,'disabled');
  await click('[data-alc-action="runtime"]');await visible('[name="model"][value="auto"]');await click('[name="model"][value="auto"]');await fill('market','5');await click('[data-alc-submit]');await waitFor(`!document.querySelector('[data-alc-dialog]').open`);assert.equal((await read('/settings/runtime')).defaultBudgets.marketSpace.limit,5);
  const downloads=join(b.homeDirectory,'downloads');await mkdir(downloads);await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  for(const extension of ['json','zip']){await click('[data-alc-action="export-'+extension+'"]');await includes('导出已生成。');await click('[data-alc-action="notice-close"]');}
  let exported:Buffer|undefined;for(let n=0;n<20;n++){try{exported=await readFile(join(downloads,'alchemist-'+new Date().toISOString().slice(0,10)+'.json'));break;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(exported);const archive=JSON.parse(exported.toString());assert.ok(JSON.stringify(archive).includes('先验证持续使用再投入'));assert.doesNotMatch(exported.toString(),/apiKey|api_key|secretReference/);
  const zip=await readFile(join(downloads,'alchemist-'+new Date().toISOString().slice(0,10)+'.zip'));assert.equal(zip.subarray(0,2).toString(),'PK');

  await click('[data-alc-collection="pulse"]');await click('[data-alc-action="sources"]');
  const source=(await read('/pulse/sources')).sources[0];await visible('[data-alc-dialog] [name="'+source.sourceId+'"]');await click('[data-alc-dialog] [name="'+source.sourceId+'"]');await click('[data-alc-submit]');await includes('来源设置已保存。');assert.equal((await read('/pulse/sources')).sources[0].enabled,!source.enabled);await click('[data-alc-action="notice-close"]');
  await visible('[data-alc-open="pulse"]');await click('[data-alc-open="pulse"]');await includes('可以探索的机会');await click('[data-alc-action="save-opportunity"]');await includes('已保存');await click('[data-alc-action="convert"]');await visible('[data-alc-action="explore"]');
  assert.equal((await read('/bootstrap')).directions.length,2);
  await click('[data-alc-action="new"]');await fill('description','浏览器验收缺模型也保存方向');await click('[data-alc-submit]');await includes('这次炼化未完成');
  const saved=await read('/bootstrap');assert.equal(saved.directions.length,3);assert.equal(saved.explorations[0].status,'failed');assert.deepEqual(saved.explorations[0].cards,[]);
  await click('[data-alc-action="explore"]');await includes('这次炼化未完成');
  await command('Page.reload',{},sessionId);await visible('[data-alc-action="explore"]');await includes('浏览器验收缺模型也保存方向');
  await click('[data-alc-collection="ideas"]');await click(`[data-alchemist-id="${ids.idea}"]`);await visible('[data-alc-action="market"]');await click('[data-alc-action="market"]');await includes('研究摘要');
  await mkdir('specs/alchemist-plugin/verification',{recursive:true});
  for(const [width,height,label] of [[1440,1000,'desktop'],[390,844,'mobile']] as const){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500},sessionId);
    const bounds=await evaluate<{width:number;right:number}>(`(()=>{const r=document.querySelector('${content}').getBoundingClientRect();return {width:document.documentElement.scrollWidth,right:r.right}})()`);
    assert.ok(bounds.width<=width+1&&bounds.right<=width+1,JSON.stringify(bounds));
    for(const theme of ['light','dark']){await evaluate(`document.documentElement.dataset.resolvedTheme='${theme}'`);const shot=await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId);await writeFile(`specs/alchemist-plugin/verification/native-${label}-${theme}.png`,Buffer.from(shot.data,'base64'));}
  }
  await click('[data-alc-action="back"]');await visible(`[data-alchemist-id="${ids.idea}"]`);
  assert.equal(await evaluate(`document.querySelector('${root}').dataset.expanded`),'false');
});
