import type Database from 'better-sqlite3';
import type {ContextHistoryReplication} from '@molis-ai/molis-work-contracts/modules/context-ledger';
import type {SessionContentStore} from './content-store.js';
import {SESSION_SYNC_ROOT_FIELDS,SESSION_SYNC_EVENT_FIELDS,SESSION_SYNC_HANDOFF_FIELDS,sessionSyncMetadata,validateSessionSyncValue} from './session-sync-shape.js';
import {sessionReference} from './session-reference-scope.js';
import {workSyncErrors as errors} from './session-sync-errors.js';

type Row=Record<string,unknown>;
const pick=(row:Row,fields:readonly string[])=>Object.fromEntries(fields.map(key=>[key,row[key]]));
/** One owner transaction projects only committed facts. Never uses the UI's unavailable-content placeholder. */
export function readSessionSyncValue(db:Database.Database,content:SessionContentStore,refs:ContextHistoryReplication,spaceId:string,key:string,authorize:()=>void) {
  return db.transaction(()=>{
    authorize();const session=db.prepare('SELECT * FROM sessions WHERE session_id=?').get(key) as Row|undefined;if(!session)return null;
    const readText=(input:unknown)=>{
      if(typeof input!=='string'||!/^molis-work-session\/sha256\/[a-f0-9]{64}$/.test(input))throw errors.sync_invalid('会话正文引用格式无效，原内容已保留');
      try{const value=content.read(input);authorize();return value;}catch{authorize();throw errors.sync_unavailable('会话原正文暂不可读，请恢复原件或原密钥后重试');}
    };
    const events=(db.prepare('SELECT * FROM session_events WHERE session_id=? ORDER BY occurred_at,source_order,event_id').all(key) as Row[]).map(row=>({
      ...pick(row,SESSION_SYNC_EVENT_FIELDS),content:readText(row.content_ref),metadata:sessionSyncMetadata(JSON.parse(String(row.metadata_json))),
    }));
    const handoffs=(db.prepare('SELECT * FROM session_handoffs WHERE source_session_id=? ORDER BY package_id').all(key) as Row[]).map(row=>({
      ...pick(row,SESSION_SYNC_HANDOFF_FIELDS),destination_session_id:row.sync_passive===1?row.sync_destination_session_id:row.destination_session_id,
      content:readText(row.content_ref),retryable:row.retryable===1,references:refs.read(sessionReference(String(row.package_id),true)),
    }));
    const value=validateSessionSyncValue({format:1,spaceId,session:pick(session,SESSION_SYNC_ROOT_FIELDS),events,handoffs,references:refs.read(sessionReference(key))},spaceId,key,refs);
    authorize();return value;
  })();
}
