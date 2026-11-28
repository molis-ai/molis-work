import type {PluginDatabaseReader,PluginDatabase} from '@molis-ai/molis-work-contracts/platform/plugin';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
const errors=defineErrorCodes('coding',{history_invalid:'invalid',history_changed:'conflict'});
export const CODING_HISTORY_SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS coding_saved_history (
 session_id TEXT NOT NULL REFERENCES coding_sessions(session_id) ON DELETE CASCADE,source_id TEXT NOT NULL,archive_json TEXT NOT NULL,
 PRIMARY KEY(session_id,source_id));`;
export function readCodingSavedHistory(db:PluginDatabaseReader,sessionId:string,localSource:string|null=null):string[] {
 return db.all('SELECT archive_json FROM coding_saved_history WHERE session_id=? AND (? IS NULL OR source_id<>?) ORDER BY source_id',[sessionId,localSource,localSource]).map(row=>String(row.archive_json));
}
/** Refresh immutable derived exports through the trusted execution owner, then recheck the original binding. */
export async function refreshCodingSavedHistory(db:PluginDatabase,read:(runtimeId:string,runtimeSessionId:string)=>Promise<string>,authorize:()=>void,validate:(json:string)=>{sessionId:string}):Promise<void> {
 authorize();const rows=db.all("SELECT session_id,runtime_id,runtime_session_id FROM coding_sessions WHERE runtime_session_id IS NOT NULL AND state IN ('done','failed','stopped','cancelled')");
 for(const row of rows){
  authorize();
  const json=await read(String(row.runtime_id),String(row.runtime_session_id));authorize();const source=validate(json).sessionId;
  if(source!==row.runtime_session_id)throw errors.history_invalid('会话历史来源不匹配');
  await db.transaction(async()=>authorize(),transaction=>{
   authorize();const current=transaction.get('SELECT runtime_id,runtime_session_id FROM coding_sessions WHERE session_id=?',[row.session_id!]);
   if(!current||current.runtime_id!==row.runtime_id||current.runtime_session_id!==row.runtime_session_id)throw errors.history_changed('会话绑定已变化，请重试');
   const old=transaction.get('SELECT archive_json FROM coding_saved_history WHERE session_id=? AND source_id=?',[row.session_id!,source]);
   if(old?.archive_json!==json)transaction.run('INSERT INTO coding_saved_history VALUES(?,?,?) ON CONFLICT(session_id,source_id) DO UPDATE SET archive_json=excluded.archive_json',[row.session_id!,source,json]);
   authorize();
  });
 }
}
