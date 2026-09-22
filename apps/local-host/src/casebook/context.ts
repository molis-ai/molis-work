import { conforms, goalContextSchema } from './schema.js';
import { randomUUID } from 'node:crypto';
import { InteractionJournal,digest } from './journal.js';
import { CasebookError,CONTEXT_PURPOSE,VERSION,exact,type ContextRequest,type ContextEnvelope,type GoalContext } from './contract.js';
import type { GoalRecord } from '@molis-ai/molis-work-contracts/modules/goals';

/** Only event-time Goal title/identity, under a separate purpose; never a snapshot or mapping scan. */
export class InteractionContexts {
  readonly authorization:InteractionJournal;
  constructor(private journal:InteractionJournal) {
    this.authorization=new InteractionJournal(journal.db,journal.board,journal.project,CONTEXT_PURPOSE);
  }
  capture(epoch:string,operation:string,phase:'before'|'after',goal:GoalRecord,goalRef:string):void {
    const interaction=this.journal.scope(), context=this.authorization.scope();
    if(!interaction || interaction.state!=='active' || interaction.epoch!==epoch || !context || context.state!=='active') return;
    const body={context_id:randomUUID(),operation_id:operation,phase,captured_at:new Date().toISOString(),
      goal_ref:goalRef,goal_id:goal.goal_id,goal_title:goal.title.slice(0,500),title_truncated:goal.title.length>500,
      contract_revision:goal.current_contract_revision};
    const projected={...body,source_digest:digest(body)};
    if(!conforms(projected,goalContextSchema.properties!.contexts!.items!)) throw new CasebookError('source_projection_invalid');
    this.journal.db.prepare('INSERT OR IGNORE INTO casebook_goal_contexts VALUES (?,?,?,?,?,?)')
      .run(this.journal.board,epoch,context.epoch,operation,phase,JSON.stringify(projected));
  }
  read(input:ContextRequest):ContextEnvelope {
    exact(input,['project_ref','schema_version','authorization_epoch','context_authorization_epoch','operation_ids']);
    if(input.schema_version!==VERSION) throw new CasebookError('unsupported_schema_version');
    const i=this.journal.scope(),c=this.authorization.scope();
    if(input.project_ref!==this.journal.project || !i || i.state!=='active' || i.epoch!==input.authorization_epoch ||
      !c || c.state!=='active' || c.epoch!==input.context_authorization_epoch) throw new CasebookError('not_authorized');
    if(!Array.isArray(input.operation_ids) || input.operation_ids.length>100 || input.operation_ids.some(x=>typeof x!=='string'||x.length>200)) throw new CasebookError('invalid_request');
    const contexts:GoalContext[]=[];const missing:string[]=[];
    for(const operation of [...new Set(input.operation_ids)]) {
      const rows=this.journal.db.prepare('SELECT body FROM casebook_goal_contexts WHERE board=? AND interaction_epoch=? AND context_epoch=? AND operation_id=? ORDER BY phase')
        .all(this.journal.board,i.epoch,c.epoch,operation) as {body:string}[];
      if(!rows.length) missing.push(operation);
      for(const row of rows) {
        const value=JSON.parse(row.body) as GoalContext;
        const {source_digest,...body}=value;
        if(!conforms(value,goalContextSchema.properties!.contexts!.items!) || digest(body)!==source_digest) throw new CasebookError('source_projection_invalid');
        contexts.push(value);
      }
    }
    return {contract_id:'goalboard.casebook.goal-context',schema_version:VERSION,project_ref:this.journal.project,
      authorization_epoch:i.epoch,context_authorization_epoch:c.epoch,contexts,missing_operation_ids:missing};
  }
}
