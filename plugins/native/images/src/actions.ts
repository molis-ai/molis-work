import { ActionError, type ActionAvailability, type ActionDefinition, type ActionSchema, type ActionHandlerBinding, type ActionCallContext, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineConnectorUsagesAction, type ConnectorConnectionView } from "@molis-ai/molis-work-contracts/services/connector-host";
import { IMAGES_PLUGIN_ID, type ImageConnection, ImageConnectionInput, ImageGenerateInput, ImageJob } from "./contract.js";
import type { ImagesService } from "./service.js";
import { createImagesSearchHandlers, imagesSearchActions } from "./search.js";
import { IMAGES_FILES_WRITE } from "./owner-files.js";
const text = {type:"string"}, id = {...text,minLength:1,pattern:"\\S"};
const object = (properties:Record<string,unknown>,required=Object.keys(properties)):ActionSchema=>({type:"object",properties,required,additionalProperties:false});
const array = (items:unknown)=>({type:"array",items});
const format={enum:["openai-images","gemini"]},mime={enum:["image/png","image/jpeg","image/webp"]};
const connectionFields={id,name:text,api_format:format,base_url:text,model:text,has_key:{type:"boolean"},created_at:text,updated_at:text};
const connection=object({...connectionFields,auth_connection_id:id,available:{type:"boolean"},unavailable_reason:text},Object.keys(connectionFields));
const auth=object({connection_id:id,service_id:text,display_name:text,account_label:{type:["string","null"]},auth_method:text,source:text,enabled:{type:"boolean"},state:text,target_origin:text},["connection_id","service_id","display_name","account_label","auth_method","source","enabled","state"]);
const image=object({id,mime_type:mime,byte_length:{type:"integer",minimum:0},filename:text});
const job=object({id,project_id:id,request_id:id,connection_id:id,connection_name:text,api_format:format,model:text,prompt:text,size:text,aspect_ratio:text,
  status:{enum:["running","succeeded","failed","cancelled","interrupted"]},images:array(image),error:text,created_at:text,finished_at:{type:["string","null"]}});
const changed=object({job});
function define<I,O>(name:string,title:string,description:string,operation:"query"|"command",scope:"home"|"project",input:ActionSchema,output:ActionSchema,permissions:readonly string[],execution?:ActionDefinition["action"]["execution"]):ActionDefinition<I,O>{
  return {capability_id:`images.${name}`,version:name === "jobs.start" ? 3 : name === "jobs.delete" ? 2 : 1,operation,action:{title,description,...(execution?{execution}:{}),...(name === "jobs.start" ? {scheduling:"concurrent" as const,background_job:{
    status:{capability_id:"images.jobs.get",version:1},id:"job.id",input:"id",state:"job.status",done:["succeeded","cancelled"],failed:["failed","interrupted"]}}:{}),kind:operation==="query"?"query":"operation",scope,audiences:["user","workflow","agent","mcp"],subject_kinds:["image"],input_schema:input,output_schema:output,permissions}};
}
export const imagesActions={
  connectionUsages:defineConnectorUsagesAction("images.connection.usages","生图配置使用的连接",["images:connections:read"],"home"),
  connections:{...define<Record<string,never>,{connections:ImageConnection[];auth_connections:ConnectorConnectionView[]}>("connections.list","生图服务列表","读取 Home 生图配置及当前服务连接状态，不返回凭据","query","home",object({}),object({connections:array(connection),auth_connections:array(auth)}),["images:connections:read"]),version:2},
  saveConnection:define<ImageConnectionInput,{connection:ImageConnection}>("connections.save","保存生图服务","保存协议、地址、模型及已有系统连接引用；API Key 在服务连接中管理","command","home",object({id,name:id,api_format:format,base_url:id,model:id,auth_connection_id:text},["name","api_format","base_url","model"]),object({connection}),["images:connections:write"]),
  deleteConnection:define<{id:string},{deleted:true}>("connections.delete","删除生图服务","删除生图配置及其绑定，保留生成历史和图片","command","home",object({id}),object({deleted:{const:true}}),["images:connections:write"]),
  list:define<Record<string,never>,{jobs:ImageJob[]}>("jobs.list","生成记录","读取当前项目的生成状态、提示和图片记录","query","project",object({}),object({jobs:array(job)}),["images:read"]),
  get:define<{id:string},{job:ImageJob}>("jobs.get","读取生图任务","按任务 ID 读取当前状态，不重新调用厂商","query","project",object({id}),changed,["images:read"]),
  start:define<ImageGenerateInput,{job:ImageJob}>("jobs.start","生成图片","启动持久任务并返回 running；request_id 去重同次提交，后续查询任务。HTTP 断开不自动取消","command","project",object({request_id:{...id,maxLength:128},connection_id:id,prompt:{...id,maxLength:32000},size:text,aspect_ratio:text},["request_id","connection_id","prompt"]),changed,["images:generate","model:invoke",IMAGES_FILES_WRITE],{cost:"metered"}),
  cancel:define<{id:string},{job:ImageJob}>("jobs.cancel","停止本机等待","停止当前项目任务等待；厂商可能仍在生成或计费，不会自动重新生成","command","project",object({id}),changed,["images:generate"]),
  delete:define<{id:string},{deleted:true}>("jobs.delete","删除生成记录","删除终态任务及本机图片文件；运行中需先取消","command","project",object({id}),object({deleted:{const:true}}),["images:delete",IMAGES_FILES_WRITE]),
  image:define<{id:string;image_id:string},{base64:string;mime_type:string;filename:string}>("images.read","读取生成图片","返回任务中实际图片字节的 Base64、MIME 和文件名；不是厂商 URL","query","project",object({id,image_id:id}),object({base64:text,mime_type:mime,filename:text}),["images:read"]),
  searchEntries:imagesSearchActions.entries,
  subject:imagesSearchActions.subject,
  files:imagesSearchActions.files,
  fileContent:imagesSearchActions.fileContent,
};
export const IMAGES_ACTION_PERMISSIONS=[...new Set(Object.values(imagesActions).flatMap(d=>d.action.permissions))];
export interface ImagesActionPorts { service(): ImagesService }
export function createImagesActionHandlers(ports:ImagesActionPorts):ActionHandlerBinding[]{
  const project=(caller:ActionCallContext)=>{if(!caller.project_id)throw new ActionError("actions.project_required","请选择项目");return caller.project_id;};
  const bind=<I,O>(definition:ActionDefinition<I,O>,run:(input:I,caller:ActionExecutionContext)=>O | Promise<O>):ActionHandlerBinding=>({capability_id:definition.capability_id,version:definition.version,handle:(caller,input)=>run(input as I,caller)});
  return [
    bind(imagesActions.connectionUsages,input=>({usages:ports.service().listConnections().filter(connection=>connection.auth_connection_id===input.connection_id).map(connection=>({
      usage_id:connection.id,title:connection.name,detail:connection.unavailable_reason??`生图模型：${connection.model}`,enabled:connection.available??connection.has_key,
      actions:[{action:{capability_id:imagesActions.start.capability_id,version:imagesActions.start.version,provider_id:IMAGES_PLUGIN_ID},input:{connection_id:connection.id}}],
    }))})),
    bind(imagesActions.connections,()=>({connections:ports.service().listConnections(),auth_connections:ports.service().authConnections()})),
    bind(imagesActions.saveConnection,async (input,caller)=>({connection:await ports.service().saveConnection(input,caller)})),
    bind(imagesActions.deleteConnection,async (input,caller)=>{await ports.service().deleteConnection(input.id,caller);return {deleted:true as const};}),
    bind(imagesActions.list,(_,caller)=>({jobs:ports.service().listJobs(project(caller))})),
    bind(imagesActions.get,(input,caller)=>({job:ports.service().getJob(project(caller),input.id)})),
    {...bind(imagesActions.start,async (input,caller)=>({job:await ports.service().start(project(caller),input,caller)})), availability:(caller:ActionCallContext):ActionAvailability=> {
      if(caller.audience === "user")return {available:true};
      return ports.service().listConnections().some(connection=>connection.available) ? {available:true} :
        {available:false,code:"actions.connection_required",reason:"还没有可用的生图服务：请先在图片页添加。"};
    }},
    bind(imagesActions.cancel,async (input,caller)=>({job:await ports.service().cancel(project(caller),input.id,caller)})),
    bind(imagesActions.delete,async (input,caller)=>{await ports.service().deleteJob(project(caller),input.id,caller);return {deleted:true as const};}),
    bind(imagesActions.image,(input,caller)=>{const image=ports.service().readImage(project(caller),input.id,input.image_id);return {base64:image.bytes.toString("base64"),mime_type:image.mime,filename:image.filename};}),    ...createImagesSearchHandlers(ports.service),
  ];
}
