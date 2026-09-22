import { REASON_CODES, RECOVERY_ACTIONS } from './reason-codes.js';
import type { ResultReason } from './contract.js';
const codes=new Set(REASON_CODES);
const actions=new Set<string>(RECOVERY_ACTIONS);
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export function reasonCode(value:unknown):string {
  return typeof value==='string'&&codes.has(value)?value:'unknown';
}
/** Keep only exact existing machine fields. Human remediation/message/facts are never copied. */
export function resultReasons(output:unknown,threw:boolean):ResultReason[] {
  const result=object(output);
  const reasons=threw?[{code:result.code,facts:result.details}]:Array.isArray(result.unmet_reasons)?result.unmet_reasons:Array.isArray(result.reasons)?result.reasons:[];
  return reasons.map(value=>{
    const r=object(value),code=reasonCode(r.code),details=object(r.facts);
    const next=typeof details.next_action==='string'&&actions.has(details.next_action)?details.next_action:null;
    // Unknown reason codes cannot smuggle an otherwise recognized recovery instruction.
    const recovery=code!=='unknown'&&(next!==null||typeof details.requires_user_confirmation==='boolean'||typeof details.retry_same_idempotency_key==='boolean')?{
      next_action:next,
      requires_user_confirmation:typeof details.requires_user_confirmation==='boolean'?details.requires_user_confirmation:null,
      retry_same_idempotency_key:typeof details.retry_same_idempotency_key==='boolean'?details.retry_same_idempotency_key:null,
    }:null;
    return {code,recovery};
  });
}
