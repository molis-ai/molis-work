import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {previewProjectCopy,projectCopyIdentities,type ProjectCopySource} from '@molis-ai/molis-work-service-placement';
import type {ProjectCopyAsset,ProjectCopyOwner,ProjectCopyReference} from '@molis-ai/molis-work-contracts/services/placement';
import {ensureStorageSpace,personalStorageSpace,homeSqlitePath,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {openFormStore,openFormCopyOwner} from '@molis-ai/molis-work-plugin-form';
import {openDatasetStore,openDatasetCopyOwner} from '@molis-ai/molis-work-plugin-dataset';
import {openPptStore,openPptCopyOwner} from '@molis-ai/molis-work-plugin-ppt';
import {openLingguangStore,openLingguangCopyOwner} from '@molis-ai/molis-work-plugin-lingguang';

function source(ownerId:string,roots:Map<string,ProjectCopyAsset[]>,links:Map<string,ProjectCopyReference[]>=new Map()):ProjectCopySource {
 const owner:ProjectCopyOwner={kinds:[ownerId+':record'],snapshot(projectId){return structuredClone(roots.get(projectId)??[]);},read(ref){return structuredClone([...roots.values()].flat().find(asset=>asset.key===ref.id)??null);},references(asset){return structuredClone(links.get(asset.key)??[]);},fork(){throw new Error('NOT_PREVIEW');},apply(){throw new Error('NOT_PREVIEW');}};
 return {ownerId,owner};
}

test('copy preview closes typed dependencies, deduplicates cycles and refuses stale or revoked confirmation',()=>{
 const records=new Map([['p1',[{key:'one',value:{body:'Complete original one'}}]],['p2',[{key:'two',value:{body:'Complete original two'}}]],['home',[{key:'home-note',value:{body:'Only explicitly referenced home data'}}]]]);
 const link=(id:string,projectId:string|null)=>({kind:'example.publisher:record',id,projectId});
 const port=source('example.publisher',records,new Map([['one',[link('two','p2'),link('home-note',null)]],['two',[link('one','p1')]]]));
 let authorized=true;const input={sourceSpaceId:'space_local',projectIds:['p2','p1'],sources:[port],authorize(){if(!authorized)throw new Error('REVOKED');}};
 const preview=previewProjectCopy(input);assert.equal(preview.view.assetCount,3);assert.equal(preview.view.dependencies.length,3);assert.deepEqual(preview.view.blockers,[]);assert.deepEqual(preview.view.projectIds,['p1','p2']);
 assert.doesNotMatch(JSON.stringify(preview.view),/Complete original/,'UI view has no saved bodies');
 assert.equal(previewProjectCopy({...input,projectIds:['p1','p2']}).view.fingerprint,preview.view.fingerprint);
 input.projectIds.splice(0,2,'unselected');const view=preview.view;(view.projectIds as string[]).push('unselected');
 const confirmed=preview.confirm(preview.view.fingerprint);assert.equal(confirmed.length,3,'scope and view are captured independently of caller arrays');
 (confirmed[0]!.asset.value as Record<string,unknown>).body='Attempted caller mutation';assert.equal(preview.confirm(preview.view.fingerprint).length,3);
 assert.throws(()=>preview.confirm('wrong'),{code:'placement.copy_stale'});
 records.get('p1')![0]!.value.body='Later source edit';assert.throws(()=>preview.confirm(preview.view.fingerprint),{code:'placement.copy_stale'});
 authorized=false;assert.throws(()=>preview.confirm(preview.view.fingerprint),/REVOKED/);
});

test('copy preview reports missing, unavailable and unselected references without importing a partial graph',()=>{
 const roots=new Map([['p1',[{key:'one',value:{body:'retained'}}]]]),reference=(kind:string,id:string,projectId:string|null)=>({kind,id,projectId});
 const port=source('example.publisher',roots,new Map([['one',[reference('unavailable.owner:record','unknown','p1'),reference('example.publisher:record','missing','p1'),reference('example.publisher:record','external','p2')]]]));
 const preview=previewProjectCopy({sourceSpaceId:'space_local',projectIds:['p1'],sources:[port],authorize(){}});
 assert.deepEqual(preview.view.blockers.map(item=>item.reason).sort(),['missing','owner_unavailable','unselected_project']);
 assert.throws(()=>preview.confirm(preview.view.fingerprint),{code:'placement.copy_unavailable'});assert.equal(roots.get('p1')![0]!.value.body,'retained');
});

test('copy confirmation detects root additions and owner identity changes, including an originally empty project',()=>{
 const roots=new Map<string,ProjectCopyAsset[]>([['p1',[]],['p2',[]]]),port=source('example.publisher',roots),input={sourceSpaceId:'space_local',projectIds:['p1','p2'],sources:[port],authorize(){}};
 const empty=previewProjectCopy(input);assert.equal(empty.view.assetCount,0);roots.set('p2',[{key:'new',value:{full:'Added after preview'}}]);assert.throws(()=>empty.confirm(empty.view.fingerprint),{code:'placement.copy_stale'});
 const current=previewProjectCopy(input);(port.owner.kinds as string[]).push('example.publisher:new');assert.throws(()=>current.confirm(current.view.fingerprint),{code:'placement.copy_stale'});
 assert.throws(()=>previewProjectCopy({...input,sources:[{ownerId:'forged.publisher',owner:port.owner}]}),{code:'placement.copy_invalid'});
 assert.throws(()=>previewProjectCopy({...input,sources:[port,port]}),{code:'placement.copy_invalid'});
});

test('copy preview refuses lossy or executable JSON rather than silently omitting saved data',()=>{
 const roots=new Map<string,ProjectCopyAsset[]>([['p1',[]]]),port=source('example.publisher',roots),input={sourceSpaceId:'space_local',projectIds:['p1'],sources:[port],authorize(){}};
 // Bypass only the fixture clone: the production parser must refuse getters without executing them.
 let calls=0;port.owner.snapshot=()=>[{key:'original',value:Object.defineProperty({},'secret',{enumerable:true,get(){calls++;return 'private';}})}];
 assert.throws(()=>previewProjectCopy(input),{code:'placement.copy_invalid'});assert.equal(calls,0);
 for(const value of [{lost:undefined},{number:NaN},new Date(),[,'hole'],{body:'kept',toJSON(){return 'changed';}}]){port.owner.snapshot=()=>[{key:'original',value}];assert.throws(()=>previewProjectCopy(input),{code:'placement.copy_invalid'});}
 const array:unknown[]=[];Object.defineProperty(array,'0',{enumerable:true,get(){calls++;return 'private';}});port.owner.snapshot=()=>[{key:'original',value:array}];assert.throws(()=>previewProjectCopy(input),{code:'placement.copy_invalid'});assert.equal(calls,0);
});

test('copy identity is stable across retries and separates projects, accounts, operations and object kinds',()=>{
 const input={operationId:'durable-operation-1',sourceSpaceId:'space_local',targetSpaceId:'space_alice',projects:[{id:'p1',title:'First'},{id:'p2',title:'Second'}]},first=projectCopyIdentities(input),again=projectCopyIdentities({...input,projects:[...input.projects].reverse()});
 assert.equal(first.project('p1'),again.project('p1'));assert.notEqual(first.project('p1'),first.project('p2'));assert.match(first.project('p1'),/^project-[a-f0-9-]{36}$/);
 const identity=first.forProject('p1'),id=identity.id('example.publisher:record','same');assert.equal(id,again.forProject('p1').id('example.publisher:record','same'));assert.notEqual(id,first.forProject('p2').id('example.publisher:record','same'));assert.notEqual(id,identity.id('example.publisher:other','same'));
 assert.notEqual(id,projectCopyIdentities({...input,targetSpaceId:'space_bob'}).forProject('p1').id('example.publisher:record','same'));assert.notEqual(id,projectCopyIdentities({...input,operationId:'durable-operation-2'}).forProject('p1').id('example.publisher:record','same'));
 assert.throws(()=>identity.project('unselected'),{code:'placement.copy_scope'});assert.throws(()=>identity.id('kind','id','unselected'),{code:'placement.copy_scope'});assert.throws(()=>projectCopyIdentities({...input,targetSpaceId:input.sourceSpaceId}),{code:'placement.copy_scope'});assert.equal(first.forProject(null).targetProjectId,null);
});

test('two real local projects preview and fork all four supported owners independently without changing source bytes',t=>{
 const root=mkdtempSync(join(tmpdir(),'copy-preview-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const localHome=join(root,'local'),personalHome=join(root,'personal'),local=ensureStorageSpace(localHome),personal=ensureStorageSpace(personalHome,personalStorageSpace('https://auth.example.test','work','alice'));
 const projects=[{id:'original-a',title:'First project'},{id:'original-b',title:'Second project'}],maps=projectCopyIdentities({operationId:'confirmed-operation',sourceSpaceId:local.spaceId,targetSpaceId:personal.spaceId,projects});
 const form=openFormStore(localHome),dataset=openDatasetStore(localHome),ppt=openPptStore(localHome),lingguang=openLingguangStore(localHome);
 for(const project of projects){form.create({project_id:project.id,title:'Form '+project.id});dataset.create({project_id:project.id,title:'Dataset '+project.id});ppt.create({project_id:project.id,title:'PPT '+project.id});const spark=lingguang.create({project_id:project.id,title:'Spark '+project.id,body:'Full body with literal '+project.id});if(project.id==='original-a'){const conversation=lingguang.openConversation([spark.id],project.id).conversation;const expected=lingguang.conversation(conversation.id,project.id);lingguang.addReply(conversation.id,'Complete question','Complete reply',project.id,expected);}}
 form.close();dataset.close();ppt.close();lingguang.close();
 const context=(direction:'source'|'target'):AggregateCopyContext=>({direction,spaceId:direction==='source'?local.spaceId:personal.spaceId,authorize(){},project(id){const project=projects.find(p=>direction==='source'?p.id===id:maps.project(p.id)===id);assert.ok(project,'only confirmed projects');return {title:project.title};},canUploadProject:()=>false,hasArtifact:()=>false});
 const entries=[['form','io.molis.work.form',openFormCopyOwner],['dataset','io.molis.work.dataset',openDatasetCopyOwner],['ppt','io.molis.work.ppt',openPptCopyOwner],['lingguang','io.molis.work.lingguang',openLingguangCopyOwner]] as const;
 const before=entries.map(([name])=>readFileSync(homeSqlitePath(localHome,name))),sources=entries.map(([,ownerId,open])=>({ownerId,port:open(localHome,context('source'))!})),targets=entries.map(([,ownerId,open])=>({ownerId,port:open(personalHome,context('target'))!}));
 t.after(()=>{for(const {port} of [...sources,...targets])port.close();});
 const preview=previewProjectCopy({sourceSpaceId:local.spaceId,projectIds:projects.map(p=>p.id),sources:sources.map(({ownerId,port})=>({ownerId,owner:port.owner})),authorize(){}});assert.equal(preview.view.assetCount,9);assert.deepEqual(preview.view.blockers,[]);assert.equal(preview.view.dependencies.length,1);
 const confirmed=preview.confirm(preview.view.fingerprint),forked=confirmed.map(entry=>{const source=sources.find(p=>p.ownerId===entry.ownerId)!.port.owner;return {...entry,asset:source.fork(entry.asset,maps.forProject(entry.projectId)),dependencies:source.references(entry.asset).length};});
 // This fixture has a single spark -> conversation dependency; future whole-project scheduling is separate.
 for(const entry of forked.sort((a,b)=>a.dependencies-b.dependencies)){const target=targets.find(p=>p.ownerId===entry.ownerId)!.port.owner;target.apply(entry.asset);target.apply(entry.asset);}
 for(const {ownerId,port} of targets){const expected=forked.filter(entry=>entry.ownerId===ownerId).length;assert.equal(projects.flatMap(project=>port.owner.snapshot(maps.project(project.id))).length,expected);}
 for(let index=0;index<entries.length;index++)assert.deepEqual(readFileSync(homeSqlitePath(localHome,entries[index]![0])),before[index]);
});
