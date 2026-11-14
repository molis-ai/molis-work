import {createHash,randomUUID} from 'node:crypto';
import type {SyncBlobReference,SyncBlobSource} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type {SyncRegistration} from './index.js';
import {blobReference} from './blob-transfer.js';
import {decodeContent} from './decode-content.js';
import {parseSyncCutover,type SyncCutoverView} from './cutover.js';
import {syncError} from './sync-errors.js';

const CHUNK=4*1024*1024;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const ROUTE='/v1/process-items/cutover';

interface Status {phase:string;policyRevision:number;sourceHead:number;cutoverId?:string;consentRevision?:number;plan?:{planId:string;policyRevision:number;sourceHead:number}|null}
interface SourceItem {key:string;headRevision:number;state:string;value?:unknown;attachments?:SyncBlobReference[]}
interface SeedRow {key:string;sourceRevision:number;seeded:boolean;value?:unknown;attachments?:SyncBlobReference[]}
interface Page<T> {items:T[];more:boolean;next:string|null}
interface Receipt {digest:string;size:number;ready:boolean;parts:{part:number;checksum:string}[]}
/** One converted item: what the plan freezes, and the bytes of attachments the conversion made that the old event did not have. */
interface Converted {key:string;sourceRevision:number;value:unknown;attachments:SyncBlobReference[];fresh:SyncBlobSource[]}

export interface ProcessItemsCutoverPorts {
  assert():void;
  /** Requests as the person, without the cutover scope: the plan, seal and seeds are named by their own ids. */
  json<T>(route:string,body?:unknown,method?:string):Promise<T>;
  binary(route:string,body?:Uint8Array):Promise<Uint8Array>;
  /** The collection's own registration: its codec, and the owner's adoption of one decoded value. */
  registration:SyncRegistration;
  /** An attachment of the old stream before the seal, through the ordinary transfer of the public collection. */
  download(reference:SyncBlobReference):Promise<Uint8Array>;
}

/** The service stores JSON with its object keys sorted; values are compared the same way, never by the order a side wrote them in. */
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])])):value;
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function status(value:unknown):Status{
  const row=value as Status|null;
  if(!row||typeof row!=='object'||typeof row.phase!=='string'||!Number.isSafeInteger(row.policyRevision)||!Number.isSafeInteger(row.sourceHead))throw syncError('invalid','过程项同步切换状态无效，原件已保留');
  return row;
}

/**
 * The person's cutover of process items (specs/batch-06-shared-tools/sync-cutover.md, steps on the service side): read the old stream's
 * live heads, let the owner adopt each value, freeze them in one plan, seal, seed exactly the frozen values, read them back and finish.
 * Every step is the service's own check; this side only repeats what a lost response or a restart left unfinished. The conversion is
 * deterministic, so a resumed seeding recomputes the same wire from the same source, and the service refuses any value that differs.
 */
export async function runProcessItemsCutover(ports:ProcessItemsCutoverPorts):Promise<SyncCutoverView>{
  const {registration}=ports,adopt=registration.adopt;
  if(!registration.content||!adopt)throw syncError('unsupported','过程项采用尚未接入，原件已保留');
  let current=status(await ports.json(ROUTE));ports.assert();
  if(current.phase==='complete')return parseSyncCutover(current);
  if(current.phase!=='open'&&current.phase!=='seeding')throw syncError('invalid','过程项同步切换状态无效，原件已保留');

  // Read and adopt the old stream's live heads under one observation; a deleted or expired key is a terminal the plan leaves out.
  const sealed=current.phase==='seeding',observed={policyRevision:current.policyRevision,sourceHead:current.sourceHead};
  const read=async(reference:SyncBlobReference)=>sealed?sealedDownload(ports,current,reference):ports.download(reference);
  const converted:Converted[]=[];
  for(let after:string|null=observed.sourceHead===0?null:'';after!==null;){
    const query=new URLSearchParams({...(sealed?{}:{policyRevision:String(observed.policyRevision)}),sourceHead:String(observed.sourceHead),...(after?{after}:{})});
    const page:Page<SourceItem>=await ports.json<Page<SourceItem>>(ROUTE+'/source?'+query);ports.assert();
    if(!Array.isArray(page.items)||page.items.length>20||page.more&&!page.items.length)throw syncError('invalid','过程项旧流读取无效，原件已保留');
    for(const item of page.items){
      if(item.state!=='live')continue;
      const decoded=await decodeContent(registration,{key:item.key,operationId:'cutover-source',base:0,revision:item.headRevision,value:item.value??null,attachments:item.attachments??[]},read);ports.assert();
      const adopted=adopt(item.key,decoded.value);ports.assert();
      const encoded=registration.content.encode(item.key,adopted),old=new Set((item.attachments??[]).map(ref=>blobReference(ref).digest));
      converted.push({key:item.key,sourceRevision:item.headRevision,value:encoded.value,attachments:encoded.blobs.map(blobReference),fresh:encoded.blobs.filter(blob=>!old.has(blob.digest))});
    }
    after=page.more?page.next:null;
  }

  if(current.phase==='open'){
    // A plan this Home started for the same observation is continued; any other is replaced by the service at begin.
    const plan=current.plan&&current.plan.policyRevision===observed.policyRevision&&current.plan.sourceHead===observed.sourceHead?current.plan.planId:randomUUID().replaceAll('-','');
    for(const item of converted){
      const frozen=await ports.json<{value:unknown}>(ROUTE+'/plan/item',{planId:plan,expectedPolicyRevision:observed.policyRevision,expectedSourceHead:observed.sourceHead,key:item.key,sourceRevision:item.sourceRevision,value:item.value,attachments:item.attachments},'PUT');ports.assert();
      if(!same(frozen.value,item.value))throw syncError('invalid','过程项冻结值与本机转换不一致，原件已保留');
    }
    current=status(await ports.json(ROUTE+'/begin',{planId:plan,expectedPolicyRevision:observed.policyRevision,expectedSourceHead:observed.sourceHead,adoptProcessItems:true,allowRetainedRead:true}));ports.assert();
  }
  const cutoverId=current.cutoverId,consent=current.consentRevision;
  if(current.phase!=='seeding'&&current.phase!=='complete'||typeof cutoverId!=='string'||!Number.isSafeInteger(consent))throw syncError('invalid','过程项同步切换状态无效，原件已保留');

  // Seed what the plan holds and is not seeded yet: new attachment bytes first, then the exact frozen value.
  const byKey=new Map(converted.map(item=>[item.key,item]));
  const seeds=async()=>{
    const rows:SeedRow[]=[];
    for(let after:string|null='';after!==null;){
      const page:Page<SeedRow>=await ports.json<Page<SeedRow>>(ROUTE+'/seeds?'+new URLSearchParams({cutoverId,...(after?{after}:{})}));ports.assert();
      if(!Array.isArray(page.items)||page.items.length>20||page.more&&!page.items.length)throw syncError('invalid','过程项播种读取无效，原件已保留');
      rows.push(...page.items);after=page.more?page.next:null;
    }
    return rows;
  };
  for(const row of await seeds()){
    if(row.seeded)continue;
    const item=byKey.get(row.key);
    if(!item||item.sourceRevision!==row.sourceRevision)throw syncError('conflict','过程项旧流与冻结计划不一致，原件已保留');
    for(const blob of item.fresh)await seedBlob(ports,cutoverId,consent!,blob);
    await ports.json(ROUTE+'/seed',{cutoverId,expectedPolicyRevision:current.policyRevision,expectedConsentRevision:consent,key:item.key,sourceRevision:item.sourceRevision,value:item.value,attachments:item.attachments});ports.assert();
  }
  // Read every seed back and compare it with the conversion before the service is asked to finish.
  const readback=await seeds();
  if(readback.length!==converted.length||readback.some(row=>{const item=byKey.get(row.key);return !row.seeded||!item||!same(row.value,item.value)||!same(row.attachments??[],item.attachments);}))
    throw syncError('conflict','过程项播种读回与转换不一致，原件已保留');
  const done=await ports.json(ROUTE+'/finish',{cutoverId,expectedPolicyRevision:current.policyRevision,expectedConsentRevision:consent});ports.assert();
  return parseSyncCutover(done);
}

/** Bytes the conversion made, uploaded only through the seed entry, under the seal and the live consent. */
async function seedBlob(ports:ProcessItemsCutoverPorts,cutoverId:string,consent:number,blob:SyncBlobSource){
  const ref=blobReference(blob);
  if(blob.bytes.byteLength!==ref.size||hash(blob.bytes)!==ref.digest)throw syncError('invalid','同步附件校验失败');
  const receipt=await ports.json<Receipt>(ROUTE+'/seed-blobs/reserve',{cutoverId,expectedConsentRevision:consent,digest:ref.digest,size:ref.size});ports.assert();
  if(receipt.digest!==ref.digest||receipt.size!==ref.size||!Array.isArray(receipt.parts))throw syncError('invalid','同步附件响应无效');
  if(receipt.ready)return;
  for(let part=0;part<Math.ceil(ref.size/CHUNK);part++){
    const bytes=blob.bytes.subarray(part*CHUNK,(part+1)*CHUNK),existing=receipt.parts.find(row=>row.part===part);
    if(existing){if(existing.checksum!==hash(bytes))throw syncError('conflict','同步附件分块冲突');continue;}
    await ports.binary(ROUTE+'/seed-blobs/chunk?'+new URLSearchParams({cutoverId,consentRevision:String(consent),digest:ref.digest,part:String(part)}),bytes);ports.assert();
  }
  await ports.json(ROUTE+'/seed-blobs/complete',{cutoverId,expectedConsentRevision:consent,digest:ref.digest});ports.assert();
}

/** After the seal the old stream's attachments are read only through the retained-read grant, part by part. */
async function sealedDownload(ports:ProcessItemsCutoverPorts,current:Status,reference:SyncBlobReference):Promise<Uint8Array>{
  const ref=blobReference(reference),parts:Uint8Array[]=[];
  for(let part=0;part<Math.ceil(ref.size/CHUNK);part++){
    parts.push(await ports.binary(ROUTE+'/blob?'+new URLSearchParams({cutoverId:String(current.cutoverId),consentRevision:String(current.consentRevision),digest:ref.digest,part:String(part)})));ports.assert();
  }
  const bytes=Buffer.concat(parts);
  if(bytes.byteLength!==ref.size||hash(bytes)!==ref.digest)throw syncError('invalid','同步附件校验失败');
  return bytes;
}
