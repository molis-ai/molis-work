import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {createAlchemistProloguePort} from '../../../../apps/local-host/src/alchemist-prologue.ts';
import {openConfiguredModels,selectConfiguredTextModel} from '../../../../apps/local-host/src/configured-models.ts';
import {fixture} from '../../../../plugins/native/alchemist/tests/work-reuse/fixture.ts';
import {alchemistActions as a} from '../../../../plugins/native/alchemist/src/studio/shared/contracts/actions.ts';
const sourceHome=process.env.MOLIS_WORK_SOURCE_HOME||join(homedir(),'.molis-work'),runHome=mkdtempSync(join(tmpdir(),'work-reuse-prologue-'));
const calls:any[]=[],rounds:any[]=[];let f:Awaited<ReturnType<typeof fixture>>|undefined;
const base=createAlchemistProloguePort({homeDirectory:runHome,projectId:'synthetic-work-reuse',
  withCatalog:async(_options,use)=>{const opened=openConfiguredModels(sourceHome);if(!opened)throw new Error('No existing model catalog');try{
    const selected=selectConfiguredTextModel(sourceHome,opened.store);if(!selected)throw new Error('No configured text model');
    const models={list:()=>[{...selected.provider,models:[selected.model]}],health:()=>[{provider_id:selected.provider.provider_id,status:'ready'}],resolveConfiguration:(requested?:{provider_id:string;model_id:string})=>{if(requested&&(requested.provider_id!==selected.provider.provider_id||requested.model_id!==selected.model.model_id))return null;return opened.store.resolveConfiguration({provider_id:selected.provider.provider_id,model_id:selected.model.model_id})}};
    return await use({models} as any);
  }finally{opened.storage.close()}},
  search:async()=>[{url:'https://example.org/synthetic-interviews',title:'合成验收材料（不是实际市场证据）',excerpt:'以下均为虚构访谈，仅验收流程：甲每周整理三次访谈，希望提案附原话；乙过去付费买过转录，但未表示愿意购买研究工具；丙的团队担心AI把推广文案当用户证据。无法由这三条材料确认市场规模、当前竞品价格或付费转化。'}]});
const ai={...base,generate:async(input:Parameters<typeof base.generate>[0])=>{const start=Date.now();console.log('model:start',input.purpose);const result=await base.generate(input);const materials=JSON.parse(input.userPrompt);calls.push({operationId:input.operationId,purpose:input.purpose,runtimeLabel:result.runtimeLabel,elapsedMs:Date.now()-start,output:result.text,schema:input.jsonSchema,usage:result.usage,methods:materials.confirmedResearchPlaybook,artifacts:materials.historicalBackground?.map((x:any)=>x.reference)});console.log('model:completed',result.runtimeLabel,Date.now()-start);return result}};
let failure:string|undefined;
try{
  f=await fixture({ai,description:'内部验收的虚构场景：2至5人的独立UX研究团队，每周做3至6次用户访谈，需要在访谈后的周五写客户提案。现状是转录、原话、判断分散在多个文档，制作提案时反复找出处。考虑一个将原话片段与待验证判断关联的工具，允许用户纠正AI归纳并保存为下次研究方法。MVP只覆盖粘贴转录、抽取带出处的证据卡、人工修改和提案依据导出；不做录音转写、不自动联系客户、不把合成材料当市场事实。请形成至少一个具体可验证的候选，未知项保留为假设。'});if(!f.ideas.length)throw new Error('Exploration did not return ideas; clarify the synthetic brief before research');let reference:any,method:any;
  for(let i=0;i<3;i++){
    if(i===2)method=(await f.call(a.playbookRevise,{id:method.id,expectedVersion:method.version,methodChange:'区分用户抱怨、使用意愿与付费证据；合成材料不能支持真实市场结论',positiveExamples:['访谈分析与提案'],negativeExamples:['把转录工具付款当成新研究工具付费意愿']})).rule;
    const idea=f.ideas[i%f.ideas.length]!;
    const {plan}=await f.plan(i?{artifacts:[{reference,reason:'沿用上一轮问题结构和未验证项，本轮重新核对证据边界'}],methodIds:[method.id]}:undefined,'market_space',idea,4);
    if(i===1)await f.restart();
    const result=await f.run(plan.id,'market_space',idea);const lens=result.workspace.lenses.market_space;
    if(lens.status!=='completed')throw new Error('Research round '+(i+1)+' failed: '+lens.run?.errorCode);
    const report=lens.report!;reference=(await f.call(a.reusePublish,{reportId:report.id})).reference;
    if(!i)method=await f.confirmMethod(report.id,report.summary);
    const feedback={planId:plan.id,explanation:i?'仅补充本轮沿用理由；方法正文从已确认版本读取':'先填写方向与想法，确认原话与反证方法',preparation:i?'选择上一轮固定成果；新证据仍需另行收集':'提供明确标注的合成访谈材料',corrections:i===2?'方法改为区分抱怨、使用意愿、付费证据':'检查模型是否把合成材料当真实市场事实',result:'真实 Prologue 输出已保存；使用合成来源，只验流程，不证明市场判断或节省比例'};
    await f.call(a.reuseFeedback,feedback);
    rounds.push({round:i+1,ideaId:idea.id,planId:plan.id,reportId:report.id,summary:report.summary,claims:report.claims,reference,receipt:(await f.call(a.reuseReceipt,{planId:plan.id})).receipt,feedback});
    console.log('round:completed',i+1);
  }
} catch(error){failure=error instanceof Error?error.message:'Verification failed';console.log('verification:failed',failure)} finally{
  await f?.close();rmSync(runHome,{recursive:true,force:true});
  writeFileSync(new URL('./prologue-verification.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),scope:'Actual configured Prologue; synthetic interview sources; isolated SQLite/Artifact/Ledger. No human acceptance or efficacy percentage.',calls,rounds,...(failure?{failure}:{})},null,2));
}
if(failure)process.exitCode=1;
