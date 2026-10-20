import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginSyncDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { ProjectReplicaDefinition, ProjectReplicaRow, ProjectReplicaRows } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { parseCodingPlan, type CodingPlanDraft } from './plans.js';
import { CODING_ACTIVE_STATES } from './store.js';
import {validateCodingInputs} from './inputs.js';

export const CODING_CONTENT_REPLICA_ID='coding_content';
export const codingSync:PluginSyncDeclaration={protocol_version:1,collections:[{id:'sessions',title:'编码会话与草稿',schema_version:1,requires:[]}]};
const errors=defineErrorCodes('coding',{sync_invalid:'invalid',sync_active:'unavailable'});
const sessionColumns=['project_id','session_id','title','state','archived','goal_id','runtime_id','runtime_session_id','created_at','updated_at','steps_json','background_json'];
const privateColumns=['state','runtime_id','runtime_session_id','steps_json','background_json'] as const;
const invalid=():never=>{throw errors.sync_invalid('编码会话同步内容或归属无效');};
const text=(value:unknown,max=200):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=max;
const stamp=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function portablePlan(input:string):CodingPlanDraft{
  const value:unknown=JSON.parse(input);if(!value||typeof value!=='object'||Array.isArray(value))invalid();
  const draft=value as CodingPlanDraft;
  if(!Number.isSafeInteger(draft.revision)||draft.revision<0||!draft.source||typeof draft.source!=='object'
    ||!text(draft.source.session_id)||!text(draft.source.run_id)||typeof draft.source.task!=='string'||draft.source.task.length>100000)invalid();
  return {revision:0,content:parseCodingPlan(draft.content),source:{session_id:draft.source.session_id,run_id:draft.source.run_id,task:draft.source.task,workspace_path:''},confirmed:null};
}
function nextRevision(value:number):number{if(!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(value+1))invalid();return value+1;}

/** Coding stores canonical derived SDK exports; execution and original ledgers remain in the Runtime. */
export function codingContentReplicationDefinition(validateHistory?:(json:string)=>{sessionId:string}):ProjectReplicaDefinition{
  return {id:CODING_CONTENT_REPLICA_ID,assetKind:CODING_CONTENT_REPLICA_ID,
    tables:[
      {name:'coding_plan_versions',columns:['project_id','session_id','revision'],keys:['project_id','session_id'],keepRoot:true,journalCondition:'0'},
      {name:'coding_input_versions',columns:['project_id','session_id','revision'],keys:['project_id','session_id'],keepRoot:true,journalCondition:'0'},
      {name:'coding_sessions',columns:sessionColumns,keys:['project_id','session_id'],journalColumns:['title','archived','goal_id','state'],journalUpdateCondition:"$new.title IS NOT $old.title OR $new.archived IS NOT $old.archived OR $new.goal_id IS NOT $old.goal_id OR ($new.state IS NOT $old.state AND $new.state IN ('done','failed','stopped','cancelled') AND $new.runtime_session_id IS NOT NULL)"},
      {name:'coding_plan_drafts',columns:['project_id','session_id','revision','draft_json'],keys:['project_id','session_id']},
      {name:'coding_saved_history',columns:['project_id','session_id','source_id','archive_json'],keys:['project_id','session_id','source_id']},
      {name:'coding_inputs',columns:['project_id','session_id','revision','draft','questions_json'],keys:['project_id','session_id']},
    ],journalTypes:[],receiptOperations:[],sequenceFields:[],
    project(rows){for(const row of rows.coding_sessions!)if(row.runtime_session_id!==null&&['done','failed','stopped','cancelled'].includes(String(row.state))&&!rows.coding_saved_history!.some(archive=>archive.session_id===row.session_id&&archive.source_id===row.runtime_session_id))throw errors.sync_active('原 SDK 历史尚未导出，完整记录和队列已保留',{sync_waiting:true});return {coding_saved_history:rows.coding_saved_history!,coding_plan_versions:[],coding_input_versions:[],coding_sessions:rows.coding_sessions!.map(row=>({...row,state:'idle',runtime_id:'prologue',runtime_session_id:null,steps_json:null,background_json:null})),
      coding_plan_drafts:rows.coding_plan_drafts!.map(row=>({...row,revision:0,draft_json:JSON.stringify(portablePlan(String(row.draft_json)))})),coding_inputs:rows.coding_inputs!.map(row=>({...row,revision:0}))};},
    validate(rows,projectId){
      if(rows.coding_plan_versions!.length||rows.coding_input_versions!.length)invalid();const ids=new Set<string>();
      for(const row of rows.coding_sessions!){
        if(row.project_id!==projectId||!text(row.session_id)||!text(row.title,1000)||row.state!=='idle'||row.runtime_id!=='prologue'
          ||row.runtime_session_id!==null||row.steps_json!==null||row.background_json!==null||row.archived!==0&&row.archived!==1
          ||row.goal_id!==null&&!text(row.goal_id)||!stamp(row.created_at)||!stamp(row.updated_at))invalid();ids.add(String(row.session_id));
      }
      for(const row of rows.coding_saved_history!){if(row.project_id!==projectId||!ids.has(String(row.session_id))||typeof row.archive_json!=='string'||!text(row.source_id,500)||!validateHistory)invalid();if(validateHistory!(String(row.archive_json)).sessionId!==row.source_id)invalid();}
      for(const row of rows.coding_plan_drafts!){
        if(row.project_id!==projectId||!ids.has(String(row.session_id))||row.revision!==0||typeof row.draft_json!=='string')invalid();
        const plan=portablePlan(String(row.draft_json));
        if(plan.source.session_id!==row.session_id||JSON.stringify(plan)!==row.draft_json)invalid();
      }
      for(const row of rows.coding_inputs!){
        if(row.project_id!==projectId||!ids.has(String(row.session_id))||row.revision!==0||typeof row.questions_json!=='string')invalid();
        const questions=JSON.parse(String(row.questions_json));validateCodingInputs(row.draft,questions);if(JSON.stringify(questions)!==row.questions_json)invalid();
      }
    },
    beforeClear(local){
      for(const row of local.coding_sessions!){
        if((CODING_ACTIVE_STATES as readonly string[]).includes(String(row.state))||row.background_json!==null&&String(row.background_json)!=='[]')
          throw errors.sync_active('此项目的编码执行或后台命令尚未结束，内容已保留',{sync_waiting:true});
      }
    },
    restore(rows,local,projectId){return restore(rows,local,projectId);},
  };
}
function restore(rows:ProjectReplicaRows,local:ProjectReplicaRows,projectId:string):ProjectReplicaRows{
  const sessions=new Map(local.coding_sessions!.map(row=>[row.session_id,row]));
  const plans=restoreDrafts(rows,local,projectId,'coding_plan_drafts','coding_plan_versions',(row,revision)=>({...row,revision,draft_json:JSON.stringify({...portablePlan(String(row.draft_json)),revision})}));
  const inputs=restoreDrafts(rows,local,projectId,'coding_inputs','coding_input_versions',(row,revision)=>({...row,revision}));
  return {coding_saved_history:rows.coding_saved_history!,coding_sessions:rows.coding_sessions!.map(row=>{const old=sessions.get(row.session_id);return old?{...row,...Object.fromEntries(privateColumns.map(key=>[key,old[key]]))}:row;}),
    coding_plan_drafts:plans.drafts,coding_plan_versions:plans.versions,coding_inputs:inputs.drafts,coding_input_versions:inputs.versions};
}
function restoreDrafts(rows:ProjectReplicaRows,local:ProjectReplicaRows,projectId:string,table:string,clock:string,project:(row:ProjectReplicaRow,revision:number)=>ProjectReplicaRow){
 const prior=new Map(local[table]!.map(row=>[row.session_id,row]));
 const versions=new Map(local[clock]!.map(row=>[String(row.session_id),Number(row.revision)]));
 for(const row of local[table]!)versions.set(String(row.session_id),nextRevision(Math.max(versions.get(String(row.session_id))??0,Number(row.revision))));
 const drafts=rows[table]!.map(row=>{const id=String(row.session_id),revision=prior.has(id)?versions.get(id)!:nextRevision(versions.get(id)??0);versions.set(id,revision);return project(row,revision);});
 return {drafts,versions:[...versions].map(([session_id,revision]):ProjectReplicaRow=>({project_id:projectId,session_id,revision}))};
}
