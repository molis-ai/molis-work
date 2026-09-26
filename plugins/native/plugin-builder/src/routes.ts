import type {PluginRouteBinding,PluginStartContext} from '@molis-ai/molis-work-contracts/platform/plugin';
import {readFile} from 'node:fs/promises';
import {RecordStore} from './records.js';
import {createInspirationStarter} from './starter.js';
import {ANSWERED,BuilderWorkflow,type BuilderConfiguration} from './workflow.js';
import {bodyObject,requiredText,revisionOf,recordsResponse} from './record-routes.js';
import {operationLive,resolveDecisions,snapshot} from './activity.js';
import type {BuildDocument,BuildStep} from './model.js';
export function builderRoutes(context:PluginStartContext,workflow:BuilderWorkflow):PluginRouteBinding[]{
 const route=(route_id:string,handle:PluginRouteBinding['handle']):PluginRouteBinding=>({route_id,async handle(request){try{return await handle(request);}catch(error){return {status:(error as {code?:string}).code?.includes('conflict')?409:400,body:{error:error instanceof Error?error.message:'操作失败，内容已保留'}};}}});
 const config=(body:Record<string,unknown>):BuilderConfiguration=>({workspace_id:requiredText(body.workspace_id,'工作区'),provider_id:requiredText(body.provider_id,'模型服务'),model_id:requiredText(body.model_id,'模型')});
 return [
 route('builder.inspiration-asset',async()=>({status:200,mime:'image/png',headers:{'content-type':'image/png'},bytes:await readFile(new URL('../assets/inspiration-atlas.png',import.meta.url))})),
 route('builder.state',async()=>({status:200,body:await workflow.state()})),
 route('builder.create',request=>{
  const body=bodyObject(request.body);
  if(body.starter!==undefined){
   if(body.starter!=='inspiration')throw new Error('未知示例');
   return {status:201,body:{build:createInspirationStarter(workflow.store,context.services!.storage!)}};
  }
  return {status:201,body:{build:workflow.store.create(requiredText(body.brief,'需求'))}};
 }),
 route('builder.read',request=>({status:200,body:{build:workflow.require(request.params.id!),versions:workflow.store.versions(request.params.id!)}})),
 route('builder.action',async request=>{
  const id=request.params.id!,body=bodyObject(request.body),action=requiredText(body.action,'操作');
  if(action==='advance')return {status:200,body:{build:await workflow.advance(id,request.actor_id)}};
  // Pausing or stopping must win against the background build, which keeps bumping the revision.
  if(action==='pause')return {status:200,body:{build:await workflow.pause(id)}};
  if(action==='stop')return {status:200,body:{build:await workflow.stop(id)}};
  if(action==='remove'){workflow.store.remove(id,revisionOf(body.revision));return {status:200,body:{deleted:true}};}
  // Placing a part is checked against the latest parts, so a user's pick is not refused by the agents' ticks.
  if(action==='part')return {status:200,body:{build:await workflow.pickPart(id,workflow.require(id).revision,requiredText(body.kind,'零件'))}};
  const revision=revisionOf(body.revision);let build=workflow.require(id);
  if(build.revision!==revision)throw new Error('草稿已被更新，请刷新后重试');
  switch(action){
   case 'design':build=await workflow.start(id,revision,'design',config(body),request.actor_id);break;
   case 'choose':build=await workflow.choose(id,revision,requiredText(body.candidateId,'方案'),body.selection==='jev'?'jev':'manual');break;
   case 'resume':build=await workflow.resume(id,revision,config(body),request.actor_id);break;
   case 'revise':build=await workflow.revise(id,revision,requiredText(body.message,'修改意见'),body.target===undefined||body.target===null?undefined:requiredText(body.target,'零件'),config(body),request.actor_id);break;
   case 'message':{
    if(build.active)throw new Error('请先停止当前构建，再修改需求');
    const message=requiredText(body.message,'补充需求');
    build=workflow.store.update(id,revision,d=>{d.messages.push({role:'user',text:message});if(d.questions.length)resolveDecisions(d,ANSWERED);d.questions=[];d.candidates=[];d.phase='draft';d.error=null;});break;
   }
   case 'layout':{
    if(build.active)throw new Error('请先停止当前构建，再修改布局');
    if(!['cards','list','table'].includes(String(body.layout))||!build.design)throw new Error('布局不可用');
    build=workflow.store.update(id,revision,d=>{d.history.push(snapshot(d));d.design!.layout=body.layout as 'cards'|'list'|'table';});break;
   }
   case 'node':{
    if(build.active||build.pendingNodes.length)throw new Error('请等待装配结束或停止后再调整零件');
    const index=build.nodes.findIndex(node=>node.id===body.nodeId);if(index<0)throw new Error('这个零件已不存在');
    const label=body.label===undefined?undefined:requiredText(body.label,'零件标签');
    if(label&&label.length>160)throw new Error('零件标签不能超过160字');
    if(body.direction!==undefined&&body.direction!==-1&&body.direction!==1)throw new Error('零件移动方向无效');
    // Parts only move within their page area; a drop names the part it lands before (null: end of the area).
    const moving=build.nodes[index]!,swap=typeof body.direction==='number'?build.nodes[index+body.direction]:undefined;
    if(swap&&AREA[swap.kind]!==AREA[moving.kind])throw new Error('零件只能在同一区域内调整顺序');
    const before=body.before===undefined?undefined:body.before===null?null:build.nodes.find(node=>node.id===body.before);
    if(before===undefined&&body.before!==undefined)throw new Error('目标位置的零件已不存在');
    if(before&&AREA[before.kind]!==AREA[moving.kind])throw new Error('零件只能在同一区域内调整顺序');
    build=workflow.store.update(id,revision,d=>{
     d.history.push(snapshot(d));
     if(label)d.nodes[index]!.label=label;
     if(typeof body.direction==='number'){const target=index+body.direction;if(target>=0&&target<d.nodes.length)[d.nodes[index],d.nodes[target]]=[d.nodes[target]!,d.nodes[index]!];}
     if(before!==undefined&&before?.id!==moving.id){const [node]=d.nodes.splice(index,1);const at=before?d.nodes.findIndex(n=>n.id===before.id):d.nodes.reduce((last,n,i)=>AREA[n.kind]===AREA[moving.kind]?i+1:last,d.nodes.length);d.nodes.splice(at,0,node!);}
    });break;
   }
   case 'undo':if(build.active)throw new Error('请先停止构建再撤销');build=workflow.store.undo(id,revision);break;
   case 'publish':{const compatibility=body.compatibility;if(compatibility!==undefined&&compatibility!=='compatible'&&compatibility!=='validate')throw new Error('请选择直接兼容或升级时校验已有数据');const declared=compatibility===undefined?undefined:compatibility==='compatible';const release=await workflow.publish(id,revision,declared);return {status:200,body:{build:workflow.require(id),release}};}
   case 'upgrade':await workflow.upgrade(id,revision,revisionOf(body.version));build=workflow.require(id);break;
   default:throw new Error('未知构建操作');
  }
  return {status:200,body:{build}};
 }),
 ...(['builder.preview','builder.record'] as const).map(name=>route(name,request=>{
  const d=workflow.require(request.params.id!);if(!d.design||!d.behavior)throw new Error('功能尚未接通，表单内容会保留');
  requireWired(d,previewOperation(request.method,bodyObjectOrEmpty(request.body),request.query));
  const records=new RecordStore(context.services!.storage!,`preview:${d.id}`,d.design,d.behavior);
  return {status:200,body:recordsResponse(records,request)};
 })),
 ];
}
/** Preview data calls only work for parts the function agent has actually wired. */
function previewOperation(method:string,body:Record<string,unknown>,query:Record<string,string|undefined>):NonNullable<BuildStep['operation']>{
 if(method==='GET')return query.tag?'filter':query.search?'search':'read';
 return body.action==='import'||body.action==='export'?'export':'save';
}
const AREA:Record<string,string>={heading:'head',form:'head',actions:'head',search:'query',filter:'query',collection:'body',summary:'body'};
const OPERATION_NAME:Record<NonNullable<BuildStep['operation']>,string>={read:'读取记录',save:'保存',search:'搜索',filter:'筛选',export:'导入导出',calculate:'汇总'};
function requireWired(d:BuildDocument,operation:NonNullable<BuildStep['operation']>){
 if(!operationLive(d,operation))throw new Error(`「${OPERATION_NAME[operation]}」还在接通中，已输入的内容会保留`);
}
function bodyObjectOrEmpty(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
