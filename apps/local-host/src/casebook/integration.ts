import { InteractionContexts } from './context.js';
import type { HostCapabilityDefinition, LocalHostProjectClient } from '@molis-ai/molis-work-contracts/platform/app-host';
import type { LocalHost } from '../local-host.js';
import type { MolisWorkProjectRuntime } from '../project-host.js';
import { InteractionObserver } from './observer.js';
import { CasebookError, exact, PURPOSE, CONTEXT_PURPOSE, RECEIPTS_PURPOSE, type ContextRequest, type ContextEnvelope, type AuthorizationRequest, type ReadRequest, type Envelope } from './contract.js';
import {ReceiptJournal} from './receipts-journal.js';
import type {ReceiptReadRequest,ReceiptEnvelope} from './receipts-contract.js';

const capability=(name:string,operation:'query'|'command'):HostCapabilityDefinition<unknown,unknown>=>({
  capability_id:`io.molis.work.casebook.${name}`,version:1,operation,
});
const authorization=capability('interaction-authorization','query');
const setAuthorization=capability('set-interaction-authorization','command');
const read=capability('read-interaction-facts','query');
const contexts=capability('read-goal-contexts','query');
const receipts=capability('read-operation-receipts','query');
export function registerCasebookCapabilities(host:LocalHost<MolisWorkProjectRuntime>):void {
  const journal=(runtime:MolisWorkProjectRuntime,input:unknown)=>{
    const i=input as {board_id:string;project_ref:string};
    runtime.interactionObserver ??=new InteractionObserver(runtime.store,runtime.coordinator,i.board_id,i.project_ref);
    return runtime.interactionObserver.journal;
  };
  host.register(authorization,(r,i)=>{
    const j=journal(r,i),purpose=(i as {request:{purpose:string}}).request.purpose;
    if(![PURPOSE,CONTEXT_PURPOSE,RECEIPTS_PURPOSE].includes(purpose as typeof PURPOSE))throw new CasebookError('not_authorized');
    return (purpose===RECEIPTS_PURPOSE?new ReceiptJournal(j.db,j.board,j.project):purpose===CONTEXT_PURPOSE?new InteractionContexts(j).authorization:j).authorization();
  });
  host.register(setAuthorization,(r,i)=>{
    const j=journal(r,i), c=new InteractionContexts(j).authorization;
    const raw=(i as {request:AuthorizationRequest}).request;
    exact(raw,['project_ref','action','purpose','include_goal_context','actor_ref','user_action_ref','user_confirmed','idempotency_key']);
    if(raw.include_goal_context!==undefined && (raw.include_goal_context!==true || raw.purpose!==PURPOSE)) throw new CasebookError('invalid_request');
    const {include_goal_context,...request}=raw;
    return r.store.immediate(()=>{
      return (request.purpose===RECEIPTS_PURPOSE?new ReceiptJournal(j.db,j.board,j.project):request.purpose===CONTEXT_PURPOSE?c:j).setAuthorization(include_goal_context?raw:request,result=>{
        // This callback runs only for a new action, inside the same transaction.
        // A historical aggregate replay returns its saved receipt without touching any current scope.
        if(include_goal_context) return {...result,goal_context:c.setAuthorization({...request,purpose:CONTEXT_PURPOSE})};
        if(request.purpose===PURPOSE && request.action==='remove' && ['active','paused'].includes(c.scope()?.state??''))
          c.setAuthorization({...request,purpose:CONTEXT_PURPOSE});
        return result;
      });
    });
  });
  host.register(read,(r,i)=>journal(r,i).read((i as {request:ReadRequest}).request));
  host.register(contexts,(r,i)=>new InteractionContexts(journal(r,i)).read((i as {request:ContextRequest}).request));
  host.register(receipts,(r,i)=>{journal(r,i);return r.interactionObserver!.receipts.journal.readReceipts((i as {request:ReceiptReadRequest}).request);});
}
export interface LegacyPlanningProvider {
  readEligibility(input:unknown):unknown;
  setAuthorization(input:unknown):unknown;
  readPlanningEvents(input:unknown):unknown;
}
/** In-process embedding must supply the already-owned project client, never a database path. */
export class MolisWorkCasebookIntegration {
  constructor(private options:{client:LocalHostProjectClient;
    verifyUserAction?:(request:AuthorizationRequest)=>boolean|Promise<boolean>;
    legacyPlanning?:LegacyPlanningProvider}) {}
  private input(request?:unknown) {
    return {board_id:this.options.client.project.board_id,project_ref:this.options.client.project.project_id,request};
  }
  async readInteractionAuthorization(input:{project_ref:string;purpose:typeof PURPOSE|typeof CONTEXT_PURPOSE|typeof RECEIPTS_PURPOSE}) {
    exact(input,['project_ref','purpose']);
    if(input.project_ref!==this.options.client.project.project_id || !([PURPOSE,CONTEXT_PURPOSE,RECEIPTS_PURPOSE] as string[]).includes(input.purpose)) throw new CasebookError('not_authorized');
    return this.options.client.invoke(authorization,this.input(input));
  }
  async setInteractionAuthorization(request:AuthorizationRequest) {
    if(request.project_ref!==this.options.client.project.project_id || !(await this.options.verifyUserAction?.(request)))
      throw new CasebookError('not_authorized');
    return this.options.client.invoke(setAuthorization,this.input(request));
  }
  async readInteractionFacts(request:ReadRequest):Promise<Envelope> {
    return await this.options.client.invoke(read,this.input(request)) as Envelope;
  }
  async readGoalContexts(request:ContextRequest):Promise<ContextEnvelope> {
    return await this.options.client.invoke(contexts,this.input(request)) as ContextEnvelope;
  }
  async readOperationReceipts(request:ReceiptReadRequest):Promise<ReceiptEnvelope>{return await this.options.client.invoke(receipts,this.input(request)) as ReceiptEnvelope;}
  // Explicit delegation preserves the old provider's own source, authorization and cursor semantics.
  // No adapter opens a legacy database or maps a legacy epoch to an interaction epoch.
  readEligibility(input:unknown) { if(!this.options.legacyPlanning) throw new CasebookError('legacy_planning_provider_required'); return this.options.legacyPlanning.readEligibility(input); }
  setAuthorization(input:unknown) { if(!this.options.legacyPlanning) throw new CasebookError('legacy_planning_provider_required'); return this.options.legacyPlanning.setAuthorization(input); }
  readPlanningEvents(input:unknown) { if(!this.options.legacyPlanning) throw new CasebookError('legacy_planning_provider_required'); return this.options.legacyPlanning.readPlanningEvents(input); }
}
