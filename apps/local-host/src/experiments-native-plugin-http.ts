import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdirSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { ExperimentsService, experimentsActions, experimentsManifest, EXPERIMENTS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-experiments";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { createExperimentExecutor } from "./experiments-executor.js";
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
/** Old paths translate parameters and status codes; every operation is the registered Experiments action. */
export async function handleExperimentsNativePluginHttp(request:IncomingMessage,response:ServerResponse,url:URL,actions:BoundActionClient):Promise<boolean> {
  if(url.pathname!=="/api/experiments"&&!url.pathname.startsWith("/api/experiments/"))return false;
  const send=(status:number,body:unknown)=>{response.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});response.end(JSON.stringify(body));};
  try {
    const method=request.method, a=experimentsActions;
    const path=url.pathname.slice("/api/experiments".length).split("/").filter(Boolean);
    if(method==="GET") {
      if(!path.length){send(200,await actions.invoke(a.list,{}));return true;}
      if(path[0]==="models"){send(200,await actions.invoke(a.models,{}));return true;}
      if(path[0]==="functions"){send(200,await actions.invoke(a.functions,{}));return true;}
      const result=await actions.invoke(a.get,{id:path[0]!});
      if(path[1]==="export") {response.writeHead(200,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","content-disposition":`attachment; filename="experiment-${result.experiment.id}.json"`});response.end(JSON.stringify(result,null,2));return true;}
      send(200,result);return true;
    }
    if(method==="DELETE") {
      if(path[0]==="models" && path.length===2){send(200,await actions.invoke(a.deleteModel,{id:path[1]!}));return true;}
      if(path.length===1){send(200,await actions.invoke(a.delete,{id:path[0]!}));return true;}
      send(404,{error:"实验操作不存在"});return true;
    }
    if(method!=="POST"){send(405,{error:"仅支持 GET/POST/DELETE"});return true;}
    const body=await readBody(request);
    if(!path.length){send(201,await actions.invoke(a.create,body));return true;}
    if(path[0]==="models"){send(200,await actions.invoke(a.saveModel,body));return true;}
    if(path[0]==="credential"){if(typeof body.connection_id!=="string"||!body.connection_id.trim())throw new Error("请选择 TypeSafe 连接");send(200,await actions.invoke(a.selectConnection,{connection_id:body.connection_id}));return true;}
    const id=path[0]!;
    if(path[1]==="run"){send(202,await actions.invoke(a.run,{id}));return true;}
    if(path[1]==="cancel"){send(202,await actions.invoke(a.cancel,{id}));return true;}
    if(path[1]==="review"){send(200,await actions.invoke(a.review,{id,case_id:body.case_id,reference:body.reference,note:body.note}));return true;}
    send(404,{error:"实验操作不存在"});return true;
  }catch(error){const code=error instanceof ActionError?error.code:"";send(["actions.forbidden","actions.owner_mismatch"].includes(code)?403:400,{error:error instanceof Error?error.message:"实验请求失败",...(code?{code}:{})});return true;}
}
async function readBody(req:IncomingMessage):Promise<any>{let body="";for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>500_000)throw new Error("实验请求超过 500 KB");}try{return JSON.parse(body);}catch{throw new Error("请求不是有效 JSON");}}
