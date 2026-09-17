import { createHmac, timingSafeEqual } from 'node:crypto';
import { CasebookError, PURPOSE, CONTEXT_PURPOSE, RECEIPTS_PURPOSE, type AuthorizationRequest } from './contract.js';

export type CasebookUserActionIntent = Omit<AuthorizationRequest,'user_action_ref'>;
export interface CasebookUserActionProofOptions {
  /** Independent server-only random secret, at least 32 bytes. Never reuse the transport token. */
  secret: string;
  /** Stable identity of the intended owner/environment; must match on both servers. */
  audience: string;
  clock?: () => Date;
}
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200;
const fields=['project_ref','actor_ref','purpose','action','include_goal_context','idempotency_key','user_confirmed'];
function validIntent(value:unknown,withProof=false):value is CasebookUserActionIntent {
  if(!value||typeof value!=='object'||Array.isArray(value)) return false;
  const r=value as Record<string,unknown>;
  return Object.keys(r).every(k=>fields.includes(k)||(withProof&&k==='user_action_ref'))
    && text(r.project_ref)&&text(r.actor_ref)&&text(r.idempotency_key)&&r.user_confirmed===true
    && [PURPOSE,CONTEXT_PURPOSE,RECEIPTS_PURPOSE].includes(r.purpose as typeof PURPOSE)
    && ['join','pause','resume','remove'].includes(r.action as string)
    && (r.include_goal_context===undefined||(r.include_goal_context===true&&r.purpose===PURPOSE));
}
function setup(options:CasebookUserActionProofOptions) {
  if(typeof options?.secret!=='string'||Buffer.byteLength(options.secret)<32||!text(options.audience))
    throw new CasebookError('invalid_user_action_proof_config');
  // Capture configuration once; caller mutation must not change the trust boundary.
  const secret=options.secret,audience=options.audience,clock=options.clock??(()=>new Date());
  return {
    now:()=>Math.floor(clock().getTime()/1000),
    mac:(r:CasebookUserActionIntent,issued:number,expires:number)=>createHmac('sha256',secret).update(JSON.stringify([
      'goalboard.casebook.user-action.v1',audience,issued,expires,r.project_ref,r.actor_ref,r.purpose,r.action,
      r.include_goal_context===true,r.idempotency_key,r.user_confirmed,
    ])).digest('base64url'),
  };
}
/** Invoke only after the current HTTP request verifies membership, case control, CSRF and explicit intent. */
export function createCasebookUserActionSigner(options:CasebookUserActionProofOptions & {ttlSeconds?:number}) {
  const proof=setup(options),ttl=options.ttlSeconds??60;
  if(!Number.isInteger(ttl)||ttl<1||ttl>120) throw new CasebookError('invalid_user_action_proof_config');
  return (request:CasebookUserActionIntent):string=>{
    if(!validIntent(request)) throw new CasebookError('invalid_request');
    const issued=proof.now(),expires=issued+ttl;
    if(!Number.isSafeInteger(issued)||issued<0||!Number.isSafeInteger(expires)) throw new CasebookError('invalid_user_action_proof_config');
    return `cbua1.${issued}.${expires}.${proof.mac(request,issued,expires)}`;
  };
}
/** Opt-in verifier callback. Durable exact replay semantics remain with the owner's authorization journal. */
export function createCasebookUserActionVerifier(options:CasebookUserActionProofOptions) {
  const proof=setup(options);
  return (request:AuthorizationRequest):boolean=>{
    try {
      if(!validIntent(request,true)||!text(request.user_action_ref)) return false;
      const match=/^cbua1\.(0|[1-9][0-9]{0,15})\.(0|[1-9][0-9]{0,15})\.([A-Za-z0-9_-]{43})$/.exec(request.user_action_ref);
      if(!match) return false;
      const issued=Number(match[1]),expires=Number(match[2]),now=proof.now();
      if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||!Number.isSafeInteger(now)
        ||issued>now||expires<=now||expires<=issued||expires-issued>120) return false;
      return timingSafeEqual(Buffer.from(match[3]!),Buffer.from(proof.mac(request,issued,expires)));
    } catch { return false; }
  };
}
