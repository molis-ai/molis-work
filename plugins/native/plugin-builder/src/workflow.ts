import {randomUUID} from 'node:crypto';
import type {PluginStartContext,PluginCapabilityClient} from '@molis-ai/molis-work-contracts/platform/plugin';
import {agentHostCapabilities as agent,isTerminalAgentPhase} from '@molis-ai/molis-work-contracts/services/agent-host';
import {projectSettingsCapabilities} from '@molis-ai/molis-work-contracts/modules/projects';
import {BuilderStore} from './store.js';
import {RecordStore,validateValues} from './records.js';
import {BuilderError,type BuildDocument,type Design,type PartSelection,type Release} from './model.js';
import {dropUnfitBindings,expandProposal,parseBehavior,parseCandidates,parseDesign,parseModelJson,parseNodes} from './validation.js';
import {cancelOpenSteps,connectNext,connectedIds,fullyWired,needsConnection,placeNext,queueConnections,recordStep,resolveDecisions,settleStep,snapshot} from './activity.js';
import {FINISH,SPEC_BOARD,isRequired,partCandidates,partName,partNode,ruleChoice,selectionState,type PartCandidate} from './spec-board.js';
export interface BuilderConfiguration {workspace_id:string;provider_id:string;model_id:string}
/** A bounded choice question: the answer must be one of `candidates`, which the caller re-checks. */
export interface ChoiceQuestion {key:string;instructions:string;state:string;candidates:readonly PartCandidate[]}
export interface ChoiceAnswer {choice:string|null;model:string;elapsedMs:number;confidence:number|null}
export interface BuilderPorts {
 ready():Promise<void>;
 models():Promise<readonly {provider_id:string;model_id:string;label:string}[]>;
 /** Jev. Absent or unavailable means rule selection, which is recorded as such. */
 choose?(question:ChoiceQuestion):Promise<ChoiceAnswer>;
 selectionAvailable?():boolean;
 /** Read-only snapshot of installed generated-plugin versions from Plugin Runtime. */
 installedVersions?():Promise<Record<string,string>>;
 /** Host routes this user-confirmed update through Plugin Runtime's upgrade path. */
 upgradePublished?(release:Release):Promise<void>;
}
type Stage='design'|'behavior';
/** Label of a clarification round the user has answered; counting them bounds how often the design role may ask. */
export const ANSWERED='你补充了说明';
const LAYOUTS:readonly PartCandidate[]=[{key:'cards',description:'卡片：每项独立浏览，适合素材与灵感'},{key:'list',description:'列表：快速逐项阅读和编辑'},{key:'table',description:'表格：密集比较字段和数值统计'}];
const NEXT_PART_INSTRUCTIONS='你在为一个本地数据插件逐个装配界面零件。根据主线设计的用户旅程和已放入的零件，从候选中选出下一步最该放入的一个零件；主线旅程已覆盖时选择 finish。只能从候选里选，不改变字段、数据或任务范围。';
const activePhase=(d:BuildDocument)=>d.active?.stage==='design'?'clarifying':'building';
const message=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;
export class BuilderWorkflow {
 readonly store:BuilderStore;
 private readonly api:PluginCapabilityClient;
 private readonly busy=new Set<string>();
 private readonly selecting=new Set<string>();
 constructor(private readonly context:PluginStartContext,private readonly ports:BuilderPorts){
  if(!context.services?.storage || !context.services.capabilities || !context.board_id) throw new Error('创作插件缺少项目、存储或执行能力');
  this.store=new BuilderStore(context.services.storage);this.api=context.services.capabilities;
 }
 require(id:string){const d=this.store.get(id);if(!d)throw new Error('找不到这份草稿');return d;}
 async publish(id:string,revision:number,compatibleWithPrevious?:boolean){
  const d=this.require(id);if(d.revision!==revision||d.phase!=='ready'||!d.design||!d.behavior||d.active)throw new Error('草稿已改变或尚未就绪，请完成构建后重试');
  return this.store.release(id,revision,compatibleWithPrevious);
 }
 async upgrade(id:string,revision:number,version:number){
  const d=this.require(id);if(d.revision!==revision)throw new Error('草稿已改变，请刷新后重试');
  const release=this.store.versions(id).find(r=>r.version===version);if(!release)throw new Error('找不到这个发布版本');
  const latest=this.store.releases().find(item=>item.buildId===id);
  if(latest?.version!==release.version)throw new Error('只能升级到最新发布版本');
  const installed=(await this.ports.installedVersions?.())?.[release.pluginId];
  const installedNumber=installed?.match(/^(\d+)\.0\.0$/)?.[1];
  if(!installedNumber)throw new Error('此插件尚未安装，请先打开当前发布版本');
  if(version<=Number(installedNumber))throw new Error('只能升级到高于当前安装版本的新发布');
  if(!this.ports.upgradePublished)throw new Error('插件升级入口尚未装配');
  try{await this.ports.upgradePublished(release);}catch(error){throw new Error(`v${version} 升级失败，仍保留 v${installedNumber}：${message(error,'请重试')}`);}
  return release;
 }
 private jevReady(){return Boolean(this.ports.choose&&(this.ports.selectionAvailable?.()??true));}
 async state(){await this.ports.ready();const [models,workspaces,runtimes,installedVersions]=await Promise.all([this.ports.models(),this.api.invoke(projectSettingsCapabilities.workspaces,[]),this.api.invoke(agent.listRuntimes,[]),this.ports.installedVersions?.()??Promise.resolve({})]);return {builds:this.store.list(),releases:this.store.releases(),installedVersions,models,workspaces:workspaces.map(w=>({workspace_id:w.workspace_id,label:w.display_name||'项目工作区'})),runtimeAvailable:runtimes.some(r=>r.runtime_id==='prologue'),selectionAvailable:this.jevReady(),specBoard:SPEC_BOARD.map(({kind,name,purpose})=>({kind,name,purpose}))};}
 async start(id:string,revision:number,stage:Stage,config:BuilderConfiguration,actor:string,repairing=false){
  if(this.busy.has(id))throw new Error('当前操作尚未结束，请稍候');this.busy.add(id);
  let token:string|undefined;
  try{
   await this.ports.ready();const d=this.require(id);
   if(d.revision!==revision || d.active)throw new Error('草稿已改变或仍有任务运行，请刷新后重试');
   const [workspaces,models]=await Promise.all([this.api.invoke(projectSettingsCapabilities.workspaces,[]),this.ports.models()]);
   const workspace=workspaces.find(w=>w.workspace_id===config.workspace_id&&w.realpath_verified);
   if(!workspace)throw new Error('请先选择本项目已授权的工作区');
   if(!models.some(m=>m.provider_id===config.provider_id&&m.model_id===config.model_id))throw new Error('所选模型尚未配置，请在模型设置中完成配置');
   token=randomUUID();const operation=token;
   this.store.update(id,revision,doc=>{
    if(!repairing)doc.repair=undefined;doc.phase=stage==='design'?'clarifying':'building';doc.error=null;doc.configuration={...config};doc.active={token:operation,stage,baseRevision:revision,...config};(doc.runs??=[]).push({token:operation,stage,...config,phase:'starting'});
    const fixing=repairing&&doc.repair?`根据校验结果修正（第 ${doc.repair.attempt} 次）`:'';
    recordStep(doc,stage==='design'?{id:`run:${operation}`,agent:'design',action:'understand',label:fixing||(doc.design?'理解你的修改':'理解需求与使用场景'),status:'active',...(fixing?{detail:doc.repair!.error}:{})}:{id:`run:${operation}`,agent:'behavior',action:'plan',label:fixing||'编写数据与行为',status:'active',detail:fixing?doc.repair!.error:'字段校验、保存、搜索与导出'});
   });
   const directory={canonical_path:workspace.canonical_path,realpath_verified:true};
   const owner={board_id:this.context.board_id!,plugin_id:this.context.plugin_id,install_id:this.context.install_id,actor_id:actor,directory};
   const session=await this.api.invoke(agent.createSession,['prologue',{...owner,title:`${d.title} · ${stage}`}]);
   if(this.require(id).active?.token!==token)return this.require(id);
   let current=this.require(id);this.store.update(id,current.revision,doc=>{if(doc.active)doc.active.session_id=session.session_id;doc.runs!.find(r=>r.token===token)!.session_id=session.session_id;});
   const repair=repairing&&d.repair?.stage===stage?{repair:{previousAnswer:d.repair.answer.slice(0,12000),validationError:d.repair.error}}:{};
   const task=stage==='design'?JSON.stringify(d.design&&d.revising?{mode:'revise',request:d.revising.message,target:d.revising.target,messages:d.messages,currentDesign:d.design,placedParts:d.nodes.map(({kind,label})=>({kind,label})),...repair}:{request:d.brief,messages:d.messages,currentDesign:d.design,clarificationRounds:(d.steps??[]).filter(s=>s.agent==='design'&&s.action==='decide'&&s.label===ANSWERED).length,...repair}):JSON.stringify({design:d.design,...repair});
   const handle=await this.api.invoke(agent.startRun,['prologue',{...owner,session,task,role_id:stage,model_selection:{provider_id:config.provider_id,model_id:config.model_id},budget:{max_turns:2,max_output_tokens:32000,max_duration_ms:180000}}]);
   current=this.require(id);
   if(current.active?.token!==token){await this.api.invoke(agent.controlRun,[session,handle.ref,{kind:'cancel'}]);return this.store.update(id,this.require(id).revision,doc=>{const record=doc.runs?.find(r=>r.token===token);if(record){record.run_id=handle.ref.run_id;record.phase='cancel-requested';}});}
   const attached=this.store.update(id,current.revision,doc=>{doc.active!.run_id=handle.ref.run_id;const record=doc.runs!.find(r=>r.token===token)!;record.run_id=handle.ref.run_id;record.phase='running';});
   if(attached.phase==='paused')await this.api.invoke(agent.controlRun,[session,handle.ref,{kind:'pause'}]);
   return attached;
  }catch(error){const current=this.require(id);if(token&&current.active?.token===token)this.store.update(id,current.revision,doc=>{doc.phase='failed';doc.error=message(error,'运行启动失败');const record=doc.runs?.find(r=>r.token===token);if(record)record.phase='failed';settleStep(doc,`run:${token}`,'failed',doc.error);doc.active=null;});throw error;}
  finally{this.busy.delete(id);}
 }
 async advance(id:string,actor:string){
  if(this.busy.has(id))return this.require(id);
  let d=this.require(id);if(d.phase==='paused'||d.phase==='failed')return d;
  const run=d.active;
  if(run&&(!run.run_id||!run.session_id))return this.store.update(id,d.revision,doc=>{doc.phase='failed';doc.error='运行启动被中断，请停止本轮后继续。已有内容已保留。';settleStep(doc,`run:${run.token}`,'failed',doc.error);});
  if(run?.run_id&&run.session_id){
   await this.ports.ready();
   const view=await this.api.invoke(agent.readRun,[{runtime_id:'prologue',session_id:run.session_id},{session_id:run.session_id,run_id:run.run_id}]);
   d=this.require(id);if(d.active?.token!==run.token||d.phase==='paused')return d;
   if(isTerminalAgentPhase(view.phase)){
    d=this.store.update(id,d.revision,doc=>{const record=doc.runs?.find(r=>r.token===run.token);if(record)record.phase=view.phase;});
    const stepId=`run:${run.token}`;let answer='';
    try{
     if(view.phase!=='completed')throw new Error(view.stop_reason||'这一轮没有完成，草稿已保留');
     const turns=view.turns.filter(t=>t.kind==='assistant');answer=turns.at(-1)?.text??'';const output=parseModelJson(answer);
     if(run.stage==='design'){
      if(!output||typeof output!=='object'||Array.isArray(output))throw new Error('设计返回格式不正确');
      const value=output as {questions?:unknown;summary?:unknown;candidates?:unknown;design?:unknown;base?:unknown;samples?:unknown};
      const summary=typeof value.summary==='string'?value.summary.slice(0,4000):'设计已更新';
      if(Array.isArray(value.questions)&&value.questions.length){
       if(value.questions.length>3||value.questions.some(q=>typeof q!=='string'||!q.trim()||q.length>1000))throw new Error('澄清问题格式不正确');
       return this.store.update(id,d.revision,doc=>{doc.active=null;doc.repair=undefined;doc.phase=doc.design?'paused':'draft';doc.questions=value.questions as string[];doc.messages.push({role:'assistant',text:summary});settleStep(doc,stepId,'done',summary);recordStep(doc,{id:`decide:${run.token}`,agent:'design',action:'decide',label:`需要你回答 ${doc.questions.length} 个问题`,status:'waiting'});});
      }
      const dropped:string[]=[];
      if(d.revising&&d.design){const next=parseDesign({...(dropUnfitBindings(value.design,'修订设计',dropped) as object),id:d.design.id});return this.store.update(id,d.revision,doc=>{doc.active=null;doc.repair=undefined;settleStep(doc,stepId,'done',summary+(dropped.length?`；已忽略不合适的展示提示：${dropped.join('；')}`:''));doc.messages.push({role:'assistant',text:summary});applyRevision(doc,next,summary);});}
      const proposed=expandProposal(value);
      const candidates=parseCandidates(Array.isArray(proposed)?proposed.map((item,index)=>dropUnfitBindings(item,`候选 ${index+1} `,dropped)):proposed);
      return this.store.update(id,d.revision,doc=>{doc.active=null;doc.repair=undefined;doc.phase='choosing';doc.candidates=candidates;doc.questions=[];doc.messages.push({role:'assistant',text:summary});settleStep(doc,stepId,'done',summary);recordStep(doc,{id:`propose:${run.token}`,agent:'design',action:'propose',label:`提出 ${candidates.length} 个方案`,status:'done',detail:candidates.map(c=>`${c.title}（${LAYOUT_NAME[c.layout]}）`).join(' · ')+(dropped.length?`；已忽略不合适的展示提示：${dropped.join('；')}`:'')});recordStep(doc,{id:`decide:${run.token}`,agent:'design',action:'decide',label:'等你选择方案',status:'waiting'});});
     }
     if(!d.design)throw new Error('主线设计已不存在');
     if(run.stage!=='behavior')throw new Error('界面已改为按规格板逐个选择零件，请继续构建');
     const behavior=parseBehavior(output,d.design);
     d=this.store.update(id,d.revision,doc=>{doc.active=null;doc.repair=undefined;doc.behavior=behavior;doc.connected=[];queueConnections(doc);const ops=[...doc.nodes,...doc.pendingNodes].filter(needsConnection).length;settleStep(doc,stepId,'done',behavior.calculations.length?`${behavior.calculations.length} 项计算通过校验`:'数据结构与操作通过校验');doc.messages.push({role:'assistant',text:ops?'数据与操作已通过校验，正在逐个接到界面上。':'数据与操作已通过校验，界面零件出现后逐个接通。'});});
    }catch(error){
     // The model answered but the host rejected it: hand the reason back to the same role, at most twice in a row.
     const rejected=view.phase==='completed'&&answer.trim()!==''&&(error instanceof BuilderError||['设计返回格式不正确','澄清问题格式不正确'].includes(message(error,'')));
     const attempt=(this.require(id).repair?.attempt??0)+1;
     if(rejected&&attempt<=2&&run.workspace_id&&run.provider_id&&run.model_id){
      const reason=message(error,'模型结果未通过校验');const retry=this.store.update(id,this.require(id).revision,doc=>{doc.active=null;doc.repair={stage:run.stage as Stage,attempt,error:reason,answer};settleStep(doc,stepId,'failed',`校验未通过：${reason}`+(view.stop_reason?` · 停止原因：${view.stop_reason}`:'')+` · 回答 ${answer.length} 字${view.usage?.tokens?.output?`，输出 ${view.usage.tokens.output} tokens`:''}，结尾：${answer.trim().slice(-80)}`);});
      return this.start(id,retry.revision,run.stage as Stage,{workspace_id:run.workspace_id,provider_id:run.provider_id,model_id:run.model_id},actor,true);
     }
     return this.store.update(id,this.require(id).revision,doc=>{doc.active=null;doc.phase='failed';doc.error=message(error,'模型结果无法使用');settleStep(doc,stepId,'failed',doc.error+(answer?` · 模型返回的开头：${answer.trim().slice(0,160)} …结尾：${answer.trim().slice(-120)}`:'')+(view.stop_reason?` · 停止原因：${view.stop_reason}`:''));});}
   }else if(['reconcile-required','awaiting-input','awaiting-review','stopped'].includes(view.phase)){
    return this.store.update(id,d.revision,doc=>{doc.phase='failed';doc.error='原运行需要处理或已中断。可停止本轮后重试；已完成的界面会保留。';settleStep(doc,`run:${run.token}`,'failed',doc.error);});
   }
  }
  d=this.require(id);if(d.phase!=='building')return d;
  if(d.pendingNodes.length)d=this.store.update(id,d.revision,doc=>{placeNext(doc);queueConnections(doc);});
  else if(d.assembling)d=await this.assembleNext(id);
  if(d.phase!=='building')return d;
  if(d.behavior&&d.nodes.some(n=>needsConnection(n)&&!connectedIds(d).has(n.id)))d=this.store.update(id,d.revision,doc=>{connectNext(doc);});
  if(d.behavior&&d.samples?.length&&!d.samplesSaved&&d.nodes.some(n=>n.kind==='form'&&connectedIds(d).has(n.id)))d=this.trySave(id);
  if(!d.active&&d.design&&!d.behavior){
   const config=d.configuration??(run?.workspace_id&&run.provider_id&&run.model_id?{workspace_id:run.workspace_id,provider_id:run.provider_id,model_id:run.model_id}:null);
   if(!config)return this.store.update(id,d.revision,doc=>{doc.phase='paused';doc.error='请选择工作区和模型后继续构建';});
   return this.start(id,d.revision,'behavior',config,actor);
  }
  if(!d.active&&!d.assembling&&fullyWired(d))return this.verify(id);
  return d;
 }
 /** Choose one part from the spec board: Jev when available, else a recorded rule. A late answer is dropped. */
 private async assembleNext(id:string):Promise<BuildDocument>{
  let d=this.require(id);if(this.selecting.has(id)||!d.design||d.steps?.some(s=>s.agent==='ui'&&s.action==='decide'&&s.status==='waiting'))return d;
  const design=d.design,placed=d.nodes.map(n=>n.id).join(','),candidates=partCandidates(design,d.nodes),keys=candidates.map(c=>c.key);
  const stepId=`pick:${randomUUID().slice(0,8)}`;
  let selection:PartSelection;
  if(candidates.length===1)selection={source:'rule',candidates:keys,choice:keys[0]!,reason:'唯一合法候选'};
  else if(!this.jevReady())selection={source:'rule',candidates:keys,choice:ruleChoice(candidates,design),reason:'Jev 未配置，按规格板顺序'};
  else{
   this.selecting.add(id);
   try{
    d=this.store.update(id,d.revision,doc=>{recordStep(doc,{id:stepId,agent:'ui',action:'place',label:'Jev 正在选择下一个零件',status:'active',detail:`${candidates.length} 个合法候选`,selection:{source:'jev',candidates:keys,choice:''}});});
    let answer:ChoiceAnswer|undefined,failure='';
    try{answer=await this.ports.choose!({key:'plugin_builder_next_part',instructions:NEXT_PART_INSTRUCTIONS,state:selectionState(design,d.nodes),candidates});}catch(error){failure=message(error,'Jev 调用失败');}
    d=this.require(id);
    if(d.phase!=='building'||!d.assembling||d.design?.id!==design.id||d.nodes.map(n=>n.id).join(',')!==placed)return this.store.update(id,d.revision,doc=>{settleStep(doc,stepId,'cancelled','构建已暂停或界面已变化，这次选择未采用');});
    if(!answer||!answer.choice||!keys.includes(answer.choice)){
     const reason=failure||`Jev 返回了候选之外的「${answer?.choice??'空'}」`;
     return this.store.update(id,d.revision,doc=>{recordStep(doc,{id:stepId,agent:'ui',action:'place',label:'Jev 没有给出合法零件',status:'failed',detail:reason,selection:{source:'jev',candidates:keys,choice:''}});recordStep(doc,{id:`decide:${stepId}`,agent:'ui',action:'decide',label:'请你选择下一个零件',status:'waiting',detail:`${reason}。已放入的零件不受影响，可从候选中选一个，或继续构建重试 Jev。`,selection:{source:'user',candidates:keys,choice:''}});});
    }
    selection={source:'jev',candidates:keys,choice:answer.choice,model:answer.model,elapsedMs:answer.elapsedMs,confidence:answer.confidence};
   }finally{this.selecting.delete(id);}
  }
  return this.store.update(id,d.revision,doc=>this.applyPart(doc,stepId,selection));
 }
 private applyPart(doc:BuildDocument,stepId:string,selection:PartSelection){
  if(selection.choice===FINISH){doc.assembling=false;recordStep(doc,{id:stepId,agent:'ui',action:'place',label:'界面装配完成',status:'done',detail:`${doc.nodes.length} 个零件`,selection});return;}
  const node=partNode(doc.design!,selection.choice);doc.nodes.push(node);
  recordStep(doc,{id:stepId,agent:'ui',action:'place',label:`放入${node.label}`,target:node.id,status:'done',detail:partName(node.kind),selection});
  if(!partCandidates(doc.design!,doc.nodes).length)doc.assembling=false;
  queueConnections(doc);
 }
 /** The user takes a turn: place any legal part next, e.g. when Jev could not answer. */
 async pickPart(id:string,revision:number,kind:string){
  if(this.selecting.has(id))throw new Error('Jev 正在选择，请稍候再放入');
  const d=this.require(id);if(d.revision!==revision)throw new Error('草稿已更新，请重试');
  if(!d.design||!d.assembling||d.active?.stage==='design')throw new Error('当前不在装配界面零件');
  const candidates=partCandidates(d.design,d.nodes);if(!candidates.some(c=>c.key===kind))throw new Error(`「${partName(kind)}」现在不能放入`);
  return this.store.update(id,revision,doc=>{
   for(const step of doc.steps??[])if(step.agent==='ui'&&step.action==='decide'&&step.status==='waiting'){step.status='done';step.label=`你选择了${partName(kind)}`;}
   this.applyPart(doc,`pick:${randomUUID().slice(0,8)}`,{source:'user',candidates:candidates.map(c=>c.key),choice:kind,reason:'用户选择'});
   if(doc.phase!=='building'&&!doc.error)doc.phase='building';
  });
 }
 /** The function agent exercises the freshly wired save with the proposal's examples, through the real record store. */
 private trySave(id:string){
  const d=this.require(id);const records=new RecordStore(this.context.services!.storage!,`preview:${id}`,d.design!,d.behavior!);
  let saved=0,problem='';if(!records.list().length)for(const sample of d.samples??[]){try{records.save(sample);saved+=1;}catch(error){problem=message(error,'示例未通过校验');}}
  return this.store.update(id,d.revision,doc=>{doc.samplesSaved=true;recordStep(doc,{id:`samples:${doc.revision}`,agent:'behavior',action:'verify',label:'用示例内容试跑保存',status:problem&&!saved?'failed':'done',detail:saved?`${saved} 条示例内容已通过保存与校验，可随时编辑或删除`+(problem?`；1 条未通过：${problem}`:''):problem||'预览里已有内容，未写入示例',target:doc.nodes.find(n=>n.kind==='form')?.id});});
 }
 /** A real self-check before the plugin is offered for use: the same validators and record store as publishing. */
 private verify(id:string){
  const d=this.require(id);const stepId=`verify:${d.revision}`;
  try{
   const design=parseDesign(d.design),nodes=parseNodes(d.nodes,design),behavior=parseBehavior(d.behavior,design);
   const rows=new RecordStore(this.context.services!.storage!,`preview:${id}`,design,behavior).list();
   const wired=connectedIds(d);const loose=nodes.filter(n=>needsConnection(n)&&!wired.has(n.id));if(loose.length)throw new Error(`${loose.map(n=>n.label).join('、')}还没有接通`);
   return this.store.update(id,d.revision,doc=>{recordStep(doc,{id:stepId,agent:'host',action:'verify',label:'检查完整旅程',status:'done',detail:`${nodes.length} 个零件、${nodes.filter(needsConnection).length} 项操作已接通 · ${rows.length} 条预览记录可计算`});doc.phase='ready';});
  }catch(error){return this.store.update(id,d.revision,doc=>{recordStep(doc,{id:stepId,agent:'host',action:'verify',label:'检查完整旅程',status:'failed',detail:message(error,'检查未通过')});doc.phase='failed';doc.error='完整性检查未通过：'+message(error,'请调整后重试');});}
 }
 async pause(id:string){
  const d=this.require(id);
  const next=this.store.update(id,d.revision,doc=>{doc.phase='paused';});
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
  if(!d.design)return this.start(id,d.revision,'design',config,actor);
  d=this.store.update(id,d.revision,doc=>{
   doc.configuration={...config};doc.phase='building';doc.error=null;
   if(!doc.pendingNodes.length&&SPEC_BOARD.some(spec=>isRequired(spec,doc.design!)&&!doc.nodes.some(n=>n.kind===spec.kind)))doc.assembling=true;
   // Resuming retries Jev, so a pending "choose a part" request is withdrawn rather than left open.
   for(const step of doc.steps??[])if(step.agent==='ui'&&step.action==='decide'&&step.status==='waiting'){step.status='cancelled';step.detail='已重新交给 Jev 选择';}
  });
  if(!d.behavior)return this.start(id,d.revision,'behavior',config,actor);
  return d;
 }
 async stop(id:string){
  const d=this.require(id);const next=this.store.update(id,d.revision,doc=>{doc.active=null;doc.phase='paused';doc.revising=undefined;if(d.active)settleStep(doc,`run:${d.active.token}`,'cancelled','已停止本轮');});
  if(d.active?.run_id&&d.active.session_id)await this.api.invoke(agent.controlRun,[{runtime_id:'prologue',session_id:d.active.session_id},{run_id:d.active.run_id,session_id:d.active.session_id},{kind:'cancel'}]);return next;
 }
 /** A change request on a working plugin: the design agent revises the shared design, the host keeps what still holds. */
 async revise(id:string,revision:number,text:string,targetId:string|undefined,config:BuilderConfiguration,actor:string){
  const d=this.require(id);if(d.revision!==revision)throw new Error('草稿已更新，请重试');
  if(d.active)throw new Error('请等这一轮完成或先停止，再提出修改');if(!d.design)throw new Error('先确定一个方案，再修改它');
  const target=targetId===undefined?undefined:d.nodes.find(n=>n.id===targetId);if(targetId!==undefined&&!target)throw new Error('你指着的零件已经不在画布上');
  const next=this.store.update(id,revision,doc=>{
   doc.history.push(snapshot(doc));doc.messages.push({role:'user',text:target?`［${target.label}］${text}`:text});
   doc.revising={message:text,...(target?{target:{id:target.id,kind:target.kind,label:target.label}}:{})};doc.questions=[];doc.error=null;
   cancelOpenSteps(doc,['ui','behavior','host'],'需求已更新');
  });
  return this.start(id,next.revision,'design',config,actor);
 }
 async choose(id:string,revision:number,candidateId:string,selection:'manual'|'jev'){
  const d=this.require(id);if(d.active||d.revision!==revision)throw new Error('草稿已改变，请重新选择');
  const candidate=d.candidates.find(c=>c.id===candidateId);if(!candidate)throw new Error('候选已不存在');
  let selected:BuildDocument['selection']={source:'manual',reason:'采用用户选择的界面方案'};let layout=candidate.layout;
  if(selection==='jev'){
   if(!this.jevReady())throw new Error('Jev 尚未配置，可改为采用所选方案');
   const answer=await this.ports.choose!({key:'plugin_builder_layout',instructions:'根据主线旅程选择适合操作的集合零件。不要改变字段、数据或任务范围。',state:JSON.stringify(candidate),candidates:LAYOUTS});
   if(!LAYOUTS.some(l=>l.key===answer.choice))throw new Error('Jev 没有选择合法零件，草稿未改变；可重试或手动选择');
   layout=answer.choice as Design['layout'];selected={source:'jev',model:answer.model,elapsedMs:answer.elapsedMs,reason:'Jev 在卡片、列表和表格中选择合法集合零件'};
  }
  return this.store.update(id,revision,doc=>{
   doc.history.push(snapshot(doc));doc.revising=undefined;const {rationale:_rationale,samples,...design}=candidate;doc.design={...design,layout};
   // Invalid examples are dropped, never repaired: they must pass the same checks as a user's record.
   doc.samples=(samples??[]).flatMap(sample=>{try{return [validateValues(sample,doc.design!)];}catch{return [];}});doc.samplesSaved=false;doc.title=candidate.title;doc.nodes=[];doc.pendingNodes=[];doc.behavior=null;doc.connected=[];doc.assembling=false;doc.selection=selected;doc.phase='paused';doc.error=null;
   cancelOpenSteps(doc,['ui','behavior','host'],'方案已更换');resolveDecisions(doc,`采用「${candidate.title}」`);
  });
 }
}
const LAYOUT_NAME={cards:'卡片',list:'列表',table:'表格'};
/** What a revision changed, in the user's words; also decides which parts must be redone. */
export function describeRevision(before:Design,after:Design){
 const changes:string[]=[];const oldFields=new Map(before.fields.map(f=>[f.id,f]));
 if(before.title!==after.title)changes.push(`名称改为「${after.title}」`);
 if(before.layout!==after.layout)changes.push(`集合从${LAYOUT_NAME[before.layout]}换成${LAYOUT_NAME[after.layout]}`);
 const added=after.fields.filter(f=>!oldFields.has(f.id)),removed=before.fields.filter(f=>!after.fields.some(n=>n.id===f.id));
 if(added.length)changes.push(`新增字段 ${added.map(f=>f.label).join('、')}`);
 if(removed.length)changes.push(`移除字段 ${removed.map(f=>f.label).join('、')}`);
 const relabeled=after.fields.filter(f=>oldFields.has(f.id)&&oldFields.get(f.id)!.label!==f.label);if(relabeled.length)changes.push(`字段改名 ${relabeled.map(f=>f.label).join('、')}`);
 if(JSON.stringify(before.calculations)!==JSON.stringify(after.calculations)){const was=new Set(before.calculations.map(c=>c.id)),now=new Set(after.calculations.map(c=>c.id));const gone=before.calculations.filter(c=>!now.has(c.id)).map(c=>c.label),added=after.calculations.filter(c=>!was.has(c.id)).map(c=>c.label);changes.push([gone.length?`移除计算 ${gone.join('、')}`:'',added.length?`新增计算 ${added.join('、')}`:''].filter(Boolean).join('，')||'计算规则已更新');}
 if(before.allowImport!==after.allowImport||before.allowExport!==after.allowExport)changes.push('导入导出范围已更新');
 if(JSON.stringify(before.presentation??{})!==JSON.stringify(after.presentation??{}))changes.push('卡片展示方式已更新');
 if(JSON.stringify(before.totals??null)!==JSON.stringify(after.totals??null)){const name=(id:string)=>[...after.fields,...after.calculations].find(f=>f.id===id)?.label??id;changes.push(after.totals?`合计项改为 ${after.totals.map(name).join('、')}`:'合计全部数字项');}
 if(before.description!==after.description)changes.push('说明已更新');
 const behaviorChanged=JSON.stringify([before.fields,before.calculations,before.allowImport,before.allowExport])!==JSON.stringify([after.fields,after.calculations,after.allowImport,after.allowExport]);
 return {changes,behaviorChanged,fieldsChanged:JSON.stringify(before.fields)!==JSON.stringify(after.fields)};
}
function applyRevision(doc:BuildDocument,next:Design,summary:string){
 const before=doc.design!;const {changes,behaviorChanged,fieldsChanged}=describeRevision(before,next);const target=doc.revising?.target;
 doc.design=next;doc.title=next.title;doc.revising=undefined;doc.phase='building';
 recordStep(doc,{id:`revise:${doc.revision}`,agent:'design',action:'plan',label:'修订主线设计',status:'done',detail:changes.join(' · ')||summary,...(target?{target:target.id}:{})});
 // Parts that no longer fit the design leave; the rest stay, relabeled where their label came from the design.
 const kept=doc.nodes.filter(node=>{try{partNode(next,node.kind);return true;}catch{recordStep(doc,{id:`remove:${node.id}:${doc.revision}`,agent:'ui',action:'remove',label:`移除${node.label}`,status:'done',detail:'新设计不再需要这个零件'});return false;}});
 doc.nodes=kept.map(node=>{
  const derived=partNode(before,node.kind).label===node.label;const label=derived?partNode(next,node.kind).label:node.label;
  const touched=node.id===target?.id||(node.kind==='heading'&&before.title!==next.title)||(node.kind==='collection'&&(before.layout!==next.layout||JSON.stringify(before.presentation)!==JSON.stringify(next.presentation)))||(node.kind==='form'&&fieldsChanged);
  if(touched)recordStep(doc,{id:`adjust:${node.id}:${doc.revision}`,agent:'ui',action:'place',label:`调整${label}`,target:node.id,status:'done',detail:changes.join(' · ')||'按你的要求调整'});
  return {...node,label};
 });
 if(behaviorChanged){doc.behavior=null;doc.connected=[];cancelOpenSteps(doc,['behavior'],'主线设计已修订');}
 else doc.connected=[...connectedIds(doc)].filter(id=>doc.nodes.some(n=>n.id===id));
 // New fields can make optional parts legal again; the selector decides whether to add them.
 doc.assembling=fieldsChanged&&partCandidates(next,doc.nodes).some(c=>c.key!==FINISH);
}
