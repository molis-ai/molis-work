import {createHash,randomUUID} from 'node:crypto';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';

const errors=defineErrorCodes('placement',{copy_journal_invalid:'invalid',copy_journal_scope:'forbidden',copy_journal_conflict:'conflict'});
export interface ProjectCopyPlan {
 readonly operationId:string;readonly sourceSpaceId:string;readonly targetSpaceId:string;readonly fingerprint:string;
 readonly projects:readonly {readonly sourceId:string;readonly targetId:string;readonly title:string}[];
 readonly assets:readonly {readonly id:string;readonly targetKey:string;readonly targetHash:string}[];
}
export interface ProjectCopyReceipt {
 readonly plan:ProjectCopyPlan;readonly planHash:string;readonly attempt:string;
 readonly applied:readonly string[];readonly published:readonly string[];readonly state:'copying'|'complete';
}
interface Journal {format:1;spaceId:string;operations:Record<string,ProjectCopyReceipt>}
export interface ProjectCopyJournal {
 get(operationId:string):ProjectCopyReceipt|null;
 reserve(plan:ProjectCopyPlan):ProjectCopyReceipt;
 start(operationId:string,planHash:string):{readonly attempt:string;check():void};
 applied(operationId:string,attempt:string,assetId:string):void;
 published(operationId:string,attempt:string,projectId:string):void;
 complete(operationId:string,attempt:string):ProjectCopyReceipt;
}
const exact=(value:object,keys:string[])=>Object.keys(value).sort().join(',')===keys.sort().join(',');
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max=240):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const unique=(values:readonly string[])=>new Set(values).size===values.length;
function planValue(input:unknown,spaceId:string):ProjectCopyPlan {
 if(!object(input)||!exact(input,['operationId','sourceSpaceId','targetSpaceId','fingerprint','projects','assets'])||!text(input.operationId,200)||!text(input.sourceSpaceId)||input.targetSpaceId!==spaceId||input.sourceSpaceId===spaceId||!hash(input.fingerprint)||!Array.isArray(input.projects)||input.projects.length<1||input.projects.length>100||!Array.isArray(input.assets)||input.assets.length>50000)throw errors.copy_journal_invalid('复制回执格式或空间无效，原记录已保留');
 const projects=input.projects.map(value=>{if(!object(value)||!exact(value,['sourceId','targetId','title'])||!text(value.sourceId,80)||value.sourceId==='personal'||!text(value.targetId,80)||value.targetId===value.sourceId||!text(value.title,120)||!value.title.trim())throw errors.copy_journal_invalid('复制回执项目映射无效');return {sourceId:value.sourceId,targetId:value.targetId,title:value.title};}).sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
 const assets=input.assets.map(value=>{if(!object(value)||!exact(value,['id','targetKey','targetHash'])||!text(value.id,2500)||!text(value.targetKey,2000)||!hash(value.targetHash))throw errors.copy_journal_invalid('复制回执资产映射无效');return {id:value.id,targetKey:value.targetKey,targetHash:value.targetHash};}).sort((a,b)=>a.id.localeCompare(b.id));
 if(!unique(projects.map(p=>p.sourceId))||!unique(projects.map(p=>p.targetId))||!unique(assets.map(a=>a.id)))throw errors.copy_journal_invalid('复制回执包含重复身份');
 return {operationId:input.operationId,sourceSpaceId:input.sourceSpaceId,targetSpaceId:spaceId,fingerprint:input.fingerprint,projects,assets};
}
const planHash=(plan:ProjectCopyPlan)=>createHash('sha256').update(JSON.stringify(plan)).digest('hex');
function readJournal(raw:string|null,spaceId:string):Journal {
 if(raw===null)return {format:1,spaceId,operations:{}};
 if(Buffer.byteLength(raw)>16*1024*1024)throw errors.copy_journal_invalid('复制回执超过读取预算，原记录已保留');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw errors.copy_journal_invalid('复制回执不是完整 JSON，原记录已保留');}
 if(!object(value)||!exact(value,['format','spaceId','operations'])||value.format!==1||value.spaceId!==spaceId||!object(value.operations)||Object.keys(value.operations).length>1000)throw errors.copy_journal_invalid('复制回执不是当前空间的现行格式，原记录已保留');
 const operations:Record<string,ProjectCopyReceipt>={};
 for(const [id,entry] of Object.entries(value.operations)){
  if(!object(entry)||!exact(entry,['plan','planHash','attempt','applied','published','state'])||!text(entry.attempt)||!hash(entry.planHash)||!Array.isArray(entry.applied)||!entry.applied.every(a=>text(a,2500))||!unique(entry.applied)||!Array.isArray(entry.published)||!entry.published.every(p=>text(p,80))||!unique(entry.published)||!['copying','complete'].includes(String(entry.state)))throw errors.copy_journal_invalid('复制阶段回执无效');
  const plan=planValue(entry.plan,spaceId);if(plan.operationId!==id||planHash(plan)!==entry.planHash||entry.applied.some(a=>!plan.assets.some(asset=>asset.id===a))||entry.published.some(p=>!plan.projects.some(project=>project.targetId===p))||entry.published.length&&entry.applied.length!==plan.assets.length||entry.state==='complete'&&entry.published.length!==plan.projects.length)throw errors.copy_journal_invalid('复制阶段与确认映射不符');
  Object.defineProperty(operations,id,{value:{plan,planHash:entry.planHash,attempt:entry.attempt,applied:entry.applied,published:entry.published,state:entry.state},enumerable:true,writable:true,configurable:true});
 }
 return {format:1,spaceId,operations};
}
/** Local metadata only: identities, hashes and stages; never source bodies, credentials or execution grants. */
export function createProjectCopyJournal(storage:{read():string|null;compareAndSet(expected:string|null,value:string):boolean},targetSpaceId:string,authorize:()=>void):ProjectCopyJournal {
 if(!text(targetSpaceId))throw errors.copy_journal_scope('目标空间无效');
 const load=()=>{authorize();const raw=storage.read();authorize();return {raw,journal:readJournal(raw,targetSpaceId)};};
 const get=(id:string)=>{const {journal}=load();return Object.hasOwn(journal.operations,id)?structuredClone(journal.operations[id]!):null;};
 const change=<T>(mutate:(journal:Journal)=>T):T=>{const {raw,journal}=load(),result=mutate(journal),next=JSON.stringify(journal);readJournal(next,targetSpaceId);if(Buffer.byteLength(next)>16*1024*1024)throw errors.copy_journal_invalid('复制回执空间已满，原记录已保留');authorize();if(next!==raw&&!storage.compareAndSet(raw,next))throw errors.copy_journal_conflict('复制回执已由另一请求推进，请重试');authorize();return structuredClone(result);};
 const requireAttempt=(journal:Journal,id:string,attempt:string)=>{const receipt=Object.hasOwn(journal.operations,id)?journal.operations[id]:null;if(!receipt||receipt.attempt!==attempt||receipt.state!=='copying')throw errors.copy_journal_conflict('复制已由新的请求接管，旧提交已停止');return receipt;};
 return {get,reserve(input){const plan=planValue(structuredClone(input),targetSpaceId),digest=planHash(plan);return change(journal=>{
  const old=Object.hasOwn(journal.operations,plan.operationId)?journal.operations[plan.operationId]:null;
  if(old){if(old.planHash!==digest)throw errors.copy_journal_conflict('同一复制请求不能更换原件或目标，请使用原回执重试');return old;}
  if(Object.keys(journal.operations).length>=1000)throw errors.copy_journal_invalid('复制回执数量已满，原记录已保留');
  const receipt:ProjectCopyReceipt={plan,planHash:digest,attempt:randomUUID(),applied:[],published:[],state:'copying'};Object.defineProperty(journal.operations,plan.operationId,{value:receipt,enumerable:true,writable:true,configurable:true});return receipt;
 });},start(id,digest){const attempt=randomUUID();change(journal=>{const receipt=Object.hasOwn(journal.operations,id)?journal.operations[id]:null;if(!receipt||receipt.planHash!==digest||receipt.state!=='copying')throw errors.copy_journal_conflict('复制请求已完成或内容不符');journal.operations[id]={...receipt,attempt};});return {attempt,check(){const receipt=get(id);authorize();if(!receipt||receipt.attempt!==attempt||receipt.state!=='copying')throw errors.copy_journal_conflict('复制已由新的请求接管，旧提交已停止');}};},
 applied(id,attempt,assetId){change(journal=>{const receipt=requireAttempt(journal,id,attempt);if(!receipt.plan.assets.some(asset=>asset.id===assetId))throw errors.copy_journal_scope('资产不属于已确认的复制');if(!receipt.applied.includes(assetId))journal.operations[id]={...receipt,applied:[...receipt.applied,assetId].sort()};});},
 published(id,attempt,projectId){change(journal=>{const receipt=requireAttempt(journal,id,attempt);if(receipt.applied.length!==receipt.plan.assets.length||!receipt.plan.projects.some(project=>project.targetId===projectId))throw errors.copy_journal_conflict('全部内容尚未保存，不能发布项目');if(!receipt.published.includes(projectId))journal.operations[id]={...receipt,published:[...receipt.published,projectId].sort()};});},
 complete(id,attempt){return change(journal=>{const receipt=requireAttempt(journal,id,attempt);if(receipt.applied.length!==receipt.plan.assets.length||receipt.published.length!==receipt.plan.projects.length)throw errors.copy_journal_conflict('项目复制尚未完成');return journal.operations[id]={...receipt,state:'complete'};});},
 };
}
