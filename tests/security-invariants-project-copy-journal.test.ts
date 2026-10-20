import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,rmSync,renameSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createProjectCopyJournal,previewProjectCopy,executeProjectCopy,projectCopyIdentities,type ProjectCopyPlan,type ProjectCopyExecution} from '@molis-ai/molis-work-service-placement';
import {openProjectCopyJournal} from '@molis-ai/molis-work-app-local-host';
import {ensureStorageSpace,personalStorageSpace,createAtomicFileDocument,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {openFormStore,openFormCopyOwner} from '@molis-ai/molis-work-plugin-form';
import {ActionError} from '@molis-ai/molis-work-contracts/platform/actions';

function fixture(t:import('node:test').TestContext){
 const root=mkdtempSync(join(tmpdir(),'copy-journal-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const localHome=join(root,'local'),targetHome=join(root,'personal'),local=ensureStorageSpace(localHome),target=ensureStorageSpace(targetHome,personalStorageSpace('https://auth.example.test','work','alice'));
 let active=true;const check=()=>{if(!active)throw new Error('ACCOUNT_REVOKED');},journal=()=>openProjectCopyJournal(targetHome,target.spaceId,check);
 const projects=[{id:'original-a',title:'First complete project'},{id:'original-b',title:'Second complete project'}],identity={operationId:'same-stable-operation',sourceSpaceId:local.spaceId,targetSpaceId:target.spaceId,projects},maps=projectCopyIdentities(identity);
 const context=(direction:'source'|'target',authorize:()=>void):AggregateCopyContext=>({direction,spaceId:direction==='source'?local.spaceId:target.spaceId,authorize,project(id){const found=projects.find(p=>(direction==='source'?p.id:maps.project(p.id))===id);assert.ok(found,'only selected project identities');return {title:found.title};},canUploadProject:()=>false,hasArtifact:()=>false});
 const form=openFormStore(localHome);for(const project of projects)form.create({project_id:project.id,title:'Complete original '+project.id});form.close();
 const source=openFormCopyOwner(localHome,context('source',check))!;t.after(()=>source.close());const sources=[{ownerId:'io.molis.work.form',owner:source.owner}],preview=previewProjectCopy({sourceSpaceId:local.spaceId,projectIds:projects.map(p=>p.id),sources,authorize:check});
 const visible=new Set<string>(),prepared=new Set<string>();
 const input:ProjectCopyExecution={...identity,fingerprint:preview.view.fingerprint,preview,sources,journal:journal(),authorize:check,target(ownerId,authorize){assert.equal(ownerId,'io.molis.work.form');return openFormCopyOwner(targetHome,context('target',authorize))!;},async prepareProject(project,authorize){authorize();prepared.add(project.targetId);assert.equal(visible.size,0,'preparation does not publish');},async publishProject(project,authorize){authorize();visible.add(project.targetId);}};
 return {root,localHome,targetHome,local,target,context,check,journal,input,maps,visible,prepared,revoke(){active=false;}};
}

test('copy journal persists complete identity plans before effects and refuses premature publishing, wrong attempts and changed plans',t=>{
 const f=fixture(t),journal=f.journal(),plan:ProjectCopyPlan={operationId:'durable-plan',sourceSpaceId:f.local.spaceId,targetSpaceId:f.target.spaceId,fingerprint:'a'.repeat(64),projects:[{sourceId:'original-a',targetId:f.maps.project('original-a'),title:'Independent copy'}],assets:[{id:'owner-asset',targetKey:'new-asset',targetHash:'b'.repeat(64)}]};
 const receipt=journal.reserve(plan),path=join(f.targetHome,'placement','project-copies.json');assert.deepEqual(f.journal().get(plan.operationId),receipt,'new process-facing handle reads the same complete mapping');assert.doesNotMatch(readFileSync(path,'utf8'),/Complete original original-a/,'source bodies are not stored');
 assert.throws(()=>journal.reserve({...plan,fingerprint:'c'.repeat(64)}),{code:'placement.copy_journal_conflict'});
 const first=journal.start(plan.operationId,receipt.planHash);assert.throws(()=>journal.published(plan.operationId,first.attempt,plan.projects[0]!.targetId),{code:'placement.copy_journal_conflict'});assert.throws(()=>journal.complete(plan.operationId,first.attempt),{code:'placement.copy_journal_conflict'});
 const second=f.journal().start(plan.operationId,receipt.planHash);assert.throws(()=>first.check(),{code:'placement.copy_journal_conflict'});assert.throws(()=>journal.applied(plan.operationId,first.attempt,'owner-asset'),{code:'placement.copy_journal_conflict'});
 journal.applied(plan.operationId,second.attempt,'owner-asset');journal.applied(plan.operationId,second.attempt,'owner-asset');journal.published(plan.operationId,second.attempt,plan.projects[0]!.targetId);assert.equal(journal.complete(plan.operationId,second.attempt).state,'complete');
 assert.throws(()=>journal.start(plan.operationId,receipt.planHash),{code:'placement.copy_journal_conflict'});assert.equal(f.journal().get(plan.operationId)!.applied.length,1);
});

test('copy execution recovers an owner commit whose acknowledgement was lost, without duplicate copies or early publication',async t=>{
 const f=fixture(t),originalJournal=f.input.journal;let lost=true;
 f.input.journal={...originalJournal,applied(id,attempt,assetId){if(lost){lost=false;throw new Error('ACK_LOST');}originalJournal.applied(id,attempt,assetId);}};
 await assert.rejects(executeProjectCopy(f.input),/ACK_LOST/);assert.equal(f.visible.size,0);assert.equal(f.journal().get(f.input.operationId)!.applied.length,0);
 const target=openFormStore(f.targetHome);try{assert.equal(f.input.projects.flatMap(p=>target.list(f.maps.project(p.id))).length,1,'one actual owner commit survived before its receipt');}finally{target.close();}
 f.input.journal=f.journal();const result=await executeProjectCopy(f.input);assert.equal(result.state,'complete');assert.equal(result.applied.length,2);assert.equal(f.visible.size,2);
 const copied=openFormStore(f.targetHome);try{assert.equal(f.input.projects.flatMap(p=>copied.list(f.maps.project(p.id))).length,2);const first=copied.list(f.maps.project('original-a'))[0]!;copied.update(first.id,{title:'Independent later edit'},first.project_id);assert.equal((await executeProjectCopy({...f.input,preview:{...f.input.preview,confirm(){throw new Error('COMPLETED_MUST_NOT_READ_SOURCE');}}})).state,'complete');assert.equal(copied.get(first.id,first.project_id).title,'Independent later edit');}finally{copied.close();}
});

test('copy restart refuses a changed partial target and keeps both originals and the unpublished receipt',async t=>{
 const f=fixture(t);let commits=0;const targetPort=f.input.target;
 f.input.target=(ownerId,check)=>{const port=targetPort(ownerId,check);return {...port,owner:{...port.owner,apply(asset){port.owner.apply(asset);if(++commits===1)throw new Error('INTERRUPTED');}}};};
 await assert.rejects(executeProjectCopy(f.input),/INTERRUPTED/);assert.equal(f.visible.size,0);
 const target=openFormStore(f.targetHome);try{const item=f.input.projects.flatMap(p=>target.list(f.maps.project(p.id)))[0]!;target.update(item.id,{title:'User edited partial copy'},item.project_id);}finally{target.close();}
 f.input.target=targetPort;f.input.journal=f.journal();await assert.rejects(executeProjectCopy(f.input),/目标副本已经变化/);assert.equal(f.visible.size,0);assert.equal(f.journal().get(f.input.operationId)!.state,'copying');
 const source=openFormStore(f.localHome);try{assert.equal(source.list('original-a')[0]!.title,'Complete original original-a');assert.equal(source.list('original-b')[0]!.title,'Complete original original-b');}finally{source.close();}
});

test('copy attempt takeover during an owner final transaction check rolls back content and the normal sync journal',async t=>{
 const f=fixture(t);let stolen=false;
 f.input.target=(ownerId,check)=>{assert.equal(ownerId,'io.molis.work.form');let calls=0;const port=openFormCopyOwner(f.targetHome,f.context('target',()=>{if(++calls===4&&!stolen){const current=f.journal().get(f.input.operationId)!;f.journal().start(f.input.operationId,current.planHash);stolen=true;}check();}))!;calls=0;return port;};
 await assert.rejects(executeProjectCopy(f.input),{code:'placement.copy_journal_conflict'});assert.ok(stolen);assert.equal(f.visible.size,0);
 const target=openFormStore(f.targetHome);try{assert.equal(f.input.projects.flatMap(p=>target.list(f.maps.project(p.id))).length,0);assert.equal(target.replica(f.context('target',f.check)).counts().pending,0);}finally{target.close();}
});

test('copy revoked after asynchronous preparation cannot publish or write any owner body',async t=>{
 const f=fixture(t);f.input.prepareProject=async(_project,check)=>{await Promise.resolve();f.revoke();check();};
 await assert.rejects(executeProjectCopy(f.input),/ACCOUNT_REVOKED/);assert.equal(f.visible.size,0);const target=openFormStore(f.targetHome);try{assert.equal(f.input.projects.flatMap(p=>target.list(f.maps.project(p.id))).length,0);}finally{target.close();}
});

test('copy dependency waits are bounded and preserve the incomplete receipt without publishing',async t=>{
 const f=fixture(t);let calls=0;f.input.target=()=>({owner:{kinds:['io.molis.work.form:form'],snapshot(){return [];},read(){return null;},references(){return [];},fork(){throw new Error('NOT_SOURCE');},apply(){calls++;throw new ActionError('storage.sync_dependencies','Wait for exact dependency',{kind:'conflict',details:{sync_waiting:true}});}},close(){}});
 await assert.rejects(executeProjectCopy(f.input),/关联内容尚未全部到达/);assert.equal(calls,2);assert.equal(f.visible.size,0);assert.equal(f.journal().get(f.input.operationId)!.state,'copying');
});

test('copy journal refuses old format, wrong target account and stale CAS without altering original bytes',t=>{
 const f=fixture(t),localEntries=readdirSync(f.localHome);assert.throws(()=>openProjectCopyJournal(f.localHome,f.local.spaceId,f.check),{code:'host.copy_space_refused'});assert.deepEqual(readdirSync(f.localHome),localEntries);
 assert.throws(()=>openProjectCopyJournal(f.targetHome,'space_another_account',f.check),{code:'host.copy_space_refused'});
 const filename=join(f.targetHome,'placement','project-copies.json'),old='{"format":0,"spaceId":"'+f.target.spaceId+'","operations":{}}';writeFileSync(filename,old);assert.throws(()=>f.journal().get('any'),{code:'placement.copy_journal_invalid'});assert.equal(readFileSync(filename,'utf8'),old);
 rmSync(filename);const storage=createAtomicFileDocument(filename,f.check),journal=createProjectCopyJournal({...storage,compareAndSet(expected,value){storage.compareAndSet(expected,JSON.stringify({format:1,spaceId:f.target.spaceId,operations:{}}));return false;}},f.target.spaceId,f.check);
 assert.throws(()=>journal.reserve({operationId:'race',sourceSpaceId:f.local.spaceId,targetSpaceId:f.target.spaceId,fingerprint:'a'.repeat(64),projects:[{sourceId:'original-a',targetId:f.maps.project('original-a'),title:'copy'}],assets:[]}),{code:'placement.copy_journal_conflict'});assert.equal(f.journal().get('race'),null);
});

test('copy restart cannot recreate a partial target that the person subsequently deleted',async t=>{
 const f=fixture(t),targetPort=f.input.target;let interrupted=true;
 const input={...f.input,target(ownerId:string,check:()=>void){const port=targetPort(ownerId,check);return {...port,owner:{...port.owner,apply(asset:Parameters<typeof port.owner.apply>[0]){port.owner.apply(asset);if(interrupted){interrupted=false;throw new Error('INTERRUPTED');}}}};}};
 await assert.rejects(executeProjectCopy(input),/INTERRUPTED/);const target=openFormStore(f.targetHome);try{const row=f.input.projects.flatMap(project=>target.list(f.maps.project(project.id)))[0]!;target.delete(row.id,row.project_id,row.version);}finally{target.close();}
 await assert.rejects(executeProjectCopy({...f.input,journal:f.journal()}),/删除或替换历史/);assert.equal(f.visible.size,0);assert.equal(f.journal().get(f.input.operationId)!.state,'copying');
});

test('copy failed attempts close retained asynchronous commit callbacks even before another retry begins',async t=>{
 const f=fixture(t);let retained:(()=>void)|undefined;
 const input={...f.input,async prepareProject(_project:unknown,check:()=>void){retained=check;throw new Error('PREPARATION_INTERRUPTED');}};
 await assert.rejects(executeProjectCopy(input),/PREPARATION_INTERRUPTED/);assert.ok(retained);assert.throws(()=>retained!(),{code:'placement.copy_execution_stale'});assert.equal(f.visible.size,0);
 assert.equal((await executeProjectCopy({...f.input,journal:f.journal()})).state,'complete');assert.throws(()=>retained!(),{code:'placement.copy_execution_stale'});
});

test('copy journal cached handles refuse a directory replaced by a symlink before reading or writing foreign files',t=>{
 const f=fixture(t),journal=f.journal(),directory=join(f.targetHome,'placement'),moved=join(f.targetHome,'placement-held'),filename=join(directory,'project-copies.json'),raw=JSON.stringify({format:1,spaceId:f.target.spaceId,operations:{}});
 writeFileSync(filename,raw);renameSync(directory,moved);symlinkSync(moved,directory);assert.throws(()=>journal.get('any'),{code:'host.copy_space_refused'});assert.equal(readFileSync(join(moved,'project-copies.json'),'utf8'),raw);
});
