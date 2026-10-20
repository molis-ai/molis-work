import type {SyncEvent,SyncLocalProtection} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {createSyncBodySerialization} from '@molis-ai/molis-work-storage';
import {openSyncDatabase} from './database.js';
import {platformErrorKind} from '@molis-ai/molis-work-contracts/platform/actions';
import {pinSyncProtection} from './local-protection.js';

export interface SyncItemFailure {key:string;direction:'upload'|'download';reason:string;revision:number;automatic:boolean}
export function syncItemFailures(home:string,authorize:()=>void,protection?:SyncLocalProtection) {
  const serialization=createSyncBodySerialization(authorize,protection),binding=(namespace:string,key:string)=>JSON.stringify([namespace,key]);
  const pin=(namespace:string)=>pinSyncProtection(home,namespace,authorize,protection);
  const db=<T>(run:(connection:ReturnType<typeof openSyncDatabase>)=>T)=>{authorize();const connection=openSyncDatabase(home);try{return run(connection);}finally{connection.close();}};
  const advance=(connection:ReturnType<typeof openSyncDatabase>,namespace:string,revision:number)=>connection.prepare('INSERT INTO sync_stream_cursors VALUES (?,?) ON CONFLICT(namespace) DO UPDATE SET cursor=MAX(cursor,excluded.cursor)').run(namespace,revision);
  return {
    cursor:(namespace:string)=>db(c=>Number(c.prepare('SELECT cursor FROM sync_stream_cursors WHERE namespace=?').get(namespace)?.cursor??0)),
    list:(namespace:string):SyncItemFailure[]=>db(c=>c.prepare('SELECT key,direction,reason,revision,automatic FROM sync_failures WHERE namespace=? ORDER BY key,direction').all(namespace).map(row=>({key:String(row.key),direction:row.direction as 'upload'|'download',reason:String(row.reason),revision:Number(row.revision),automatic:row.automatic===1}))),
    deferred:(namespace:string):SyncEvent[]=>{pin(namespace);return db(c=>c.prepare("SELECT key,event FROM sync_failures WHERE namespace=? AND direction='download' AND automatic=1 ORDER BY revision LIMIT 20").all(namespace).map(row=>serialization.read(row.event,binding(namespace,String(row.key)),'deferred_event') as SyncEvent));},
    save(namespace:string,key:string,direction:'upload'|'download',error:unknown,event?:SyncEvent,automatic=false){pin(namespace);db(c=>{
      c.exec('BEGIN IMMEDIATE');try{
        const reason=protection?'同步资产暂时不可用，原内容已保留':error instanceof SyntaxError?'同步内容格式无效，原内容已保留':error instanceof Error?error.message.slice(0,1000):'同步资产校验失败';
        c.prepare('INSERT INTO sync_failures VALUES (?,?,?,?,?,?,?) ON CONFLICT(namespace,key,direction) DO UPDATE SET event=excluded.event,reason=excluded.reason,revision=excluded.revision,automatic=excluded.automatic WHERE excluded.revision>=sync_failures.revision').run(namespace,key,direction,event?serialization.write(event,binding(namespace,key),'deferred_event'):null,reason,event?.revision??0,automatic?1:0);
        if(event)advance(c,namespace,event.revision);authorize();c.exec('COMMIT');
      }catch(error){c.exec('ROLLBACK');throw error;}
    });},
    acknowledge(namespace:string,event:SyncEvent){db(c=>{
      c.exec('BEGIN IMMEDIATE');try{advance(c,namespace,event.revision);c.prepare("DELETE FROM sync_failures WHERE namespace=? AND key=? AND revision<=?").run(namespace,event.key,event.revision);authorize();c.exec('COMMIT');}catch(error){c.exec('ROLLBACK');throw error;}
    });},
    event:(namespace:string,key:string)=>{pin(namespace);return db(c=>{const row=c.prepare("SELECT event FROM sync_failures WHERE namespace=? AND key=? AND direction='download'").get(namespace,key);return row?.event?serialization.read(row.event,binding(namespace,key),'deferred_event') as SyncEvent:null;});},
    clear:(namespace:string,key:string,direction:'upload'|'download')=>db(c=>c.prepare('DELETE FROM sync_failures WHERE namespace=? AND key=? AND direction=?').run(namespace,key,direction)),
  };
}
export function itemFailureKey(error:unknown):string|null {
  if(error&&typeof error==='object'&&'details' in error&&error.details&&typeof error.details==='object'&&'sync_key' in error.details&&typeof error.details.sync_key==='string')return error.details.sync_key;
  return null;
}
export function isPermanentItemFailure(error:unknown):boolean {
  if(error instanceof SyntaxError)return true;
  if(!error||typeof error!=='object')return false;
  const kind=('kind' in error?error.kind:undefined)??('code' in error&&typeof error.code==='string'?platformErrorKind(error.code):undefined);
  return ['invalid','forbidden','too_large'].includes(String(kind));
}
/** Only an owner's explicit availability refusal, not arbitrary transport/network failures. */
export function isTemporaryOwnerFailure(error:unknown):boolean {
 if(!error||typeof error!=='object')return false;
 const kind=('kind' in error?error.kind:undefined)??('code' in error&&typeof error.code==='string'?platformErrorKind(error.code):undefined);
 return kind==='unavailable';
}
