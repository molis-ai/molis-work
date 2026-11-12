import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {TestContext} from 'node:test';
import {createDesktopWebHost} from '@molis-ai/molis-work-app-desktop';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {NATIVE_SESSION_FILE,NATIVE_SESSION_HEADER,WEB_CONTROL_TOKEN_RELATIVE_PATH} from '@molis-ai/molis-work-app-local-host';
import {v2AccountPeer} from './v2-account-peer.js';
import {completeInstallationLogin} from './installation-login.js';
export async function desktopEntryAccount(t:TestContext){
 const userId='desktop-shutdown-person',peer=v2AccountPeer(()=>userId);
 await new Promise<void>(r=>peer.server.listen(0,'127.0.0.1',r));t.after(()=>new Promise<void>(r=>peer.server.close(()=>r())));
 const address=peer.server.address();assert.ok(address&&typeof address==='object');const authOrigin='http://127.0.0.1:'+address.port;
 const reserve=createServer();await new Promise<void>(r=>reserve.listen(0,'127.0.0.1',r));const web=reserve.address();assert.ok(web&&typeof web==='object');const webPort=web.port;await new Promise<void>(r=>reserve.close(()=>r()));
 return {webPort,environment:{MOLIS_WORK_ACCOUNT_CONFIG:peer.configure('http://127.0.0.1:'+webPort),MOLIS_WORK_SECRET_BACKEND:'file',MOLIS_WORK_SYNC_ORIGIN:'',MOLIS_WORK_SYNC_LOCAL:''},
  async prepareHome(installation:string){const entry=createDesktopWebHost({ptyClientFilePath:()=>''})({homeDirectory:installation});await new Promise<void>((resolve,reject)=>entry.close(e=>e?reject(e):resolve()));const space=personalStorageSpace(authOrigin,'work',userId),home=join(installation,'spaces',space.spaceId);ensureStorageSpace(home,space);return home;},
  async login(installation:string,origin:string){const identityHeaders={[NATIVE_SESSION_HEADER]:readFileSync(join(installation,NATIVE_SESSION_FILE),'utf8').trim()},token=readFileSync(join(installation,WEB_CONTROL_TOKEN_RELATIVE_PATH),'utf8').trim();let sequence=0;
   const request=(path:string,init:RequestInit={})=>fetch(origin+path,{...init,redirect:'manual',headers:{...identityHeaders,Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'entry-account-'+(++sequence),...init.headers}});
   const begun=await request('/api/personal/login?returnTo=%2F',{method:'POST',body:'{}'});assert.equal(begun.status,200);const result=await completeInstallationLogin(request,(await begun.json()).loginUrl,userId+'@example.test');assert.equal(result.status,200,await result.clone().text());
   const status=await request('/api/personal/status');const account=await status.json();assert.equal(account.identity?.userId,userId);assert.equal(account.ready,true);return identityHeaders;
  }};
}
