import {createHash} from 'node:crypto';
import {join} from 'node:path';
import type {ProjectReplicaDefinition,SyncBlobReference,SyncContentCodec} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {createEvidenceContentStore,createLazyFileSecretStore,validateProjectReplicaRows} from '@molis-ai/molis-work-storage';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import {replicaError} from './project-replication-errors.js';

const pattern=/^molis-work-feed\/sha256\/([a-f0-9]{64})$/;
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw replicaError('replica_invalid');return value as Record<string,unknown>;}
function exact(value:Record<string,unknown>,keys:readonly string[]):void{if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))throw replicaError('replica_invalid');}
/** Explicit owner references only. Plain bytes travel; encryption keys and device paths never do. */
export function createProjectEvidenceContent(home:string,definitions:readonly ProjectReplicaDefinition[],kind:string,spaceId:string,authorize:()=>void):SyncContentCodec{
 const store=createEvidenceContentStore({secretStore:createLazyFileSecretStore(home),rootDirectory:join(home,'feed','evidence')});
 const inspect=(key:string,input:unknown)=>{
  authorize();const parts:unknown=JSON.parse(key),wire=object(input),project=object(wire.project),facts=object(wire.facts);
  if(!Array.isArray(parts)||parts.length!==3||parts[1]!==kind||parts[0]!==parts[2]||typeof parts[0]!=='string'||!parts[0]||parts[0].length>80||wire.format!==1||wire.spaceId!==spaceId||project.id!==parts[0]||typeof project.title!=='string'||!project.title.trim()||project.title.length>120)throw replicaError('replica_scope_mismatch');
  exact(project,['id','title']);exact(facts,definitions.map(d=>d.id));const refs=new Set<string>();
  for(const definition of definitions){const rows=validateProjectReplicaRows(facts[definition.id],definition,parts[0]);definition.validate(rows,parts[0]);for(const ref of definition.contentRefs?.(rows,parts[0])??[]){if(!pattern.test(ref))throw replicaError('replica_references_invalid');refs.add(ref);}}
  return {wire,refs:[...refs].sort()};
 };
 const codec=createSyncJsonContent({spaceId,authorize,project(key,input,put){
  const {wire,refs}=inspect(key,input);exact(wire,['format','spaceId','project','facts']);if(!refs.length)return input;
  const evidence=refs.map(reference=>{authorize();let body:string;try{body=store.read(reference);}catch{throw replicaError('replica_content_unavailable');}authorize();const bytes=Buffer.from(body);if(bytes.length>1024*1024||digest(bytes)!==pattern.exec(reference)![1])throw replicaError('replica_invalid');return {reference,blob:bytes.length?put(bytes):null};});
  return {...wire,evidence};
 }});
 return {encode:codec.encode,async decode(key,input,read){
  const decoded=await codec.decode(key,input,read);authorize();const {wire,refs}=inspect(key,decoded);
  if(!refs.length){exact(wire,['format','spaceId','project','facts']);return decoded;}
  exact(wire,['format','spaceId','project','facts','evidence']);if(!Array.isArray(wire.evidence)||wire.evidence.length!==refs.length)throw replicaError('replica_references_invalid');
  let total=0;const entries=wire.evidence.map((v,index)=>{const e=object(v);exact(e,['reference','blob']);if(e.reference!==refs[index])throw replicaError('replica_references_invalid');let blob:SyncBlobReference|null=null;
   if(e.blob!==null){const b=object(e.blob);exact(b,['digest','size']);if(b.digest!==pattern.exec(refs[index]!)![1]||!Number.isSafeInteger(b.size)||Number(b.size)<1||Number(b.size)>1024*1024)throw replicaError('replica_references_invalid');blob={digest:String(b.digest),size:Number(b.size)};total+=blob.size;}
   else if(pattern.exec(refs[index]!)![1]!==digest(new Uint8Array()))throw replicaError('replica_references_invalid');return {reference:refs[index]!,blob};});
  if(total>100000000)throw replicaError('replica_limit');const bodies:Uint8Array[]=[];
  for(const entry of entries){authorize();const bytes=entry.blob?await read(entry.blob):new Uint8Array();authorize();if(bytes.length!==(entry.blob?.size??0)||digest(bytes)!==pattern.exec(entry.reference)![1])throw replicaError('replica_invalid');bodies.push(bytes);}
  const texts=bodies.map(bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes));authorize();
  for(let n=0;n<entries.length;n++){authorize();if(store.write(texts[n]!).contentRef!==entries[n]!.reference)throw replicaError('replica_invalid');}authorize();
  const {evidence:_evidence,...value}=wire;return value;
 }};
}
