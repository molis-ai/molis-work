import {ActionService} from '@molis-ai/molis-work-kernel';
import type {ActionDefinition} from '@molis-ai/molis-work-contracts/platform/actions';
import assert from 'node:assert/strict';
import test from 'node:test';
import {PersonalAuth} from '@molis-ai/molis-work-app-local-host';
import {createTrialAuthPeer,trialAccountConfig} from '../examples/personal-trial-tools/mock-auth.mjs';
const config=trialAccountConfig('http://127.0.0.1:8787','http://127.0.0.1:4173');
const control={assertCurrent(){}};
function fixture(){const values=new Map<string,string>();const store={assertWritable:()=>{},get:(k:string)=>values.get(k)??null,put:(k:string,v:string)=>{values.set(k,v);},delete:(k:string)=>{values.delete(k);}};let user='alice';const waits:{token?:()=>Promise<void>;identity?:()=>Promise<void>}={};const peer=createTrialAuthPeer({configuration:()=>config,user:()=>user,waits});const auth=new PersonalAuth(config,store,peer.fetch);return {auth,values,store,peer,waits,setUser:(v:string)=>{user=v;}};}
async function login(auth:PersonalAuth,email='alice@example.test'){
 await auth.begin(config.productOrigin+'/account/callback');
 const tx=await auth.authentication.create({purpose:'LOGIN',method:'EMAIL_PASSWORD'},control);
 await auth.authentication.submit(tx.handle,{step:'PASSWORD_LOGIN',email,password:'synthetic-fixture-password'},control);
 const result=await auth.authentication.submit(tx.handle,{step:'COMPLETE'},control);await auth.adoptLogin(false);auth.finishLogin();return result;
}

test('WUA-32 logout fences a waiting action before any late business effect or next-account adoption', async()=>{
 const f=fixture();await login(f.auth);
 const lease=f.auth.accountLease(),entered=Promise.withResolvers<void>(),release=Promise.withResolvers<void>(),settled=Promise.withResolvers<void>();
 let writes=0;
 const service=new ActionService();
 const action:ActionDefinition={capability_id:'fixture.account.wait',version:1,operation:'command',scheduling:'concurrent',action:{title:'Wait',description:'Synthetic external wait',kind:'operation',scope:'project',audiences:['user'],permissions:[],subject_kinds:[],input_schema:{type:'object'},output_schema:{type:'integer'}}};
 const dispose=service.registerProvider({provider:{provider_id:'fixture.account',title:'Account fixture',kind:'system'},definitions:[action],handlers:[{...action,handle:async context=>{entered.resolve();try{await release.promise;await context.beforeEffect();return ++writes;}finally{settled.resolve();}}}]});
 try {
  const pending=service.invoke({actor_id:'alice',project_id:'project',audience:'user',permissions:[],assert_authority_current:()=>lease.assertCurrent()},action,{}, {signal:lease.signal});
  const rejected=assert.rejects(pending);await entered.promise;
  await f.auth.logout();assert.equal(lease.signal.aborted,true);
  f.setUser('bob');await login(f.auth,'bob@example.test');release.resolve();await rejected;
  await settled.promise;
  assert.equal(writes,0,'late external completion cannot write after logout');assert.equal(f.auth.identity()?.userId,'bob');
 }finally{release.resolve();dispose();f.auth.suspend();}
});
