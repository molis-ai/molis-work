import {InteractionContexts} from './context.js';
import {ReceiptObserver} from './receipts-observer.js';
import {randomUUID} from 'node:crypto';
import type {HostCapabilityDescriptor} from '@molis-ai/molis-work-contracts/platform/app-host';
import type {GoalProjectApplication} from '../goal-project-application.js';
import type {LocalProjectDatabase} from '../project-database.js';
import {InteractionJournal} from './journal.js';
import {resultReasons} from './reasons.js';
import type {Fact,Condition,EventState} from './contract.js';

export const EVENT_METHODS = {
 createIntent:'create-intent',listGoals:'list-goals',readState:'read-state',configure:'configure',report:'report',
 listEvents:'list',listLatestEvents:'list-latest',listLatestTimeline:'timeline',readEvent:'read',
 recordProgress:'progress',applyConcern:'concern',requestDecision:'decision-request',citeDecision:'cite-decision',
 recordTrustedDecision:'decide',setAgreement:'agree',submitClosure:'close',resumeWork:'resume',recordNote:'note',
} as const;
const CAPABILITIES=new Set(Object.values(EVENT_METHODS).map(x=>`io.molis.work.goals.events.${x}`));
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const integer=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0?Number(x):null;
interface Ticket {mutation:boolean;epoch:string;base:Omit<Fact,'seq'|'source_digest'>;goal:string|null;tag:(domain:string,value:unknown)=>string;}
/** Project-owned observation. No inferred workflow state or business text export. */
export class InteractionObserver {
 readonly journal:InteractionJournal;
 readonly receipts:ReceiptObserver;
 constructor(private store:LocalProjectDatabase,private app:GoalProjectApplication,board:string,project:string){this.journal=new InteractionJournal(store.db,board,project);this.receipts=new ReceiptObserver(store,app,board,project);}
 before(cap:HostCapabilityDescriptor,input:unknown,channel:Fact['channel']='local-host.capability.v1'):unknown{
  const operation=randomUUID();
  return {legacy:this.beforeLegacy(cap,input,channel,operation),receipt:this.receipts.before(cap,input,operation,channel)};
 }
 after(ticket:unknown,result:unknown,threw:boolean):void{
  if(!ticket)return;const t=ticket as {legacy:unknown;receipt:unknown};
  this.afterLegacy(t.legacy,result,threw);this.receipts.after(t.receipt,result,threw);
 }
 private beforeLegacy(cap:HostCapabilityDescriptor,input:unknown,channel:Fact['channel'],operation:string):Ticket|null{
  try{
   if(!CAPABILITIES.has(cap.capability_id)||cap.version!==1)return null;
   const scope=this.journal.scope();if(!scope||scope.state!=='active')return null;
   const fields=obj(input);if(fields.board_id!==this.journal.board)return null;
   const tag=(d:string,v:unknown)=>this.journal.tag(scope,d,v),ref=(v:unknown)=>typeof v==='string'?tag('reference',v):null;
   const refs=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string').slice(0,20).map(x=>tag('reference',x)):[];
   const goal=typeof fields.goal_id==='string'?fields.goal_id:null;
   const comparison:Record<string,unknown>={};
   for(const k of ['title','outcome','types','requirements','summary','events','progress','reason','result','kind','action','expected_version','expected_config_version','expected_agreement_version','statement','conclusion'])if(Object.hasOwn(fields,k))comparison[k]=fields[k];
   const base:Ticket['base']={fact_id:randomUUID(),operation_id:operation,occurred_at:new Date().toISOString(),kind:'attempt',channel,
    capability:cap.capability_id,capability_version:cap.version,projection_version:'2.0.0',
    request_key:typeof fields.idempotency_key==='string'?tag('request-key',[cap.capability_id,fields.actor_id,fields.idempotency_key]):null,
    selection:{goal_ref:ref(goal),proposal_ref:null,obligation_ref:null,evidence_refs:null,action_ref:null,action_condition:null,contract_revision:null,
     event_refs:[...refs(fields.event_ids),...(ref(fields.event_id)?[ref(fields.event_id)!]:[])].slice(0,20),requirement_refs:[...new Set([...refs(fields.requirement_ids),...refs(Array.isArray(fields.events)?fields.events.flatMap(e=>Array.isArray(obj(e).judgments)?(obj(e).judgments as unknown[]).map(j=>obj(j).requirement_id):[]):[])])].slice(0,20),
     expected_config_version:integer(fields.expected_config_version??fields.expected_version),expected_agreement_version:integer(fields.expected_agreement_version),content_comparison:tag('selected-content-v2',comparison)},
    condition:this.condition(goal,tag),event_state:this.state(goal,tag),accepted:null,related_states:[],related_states_truncated:false,
    outcome:'pending',reason_code:null,result_reasons:[],replayed:null,saved:null,offered:[],offered_truncated:false,corrects_fact_id:null};
   this.journal.append(scope.epoch,base);this.capture(scope.epoch,base.operation_id,'before',goal,tag);return{mutation:cap.operation==='command',epoch:scope.epoch,base,goal,tag};
  }catch{this.journal.unpersistedFailures++;return null;}
 }
 private afterLegacy(ticket:unknown,result:unknown,threw:boolean):void{
  if(!ticket)return;const t=ticket as Ticket;
  try{
   const output=obj(result),goal=t.goal??(typeof obj(output.goal).goal_id==='string'?obj(output.goal).goal_id as string:null);
   const candidates=[output.event_id,...(Array.isArray(output.events)?output.events.map(x=>obj(x).event_id):[])].filter((v):v is string=>typeof v==='string');
   // Verify mutation event IDs through the same owner's public read API, not arbitrary returned payloads.
   const eventRefs=goal&&!threw&&t.mutation?[...new Set(candidates)].slice(0,20).filter(id=>this.app.goalEvents.readEvent(this.journal.board,goal,id)!=null).map(id=>t.tag('reference',id)):[];
   const state=this.state(goal,t.tag),reasons=resultReasons(result,threw);
   this.journal.append(t.epoch,{...t.base,fact_id:randomUUID(),kind:'result',occurred_at:new Date().toISOString(),condition:this.condition(goal,t.tag),event_state:state,
    accepted:typeof output.completion_applied==='boolean'?output.completion_applied:typeof output.allowed==='boolean'?output.allowed:null,
    outcome:threw?'threw':'returned',reason_code:reasons[0]?.code??null,result_reasons:reasons,replayed:typeof output.replayed==='boolean'?output.replayed:null,
    saved:threw||!t.mutation?null:{review_ref:null,evidence_refs:null,goal_ref:goal?t.tag('reference',goal):null,proposal_ref:null,state:state?.work_status??null,event_refs:eventRefs}});
   this.capture(t.epoch,t.base.operation_id,'after',goal,t.tag);
  }catch{this.journal.unpersistedFailures++;}
 }
 private state(goal:string|null,tag:Ticket['tag']):EventState|null{
  if(!goal||!this.store.goalsQuery.getGoal(this.journal.board,goal))return null;
  const s=this.app.goalEvents.readState(this.journal.board,goal);
  const values=[s.requirements.map(x=>x.requirement_id),s.gaps.map(x=>x.requirement_id),s.pending_decisions.map(x=>x.request_id),s.concerns.filter(x=>x.status==='open'&&x.blocks_closure).map(x=>x.concern_id)];
  const [requirements,gaps,decisions,concerns]=values.map(xs=>xs.slice(0,20).map(x=>tag('reference',x)));
  return{work_status:s.work_status,config_version:s.config.version,agreement_version:s.agreement.version,goal_event_cursor:s.goal_event_cursor,can_record:s.can_record,completion_effect:s.completion_effect,
   requirement_refs:requirements!,unmet_requirement_refs:gaps!,pending_decision_refs:decisions!,blocking_concern_refs:concerns!,refs_truncated:values.some(xs=>xs.length>20)};
 }
 private condition(goal:string|null,tag:Ticket['tag']):Condition{
  const current=goal?this.store.goalsQuery.getGoal(this.journal.board,goal):null;
  return{goal_ref:goal?tag('reference',goal):null,contract_revision:current?.current_contract_revision??null,action_condition:null,progress:null,display_status:null};
 }
 private capture(epoch:string,operation:string,phase:'before'|'after',goal:string|null,tag:Ticket['tag']){
  if(!goal)return;const contexts=new InteractionContexts(this.journal);if(contexts.authorization.scope()?.state!=='active')return;
  const current=this.store.goalsQuery.getGoal(this.journal.board,goal);if(current)contexts.capture(epoch,operation,phase,current,tag('reference',goal));
 }
}
