import { REASON_CODES, RECOVERY_ACTIONS } from './reason-codes.js';
/** Source of the generated, strict JSON Schema and the consumer's runtime validation. */
export interface Schema { type?:string|string[]; const?:unknown; enum?:unknown[]; properties?:Record<string,Schema>;
  required?:string[]; additionalProperties?:false; items?:Schema; minimum?:number; maximum?:number; maxItems?:number; maxLength?:number; pattern?:string; }
const string:Schema={type:'string',maxLength:200};
const hash:Schema={type:'string',pattern:'^[a-f0-9]{64}$'};
const hashOrNull:Schema={type:['string','null'],pattern:'^[a-f0-9]{64}$'};
const nullable:Schema={type:['string','null'],maxLength:200};
const integer:Schema={type:['integer','null'],minimum:1};
const bool:Schema={type:'boolean'};
const nullableBool:Schema={type:['boolean','null']};
const strings:Schema={type:'array',items:string,maxItems:100};
const object=(properties:Record<string,Schema>):Schema=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const condition={goal_ref:hashOrNull,contract_revision:integer,action_condition:hashOrNull,progress:nullable,display_status:nullable};
const selection=object({event_refs:{type:"array",maxItems:20,items:hash},requirement_refs:{type:"array",maxItems:20,items:hash},expected_config_version:{type:["integer","null"],minimum:0},expected_agreement_version:{type:["integer","null"],minimum:0},goal_ref:hashOrNull,proposal_ref:hashOrNull,obligation_ref:hashOrNull,
  evidence_refs:{type:['array','null'],items:hash,maxItems:100},action_ref:hashOrNull,action_condition:hashOrNull,
  contract_revision:integer,content_comparison:hash});
const saved=object({event_refs:{type:"array",maxItems:20,items:hash},review_ref:hashOrNull,evidence_refs:{type:['array','null'],items:hash,maxItems:100},goal_ref:hashOrNull,proposal_ref:hashOrNull,state:nullable});
const reason:Schema={enum:[...REASON_CODES,'unknown']};
const resultReason=object({code:reason,recovery:{...object({next_action:{enum:[...RECOVERY_ACTIONS,null]},requires_user_confirmation:nullableBool,retry_same_idempotency_key:nullableBool}),type:['object','null']}});
const eventState=object({work_status:{enum:['open','completed','cancelled']},config_version:{type:'integer',minimum:0},agreement_version:{type:'integer',minimum:0},goal_event_cursor:{type:'integer',minimum:0},can_record:bool,completion_effect:bool,
 requirement_refs:{type:'array',maxItems:20,items:hash},unmet_requirement_refs:{type:'array',maxItems:20,items:hash},pending_decision_refs:{type:'array',maxItems:20,items:hash},blocking_concern_refs:{type:'array',maxItems:20,items:hash},refs_truncated:bool});
const fact=object({channel:{enum:['local-host.capability.v1','web.goal-events.v1']},event_state:{...eventState,type:['object','null']},fact_id:string,seq:{type:'integer',minimum:1},occurred_at:string,operation_id:string,
  kind:{enum:['attempt','result','correction']},capability:string,capability_version:{type:'integer',minimum:1},request_key:hashOrNull,
  selection,condition:object(condition),accepted:nullableBool,projection_version:{const:'2.0.0'},
  related_states:{type:'array',maxItems:20,items:object({object_ref:hash,object_type:{enum:['run','claim']},state:nullable})},related_states_truncated:bool,
  outcome:{enum:['pending','returned','threw']},reason_code:{enum:[...REASON_CODES,'unknown',null]},result_reasons:{type:'array',maxItems:100,items:resultReason},replayed:nullableBool,
  saved:{...saved,type:['object','null']},offered:{type:'array',maxItems:20,items:object({...condition,action_ref:hashOrNull,action_kind:nullable,status:nullable,requires_parent_confirmation:nullableBool,reason_codes:{type:'array',maxItems:100,items:reason}})},
  offered_truncated:bool,source_digest:hash,corrects_fact_id:nullable});
export const interactionFactsSchema={
  $schema:'https://json-schema.org/draft/2020-12/schema',
  $id:'https://goalboard.dev/contracts/casebook/interaction-facts/2.0.0',
  ...object({contract_id:{const:'goalboard.casebook.interaction-facts'},schema_version:{const:'2.0.0'},project_ref:string,
    authorization_epoch:string,exported_at:string,stream_id:string,
    cursor:object({after_exclusive:{type:'integer',minimum:0},to_inclusive:{type:'integer',minimum:0},has_more:bool}),
    coverage:object({recording_since:string,retained_from_seq:{type:'integer',minimum:1},channels:strings,missing:strings,
      unpersisted_failures:{type:'integer',minimum:0},incomplete_operations:{type:'integer',minimum:0},paused_windows:{type:'integer',minimum:0},historical_backfill:{const:false},external_outcome:{const:'unknown'}}),
    facts:{type:'array',maxItems:100,items:fact}}),
};
export function conforms(value:unknown,schema:Schema=interactionFactsSchema):boolean {
  if(Object.hasOwn(schema,'const') && value!==schema.const) return false;
  if(schema.enum && !schema.enum.includes(value)) return false;
  if(schema.type) {
    const kinds=Array.isArray(schema.type)?schema.type:[schema.type];
    const actual=value===null?'null':Array.isArray(value)?'array':typeof value;
    if(!kinds.some(k=>k===actual || k==='integer' && typeof value==='number' && Number.isSafeInteger(value))) return false;
  }
  if(typeof value==='number' && ((schema.minimum!==undefined && value<schema.minimum)||(schema.maximum!==undefined && value>schema.maximum))) return false;
  if(typeof value==='string' && schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
  if(typeof value==='string' && schema.maxLength!==undefined && value.length>schema.maxLength) return false;
  if(Array.isArray(value)) return (schema.maxItems===undefined||value.length<=schema.maxItems) && (!schema.items||value.every(v=>conforms(v,schema.items!)));
  if(value && typeof value==='object' && schema.properties) {
    const record=value as Record<string,unknown>;
    return (schema.required??[]).every(k=>Object.hasOwn(record,k)) && Object.entries(record).every(([k,v])=>
      schema.properties![k]?conforms(v,schema.properties![k]!):schema.additionalProperties!==false);
  }
  return true;
}

export const authorizationSchema=object({
 project_ref:string,purpose:{enum:['casebook.interaction-review.v1','casebook.goal-context.v1','casebook.operation-receipts.v1']},
 state:{enum:['not_joined','active','paused','removed']},authorization_epoch:nullable,deletion_required:bool,
});
const receipt=object({action:{enum:['join','pause','resume','remove']},purpose:authorizationSchema.properties!.purpose!,actor_ref:hash,user_action_ref:hash,recorded_at:string});
export const authorizationActionSchema:Schema={...authorizationSchema,
 required:[...authorizationSchema.required!,'action_receipt'],
 properties:{...authorizationSchema.properties!,action_receipt:receipt,goal_context:{...authorizationSchema,
   required:[...authorizationSchema.required!,'action_receipt'],properties:{...authorizationSchema.properties!,action_receipt:receipt}}}};
export const goalContextSchema={
 $schema:'https://json-schema.org/draft/2020-12/schema',
 $id:'https://goalboard.dev/contracts/casebook/goal-context/2.0.0',
 ...object({contract_id:{const:'goalboard.casebook.goal-context'},schema_version:{const:'2.0.0'},project_ref:string,
 authorization_epoch:string,context_authorization_epoch:string,missing_operation_ids:strings,
 contexts:{type:'array',maxItems:200,items:object({context_id:string,operation_id:string,phase:{enum:['before','after']},captured_at:string,
 goal_ref:hash,goal_id:string,goal_title:{type:'string',maxLength:500},title_truncated:bool,contract_revision:{type:'integer',minimum:1},source_digest:hash})}}),
};

export const projectDiscoverySchema={...object({contract_id:{const:'goalboard.casebook.projects'},schema_version:{const:'1.0.0'},projects:{type:'array',maxItems:100,items:object({project_ref:{type:'string',maxLength:200},project_name:{type:'string',maxLength:500}})}})};
