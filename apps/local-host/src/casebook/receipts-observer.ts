import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {HostCapabilityDescriptor} from '@molis-ai/molis-work-contracts/platform/app-host';
import type {GoalProjectApplication} from '../goal-project-application.js';
import type {LocalProjectDatabase} from '../project-database.js';
import {ReceiptJournal} from './receipts-journal.js';
import {resultReasons} from './reasons.js';
import type {OperationReceipt,ReceiptScope} from './receipts-contract.js';
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const integer=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0?Number(x):null;
const array=(x:unknown)=>Array.isArray(x)?x:[];
const proposalStates=['pending','superseded','approved','partially_applied','rejected','dismissed','closed'];
const effects=['accept_requirements','reject_requirements','accept_concerns','reject_concerns','authorize_action','deny_action','authorize_agreement_change'];
const packageVersion=(()=>{let dir=dirname(fileURLToPath(import.meta.url));for(let i=0;i<8;i++,dir=dirname(dir)){try{const p=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));if(p.name==='@molis-ai/molis-work'&&typeof p.version==='string')return p.version.slice(0,100);}catch{/* package metadata may be unavailable in embedding */}}return null;})();
export const receiptRuntime=()=>({node_version:process.versions.node,package_version:packageVersion,projection_version:'1.0.0' as const});
type Base=Omit<OperationReceipt,'seq'|'source_digest'>;
interface Ticket {epoch:string;base:Base;goal:string|null;proposal:string|null;mutation:boolean;tag:(value:unknown)=>string;}
export class ReceiptObserver {
 readonly journal:ReceiptJournal;
 constructor(private store:LocalProjectDatabase,private app:GoalProjectApplication,board:string,project:string){this.journal=new ReceiptJournal(store.db,board,project);}
 before(cap:HostCapabilityDescriptor,input:unknown,operation:string,channel:OperationReceipt['channel']):Ticket|null {
  try{
   const proposal=/^io\.molis\.work\.goals\.(submit|list|check|decide)-goal-tree-proposals?$/.test(cap.capability_id);
   if(cap.version!==1||(!proposal&&!/^io\.molis\.work\.goals\.events\.(create-intent|list-goals|read-state|configure|report|list|list-latest|timeline|read|progress|concern|decision-request|cite-decision|decide|agree|close|resume|note)$/.test(cap.capability_id)))return null;
   const s=this.journal.scope();if(!s||s.state!=='active')return null;
   const f=obj(proposal?array(input)[0]:input);if(f.board_id!==this.journal.board)return null;
   const tag=(v:unknown)=>this.journal.tag(s,'reference',v),ref=(v:unknown)=>typeof v==='string'?tag(v):null;
   const goal=typeof f.goal_id==='string'?f.goal_id:typeof f.root_goal_id==='string'?f.root_goal_id:null,p=typeof f.proposal_id==='string'?f.proposal_id:null;
   const comparison:Record<string,unknown>={};for(const key of ['title','outcome','types','requirements','events','progress','reason','result','kind','action','statement','conclusion','question','options','scope','effects','authorized_change','proposed_change','items','decisions','confirm_all_pending'])if(Object.hasOwn(f,key))comparison[key]=f[key];
   const base:Base={receipt_id:randomUUID(),operation_id:operation,occurred_at:new Date().toISOString(),phase:'attempt',channel,capability:cap.capability_id,capability_version:cap.version,runtime:receiptRuntime(),
    request_key:typeof f.idempotency_key==='string'?this.journal.tag(s,'request-key',[cap.capability_id,f.actor_id??obj(f.authority).actor_id,f.idempotency_key]):null,outcome:'pending',replayed:null,
    selection:{goal_ref:ref(goal),proposal_ref:ref(p),request_ref:ref(f.request_id),decision_ref:ref(f.decision_id??f.cited_decision_id),selected_option_ref:ref(f.selected_option_id),scope:this.scope(f.scope,tag),expected_config_version:integer(f.expected_config_version??f.expected_version),expected_agreement_version:integer(f.expected_agreement_version),base_event_cursor:integer(f.base_event_cursor),content_comparison:this.journal.tag(s,'selected-content-v1',comparison)},
    condition:this.condition(goal,p),guidance:{observation:'api_return_only',reasons:[],reasons_truncated:false,decision_options:[],options_truncated:false,semantic_next_action:null,requires_new_confirmation:null},decision:null,saved:null};
   this.journal.appendReceipt(s.epoch,base);return{epoch:s.epoch,base,goal,proposal:p,mutation:cap.operation==='command',tag};
  }catch{this.journal.unpersistedFailures++;return null;}
 }
 after(ticket:unknown,result:unknown,threw:boolean){
  if(!ticket)return;const t=ticket as Ticket;
  try{
   const o=obj(result),p=obj(o.proposal),d=obj(o.decision??o.decision_request),semantic=obj(o.semantic_review),ref=(v:unknown)=>typeof v==='string'?t.tag(v):null;
   const refs=(v:unknown)=>array(v).filter(x=>typeof x==='string').slice(0,20).map(t.tag);
   const goal=t.goal??(typeof obj(o.goal).goal_id==='string'?obj(o.goal).goal_id as string:null),proposal=t.proposal??(typeof p.proposal_id==='string'?p.proposal_id:null);
   const events=[o.event_id,...array(o.events).map(x=>obj(x).event_id)].filter((x):x is string=>typeof x==='string');
   const verified=goal&&!threw&&t.mutation?[...new Set(events)].filter(id=>this.app.goalEvents.readEvent(this.journal.board,goal,id)!=null):[];
   const stored=proposal&&!threw?this.app.goalTree.listGoalTreeProposals({board_id:this.journal.board,proposal_id:proposal}).proposals.find(x=>x.proposal_id===proposal):null;
   const options=array(d.options),reasons=resultReasons(result,threw);
   this.journal.appendReceipt(t.epoch,{...t.base,receipt_id:randomUUID(),occurred_at:new Date().toISOString(),phase:'result',outcome:threw?'threw':'returned',replayed:typeof o.replayed==='boolean'?o.replayed:null,condition:this.condition(goal,proposal),
    guidance:{observation:'api_return_only',reasons:reasons.slice(0,100),reasons_truncated:reasons.length>100,decision_options:refs(options.map(x=>obj(x).option_id)),options_truncated:options.length>20,semantic_next_action:['review_affected_subgraph','continue'].includes(String(semantic.next_action))?semantic.next_action as 'continue':null,requires_new_confirmation:typeof semantic.canonical_changes_require_new_user_confirmation==='boolean'?semantic.canonical_changes_require_new_user_confirmation:null},
    decision:!threw&&Object.keys(d).length?{request_ref:ref(d.request_id),decision_ref:ref(d.decision_id),scope:this.scope(d.scope,t.tag),effect_kinds:array(d.effects).map(x=>obj(x).kind).filter((x):x is string=>typeof x==='string'&&effects.includes(x)).slice(0,20),config_version:integer(d.config_version),agreement_version:integer(d.agreement_version),commitment_comparison:d.commitment?t.tag(['decision-commitment-v1',d.commitment]):null}:null,
    saved:threw||!t.mutation?null:{recorded:typeof o.recorded==='boolean'?o.recorded:null,completion_applied:typeof o.completion_applied==='boolean'?o.completion_applied:null,goal_ref:goal&&this.store.goalsQuery.getGoal(this.journal.board,goal)?ref(goal):null,event_refs:verified.slice(0,20).map(t.tag),proposal_ref:stored?ref(stored.proposal_id):null,proposal_version:integer(stored?.version),proposal_state:stored?.state??null,applied_item_refs:refs(o.applied_item_ids),conflict_item_refs:refs(o.conflict_item_ids),refs_truncated:verified.length>20||array(o.applied_item_ids).length>20||array(o.conflict_item_ids).length>20}});
  }catch{this.journal.unpersistedFailures++;}
 }
 private scope(value:unknown,tag:Ticket['tag']):ReceiptScope|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;const s=obj(value),refs=(v:unknown)=>array(v).filter(x=>typeof x==='string').slice(0,20).map(tag);
  return{requirement_refs:refs(s.requirement_ids),event_refs:refs(s.event_ids),concern_refs:refs(s.concern_ids),action_ref:typeof s.action==='string'?tag(s.action):null,truncated:[s.requirement_ids,s.event_ids,s.concern_ids].some(x=>array(x).length>20)};
 }
 private condition(goal:string|null,proposal:string|null):OperationReceipt['condition'] {
  const s=goal&&this.store.goalsQuery.getGoal(this.journal.board,goal)?this.app.goalEvents.readState(this.journal.board,goal):null;
  const p=proposal?this.app.goalTree.listGoalTreeProposals({board_id:this.journal.board,proposal_id:proposal}).proposals.find(x=>x.proposal_id===proposal):null;
  return{config_version:integer(s?.config.version),agreement_version:integer(s?.agreement.version),goal_event_cursor:integer(s?.goal_event_cursor),proposal_version:integer(p?.version),proposal_state:p&&proposalStates.includes(p.state)?p.state:null};
 }
}
