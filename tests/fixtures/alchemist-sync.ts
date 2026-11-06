import {ActionService} from '@molis-ai/molis-work-kernel';
import {bindActionClient,type ActionDefinition} from '@molis-ai/molis-work-contracts/platform/actions';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {createAlchemistStudioRuntime,createAlchemistActionHandlers,alchemistManifest,ALCHEMIST_ACTION_PERMISSIONS,alchemistActions as a} from '@molis-ai/molis-work-plugin-alchemist';
import {controlledAlchemistAi} from './alchemist-actions.js';

export function personalStudio(home:string,projectId='project'){
 const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
 const controlled=controlledAlchemistAi(),path=join(home,'alchemist','projects',encodeURIComponent(projectId).replaceAll('.','%2E'),'studio.sqlite');
 const service=new ActionService(),caller={actor_id:'alice',project_id:projectId,audience:'user' as const,permissions:ALCHEMIST_ACTION_PERMISSIONS};
 const runtime=createAlchemistStudioRuntime({databasePath:path,storage:{space,projectId},ai:controlled.ai,pulseSourceMode:'fixture',actions:{
  async invoke<I,O>(definition:ActionDefinition<I,O>,input:I,signal?:AbortSignal):Promise<O>{return await service.invoke({...caller,signal},definition,input) as O;}
 }});
 service.registerProvider({provider:{provider_id:alchemistManifest.plugin_id,title:alchemistManifest.name,kind:'plugin',plugin_id:alchemistManifest.plugin_id,project_id:projectId},definitions:Object.values(a),handlers:createAlchemistActionHandlers({resolve:caller=>runtime.actionsFor(caller.actor_id)})});
 const bound=bindActionClient(service,()=>caller);
 return {...controlled,runtime,space,path,call:bound.invoke.bind(bound)};
}
export async function savedStudio(f:ReturnType<typeof personalStudio>){
 const {direction}=await f.call(a.directionCreate,{title:'Portable direction',description:'独立创始人保存访谈证据与下一步判断'});
 const receipt=await f.call(a.explorationStart,{id:direction.id});await f.runtime.runPending();
 const {exploration}=await f.call(a.explorationGet,{id:receipt.runId}),{idea}=await f.call(a.cardKeep,{id:exploration.cards[0]!.id});
 for(const lens of ['market_space','build_cost'] as const){
  const {plan}=await f.call(a.researchPlan,{id:idea.id,ideaVersion:1,lens,modelPolicy:'fixed',modelId:f.model.id,budget:{kind:'calls',limit:3}});
  await f.call(a.researchStart,{id:idea.id,lens,planId:plan.id});await f.runtime.runPending();
 }
 const workspace=await f.call(a.researchGet,{id:idea.id,version:1}),report=workspace.lenses.market_space.report!;
 const {annotation}=await f.call(a.annotationCreate,{target:{kind:'lens_report',objectId:report.id,revision:report.revision,blockId:'summary'},quotedSnapshot:report.summary,comment:'保存独立访谈反证'});
 const {proposal}=await f.call(a.playbookPropose,{id:annotation.id,methodChange:'先核对独立访谈',positiveExamples:['用户原话'],negativeExamples:['推广文案'],scopeKind:'direction'});
 const {rule}=await f.call(a.proposalApply,{id:proposal.id});
 await f.call(a.playbookRevise,{id:rule.id,expectedVersion:rule.version,expectedEtag:(await f.call(a.playbookEditing,{id:rule.id})).etag,methodChange:'保留反证和原文',positiveExamples:['独立来源'],negativeExamples:['付费推广']});
 await f.call(a.decisionCreate,{id:idea.id,version:1,outcome:'hold',reason:'需要真实付费访谈',revisitCondition:'新的独立证据'});
 await f.call(a.conversationSend,{body:'记录这次研究',context:{kind:'idea',label:'证据卡',ideaId:idea.id,version:1,panel:'brief'}});
 await f.call(a.pulseStart,{});await f.runtime.runPending();
 return {direction,idea,report,rule};
}
