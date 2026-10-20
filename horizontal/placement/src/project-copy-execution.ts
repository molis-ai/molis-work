import {createHash} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {defineErrorCodes,requireSynchronous} from '@molis-ai/molis-work-contracts/platform/actions';
import type {ProjectCopyOwner} from '@molis-ai/molis-work-contracts/services/placement';
import {projectCopyIdentities,type ProjectCopyIdentityInput} from './project-copy-identity.js';
import type {ProjectCopyPreview,ProjectCopySource} from './project-copy-preview.js';
import type {ProjectCopyJournal,ProjectCopyPlan,ProjectCopyReceipt} from './project-copy-journal.js';

const errors=defineErrorCodes('placement',{copy_execution_invalid:'invalid',copy_execution_stale:'conflict'});
export interface ProjectCopyExecution extends ProjectCopyIdentityInput {
 readonly fingerprint:string;readonly preview:ProjectCopyPreview;readonly sources:readonly ProjectCopySource[];readonly journal:ProjectCopyJournal;
 authorize():void;
 /** Final owner write checks MUST include this attempt fence, including the owner's transaction tail. */
 target(ownerId:string,check:()=>void):{owner:ProjectCopyOwner;close():void};
 /** Stage files/reservations without publishing a visible project. Must be idempotent and recheck after waits. */
 prepareProject(project:{sourceId:string;targetId:string;title:string},check:()=>void):Promise<void>;
 /** Publish only after every selected owner's data is saved. Retry must verify/adopt the same reserved project. */
 publishProject(project:{sourceId:string;targetId:string;title:string},check:()=>void):Promise<void>;
}
/** No cloud, policy, model or Runtime calls. An interrupted owner commit is replayed with the same identities. */
export async function executeProjectCopy(input:ProjectCopyExecution):Promise<ProjectCopyReceipt> {
 const authorize=input.authorize.bind(input),journal=input.journal,target=input.target.bind(input),prepareProject=input.prepareProject.bind(input),publishProject=input.publishProject.bind(input);authorize();
 const operationId=input.operationId,sourceSpaceId=input.sourceSpaceId,targetSpaceId=input.targetSpaceId,projects=input.projects.map(project=>({...project})),fingerprint=input.fingerprint;
 const maps=projectCopyIdentities({operationId,sourceSpaceId,targetSpaceId,projects}),old=journal.get(operationId);
 if(old?.state==='complete'){
  if(old.plan.sourceSpaceId!==sourceSpaceId||old.plan.targetSpaceId!==targetSpaceId||old.plan.fingerprint!==fingerprint||JSON.stringify(old.plan.projects)!==JSON.stringify(projects.map(p=>({sourceId:p.id,targetId:maps.project(p.id),title:p.title})).sort((a,b)=>a.sourceId.localeCompare(b.sourceId))))throw errors.copy_execution_stale('复制请求与已有回执不符');
  authorize();return old;
 }
 const sources=new Map(input.sources.map(source=>[source.ownerId,source.owner]));if(sources.size!==input.sources.length)throw errors.copy_execution_invalid('复制 owner 重复');
 const entries=input.preview.confirm(fingerprint),confirmed=input.preview.view;
 if(confirmed.sourceSpaceId!==sourceSpaceId||confirmed.fingerprint!==fingerprint||JSON.stringify([...confirmed.projectIds].sort())!==JSON.stringify(projects.map(p=>p.id).sort()))throw errors.copy_execution_stale('确认空间或项目与预览不符');
 const assets=entries.map(entry=>{const source=sources.get(entry.ownerId);if(!source)throw errors.copy_execution_invalid('原内容 owner 不可用');authorize();const asset=source.fork(entry.asset,maps.forProject(entry.projectId));return {ownerId:entry.ownerId,id:JSON.stringify([entry.ownerId,entry.asset.key]),asset};});
 const plan:ProjectCopyPlan={operationId,sourceSpaceId,targetSpaceId,fingerprint,projects:projects.map(p=>({sourceId:p.id,targetId:maps.project(p.id),title:p.title})),assets:assets.map(entry=>({id:entry.id,targetKey:entry.asset.key,targetHash:createHash('sha256').update(JSON.stringify(entry.asset)).digest('hex')}))};
 // Persist the full identity plan before opening a target or staging any project.
 authorize();const receipt=journal.reserve(plan),lease=journal.start(operationId,receipt.planHash);let active=true;
 const check=()=>{if(!active)throw errors.copy_execution_stale('此复制尝试已结束，迟到提交已停止');authorize();lease.check();authorize();};
 const targets=new Map<string,ReturnType<ProjectCopyExecution['target']>>();
 try{
  for(const entry of assets){check();if(!targets.has(entry.ownerId))targets.set(entry.ownerId,target(entry.ownerId,check));}
  for(const project of receipt.plan.projects){check();await prepareProject(project,check);check();}
  // Owners enforce dependency presence. Repeat only declared dependency waits; all other refusals stop intact.
  let pending=[...assets],processed=0;while(pending.length){const waiting:typeof pending=[];let progress=false;
   for(const entry of pending){if(processed++%20===0){await setImmediate();check();}check();try{requireSynchronous(targets.get(entry.ownerId)!.owner.apply(entry.asset),'复制 owner 必须在同步事务内提交');}catch(error){if(error&&typeof error==='object'&&'details' in error&&error.details&&typeof error.details==='object'&&'sync_waiting' in error.details&&error.details.sync_waiting===true){waiting.push(entry);continue;}throw error;}check();journal.applied(operationId,lease.attempt,entry.id);progress=true;}
   if(!progress)throw errors.copy_execution_stale('关联内容尚未全部到达，副本保留在未完成状态，可使用同一回执重试');pending=waiting;
  }
  for(const project of receipt.plan.projects){check();await publishProject(project,check);check();journal.published(operationId,lease.attempt,project.targetId);}
  check();return journal.complete(operationId,lease.attempt);
 }finally{active=false;for(const target of targets.values())target.close();}
}
