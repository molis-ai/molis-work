import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {homeSqlitePath} from '@molis-ai/molis-work-storage';
import {openSyncDatabase} from './database.js';
import {PROCESS_ITEMS_NAMESPACE} from './cutover.js';
import {syncError} from './sync-errors.js';

/**
 * The private recovery file of a Home whose process items had not all reached the old stream when the account adopted them
 * (specs/batch-06-shared-tools/sync-cutover.md step 3, BSH-14-D). The process-item owner supplies each project's original journal and
 * the graphs its changes point at; this module supplies what sync.db holds for the public collection and publishes the file once,
 * under `sync/process-items-recovery/<captureId>.jsonl` in that Home. Nothing in it is a credential, and it is never overwritten.
 */
export const PROCESS_ITEMS_RECOVERY_FORMAT=/* @version format.sync.process_items_recovery */ 1;
const DIRECTORY=['sync','process-items-recovery'];
const CAPTURE=/^[a-f0-9]{32}$/u;

export interface ProcessItemsRecoveryHeader {
  readonly format:typeof PROCESS_ITEMS_RECOVERY_FORMAT;
  readonly captureId:string;
  readonly spaceId:string;
  readonly namespace:string;
  readonly cutoverId:string;
  readonly sourceVersion:number;
}
/** One project's original process-item journal exactly as stored, and the owner graph (or deletion intent) of each changed key. */
export interface ProcessItemsRecoveryProject {
  readonly projectId:string;
  readonly layout:'original'|'current';
  /** null when the journal never recorded its state row. */
  readonly state:{readonly device:string;readonly cursor:number}|null;
  readonly changes:readonly {readonly seq:number;readonly key:string}[];
  readonly heads:readonly {readonly key:string;readonly revision:number}[];
  readonly outbox:readonly {readonly key:string;readonly through_seq:number;readonly operation:string}[];
  readonly conflicts:readonly {readonly key:string;readonly event:string;readonly reason:string;readonly waiting:number}[];
  readonly resolutions:readonly {readonly id:number;readonly key:string;readonly choice:string;readonly local_json:string;readonly remote_json:string}[];
  readonly graphs:readonly {readonly key:string;readonly graph:unknown}[];
}
/** sync.db rows of the public collection, byte for byte; parts keep their stored bytes, checksum and protection binding. */
export interface ProcessItemsSyncEvidence {
  readonly failures:readonly {readonly key:string;readonly direction:string;readonly event:string|null;readonly reason:string;readonly revision:number;readonly automatic:number}[];
  readonly streamCursor:number|null;
  readonly partitionCursor:number|null;
  readonly protectedMode:number|null;
  readonly uploads:readonly {readonly operation:string;readonly digest:string}[];
  readonly parts:readonly {readonly digest:string;readonly part:number;readonly checksum:string;readonly bytes:string}[];
}
/** What the person's takeover did with one captured key: nothing to move, queued as a new local write, left to its conflict, or kept. */
export interface ProcessItemsTakeoverOutcome {
  readonly key:string;
  readonly outcome:'same'|'queued'|'conflict'|'kept';
}
export interface ProcessItemsRecovery {
  readonly header:ProcessItemsRecoveryHeader;
  readonly projects:readonly ProcessItemsRecoveryProject[];
  readonly sync:ProcessItemsSyncEvidence;
}

/** What sync.db holds for the public collection now: read in one transaction, never through a queue that could move it. */
export function readProcessItemsSyncEvidence(home:string):ProcessItemsSyncEvidence{
  // A Home that never synced has no sync.db; reading it does not create one.
  if(!fs.existsSync(homeSqlitePath(home,'sync')))return {failures:[],streamCursor:null,partitionCursor:null,protectedMode:null,uploads:[],parts:[]};
  const db=openSyncDatabase(home);
  try{
    db.exec('BEGIN');
    try{
      const one=(table:string,column:string)=>{const row=db.prepare(`SELECT ${column} AS value FROM ${table} WHERE namespace=?`).get(PROCESS_ITEMS_NAMESPACE);return row?Number(row.value):null;};
      return {
        failures:db.prepare('SELECT key,direction,event,reason,revision,automatic FROM sync_failures WHERE namespace=? ORDER BY key,direction').all(PROCESS_ITEMS_NAMESPACE)
          .map(row=>({key:String(row.key),direction:String(row.direction),event:row.event===null?null:String(row.event),reason:String(row.reason),revision:Number(row.revision),automatic:Number(row.automatic)})),
        streamCursor:one('sync_stream_cursors','cursor'),partitionCursor:one('sync_partition_cursors','cursor'),protectedMode:one('sync_payload_modes','protected'),
        uploads:db.prepare('SELECT operation,digest FROM sync_blob_uploads WHERE namespace=? ORDER BY operation,digest').all(PROCESS_ITEMS_NAMESPACE).map(row=>({operation:String(row.operation),digest:String(row.digest)})),
        parts:db.prepare('SELECT digest,part,checksum,bytes FROM sync_blob_parts WHERE namespace=? ORDER BY digest,part').all(PROCESS_ITEMS_NAMESPACE)
          .map(row=>({digest:String(row.digest),part:Number(row.part),checksum:String(row.checksum),bytes:Buffer.from(row.bytes as Uint8Array).toString('base64')})),
      };
    }finally{db.exec('COMMIT');}
  }finally{db.close();}
}

/** Keys of the public collection that sync.db still holds a failure or a deferred event for. */
export function processItemsSyncFailureKeys(home:string):string[]{
  if(!fs.existsSync(homeSqlitePath(home,'sync')))return [];
  const db=openSyncDatabase(home);
  try{return db.prepare('SELECT DISTINCT key FROM sync_failures WHERE namespace=? ORDER BY key').all(PROCESS_ITEMS_NAMESPACE).map(row=>String(row.key));}
  finally{db.close();}
}

export const newProcessItemsCaptureId=()=>randomUUID().replaceAll('-','');
/** The recovery files this Home holds, newest first, by capture id. A name that is not a capture id is not one of them. */
export function listProcessItemsRecoveries(home:string):string[]{
  const directory=path.join(home,...DIRECTORY);
  let names:string[];
  try{names=fs.readdirSync(directory);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
  return names.filter(name=>name.endsWith('.jsonl')&&CAPTURE.test(name.slice(0,-6)))
    .map(name=>({id:name.slice(0,-6),at:fs.statSync(path.join(directory,name)).mtimeMs})).sort((a,b)=>b.at-a.at||a.id.localeCompare(b.id)).map(row=>row.id);
}
const file=(home:string,captureId:string)=>{
  if(!CAPTURE.test(captureId))throw syncError('invalid','过程项恢复件编号无效，原件已保留');
  return path.join(home,...DIRECTORY,captureId+'.jsonl');
};
const digest=(lines:readonly string[])=>createHash('sha256').update(lines.join('\n')).digest('hex');

/**
 * Publish a recovery file: written to a private temporary file, flushed, then linked into place, so a reader sees all of it or none,
 * and an existing file of the same capture is never replaced. The last line seals the count and digest of every line before it.
 */
export function writeProcessItemsRecovery(home:string,recovery:ProcessItemsRecovery):string{
  const target=file(home,recovery.header.captureId);
  const lines=[JSON.stringify({t:'header',...recovery.header})];
  for(const project of recovery.projects){
    const {graphs,...journal}=project;
    lines.push(JSON.stringify({t:'project',...journal}));
    for(const graph of graphs)lines.push(JSON.stringify({t:'graph',projectId:project.projectId,key:graph.key,graph:graph.graph}));
  }
  const {parts,...sync}=recovery.sync;
  lines.push(JSON.stringify({t:'sync',...sync}));
  for(const part of parts)lines.push(JSON.stringify({t:'part',...part}));
  lines.push(JSON.stringify({t:'end',lines:lines.length,sha256:digest(lines)}));
  fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
  const temporary=path.join(path.dirname(target),`.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  const handle=fs.openSync(temporary,'wx',0o600);
  try{fs.writeFileSync(handle,lines.join('\n')+'\n');fs.fsyncSync(handle);}finally{fs.closeSync(handle);}
  try{fs.linkSync(temporary,target);}
  catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw syncError('conflict','同一编号的过程项恢复件已存在，原件已保留');throw error;}
  finally{fs.rmSync(temporary,{force:true});}
  return target;
}

type Field='s'|'i'|'s?'|'i?';
/** An exact row: these fields and no others, each a string or a safe integer (`?` also allows null). */
function row<T>(value:unknown,fields:Record<string,Field>):T{
  if(!value||typeof value!=='object'||Array.isArray(value))throw syncError('invalid','过程项恢复件不完整或已改动，原件已保留');
  const entries=Object.entries(value);
  if(entries.length!==Object.keys(fields).length||entries.some(([name,item])=>{
    const kind=fields[name];if(kind===undefined)return true;
    if(item===null)return !kind.endsWith('?');
    return kind.startsWith('s')?typeof item!=='string':!Number.isSafeInteger(item);
  }))throw syncError('invalid','过程项恢复件不完整或已改动，原件已保留');
  return Object.fromEntries(entries) as T;
}
const rows=<T>(value:unknown,fields:Record<string,Field>):T[]=>{
  if(!Array.isArray(value))throw syncError('invalid','过程项恢复件不完整或已改动，原件已保留');
  return value.map(item=>row<T>(item,fields));
};
function projectLine(line:Record<string,unknown>):Omit<ProcessItemsRecoveryProject,'graphs'>{
  const {projectId,layout,state,changes,heads,outbox,conflicts,resolutions,...extra}=line;
  if(typeof projectId!=='string'||(layout!=='original'&&layout!=='current')||Object.keys(extra).length)throw syncError('invalid','过程项恢复件不完整或已改动，原件已保留');
  return {projectId,layout,state:state===null?null:row(state,{device:'s',cursor:'i'}),changes:rows(changes,{seq:'i',key:'s'}),heads:rows(heads,{key:'s',revision:'i'}),
    outbox:rows(outbox,{key:'s',through_seq:'i',operation:'s'}),conflicts:rows(conflicts,{key:'s',event:'s',reason:'s',waiting:'i'}),
    resolutions:rows(resolutions,{id:'i',key:'s',choice:'s',local_json:'s',remote_json:'s'})};
}
function syncLine(line:Record<string,unknown>):Omit<ProcessItemsSyncEvidence,'parts'>{
  const {failures,uploads,...cursors}=line;
  return {failures:rows(failures,{key:'s',direction:'s',event:'s?',reason:'s',revision:'i',automatic:'i'}),uploads:rows(uploads,{operation:'s',digest:'s'}),
    ...row<Pick<ProcessItemsSyncEvidence,'streamCursor'|'partitionCursor'|'protectedMode'>>(cursors,{streamCursor:'i?',partitionCursor:'i?',protectedMode:'i?'})};
}

/** Read a recovery file back: every line is checked against the seal and the shape it was written with; nothing is guessed. */
export function readProcessItemsRecovery(home:string,captureId:string):ProcessItemsRecovery{
  const target=file(home,captureId),invalid=()=>syncError('invalid','过程项恢复件不完整或已改动，原件已保留');
  if(!fs.existsSync(target)||!fs.lstatSync(target).isFile())throw syncError('unavailable','找不到这份过程项恢复件，原件已保留');
  const text=fs.readFileSync(target,'utf8');
  if(!text.endsWith('\n'))throw invalid();
  const lines=text.slice(0,-1).split('\n');
  let parsed:Record<string,unknown>[];
  try{parsed=lines.map(line=>JSON.parse(line) as Record<string,unknown>);}catch{throw invalid();}
  const end=parsed.at(-1);
  if(!end||end.t!=='end'||end.lines!==lines.length-1||end.sha256!==digest(lines.slice(0,-1))||Object.keys(end).length!==3)throw invalid();
  const [first,...rest]=parsed.slice(0,-1);
  if(first?.t!=='header')throw invalid();
  const {t:_header,...fields}=first;
  const header=row<ProcessItemsRecoveryHeader>(fields,{format:'i',captureId:'s',spaceId:'s',namespace:'s',cutoverId:'s',sourceVersion:'i'});
  if(header.format!==PROCESS_ITEMS_RECOVERY_FORMAT||header.captureId!==captureId||header.namespace!==PROCESS_ITEMS_NAMESPACE)throw invalid();
  const projects:ProcessItemsRecoveryProject[]=[];
  let sync:Omit<ProcessItemsSyncEvidence,'parts'>|null=null;const parts:ProcessItemsSyncEvidence['parts'][number][]=[];
  for(const {t,...line} of rest){
    if(t==='project'&&sync===null){
      const journal=projectLine(line);
      if(projects.some(project=>project.projectId===journal.projectId))throw invalid();
      projects.push({...journal,graphs:[]});
    }else if(t==='graph'&&sync===null){
      const project=projects.at(-1);
      if(!project||line.projectId!==project.projectId||typeof line.key!=='string'||!('graph' in line)||Object.keys(line).length!==3)throw invalid();
      (project.graphs as {key:string;graph:unknown}[]).push({key:line.key,graph:line.graph});
    }else if(t==='sync'&&sync===null)sync=syncLine(line);
    else if(t==='part'&&sync!==null)parts.push(row(line,{digest:'s',part:'i',checksum:'s',bytes:'s'}));
    else throw invalid();
  }
  if(!sync)throw invalid();
  return {header,projects,sync:{...sync,parts}};
}
