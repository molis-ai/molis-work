import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { ExperimentsService, experimentsManifest, EXPERIMENTS_PLUGIN_ID, summarize, type ExperimentInput, type Participant } from "@molis-ai/molis-work-plugin-experiments";
import { openFunctionsStore } from "@molis-ai/molis-work-module-functions";
import { createExperimentExecutor, experimentConnectionStatus, experimentDefaults } from "./experiments-executor.js";
import { bindTypeSafeConnection, selectedTypeSafeConnection } from "./typesafe-connection.js";
import { listConnectorConnectionViews } from "./web-connector-connections.js";
const services = new Map<string,{service:ExperimentsService; db:LocalSqliteStorage}>();
export function openExperiments(home: string) {
  home = resolve(home);
  let entry = services.get(home);
  if (!entry) {
    const directory = join(home,"plugins","experiments"); mkdirSync(directory,{recursive:true,mode:0o700}); chmodSync(directory,0o700);
    const db = new LocalSqliteStorage(join(directory,"private.sqlite")); chmodSync(join(directory,"private.sqlite"),0o600);
    const storage = new SqlitePluginPrivateStorage(db.db).forPlugin({install_id:EXPERIMENTS_PLUGIN_ID,plugin_id:EXPERIMENTS_PLUGIN_ID,version:experimentsManifest.version,deployment:"local",grants:["storage:private"],requireGrant(p){if(p!=="storage:private")throw new Error("权限未授予");}},experimentsManifest);
    const service = new ExperimentsService(storage,()=>createExperimentExecutor(home)); entry={service,db}; services.set(home,entry);
  }
  return entry.service;
}
export async function closeExperiments(home:string) {const key=resolve(home), e=services.get(key);if(e){await e.service.close();e.db.close();services.delete(key);}}
export async function handleExperimentsNativePluginHttp(request:IncomingMessage,response:ServerResponse,url:URL,home:string):Promise<boolean> {
  if(url.pathname!=="/api/experiments"&&!url.pathname.startsWith("/api/experiments/"))return false;
  const send=(status:number,body:unknown)=>{response.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});response.end(JSON.stringify(body));};
  try {
    const s=openExperiments(home), method=request.method;
    const path=url.pathname.slice("/api/experiments".length).split("/").filter(Boolean);
    if(method==="GET") {
      if(!path.length){send(200,{experiments:s.list()});return true;}
      if(path[0]==="models") {const models=s.participants();const all=[...models,...experimentDefaults().filter(p=>!models.some(m=>m.id===p.id))];send(200,{participants:all,saved_ids:models.map(m=>m.id),status:experimentConnectionStatus(all,home),connections:listConnectorConnectionViews(home,"typesafe"),selected_connection_id:selectedTypeSafeConnection(home,"experiments")?.connection_id});return true;}
      if(path[0]==="functions"){const store=openFunctionsStore(home);try{send(200,{functions:store.list().filter(f=>f.primitive==="choice")});}finally{store.close();}return true;}
      const e=s.get(path[0]!);
      if(path[1]==="export") {response.writeHead(200,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","content-disposition":`attachment; filename="experiment-${e.id}.json"`});response.end(JSON.stringify({experiment:e,summary:summarize(e)},null,2));return true;}
      send(200,{experiment:e,summary:summarize(e)});return true;
    }
    if(method==="DELETE") {
      if(path[0]==="models" && path.length===2) {
        s.deleteParticipant(path[1]!);send(200,{deleted:true});return true;
      }
      if(path.length===1){s.deleteExperiment(path[0]!);send(200,{deleted:true});return true;}
      send(404,{error:"实验操作不存在"});return true;
    }
    if(method!=="POST"){send(405,{error:"仅支持 GET/POST/DELETE"});return true;}
    const body=await readBody(request);
    if(!path.length){
      let input=body as ExperimentInput & {function_id?:string};
      if(input.function_id){const store=openFunctionsStore(home);try{const f=store.get(input.function_id);if(!f||f.primitive!=="choice")throw new Error("首版仅支持 Choice 函数快照");input={...input,task:{instructions:f.instructions,criteria:f.criteria as any,function_snapshot:{id:f.id,version:f.version,config_hash:f.config_hash,model:f.model}}};}finally{store.close();}}
      else if(input.task?.function_snapshot) throw new Error("请通过函数选择器引用宿主中的配置快照");
      send(201,{experiment:s.create(input)});return true;
    }
    if(path[0]==="models"){send(200,{participant:s.saveParticipant(body as Participant)});return true;}
    if(path[0]==="credential") {if(typeof body.connection_id!=="string"||!body.connection_id.trim())throw new Error("请选择 TypeSafe 连接");bindTypeSafeConnection(home,"experiments",body.connection_id);send(200,{saved:true});return true;}
    const id=path[0]!;
    if(path[1]==="run"){send(202,{experiment:s.start(id)});return true;}
    if(path[1]==="cancel"){send(202,{experiment:s.cancel(id)});return true;}
    if(path[1]==="review"){send(200,{experiment:s.review(id,body.case_id,body.reference,body.note)});return true;}
    send(404,{error:"实验操作不存在"});return true;
  }catch(error){send(400,{error:error instanceof Error?error.message:"实验请求失败"});return true;}
}
async function readBody(req:IncomingMessage):Promise<any>{let body="";for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>500_000)throw new Error("实验请求超过 500 KB");}try{return JSON.parse(body);}catch{throw new Error("请求不是有效 JSON");}}
