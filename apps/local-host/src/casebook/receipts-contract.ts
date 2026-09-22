import type {ResultReason} from './contract.js';
import {conforms,type Schema} from './schema.js';
export const RECEIPTS_CONTRACT='goalboard.casebook.operation-receipts';
export const RECEIPTS_VERSION='1.0.0';
export interface ReceiptReadRequest {project_ref:string;schema_version:typeof RECEIPTS_VERSION;authorization_epoch:string;after_cursor:number;limit:number;}
export interface ReceiptScope {requirement_refs:string[];event_refs:string[];concern_refs:string[];action_ref:string|null;truncated:boolean;}
export interface OperationReceipt {
 receipt_id:string;seq:number;source_digest:string;operation_id:string;occurred_at:string;
 phase:'attempt'|'result';channel:'local-host.capability.v1'|'web.goal-events.v1';capability:string;capability_version:number;
 runtime:{node_version:string;package_version:string|null;projection_version:typeof RECEIPTS_VERSION};
 request_key:string|null;outcome:'pending'|'returned'|'threw';replayed:boolean|null;
 selection:{goal_ref:string|null;proposal_ref:string|null;request_ref:string|null;decision_ref:string|null;selected_option_ref:string|null;scope:ReceiptScope|null;expected_config_version:number|null;expected_agreement_version:number|null;base_event_cursor:number|null;content_comparison:string};
 condition:{config_version:number|null;agreement_version:number|null;goal_event_cursor:number|null;proposal_version:number|null;proposal_state:string|null};
 guidance:{observation:'api_return_only';reasons:ResultReason[];reasons_truncated:boolean;decision_options:string[];options_truncated:boolean;semantic_next_action:'review_affected_subgraph'|'continue'|null;requires_new_confirmation:boolean|null};
 decision:{request_ref:string|null;decision_ref:string|null;scope:ReceiptScope|null;effect_kinds:string[];config_version:number|null;agreement_version:number|null;commitment_comparison:string|null}|null;
 saved:{recorded:boolean|null;completion_applied:boolean|null;goal_ref:string|null;event_refs:string[];proposal_ref:string|null;proposal_version:number|null;proposal_state:string|null;applied_item_refs:string[];conflict_item_refs:string[];refs_truncated:boolean}|null;
}
export interface ReceiptEnvelope {
 contract_id:typeof RECEIPTS_CONTRACT;schema_version:typeof RECEIPTS_VERSION;project_ref:string;authorization_epoch:string;
 stream_id:string;exported_at:string;cursor:{after_exclusive:number;to_inclusive:number;has_more:boolean};receipts:OperationReceipt[];
 coverage:{recording_since:string;paused_windows:number;unpersisted_failures:number;incomplete_operations:number;historical_backfill:false;missing:string[]};
}
const s:Schema={type:'string',maxLength:200},h:Schema={type:'string',pattern:'^[a-f0-9]{64}$'},hn:Schema={...h,type:['string','null']},n:Schema={type:['integer','null'],minimum:0},b:Schema={type:'boolean'},bn:Schema={type:['boolean','null']};
const arr=(items:Schema,maxItems=20):Schema=>({type:'array',items,maxItems});
const o=(properties:Record<string,Schema>):Schema=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const scope=o({requirement_refs:arr(h),event_refs:arr(h),concern_refs:arr(h),action_ref:hn,truncated:b});
const nullable=(x:Schema):Schema=>({...x,type:['object','null']});
const condition=o({config_version:n,agreement_version:n,goal_event_cursor:n,proposal_version:n,proposal_state:{enum:['pending','partially_applied','approved','rejected','superseded','dismissed','closed',null]}});
// Reuse the exact machine-reason whitelist; never allow arbitrary error messages.
import {interactionFactsSchema} from './schema.js';
export const operationReceiptSchema=o({receipt_id:s,seq:{type:'integer',minimum:1},source_digest:h,operation_id:s,occurred_at:s,
 phase:{enum:['attempt','result']},channel:{enum:['local-host.capability.v1','web.goal-events.v1']},capability:s,capability_version:{type:'integer',minimum:1},
 runtime:o({node_version:s,package_version:{type:['string','null'],maxLength:100},projection_version:{const:RECEIPTS_VERSION}}),request_key:hn,outcome:{enum:['pending','returned','threw']},replayed:bn,
 selection:o({goal_ref:hn,proposal_ref:hn,request_ref:hn,decision_ref:hn,selected_option_ref:hn,scope:nullable(scope),expected_config_version:n,expected_agreement_version:n,base_event_cursor:n,content_comparison:h}),condition,
 guidance:o({observation:{const:'api_return_only'},reasons:interactionFactsSchema.properties!.facts!.items!.properties!.result_reasons!,reasons_truncated:b,decision_options:arr(h),options_truncated:b,semantic_next_action:{enum:['review_affected_subgraph','continue',null]},requires_new_confirmation:bn}),
 decision:nullable(o({request_ref:hn,decision_ref:hn,scope:nullable(scope),effect_kinds:arr({enum:['accept_requirements','reject_requirements','accept_concerns','reject_concerns','authorize_action','deny_action','authorize_agreement_change']}),config_version:n,agreement_version:n,commitment_comparison:hn})),
 saved:nullable(o({recorded:bn,completion_applied:bn,goal_ref:hn,event_refs:arr(h),proposal_ref:hn,proposal_version:n,proposal_state:condition.properties!.proposal_state!,applied_item_refs:arr(h),conflict_item_refs:arr(h),refs_truncated:b})),
});
export const operationReceiptsSchema={...o({contract_id:{const:RECEIPTS_CONTRACT},schema_version:{const:RECEIPTS_VERSION},project_ref:s,authorization_epoch:s,stream_id:s,exported_at:s,
 cursor:o({after_exclusive:{type:'integer',minimum:0},to_inclusive:{type:'integer',minimum:0},has_more:b}),receipts:arr(operationReceiptSchema,100),
 coverage:o({recording_since:s,paused_windows:{type:'integer',minimum:0},unpersisted_failures:{type:'integer',minimum:0},incomplete_operations:{type:'integer',minimum:0},historical_backfill:{const:false},missing:arr(s,100)})}),
 $schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://goalboard.dev/contracts/casebook/operation-receipts/1.0.0'};
export const validReceipt=(value:unknown):value is OperationReceipt=>conforms(value,operationReceiptSchema);
export interface ConnectionDiagnostics {contract_id:'goalboard.casebook.connection-diagnostics';schema_version:'1.0.0';project_ref:string;observed_at:string;historical_record:false;project_state:'ready'|'not_open';runtime:OperationReceipt['runtime'];available_methods:string[];missing:string[];}
export const connectionDiagnosticsSchema=o({contract_id:{const:'goalboard.casebook.connection-diagnostics'},schema_version:{const:'1.0.0'},project_ref:s,observed_at:s,historical_record:{const:false},project_state:{enum:['ready','not_open']},runtime:operationReceiptSchema.properties!.runtime!,available_methods:arr(s),missing:arr(s)});
