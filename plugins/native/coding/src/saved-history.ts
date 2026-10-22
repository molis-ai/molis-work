import type {ReplicaDatabase as CodingSqliteDatabase} from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import type {PluginDatabaseReader} from '@molis-ai/molis-work-contracts/platform/plugin';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
const errors=defineErrorCodes('coding',{history_invalid:'invalid',history_changed:'conflict'});
export const CODING_HISTORY_SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS coding_saved_history (
 project_id TEXT NOT NULL,session_id TEXT NOT NULL,source_id TEXT NOT NULL,archive_json TEXT NOT NULL,
 PRIMARY KEY(project_id,session_id,source_id),FOREIGN KEY(project_id,session_id) REFERENCES coding_sessions(project_id,session_id) ON DELETE CASCADE);`;
export function readCodingSavedHistory(db:PluginDatabaseReader,projectId:string,sessionId:string,localSource:string|null=null):string[] {
 return db.all('SELECT archive_json FROM coding_saved_history WHERE project_id=? AND session_id=? AND (? IS NULL OR source_id<>?) ORDER BY source_id',[projectId,sessionId,localSource,localSource]).map(row=>String(row.archive_json));
}
/** Refresh immutable derived exports through the trusted execution owner, then recheck the original binding. */
export async function refreshCodingSavedHistory(db:CodingSqliteDatabase,projectId:string,read:(runtimeSessionId:string)=>Promise<string>,authorize:()=>void,validate:(json:string)=>{sessionId:string}):Promise<void> {
 authorize();const rows=db.prepare('SELECT session_id,runtime_id,runtime_session_id FROM coding_sessions WHERE project_id=? AND runtime_session_id IS NOT NULL').all(projectId) as {session_id:string;runtime_id:string;runtime_session_id:string}[];
 for(const row of rows){authorize();if(row.runtime_id!=='prologue')throw errors.history_invalid('当前会话 Runtime 不支持可携带历史');const json=await read(row.runtime_session_id);authorize();const source=validate(json).sessionId;
  const current=db.prepare('SELECT runtime_id,runtime_session_id FROM coding_sessions WHERE project_id=? AND session_id=?').get(projectId,row.session_id) as {runtime_id:string;runtime_session_id:string}|undefined;
  if(!current||current.runtime_id!==row.runtime_id||current.runtime_session_id!==row.runtime_session_id)throw errors.history_changed('会话绑定已变化，请重试');
  const old=db.prepare('SELECT archive_json FROM coding_saved_history WHERE project_id=? AND session_id=? AND source_id=?').get(projectId,row.session_id,source) as {archive_json:string}|undefined;
  if(old?.archive_json!==json){authorize();db.prepare('INSERT INTO coding_saved_history VALUES(?,?,?,?) ON CONFLICT(project_id,session_id,source_id) DO UPDATE SET archive_json=excluded.archive_json').run(projectId,row.session_id,source,json);}authorize();
 }
}
