import { conforms, projectDiscoverySchema, authorizationSchema, authorizationActionSchema, goalContextSchema } from './schema.js';
import { createHash } from 'node:crypto';
import { parseProjectRecoveryDetails } from '../project-recovery-details.js';
import { CasebookError, CONTRACT, VERSION, type ReadRequest, type AuthorizationRequest, type Envelope, type PURPOSE, type CONTEXT_PURPOSE, type RECEIPTS_PURPOSE, type ContextRequest, type ContextEnvelope } from './contract.js';
import {RECEIPTS_CONTRACT,RECEIPTS_VERSION,operationReceiptsSchema,connectionDiagnosticsSchema,type ReceiptReadRequest,type ReceiptEnvelope,type ConnectionDiagnostics} from './receipts-contract.js';

/** Network-only consumer: never imports the local host, filesystem, SQLite or a project snapshot. */
export class MolisWorkCasebookClient {
  private base:URL;
  constructor(private options:{baseUrl:string;token:string;projectRef?:string;timeoutMs?:number}) {
    this.base=new URL(options.baseUrl);
    if(this.base.username || this.base.password || this.base.search || this.base.hash || this.base.pathname!=='/' ||
       !((this.base.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(this.base.hostname)) || this.base.protocol==='https:'))
      throw new CasebookError('invalid_endpoint');
    if(options.token.length<32) throw new CasebookError('invalid_credential');
  }
  private async call(method:string,input:{project_ref:string}):Promise<unknown> {
    if(method!=='projects'&&(!this.options.projectRef||input.project_ref!==this.options.projectRef)) throw new CasebookError('not_authorized');
    let response:Response;
    try {
      response=await fetch(new URL(method==='projects'?'/casebook/v1/projects':`/casebook/v1/${encodeURIComponent(this.options.projectRef!)}/${method}`,this.base),{
        method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${this.options.token}`},
        body:JSON.stringify(method==='projects'?{}:input),redirect:'error',signal:AbortSignal.timeout(this.options.timeoutMs??5000)});
    } catch(error) { throw new CasebookError(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name)?'source_timeout':'source_unavailable'); }
    // Bound actual streamed bytes, including chunked responses, before JSON parsing.
    const reader=response.body?.getReader(); const chunks:Uint8Array[]=[];let size=0;
    if(!reader) throw new CasebookError('invalid_response');
    try {
      while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length;
        if(size>1024*1024) { await reader.cancel();throw new CasebookError('response_too_large'); } chunks.push(value); }
    } catch(error) { if(error instanceof CasebookError) throw error; throw new CasebookError(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name)?'source_timeout':'source_unavailable'); }
    let body:unknown;
    try { body=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new CasebookError('invalid_response'); }
    if(!response.ok) {
      const codes=new Set(['not_authorized','capability_unavailable','invalid_request','unsupported_schema_version','unknown_field','cursor_gap','idempotency_conflict','authorization_state_conflict','source_unavailable','project_recovery_missing','project_recovery_requires_migration','project_recovery_unsupported_schema','project_recovery_board_missing']);
      const code=(body as {code?:unknown})?.code;
      const details=code==='project_recovery_requires_migration'?parseProjectRecoveryDetails((body as {details?:unknown}).details):undefined;
      throw new CasebookError(typeof code==='string' && codes.has(code)?code:'source_unavailable',details);
    }
    return body;
  }
  async listProjects():Promise<{contract_id:'goalboard.casebook.projects';schema_version:'1.0.0';projects:{project_ref:string;project_name:string}[]}>{
    const result=await this.call('projects',{project_ref:''});if(!conforms(result,projectDiscoverySchema))throw new CasebookError('invalid_response');
    const typed=result as {contract_id:'goalboard.casebook.projects';schema_version:'1.0.0';projects:{project_ref:string;project_name:string}[]};
    if(new Set(typed.projects.map(p=>p.project_ref)).size!==typed.projects.length)throw new CasebookError('invalid_response');return typed;
  }
  async readInteractionAuthorization(input:{project_ref:string;purpose:typeof PURPOSE|typeof CONTEXT_PURPOSE|typeof RECEIPTS_PURPOSE}) {
    const value=await this.call('authorization',input);
    return this.checkedAuthorization(value,input,false);
  }
  async setInteractionAuthorization(input:AuthorizationRequest) {
    const value=await this.call('set-authorization',input);
    return this.checkedAuthorization(value,input,true);
  }
  private checkedAuthorization(value:unknown,input:{project_ref:string;purpose:string},action:boolean):{
    project_ref:string;purpose:string;state:string;authorization_epoch:string|null;deletion_required:boolean;
  } {
    if(!conforms(value,action?authorizationActionSchema:authorizationSchema)) throw new CasebookError('invalid_response');
    const status=value as {project_ref:string;purpose:string;state:string;authorization_epoch:string|null;deletion_required:boolean};
    if(status.project_ref!==input.project_ref || status.purpose!==input.purpose ||
       (status.state==='not_joined')!==(status.authorization_epoch===null) || (status.authorization_epoch!==null && !status.authorization_epoch.length) || status.deletion_required!==(status.state==='removed')) throw new CasebookError('invalid_response');
    const details=value as Record<string,unknown>;
    if(action && (details.action_receipt as {purpose:string}).purpose!==input.purpose) throw new CasebookError('invalid_response');
    if(details.goal_context) {
      const context=details.goal_context as {project_ref:string;purpose:string;state:string;authorization_epoch:string|null;deletion_required:boolean;action_receipt:{purpose:string}};
      if(context.project_ref!==input.project_ref || context.purpose!=='casebook.goal-context.v1' || context.action_receipt.purpose!==context.purpose ||
         !context.authorization_epoch || context.deletion_required!==(context.state==='removed')) throw new CasebookError('invalid_response');
    }
    return status;
  }
  async readGoalContexts(input:ContextRequest):Promise<ContextEnvelope> {
    const value=await this.call('goal-contexts',input) as ContextEnvelope;
    if(!conforms(value,goalContextSchema) || value.project_ref!==input.project_ref || value.authorization_epoch!==input.authorization_epoch || value.context_authorization_epoch!==input.context_authorization_epoch ||
       value.contexts.some(c=>!input.operation_ids.includes(c.operation_id) || (()=>{const {source_digest,...body}=c;return createHash('sha256').update(JSON.stringify(body)).digest('hex')!==source_digest;})()) ||
       value.missing_operation_ids.some(id=>!input.operation_ids.includes(id)) || input.operation_ids.some(id=>!value.contexts.some(c=>c.operation_id===id)&&!value.missing_operation_ids.includes(id))) throw new CasebookError('invalid_response');
    return value;
  }
  async readInteractionFacts(input:ReadRequest):Promise<Envelope> {
    const value=await this.call('facts',input) as Envelope;
    if(!value || typeof value!=='object') throw new CasebookError('invalid_response');
    if(value.contract_id!==CONTRACT || value.schema_version!==VERSION) throw new CasebookError('unsupported_schema_version');
    if(value.project_ref!==input.project_ref || value.authorization_epoch!==input.authorization_epoch ||
       value.stream_id!==`${CONTRACT}:${input.authorization_epoch}` || value.cursor?.after_exclusive!==input.after_cursor ||
       !Array.isArray(value.facts) || value.facts.some((f,i)=>f.seq!==input.after_cursor+i+1) ||
       value.cursor.to_inclusive!==(value.facts.at(-1)?.seq??input.after_cursor)) throw new CasebookError('invalid_response');
    if(!conforms(value) || value.facts.some(f=>{
      const {source_digest,...body}=f;
      return createHash('sha256').update(JSON.stringify(body)).digest('hex')!==source_digest;
    })) throw new CasebookError('invalid_response');
    return value;
  }
  async readOperationReceipts(input:ReceiptReadRequest):Promise<ReceiptEnvelope>{
    const value=await this.call('operation-receipts',input) as ReceiptEnvelope;
    if(!value||value.contract_id!==RECEIPTS_CONTRACT||value.schema_version!==RECEIPTS_VERSION)throw new CasebookError('unsupported_schema_version');
    if(!conforms(value,operationReceiptsSchema)||value.project_ref!==input.project_ref||value.authorization_epoch!==input.authorization_epoch||value.stream_id!==`${RECEIPTS_CONTRACT}:${input.authorization_epoch}`||value.cursor.after_exclusive!==input.after_cursor||value.receipts.length>input.limit||value.cursor.to_inclusive!==(value.receipts.at(-1)?.seq??input.after_cursor)||value.receipts.some((r,i)=>{const {source_digest,...body}=r;return r.seq!==input.after_cursor+i+1||createHash('sha256').update(JSON.stringify(body)).digest('hex')!==source_digest;}))throw new CasebookError('invalid_response');
    return value;
  }
  async readConnectionDiagnostics(input:{project_ref:string}):Promise<ConnectionDiagnostics>{
    const value=await this.call('diagnostics',input) as ConnectionDiagnostics;
    if(!conforms(value,connectionDiagnosticsSchema)||value.project_ref!==input.project_ref)throw new CasebookError('invalid_response');return value;
  }
}
export { CasebookError, CONTRACT, VERSION, PURPOSE, CONTEXT_PURPOSE, RECEIPTS_PURPOSE } from './contract.js';
export {RECEIPTS_CONTRACT,RECEIPTS_VERSION,operationReceiptsSchema,connectionDiagnosticsSchema} from './receipts-contract.js';
export type {ReceiptReadRequest,ReceiptEnvelope,OperationReceipt,ConnectionDiagnostics} from './receipts-contract.js';
export type { Envelope, ReadRequest, AuthorizationRequest } from './contract.js';
export type { ProjectRecoveryDetails } from '../project-recovery-details.js';

export { createCasebookUserActionSigner, createCasebookUserActionVerifier } from './user-action.js';
export type { CasebookUserActionIntent, CasebookUserActionProofOptions } from './user-action.js';
