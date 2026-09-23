import {randomUUID} from 'node:crypto';
import type {PluginStartContext,PluginCapabilityClient} from '@molis-ai/molis-work-contracts/platform/plugin';
import {agentHostCapabilities as agent,isTerminalAgentPhase} from '@molis-ai/molis-work-contracts/services/agent-host';
import {projectsCapabilities} from '@molis-ai/molis-work-contracts/modules/projects';
import {BuilderStore} from './store.js';
import type {BuildDocument,Design,Behavior} from './model.js';
import {parseBehavior,parseCandidates,parseModelJson,parseNodes} from './validation.js';
export interface BuilderConfiguration {workspace_id:string;provider_id:string;model_id:string}
export interface BuilderPorts {
 ready():Promise<void>;
 models():Promise<readonly {provider_id:string;model_id:string;label:string}[]>;
 selectLayout?(design:Design):Promise<{layout:Design['layout'];model:string;elapsedMs:number}>;
 selectionAvailable?():boolean;
 publicationValidator?(id:string):Promise<(design:Design,behavior:Behavior)=>void>;
}
type Stage='design'|'ui'|'behavior';
const activePhase=(d:BuildDocument)=>d.active?.stage==='design'?'clarifying':'building';
export class BuilderWorkflow {
 readonly store:BuilderStore;
 private readonly api:PluginCapabilityClient;
 private readonly busy=new Set<string>();
 constructor(private readonly context:PluginStartContext,private readonly ports:BuilderPorts){
  if(!context.services?.storage || !context.services.capabilities || !context.board_id) throw new Error('创作插件缺少项目、存储或执行能力');
  this.store=new BuilderStore(context.services.storage);this.api=context.services.capabilities;
 }
 require(id:string){const d=this.store.get(id);if(!d)throw new Error('找不到这份草稿');return d;}
 async publish(id:string,revision:number){
  const d=this.require(id);if(d.revision!==revision||d.phase!=='ready'||!d.design||!d.behavior||d.active)throw new Error('草稿已改变或尚未就绪，请完成构建后重试');
  const validate=await this.existingValidator(id);validate?.(d.design,d.behavior);
  return this.store.release(id,revision);
 }
 async activate(id:string,revision:number,version:number){
  const release=this.store.versions(id).find(r=>r.version===version);if(!release)throw new Error('找不到这个发布版本');
  const validate=await this.existingValidator(id);validate?.(release.design,release.behavior);
  return this.store.activate(id,version,revision);
 }
 private async existingValidator(id:string){
  if(!this.store.versions(id).length)return;
  if(!this.ports.publicationValidator)throw new Error('正式数据验证入口尚未装配，原版本继续使用');
  const validate=await this.ports.publicationValidator(id);
  return (design:Design,behavior:Behavior)=>{try{validate(design,behavior);}catch(error){throw new Error('新定义不能用于已有记录，原版本继续使用：'+(error instanceof Error?error.message:'数据校验失败'));}};
 }
 async state(){await this.ports.ready();const [models,workspaces,runtimes]=await Promise.all([this.ports.models(),this.api.invoke(projectsCapabilities.listWorkspaces,[]),this.api.invoke(agent.listRuntimes,[])]);return {builds:this.store.list(),releases:this.store.releases(),models,workspaces:workspaces.map(w=>({workspace_id:w.workspace_id,label:w.display_name||'项目工作区'})),runtimeAvailable:runtimes.some(r=>r.runtime_id==='prologue'),selectionAvailable:this.ports.selectionAvailable?.()??false};}
 async start(id:string,revision:number,stage:Stage,config:BuilderConfiguration,actor:string){
  if(this.busy.has(id))throw new Error('当前操作尚未结束，请稍候');this.busy.add(id);
  let token:string|undefined;
  try{
   await this.ports.ready();const d=this.require(id);
   if(d.revision!==revision || d.active)throw new Error('草稿已改变或仍有任务运行，请刷新后重试');
   const [workspaces,models]=await Promise.all([this.api.invoke(projectsCapabilities.listWorkspaces,[]),this.ports.models()]);
   const workspace=workspaces.find(w=>w.workspace_id===config.workspace_id&&w.realpath_verified);
   if(!workspace)throw new Error('请先选择本项目已授权的工作区');
   if(!models.some(m=>m.provider_id===config.provider_id&&m.model_id===config.model_id))throw new Error('所选模型尚未配置，请在模型设置中完成配置');
   token=randomUUID();const operation=token;
   this.store.update(id,revision,doc=>{doc.phase=stage==='design'?'clarifying':'building';doc.error=null;doc.configuration={...config};doc.active={token:operation,stage,baseRevision:revision,...config};(doc.runs??=[]).push({token:operation,stage,...config,phase:'starting'});});
   const directory={canonical_path:workspace.canonical_path,realpath_verified:true};
   const owner={board_id:this.context.board_id!,plugin_id:this.context.plugin_id,install_id:this.context.install_id,actor_id:actor,directory};
   const session=await this.api.invoke(agent.createSession,['prologue',{...owner,title:`${d.title} · ${stage}`}]);
   if(this.require(id).active?.token!==token)return this.require(id);
   let current=this.require(id);this.store.update(id,current.revision,doc=>{if(doc.active)doc.active.session_id=session.session_id;doc.runs!.find(r=>r.token===token)!.session_id=session.session_id;});
   const task=stage==='design'?JSON.stringify({request:d.brief,messages:d.messages,currentDesign:d.design}):JSON.stringify({design:d.design,placedParts:d.nodes});
   const handle=await this.api.invoke(agent.startRun,['prologue',{...owner,session,task,role_id:stage,model_selection:{provider_id:config.provider_id,model_id:config.model_id},budget:{max_turns:2,max_output_tokens:10000,max_duration_ms:120000}}]);
   current=this.require(id);
   if(current.active?.token!==token){await this.api.invoke(agent.controlRun,[session,handle.ref,{kind:'cancel'}]);return this.store.update(id,this.require(id).revision,doc=>{const record=doc.runs?.find(r=>r.token===token);if(record){record.run_id=handle.ref.run_id;record.phase='cancel-requested';}});}
   const attached=this.store.update(id,current.revision,doc=>{doc.active!.run_id=handle.ref.run_id;const record=doc.runs!.find(r=>r.token===token)!;record.run_id=handle.ref.run_id;record.phase='running';});
   if(attached.phase==='paused')await this.api.invoke(agent.controlRun,[session,handle.ref,{kind:'pause'}]);
   return attached;
  }catch(error){const current=this.require(id);if(token&&current.active?.token===token)this.store.update(id,current.revision,doc=>{doc.phase='failed';doc.error=error instanceof Error?error.message:'运行启动失败';const record=doc.runs?.find(r=>r.token===token);if(record)record.phase='failed';doc.active=null;});throw error;}
  finally{this.busy.delete(id);}
 }
 async advance(id:string,actor:string){
  if(this.busy.has(id))return this.require(id);
  let d=this.require(id);if(d.phase==='paused'||d.phase==='failed')return d;
  const run=d.active;
  if(run&&(!run.run_id||!run.session_id))return this.store.update(id,d.revision,doc=>{doc.phase='failed';doc.error='运行启动被中断，请停止本轮后继续。已有内容已保留。';});
  if(run?.run_id&&run.session_id){
   await this.ports.ready();
   const view=await this.api.invoke(agent.readRun,[{runtime_id:'prologue',session_id:run.session_id},{session_id:run.session_id,run_id:run.run_id}]);
   d=this.require(id);if(d.active?.token!==run.token||d.phase==='paused')return d;
   if(isTerminalAgentPhase(view.phase)){
    d=this.store.update(id,d.revision,doc=>{const record=doc.runs?.find(r=>r.token===run.token);if(record)record.phase=view.phase;});
    try{
     if(view.phase!=='completed')throw new Error(view.stop_reason||'这一轮没有完成，草稿已保留');
     const turns=view.turns.filter(t=>t.kind==='assistant');const output=parseModelJson(turns.at(-1)?.text??'');
     if(run.stage==='design'){
      if(!output||typeof output!=='object'||Array.isArray(output))throw new Error('设计返回格式不正确');
      const value=output as {questions?:unknown;summary?:unknown;candidates?:unknown};
      const summary=typeof value.summary==='string'?value.summary.slice(0,4000):'设计已更新';
      if(Array.isArray(value.questions)&&value.questions.length){
       if(value.questions.length>3||value.questions.some(q=>typeof q!=='string'||!q.trim()||q.length>1000))throw new Error('澄清问题格式不正确');
       return this.store.update(id,d.revision,doc=>{doc.active=null;doc.phase='draft';doc.questions=value.questions as string[];doc.messages.push({role:'assistant',text:summary});});
      }
      const candidates=parseCandidates(value.candidates);
      return this.store.update(id,d.revision,doc=>{doc.active=null;doc.phase='choosing';doc.candidates=candidates;doc.questions=[];doc.messages.push({role:'assistant',text:summary});});
     }
     if(!d.design)throw new Error('主线设计已不存在');
     if(run.stage==='ui'){
      const nodes=parseNodes(output,d.design);
      d=this.store.update(id,d.revision,doc=>{doc.active=null;doc.pendingNodes=nodes;doc.messages.push({role:'assistant',text:'UI 方案已校验，开始逐项装配；功能 Agent 接入同一份主线。'});});
     }else{
      const behavior=parseBehavior(output,d.design);
      d=this.store.update(id,d.revision,doc=>{doc.active=null;doc.behavior=behavior;doc.phase=doc.pendingNodes.length?'building':'ready';doc.messages.push({role:'assistant',text:'数据与操作已接通，可以录入真实内容试用。'});});
     }
    }catch(error){return this.store.update(id,this.require(id).revision,doc=>{doc.active=null;doc.phase='failed';doc.error=error instanceof Error?error.message:'模型结果无法使用';});}
   }else if(['reconcile-required','awaiting-input','awaiting-review','stopped'].includes(view.phase)){
    return this.store.update(id,d.revision,doc=>{doc.phase='failed';doc.error='原运行需要处理或已中断。可停止本轮后重试；已完成的界面会保留。';});
   }
  }
  d=this.require(id);
  if(d.pendingNodes.length){d=this.store.update(id,d.revision,doc=>{doc.nodes.push(doc.pendingNodes.shift()!);if(!doc.active&&doc.behavior&&!doc.pendingNodes.length)doc.phase='ready';});}
  if(d.phase==='building'&&!d.active&&d.nodes.length&&!d.behavior){
   const config=d.configuration??(run?.workspace_id&&run.provider_id&&run.model_id?{workspace_id:run.workspace_id,provider_id:run.provider_id,model_id:run.model_id}:null);
   if(!config)return this.store.update(id,d.revision,doc=>{doc.phase='paused';doc.error='请选择工作区和模型后继续构建';});
   return this.start(id,d.revision,'behavior',config,actor);
  }
  return d;
 }
 async pause(id:string,revision:number){
  const d=this.require(id);if(d.revision!==revision)throw new Error('草稿已更新，请重试');
  const next=this.store.update(id,revision,doc=>{doc.phase='paused';});
  if(d.active?.run_id&&d.active.session_id)await this.api.invoke(agent.controlRun,[{runtime_id:'prologue',session_id:d.active.session_id},{run_id:d.active.run_id,session_id:d.active.session_id},{kind:'pause'}]);
  return next;
 }
 async resume(id:string,revision:number,config:BuilderConfiguration,actor:string){
  let d=this.require(id);if(d.revision!==revision)throw new Error('草稿已更新，请重试');
  if(d.active){
   if(!d.active.run_id||!d.active.session_id)throw new Error('启动记录被中断，请停止后重试');
   await this.api.invoke(agent.controlRun,[{runtime_id:'prologue',session_id:d.active.session_id},{run_id:d.active.run_id,session_id:d.active.session_id},{kind:'resume'}]);
   return this.store.update(id,d.revision,doc=>{doc.phase=activePhase(doc);doc.error=null;});
  }
  if(d.pendingNodes.length){return this.store.update(id,d.revision,doc=>{doc.configuration={...config};doc.phase='building';doc.error=null;});}
  const stage=d.design?(d.nodes.length?'behavior':'ui'):'design';
  d=this.store.update(id,d.revision,doc=>{doc.error=null;});
  return this.start(id,d.revision,stage,config,actor);
 }
 async stop(id:string,revision:number){
  const d=this.require(id);const next=this.store.update(id,revision,doc=>{doc.active=null;doc.phase='paused';});
  if(d.active?.run_id&&d.active.session_id)await this.api.invoke(agent.controlRun,[{runtime_id:'prologue',session_id:d.active.session_id},{run_id:d.active.run_id,session_id:d.active.session_id},{kind:'cancel'}]);return next;
 }
 async choose(id:string,revision:number,candidateId:string,selection:'manual'|'jev'){
  const d=this.require(id);if(d.active||d.revision!==revision)throw new Error('草稿已改变，请重新选择');
  const candidate=d.candidates.find(c=>c.id===candidateId);if(!candidate)throw new Error('候选已不存在');
  let selected:BuildDocument['selection']={source:'manual',reason:'采用用户选择的界面方案'};let layout=candidate.layout;
  if(selection==='jev'){
   if(!this.ports.selectLayout)throw new Error('Jev 尚未配置，可改为采用所选方案');
   const result=await this.ports.selectLayout(candidate);layout=result.layout;selected={source:'jev',model:result.model,elapsedMs:result.elapsedMs,reason:'Jev 在卡片、列表和表格中选择合法集合零件'};
  }
  return this.store.update(id,revision,doc=>{doc.history.push({design:doc.design,nodes:doc.nodes,behavior:doc.behavior});const {rationale:_rationale,...design}=candidate;doc.design={...design,layout};doc.title=candidate.title;doc.nodes=[];doc.pendingNodes=[];doc.behavior=null;doc.selection=selected;doc.phase='paused';doc.error=null;});
 }
}
