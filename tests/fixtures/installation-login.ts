import assert from 'node:assert/strict';
/** Exercises the public V2 installation protocol; no identity/credential-store injection. */
export async function completeInstallationLogin(request:(path:string,init?:RequestInit)=>Promise<Response>,loginUrl:string,email='local-personal-trial-user@example.test'){
 const nonce=new URL(loginUrl).searchParams.get('accountLogin');assert.ok(nonce);
 const call=(path:string,body:unknown)=>request(path,{method:'POST',headers:{'content-type':'application/json','x-molis-account-login':nonce},body:JSON.stringify(body)});
 const started=await call('/api/account/auth/transactions',{purpose:'LOGIN',method:'EMAIL_PASSWORD'});assert.equal(started.status,200,await started.clone().text());const {data:tx}=await started.json();
 const path='/api/account/auth/transactions/'+tx.handle+'/submit';
 const verified=await call(path,{step:'PASSWORD_LOGIN',email,password:'synthetic-disposable-password'});assert.equal(verified.status,200,await verified.clone().text());
 return call(path,{step:'COMPLETE'});
}
