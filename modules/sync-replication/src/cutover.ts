import {openSyncDatabase} from './database.js';
import {syncError} from './sync-errors.js';

/**
 * The one public collection the sync service moves to a private stream when an account adopts it
 * (specs/batch-06-shared-tools/sync-cutover.md, current-version-adoption.md BSH-14-A/C). Requests always name the public
 * collection; local state (cursors, failures, cached parts, protection) is kept per cutover, under a lane no remote value
 * chooses. Until the cutover is complete this Host moves nothing in the collection, old stream included.
 */
export const PROCESS_ITEMS_NAMESPACE=JSON.stringify(['io.molis.work.artifacts','molis','official-artifacts-binding','process_items',1]);
export const PROCESS_ITEMS_CUTOVER_HEADER='X-Molis-Process-Items-Cutover';
const LANE='process_items_adopted';

export type SyncCutoverView=
  | {readonly phase:'unsupported'}
  | {readonly phase:'open'}
  | {readonly phase:'seeding'|'complete';readonly cutoverId:string;readonly completionHead:number;readonly consentRevision:number};

const cutoverId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{16,64}$/u.test(value);
const count=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;

/** What `GET /v1/process-items/cutover` says, checked field by field; anything else is a refusal, not a guess. */
export function parseSyncCutover(value:unknown):SyncCutoverView{
  const invalid=()=>syncError('invalid','过程项同步切换状态无效，原件已保留');
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
  const row=value as Record<string,unknown>;
  if(row.phase==='open')return {phase:'open'};
  if(row.phase!=='seeding'&&row.phase!=='complete')throw invalid();
  if(!cutoverId(row.cutoverId)||!count(row.completionHead)||!count(row.consentRevision))throw invalid();
  return {phase:row.phase,cutoverId:row.cutoverId,completionHead:row.completionHead,consentRevision:row.consentRevision};
}

/** The local name of the adopted stream: this space, this cutover, never the public collection's own state. */
export const syncCutoverLane=(spaceId:string,id:string)=>JSON.stringify([spaceId,id,LANE]);

/**
 * Which cutover this Home adopted, if any. Moving the adopted stream on a device is the person's own step (finishing the cutover there,
 * or taking over in sync settings); it is recorded as the lane's stream cursor in sync.db, so an idle round needs no extra request and a
 * restart keeps it. Only a lane of this space counts; a value that is not exactly one lane is not an adoption.
 */
export function adoptedSyncCutover(home:string,spaceId:string):string|null{
  const db=openSyncDatabase(home);
  try{
    const found=db.prepare('SELECT namespace FROM sync_stream_cursors').all().map(row=>String(row.namespace)).flatMap(name=>{
      let value:unknown;try{value=JSON.parse(name);}catch{return [];}
      return Array.isArray(value)&&value.length===3&&value[0]===spaceId&&value[2]===LANE&&cutoverId(value[1])&&name===syncCutoverLane(spaceId,value[1])?[value[1] as string]:[];
    });
    if(found.length>1)throw syncError('conflict','本机记录了不止一次过程项采用，原件已保留');
    return found[0]??null;
  }finally{db.close();}
}
export function markSyncCutoverAdopted(home:string,spaceId:string,id:string):void{
  if(!cutoverId(id))throw syncError('invalid','过程项同步切换状态无效，原件已保留');
  const adopted=adoptedSyncCutover(home,spaceId);
  if(adopted!==null&&adopted!==id)throw syncError('conflict','本机已采用另一次过程项切换，原件已保留');
  const db=openSyncDatabase(home);
  try{db.prepare('INSERT OR IGNORE INTO sync_stream_cursors VALUES (?,0)').run(syncCutoverLane(spaceId,id));}finally{db.close();}
}

/** Why this Host is not moving process items right now, in the person's words. */
export function syncCutoverWaiting(view:SyncCutoverView|null):string{
  if(!view||view.phase==='complete')return '过程项同步需要先在同步设置里采用或接管，本机暂停过程项同步，原件已保留';
  if(view.phase==='unsupported')return '同步服务尚未支持过程项采用，本机暂停过程项同步，原件已保留';
  if(view.phase==='open')return '过程项同步需要先在同步设置里完成采用，本机暂停过程项同步，原件已保留';
  return '过程项正在采用，完成后在同步设置里接管，原件已保留';
}
