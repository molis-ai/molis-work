import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { createCasebookUserActionSigner, createCasebookUserActionVerifier } from '../apps/local-host/src/casebook/user-action.js';
import { PURPOSE, CONTEXT_PURPOSE, type AuthorizationRequest } from '../apps/local-host/src/casebook/contract.js';

const intent: Omit<AuthorizationRequest,'user_action_ref'> = {project_ref:'project',actor_ref:'github:123',purpose:PURPOSE,action:'join',include_goal_context:true,user_confirmed:true,idempotency_key:'click-1'};
function fixture() {
 let now=Date.parse('2026-09-09T00:00:00Z');
 const config={secret:randomBytes(32).toString('base64url'),audience:'isolated-owner',clock:()=>new Date(now)};
 return {config,sign:createCasebookUserActionSigner(config),verify:createCasebookUserActionVerifier(config),advance:(ms:number)=>{now+=ms;}};
}
test('signed action binds every field and owner audience, rejects plain claims and malformed proofs',()=>{
 const f=fixture(); const request={...intent,user_action_ref:f.sign(intent)};
 assert.equal(f.verify(request),true);assert.ok(request.user_action_ref.length<200);
 for(const change of [{project_ref:'other'},{actor_ref:'github:456'},{purpose:CONTEXT_PURPOSE},{action:'remove'},{include_goal_context:undefined},{idempotency_key:'click-2'},{user_confirmed:false},{extra:'hidden'}])
   assert.equal(f.verify({...request,...change} as AuthorizationRequest),false);
 for(const proof of ['true','verified-user-action','',request.user_action_ref+'x',request.user_action_ref.replace('cbua1','cbua2'),'x'.repeat(201)])
   assert.equal(f.verify({...request,user_action_ref:proof}),false);
 assert.equal(createCasebookUserActionVerifier({...f.config,audience:'other-owner'})(request),false);
 assert.equal(createCasebookUserActionVerifier({...f.config,secret:randomBytes(32).toString('base64url')})(request),false);
 for(const bad of [null,{},[],{...request,user_action_ref:42}]) assert.equal(f.verify(bad as AuthorizationRequest),false);
});
test('short proof expires at the exact boundary, rejects future and extended windows',()=>{
 const f=fixture();const request={...intent,user_action_ref:f.sign(intent)};
 f.advance(-1000);assert.equal(f.verify(request),false);f.advance(60999);assert.equal(f.verify(request),true);
 f.advance(1);assert.equal(f.verify(request),false);
 assert.throws(()=>createCasebookUserActionSigner({...f.config,ttlSeconds:121}));
 assert.throws(()=>createCasebookUserActionSigner({...f.config,ttlSeconds:0}));
 const long=createCasebookUserActionSigner({...f.config,ttlSeconds:120});
 assert.equal(f.verify({...intent,user_action_ref:long(intent)}),true);
});
test('signer requires explicit valid intent and strong separate configuration',()=>{
 const f=fixture();
 for(const change of [{action:'unknown'},{purpose:'legacy'},{include_goal_context:false},{user_confirmed:false},{actor_ref:''},{project_ref:''},{idempotency_key:''},{extra:'hidden'}])
   assert.throws(()=>f.sign({...intent,...change} as typeof intent));
 assert.throws(()=>f.sign({...intent,purpose:CONTEXT_PURPOSE}));
 for(const factory of [createCasebookUserActionSigner,createCasebookUserActionVerifier]) {
   assert.throws(()=>factory({...f.config,secret:''}));assert.throws(()=>factory({...f.config,secret:'short'}));
   assert.throws(()=>factory({...f.config,audience:''}));
 }
});
