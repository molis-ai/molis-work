import { buildExport, readExport, type Runtime, type SessionExport, type ModelEvent } from '@prologue/sdk';
import type {AgentSavedHistoryView,AgentSavedHistoryMessage} from '@molis-ai/molis-work-contracts/services/agent-host';
import type {SessionIndexStore} from './prologue-session-index.js';
import {agentErrors} from '../errors.js';

export interface SavedHistoryOwner {project_id:string;plugin_id:string;actor_id:string}
export interface PrologueSavedHistoryPort {read(sessionId:string,owner:SavedHistoryOwner,authorize:()=>void):Promise<string>}
/** Canonical SDK integrity validation is shared by source, SQL validation and passive display. */
export function readSavedAgentHistory(json:string):SessionExport {
 if(typeof json!=='string'||Buffer.byteLength(json)>100000000)throw agentErrors.history_invalid('会话历史内容无效');
 try {const input:unknown=JSON.parse(json),value=readExport(input),ids=new Set<string>();
  for(const run of value.runs){if(typeof run.runId!=='string'||!run.runId||run.runId.length>500||ids.has(run.runId))throw agentErrors.history_invalid('会话历史引用无效');ids.add(run.runId);
   if(run.events.some(event=>!event||typeof event.type!=='string'))throw agentErrors.history_invalid('会话历史事件无效');}
  if(JSON.stringify(value)!==json)throw agentErrors.history_invalid('会话历史格式无效');return value;
 }catch {throw agentErrors.history_invalid('会话历史损坏或格式不支持，原记录已保留');}
}
export function savedAgentHistoryView(json:string):AgentSavedHistoryView {
 const value=readSavedAgentHistory(json);
 return {runs:value.runs.map(run=>{
  const messages:AgentSavedHistoryMessage[]=[];
  for(const event of run.events){const row:Record<string,unknown>={...event},type=String(row.type);
   const role=type==='prompt'?(row.role==='user'?'user':'system'):type==='text-delta'||type==='reasoning-delta'?'assistant':type==='tool-call'||type==='tool-result'?'tool':'event';
   const text=typeof row.text==='string'?row.text:JSON.stringify(row);
   const prior=messages.at(-1);if((type==='text-delta'||type==='reasoning-delta')&&prior?.role===role)prior.text+=text;else messages.push({role,text});
  }
  return {run_id:run.runId,outcome:String(run.events.at(-1)!.type),messages};
 })};
}
/** Reuses the existing Runtime owner; never imports a session, resumes work or reads a second SDK store. */
export function createPrologueSavedHistory(runtime:Runtime,index:SessionIndexStore):PrologueSavedHistoryPort {
 return {async read(sessionId,owner,authorize){
  authorize();const saved=await index.read(sessionId);authorize();
  if(!saved||Object.entries(owner).some(([key,value])=>saved.owner[key as keyof typeof owner]!==value))throw agentErrors.history_scope('会话历史不属于当前项目、插件或用户');
  const settled=async()=>{const work=await runtime.listOpenWork();authorize();if(work.unavailable.length||work.items.some(item=>item.origin.session===sessionId)||saved.attempts.some(attempt=>!attempt.run_id&&!attempt.refused))throw agentErrors.history_waiting('会话执行尚未结算，历史暂不上传',{sync_waiting:true});};
  await settled();const session=await runtime.sessions.open(saved.ref);authorize();if(!session)throw agentErrors.history_invalid('原 SDK 会话不可读取');
  const exported=await session.exportPackage();authorize();const runs=[];
  for(const run of exported.runs){
   if(!saved.attempts.some(attempt=>attempt.run_id===run.runId))throw agentErrors.history_invalid('会话历史缺少原启动归属');
   const events=await session.replay({kind:'run',id:run.runId,revision:1});authorize();
   // Preserve non-enumerable Error facts before the SDK's own export redaction and integrity seal.
   const portable=JSON.parse(JSON.stringify(events,(_key,value)=>value instanceof Error?{name:value.name,message:value.message,...('code' in value?{code:value.code}:{}),...('safeMessage' in value?{safeMessage:value.safeMessage}:{})}:value)) as ModelEvent[];
   runs.push({runId:run.runId,events:portable});
  }
  await settled();const current=await session.terminalRuns();authorize();if(JSON.stringify(current.map(ref=>ref.id))!==JSON.stringify(exported.runs.map(run=>run.runId)))throw agentErrors.history_waiting('会话历史已变化，请重新读取',{sync_waiting:true});
  const result=JSON.stringify(buildExport({sessionId:exported.sessionId,runs,...(exported.entries?{entries:exported.entries}:{})}));
  readSavedAgentHistory(result);authorize();return result;
 }};
}
