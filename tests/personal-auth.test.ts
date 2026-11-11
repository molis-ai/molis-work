import assert from 'node:assert/strict';
import test from 'node:test';
import {PersonalAuth,PersonalWebSessions,personalCloudConfig} from '@molis-ai/molis-work-app-local-host';
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
test('V2U-04 installation requires the complete V2 environment, with one registered client',()=>{
 assert.deepEqual(personalCloudConfig({MOLIS_WORK_ACCOUNT_CONFIG:JSON.stringify(config)}),config);
 assert.equal(personalCloudConfig({MOLIS_WORK_AUTH_ORIGIN:config.authOrigin,MOLIS_WORK_AUTH_CLIENT_ID:config.clientId}),null);
 assert.throws(()=>personalCloudConfig({MOLIS_WORK_ACCOUNT_CONFIG:'{}'}));
});
test('V2U-04 validated identity selects the Home; credentials stay in the secret store and restore through V2',async()=>{
 const f=fixture();assert.equal(f.auth.identity(),null);await login(f.auth);assert.equal(f.auth.identity()?.userId,'alice');
 assert.doesNotMatch(JSON.stringify(f.auth.identity()),/accessToken|refreshToken/);assert.equal(f.values.size,1);
 const restarted=new PersonalAuth(config,f.store,f.peer.fetch);assert.equal(restarted.identity(),null);assert.equal((await restarted.currentIdentity())?.userId,'alice');
 await f.auth.logout();assert.equal(f.auth.identity(),null);assert.doesNotMatch([...f.values.values()].join(''),/accessToken|refreshToken/);f.auth.suspend();restarted.suspend();
});
test('V2U-04 malformed persisted state never becomes an installation identity',async()=>{
 const f=fixture();await login(f.auth);for(const key of f.values.keys())f.values.set(key,JSON.stringify({user:{userId:'attacker',displayName:'Forged'}}));
 const restarted=new PersonalAuth(config,f.store,f.peer.fetch);await assert.rejects(restarted.currentIdentity());assert.equal(restarted.identity(),null);f.auth.suspend();restarted.suspend();
});
test('V2U-07 suspension and cancellation fence delayed token adoption and preserve saved login on normal stop',async()=>{
 const f=fixture();let reached!:()=>void,release!:()=>void;const waiting=new Promise<void>(r=>{reached=r;}),gate=new Promise<void>(r=>{release=r;});f.waits.token=async()=>{reached();await gate;};
 const pending=login(f.auth);await waiting;f.auth.cancelLogin();release();await assert.rejects(pending);assert.equal(f.auth.identity(),null);
 f.waits.token=undefined;await login(f.auth);const lease=f.auth.accountLease(),saved=[...f.values];f.auth.suspend();assert.throws(()=>lease.assertCurrent());assert.deepEqual([...f.values],saved);
});
test('V2U-04 current-account leases and browser cookies cannot cross an account switch',async()=>{
 const f=fixture();await login(f.auth);const lease=f.auth.accountLease(),web=new PersonalWebSessions(),old=web.adopt(f.auth),cookie=web.cookie(old,false);
 await f.auth.logout();assert.equal(lease.signal.aborted,true);assert.throws(()=>lease.assertCurrent());f.setUser('bob');await login(f.auth,'bob@example.test');assert.equal(web.get(cookie),null);assert.equal(f.auth.identity()?.userId,'bob');web.close();f.auth.suspend();
});
test('V2U-04 entry nonce is local, canceled before reuse, and never a remote code/token',async()=>{
 const f=fixture();const url=new URL(await f.auth.begin(config.productOrigin+'/account/callback'));assert.equal(url.origin,config.productOrigin);assert.equal(url.pathname,'/');assert.equal(url.searchParams.get('accountLogin'),f.auth.callbackState());assert.throws(()=>f.auth.cancel('forged'));f.auth.cancelLogin();assert.equal(f.auth.loginPending(),false);f.auth.suspend();
});

test('WUA-30 signing in to the same user replaces the login lease and refuses old browser cookies',async()=>{
 const f=fixture(),web=new PersonalWebSessions();
 try{await login(f.auth);const lease=f.auth.accountLease(),cookie=web.cookie(web.adopt(f.auth),false);await login(f.auth);
 assert.equal(lease.signal.aborted,true);assert.throws(()=>lease.assertCurrent());assert.equal(web.get(cookie),null);assert.equal(f.auth.identity()?.userId,'alice');
 }finally{web.close();f.auth.suspend();}
});
