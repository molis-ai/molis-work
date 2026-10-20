import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,readdirSync,renameSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ensureStorageSpace,personalStorageSpace,homeSqlitePath,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {openFormStore,openFormCopyOwner} from '@molis-ai/molis-work-plugin-form';
import {openDatasetStore,openDatasetCopyOwner} from '@molis-ai/molis-work-plugin-dataset';
import {openPptStore,openPptCopyOwner} from '@molis-ai/molis-work-plugin-ppt';
import {openLingguangStore,openLingguangCopyOwner} from '@molis-ai/molis-work-plugin-lingguang';
import type {ProjectCopyAsset,ProjectCopyIdentity} from '@molis-ai/molis-work-contracts/services/placement';

type Wire={record:Record<string,string|number|null>;children:Record<string,Record<string,string|number|null>[]>;project:{id:string;title:string};spaceId:string};
function homes(t:import('node:test').TestContext){
 const root=mkdtempSync(join(tmpdir(),'project-owner-copy-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const source=join(root,'local'),target=join(root,'personal');const local=ensureStorageSpace(source),personal=ensureStorageSpace(target,personalStorageSpace('https://auth.example.test','work','alice'));
 let active=true;const context=(direction:'source'|'target'):AggregateCopyContext=>({direction,spaceId:direction==='source'?local.spaceId:personal.spaceId,authorize(){if(!active)throw new Error('REVOKED');},canUploadProject:()=>true,project(id){if(id!==(direction==='source'?'original':'copied'))throw new Error('FOREIGN_PROJECT');return {title:direction==='source'?'Original':'Copied'};},hasArtifact:()=>false});
 const ids=new Map<string,string>(),identity:ProjectCopyIdentity={sourceSpaceId:local.spaceId,targetSpaceId:personal.spaceId,sourceProjectId:'original',targetProjectId:'copied',targetTitle:'Copied',project(id){if(id!=='original')throw new Error('UNCONFIRMED_DEPENDENCY');return 'copied';},id(kind,id){const key=JSON.stringify([kind,id]);if(!ids.has(key))ids.set(key,randomUUID());return ids.get(key)!;}};
 return {source,target,context,identity,revoke(){active=false;}};
}

for(const [name,open] of [['form',openFormStore],['dataset',openDatasetStore],['ppt',openPptStore],['lingguang',openLingguangStore]] as const)test('project copy '+name+' uses the local owner, independent IDs, stable retry and rejects an edited target',t=>{
 const f=homes(t),source=open(f.source),target=open(f.target);t.after(()=>{source.close();target.close();});const original=source.create({project_id:'original',title:'Original'});source.create({project_id:'unselected',title:'Must stay local'});
 source.update(original.id,{title:'Keep literal source ID '+original.id},'original');
 const a=source.copy(f.context('source')),b=target.copy(f.context('target')),before=readFileSync(homeSqlitePath(f.source,name));assert.throws(()=>source.replica(f.context('source')),/同步空间不匹配/,'copy does not enable personal sync on a local Home');
 const exported=a.snapshot('original');assert.equal(exported.length,1);assert.throws(()=>a.snapshot('unselected'),/FOREIGN_PROJECT/);const copied=a.fork(exported[0]!,f.identity),again=a.fork(exported[0]!,f.identity);assert.deepEqual(copied,again);const wire=copied.value as Wire;
 assert.notEqual(wire.record.id,original.id);assert.equal(wire.record.project_id,'copied');assert.equal(wire.spaceId,f.identity.targetSpaceId);assert.equal(wire.record.title,'Keep literal source ID '+original.id,'text is not searched/replaced for IDs');
 b.apply(copied);b.apply(copied);assert.equal(target.list('copied').length,1);assert.equal(target.get(String(wire.record.id),'copied').title,wire.record.title);assert.deepEqual(readFileSync(homeSqlitePath(f.source,name)),before,'source database bytes do not change');
 assert.throws(()=>a.apply(copied));assert.throws(()=>b.apply(exported[0]!));target.update(String(wire.record.id),{title:'Independent later edit'},'copied');assert.throws(()=>b.apply(copied),/目标副本已经变化/);assert.equal(target.get(String(wire.record.id),'copied').title,'Independent later edit');
 f.revoke();assert.throws(()=>a.snapshot('original'),/REVOKED/);assert.throws(()=>b.apply(copied),/REVOKED/);
});

test('project copy preserves captured form answers and all Dataset saved versions, with new child identities',t=>{
 const f=homes(t),form=openFormStore(f.source),targetForm=openFormStore(f.target),dataset=openDatasetStore(f.source),targetDataset=openDatasetStore(f.target);t.after(()=>{form.close();targetForm.close();dataset.close();targetDataset.close();});
 const record=form.create({project_id:'original',title:'Questionnaire'}),withQuestion=form.update(record.id,{questions:[{id:'question-original',type:'text',title:'Question',required:false}]},'original');
 const answer=form.submit(record.id,{'question-original':'Full original answer'},'original',{requestId:'captured-request',expectedVersion:withQuestion.version});
 const a=form.copy(f.context('source')),copied=a.fork(a.snapshot('original')[0]!,f.identity),wire=copied.value as Wire;assert.equal(wire.children.submissions!.length,1);assert.notEqual(wire.children.submissions![0]!.id,answer.id);assert.equal(wire.children.submissions![0]!.form_id,wire.record.id);assert.match(String(wire.children.submissions![0]!.answers_json),/Full original answer/);targetForm.copy(f.context('target')).apply(copied);
 const table=dataset.create({project_id:'original',title:'Saved table'});dataset.saveVersion(table.id,'First complete snapshot','original');dataset.update(table.id,{title:'Later table'},'original');dataset.saveVersion(table.id,'Second complete snapshot','original');
 const d=dataset.copy(f.context('source')),copy=d.fork(d.snapshot('original')[0]!,f.identity),result=copy.value as Wire;assert.equal(result.children.dataset_versions!.length,2);for(const version of result.children.dataset_versions!){const snapshot=JSON.parse(String(version.snapshot_json));assert.equal(snapshot.id,result.record.id);assert.equal(snapshot.project_id,'copied');assert.equal(version.dataset_id,result.record.id);}
 targetDataset.copy(f.context('target')).apply(copy);assert.equal(targetDataset.listVersions(String(result.record.id),'copied').length,2);assert.equal(dataset.listVersions(table.id,'original').length,2);
 const malformed=structuredClone(copy) as ProjectCopyAsset;const bad=malformed.value as Wire;bad.children.dataset_versions![0]!.dataset_id='foreign';assert.throws(()=>targetDataset.copy(f.context('target')).apply(malformed));
});

test('project copy keeps completed Lingguang conversations and explicitly remaps every spark and message reference',t=>{
 const f=homes(t),source=openLingguangStore(f.source),target=openLingguangStore(f.target);t.after(()=>{source.close();target.close();});
 const spark=source.create({project_id:'original',title:'Saved spark',body:'Full saved body'}),opened=source.openConversation([spark.id],'original');const state=source.conversation(opened.conversation.id,'original');const original=source.addReply(opened.conversation.id,'Original question','Complete original reply','original',state);
 const a=source.copy(f.context('source')),b=target.copy(f.context('target')),snapshots=a.snapshot('original');assert.equal(snapshots.length,2);const conversation=snapshots.find(asset=>(asset.value as Wire).children.messages)!;assert.deepEqual(a.references(conversation),[{kind:'io.molis.work.lingguang:spark',id:spark.id,projectId:'original'}]);
 const copies=snapshots.map(asset=>a.fork(asset,f.identity));for(const asset of copies)b.apply(asset);
 const received=target.conversation(f.identity.id('io.molis.work.lingguang:conversation',opened.conversation.id),'copied');assert.deepEqual(received.conversation.spark_ids,[f.identity.id('io.molis.work.lingguang:spark',spark.id)]);assert.equal(received.messages.length,2);assert.equal(received.messages[1]!.body,'Complete original reply');assert.ok(received.messages.every(message=>!original.messages.some(source=>source.id===message.id)),'copied messages receive independent identities');assert.equal(source.conversation(opened.conversation.id,'original').messages.length,2);
});


for(const [name,open] of [['form',openFormStore],['dataset',openDatasetStore],['ppt',openPptStore],['lingguang',openLingguangStore]] as const)test('project copy '+name+' rolls back the content and journal together on final authority refusal',t=>{
 const f=homes(t),source=open(f.source),target=open(f.target);t.after(()=>{source.close();target.close();});source.create({project_id:'original',title:'Unique original'});const a=source.copy(f.context('source')),asset=a.fork(a.snapshot('original')[0]!,f.identity);let checks=0;
 const context=f.context('target'),b=target.copy({...context,authorize(){context.authorize();if(++checks===4){assert.equal(target.list('copied').length,1,'final check runs after actual content insertion');throw new Error('LATE_REVOKED');}}});checks=0;assert.throws(()=>b.apply(asset),/LATE_REVOKED/);assert.equal(target.list('copied').length,0);assert.equal(target.replica(f.context('target')).counts().pending,0);
});


for(const [name,open,factory] of [['form',openFormStore,openFormCopyOwner],['dataset',openDatasetStore,openDatasetCopyOwner],['ppt',openPptStore,openPptCopyOwner],['lingguang',openLingguangStore,openLingguangCopyOwner]] as const)test('project copy '+name+' preview uses an existing read-only source and closed handles cannot write',t=>{
 const f=homes(t),ctx=f.context('source'),entries=readdirSync(f.source);assert.equal(factory(f.source,ctx),null);assert.deepEqual(readdirSync(f.source),entries,'preview cannot initialize a missing source store');
 const store=open(f.source),saved=store.create({project_id:'original',title:'Keep every original byte'});store.close();const filename=homeSqlitePath(f.source,name),before=readFileSync(filename),files=readdirSync(join(f.source,name));
 const inherited=Object.create(ctx) as AggregateCopyContext,port=factory(f.source,inherited)!;assert.ok(port);t.after(()=>port.close());const assets=port.owner.snapshot('original');assert.equal(assets.length,1);assert.equal((assets[0]!.value as Wire).record.id,saved.id);
 ctx.direction='target';ctx.spaceId=f.identity.targetSpaceId;assert.equal((port.owner.snapshot('original')[0]!.value as Wire).spaceId,f.identity.sourceSpaceId,'opened scope does not follow a reused mutable context');
 port.close();port.close();assert.throws(()=>port.owner.snapshot('original'),/原复制接口已关闭/);assert.throws(()=>port.owner.apply(assets[0]!),/原复制接口已关闭/);assert.deepEqual(readFileSync(filename),before);assert.deepEqual(readdirSync(join(f.source,name)),files);
 const outside=join(f.source,'foreign.db');renameSync(filename,outside);symlinkSync(outside,filename);assert.throws(()=>factory(f.source,f.context('source')),/不能通过链接/);assert.deepEqual(readFileSync(outside),before);
});
