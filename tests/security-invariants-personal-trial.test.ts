import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {ensureStorageSpace,personalStorageSpace} from '@molis-ai/molis-work-storage';
import {createDesktopWebHost,openMolisWorkProjectCatalog,withMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {ProjectDeletionService} from '@molis-ai/molis-work-app-local-host';

// PTR-01 / S-60: a forged confirmation cannot bypass the trusted personal Home policy.
test('PTR-01 S-60 personal permanent deletion retains unique database and attachment before any runtime release',async t=>{
 const root=mkdtempSync(join(tmpdir(),'trial-delete-')),home=join(root,'personal');ensureStorageSpace(home,personalStorageSpace('https://auth.example.test','work','alice'));
 const catalog=await openMolisWorkProjectCatalog({homeDirectory:home});t.after(()=>{catalog.close();rmSync(root,{recursive:true,force:true});});
 const project=await catalog.createProject({display_name:'唯一原件',actor_id:'alice'}),attachment=join(dirname(project.database_path),'unique.bin');writeFileSync(attachment,Buffer.from([0,255,13,10,67]));
 const db=readFileSync(project.database_path),bytes=readFileSync(attachment);let effects=0;
 const service=new ProjectDeletionService(withMolisWorkProjectCatalog,{isPanelAlive(){effects++;return false;},async releaseProject(){effects++;}});
 await assert.rejects(service.deleteProject(home,{project_id:project.project_id,actor_id:'alice',delete_confirmed:true,idempotency_key:'trial-delete-refused'}),{code:'catalog.personal_deletion_unavailable'});
 assert.equal(effects,0);assert.deepEqual(readFileSync(project.database_path),db);assert.deepEqual(readFileSync(attachment),bytes);assert.equal(catalog.listProjectDeletions().length,0);
});

// PTR-01 / S-60: this is the actual HTTP entry, without credentials or a configured sync server.
test('PTR-01 S-60 HTTP refuses permanent cleanup without opening credentials',async()=>{
 const home=mkdtempSync(join(tmpdir(),'trial-http-')),token='synthetic-trial-control-token-0123456789';
 const server=createDesktopWebHost({ptyClientFilePath:()=>'/not-needed-for-this-test'})({homeDirectory:home,controlToken:token});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port;
 try{for(const [index,path] of ['/api/sync/purge-trash','/api/sync/history/purge'].entries()){
  const response=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':'trial-http-'+index},body:JSON.stringify({namespace:'any',key:'original',revision:1,confirm:true})});
  assert.equal(response.status,409);assert.match((await response.json()).error,/永久清理暂未开放/);
 }}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(home,{recursive:true,force:true});}
});
