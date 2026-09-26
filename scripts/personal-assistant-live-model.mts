/** Opt-in verification: synthetic/public test materials only, existing configured credential resolver. */
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveMolisWorkHome } from '@molis-ai/molis-work-storage';
import { AgentHost, createPrologueNodeAdapter, prologueModelConfiguration } from '@molis-ai/molis-work-service-agent-host';
import { openConfiguredModels, selectConfiguredTextModel } from '../apps/local-host/src/configured-models.js';
import { createPersonalAssistantPrologue, PERSONAL_ASSISTANT_AGENT, PERSONAL_ASSISTANT_PROMPTS } from '../apps/local-host/src/personal-assistant-prologue.js';
import { assistantFixture, assistantCaller as caller } from '../tests/personal-assistant-fixture.js';
if(process.env.MOLIS_ASSISTANT_LIVE_TEST!=='1')throw new Error('Set MOLIS_ASSISTANT_LIVE_TEST=1 to run the configured model with synthetic materials.');
const home=resolveMolisWorkHome(),opened=openConfiguredModels(home);
let selection:{provider_id:string;model_id:string}|undefined,providerName='';
try{const selected=opened&&selectConfiguredTextModel(home,opened.store);if(selected){selection={provider_id:selected.provider.provider_id,model_id:selected.model.model_id};providerName=selected.provider.display_name;}}finally{opened?.storage.close();}
if(!selection)throw new Error('No configured model is available.');
const resolve=()=>{const opened=openConfiguredModels(home);try{return opened?.store.resolveConfiguration(selection)??null;}finally{opened?.storage.close();}};
const directory=await mkdtemp(join(tmpdir(),'assistant-live-'));
try {
const f=assistantFixture();
try {
// Explicit synthetic approval makes the positive scenario unambiguous.
f.context.get('rss')!.content='已批准的需求变更：九月发布必须把 PDF 导出替换为 CSV 导出，原 PDF 方案取消。请更新发布说明草稿。';
f.context.get('youtube')!.content='公开验收演示要求：九月发布只检查 CSV 导出，PDF 不再是本次交付目标。';
f.context.get('goal')!.content='当前已保存的九月发布说明草稿只介绍 PDF 导出，尚未纳入今天批准的 CSV 替换要求。';
const adapter=await createPrologueNodeAdapter({app:{appId:'io.molis.work.assistant-verification',appVersion:'1.0.0'},storageRoot:join(directory,'sdk'),
 modelConfiguration:async()=>prologueModelConfiguration(resolve()),resolveCredential:ref=>{const current=resolve();return current?.provider.credential_ref===ref?current.api_key:null;}});
try{
 const host=new AgentHost();host.register(adapter);
 const owner={board_id:'isolated-assistant',actor_id:caller.actor_id,plugin_id:'personal-assistant',install_id:'assistant-verification'};
 const authority={authorizedDirectories:[],manifest:PERSONAL_ASSISTANT_AGENT,prompts:PERSONAL_ASSISTANT_PROMPTS};
 f.ports.analysis=createPersonalAssistantPrologue({host,prepare:async()=>({scope:{...owner,workspace:'none',session:await host.createSession('prologue',{...owner,workspace:'none',role_id:'personal-assistant',title:'无隐私助理验证'},authority)},authority})});
 const result=await f.service.evaluate(caller,f.input);
 const output={at:new Date().toISOString(),runtime:'Prologue via AgentHost',provider:providerName,model:selection.model_id,materialScope:'Synthetic RSS/video and project text from isolated fixture; no private accounts read',outcome:result.outcome,message:result.message,suggestions:result.suggestions.map(row=>({title:row.title,reason:row.reason,evidence:row.evidence})),writes:f.writes};
 const outputDir='specs/bp-delivery-parallel/work-items/personal-assistant/evidence';await mkdir(outputDir,{recursive:true});await writeFile(join(outputDir,'live-model-positive.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output));
 if(result.outcome==='needs_review')process.exitCode=1;
}finally{await adapter.close();}
}finally{f.close();}
}finally{await rm(directory,{recursive:true,force:true});}
