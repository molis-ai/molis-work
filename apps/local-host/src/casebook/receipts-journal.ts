import {InteractionJournal,digest} from './journal.js';
import {CasebookError,exact,RECEIPTS_PURPOSE} from './contract.js';
import {RECEIPTS_CONTRACT,RECEIPTS_VERSION,validReceipt,type OperationReceipt,type ReceiptReadRequest,type ReceiptEnvelope} from './receipts-contract.js';
import type {SqliteDatabase} from '@molis-ai/molis-work-storage';
/** Same authorization lifecycle and bounded journal storage, independent purpose/epoch. */
export class ReceiptJournal extends InteractionJournal {
 constructor(db:SqliteDatabase,board:string,project:string){super(db,board,project,RECEIPTS_PURPOSE);}
 appendReceipt(epoch:string,input:Omit<OperationReceipt,'seq'|'source_digest'>){
  return this.db.transaction(()=>{
   const s=this.scope();if(!s||s.state!=='active'||s.epoch!==epoch)return null;
   const old=this.db.prepare('SELECT board,epoch,body FROM casebook_interaction_facts WHERE id=?').get(input.receipt_id) as {board:string;epoch:string;body:string}|undefined;
   if(old){const {seq,source_digest,...prior}=JSON.parse(old.body);if(old.board!==this.key||old.epoch!==epoch||digest(prior)!==digest(input))throw new CasebookError('idempotency_conflict');return JSON.parse(old.body);}
   const {seq}=this.db.prepare('SELECT COALESCE(MAX(seq),0)+1 seq FROM casebook_interaction_facts WHERE board=? AND epoch=?').get(this.key,epoch) as {seq:number};
   const body={...input,seq},receipt={...body,source_digest:digest(body)};
   if(!validReceipt(receipt)||Buffer.byteLength(JSON.stringify(receipt))>48*1024)throw new CasebookError('source_projection_invalid');
   this.db.prepare('INSERT INTO casebook_interaction_facts VALUES (?,?,?,?,?)').run(this.key,epoch,seq,input.receipt_id,JSON.stringify(receipt));return receipt;
  }).immediate();
 }
 readReceipts(input:ReceiptReadRequest):ReceiptEnvelope {
  exact(input,['project_ref','schema_version','authorization_epoch','after_cursor','limit']);
  if(input.schema_version!==RECEIPTS_VERSION)throw new CasebookError('unsupported_schema_version');
  const s=this.scope();if(!s||s.state!=='active'||s.epoch!==input.authorization_epoch||input.project_ref!==this.project)throw new CasebookError('not_authorized');
  if(!Number.isSafeInteger(input.after_cursor)||input.after_cursor<0||!Number.isInteger(input.limit)||input.limit<1||input.limit>100)throw new CasebookError('invalid_request');
  const {max}=this.db.prepare('SELECT COALESCE(MAX(seq),0) max FROM casebook_interaction_facts WHERE board=? AND epoch=?').get(this.key,s.epoch) as {max:number};
  if(input.after_cursor>max)throw new CasebookError('cursor_gap');
  const rows=this.db.prepare('SELECT body FROM casebook_interaction_facts WHERE board=? AND epoch=? AND seq>? ORDER BY seq LIMIT ?').all(this.key,s.epoch,input.after_cursor,input.limit) as {body:string}[];
  const receipts:OperationReceipt[]=[];let bytes=0;
  for(const row of rows){if(bytes+Buffer.byteLength(row.body)>700*1024)break;bytes+=Buffer.byteLength(row.body);const r=JSON.parse(row.body);const {source_digest,...body}=r;if(!validReceipt(r)||digest(body)!==source_digest)throw new CasebookError('source_projection_invalid');if(r.seq!==input.after_cursor+receipts.length+1)throw new CasebookError('cursor_gap');receipts.push(r);}
  const {incomplete}=this.db.prepare(`SELECT COUNT(*) incomplete FROM casebook_interaction_facts a WHERE a.board=? AND a.epoch=? AND json_extract(a.body,'$.phase')='attempt' AND NOT EXISTS (SELECT 1 FROM casebook_interaction_facts b WHERE b.board=a.board AND b.epoch=a.epoch AND json_extract(b.body,'$.operation_id')=json_extract(a.body,'$.operation_id') AND json_extract(b.body,'$.phase')='result')`).get(this.key,s.epoch) as {incomplete:number};
  const to=receipts.at(-1)?.seq??input.after_cursor;
  return{contract_id:RECEIPTS_CONTRACT,schema_version:RECEIPTS_VERSION,project_ref:this.project,authorization_epoch:s.epoch,stream_id:`${RECEIPTS_CONTRACT}:${s.epoch}`,exported_at:new Date().toISOString(),cursor:{after_exclusive:input.after_cursor,to_inclusive:to,has_more:to<max},receipts,
   coverage:{recording_since:s.since,paused_windows:s.pauses,unpersisted_failures:this.unpersistedFailures,incomplete_operations:incomplete,historical_backfill:false,missing:['before_authorization','paused_windows','ui_visibility_and_user_understanding','host_intent_detours_and_delivery','mcp_context_resolve_and_bootstrap','transport_rejections_before_project_open','business_text_and_option_labels','unlisted_capabilities_and_legacy_withProject','process_crash_or_write_failure','running_source_commit_digest']}};
 }
}
