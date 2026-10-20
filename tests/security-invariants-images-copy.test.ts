import {imageRuntimeFixture,imageTerminal} from './fixtures/images-runtime.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {imagesActions,openImagesCopyOwner,openImagesSyncStore} from '@molis-ai/molis-work-plugin-images';
import {ensureStorageSpace,personalStorageSpace,homeSqlitePath,type AggregateCopyContext} from '@molis-ai/molis-work-storage';
import {projectCopyIdentities,previewProjectCopy} from '@molis-ai/molis-work-service-placement';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
async function fixture(t:import('node:test').TestContext){
 const root=mkdtempSync(join(tmpdir(),'images-copy-'));const source=join(root,'local'),target=join(root,'personal'),local=ensureStorageSpace(source),personal=ensureStorageSpace(target,personalStorageSpace('https://auth.example.test','work','alice'));
 let calls=0,active=true;const authorize=()=>{if(!active)throw new Error('ACCOUNT_CHANGED');};
 const runtime=await imageRuntimeFixture(t,{home:source,respond:(_input,response)=>{calls++;response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));}});
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const {connection}=await runtime.client(null).invoke(imagesActions.saveConnection,{...runtime.input,name:'Saved source label'});
 const {job}=await runtime.client('original').invoke(imagesActions.start,{request_id:'original-request',connection_id:connection.id,prompt:'Keep literal original source ID'});
 const saved=await imageTerminal(runtime.client('original'),job.id);assert.equal(saved.status,'succeeded');await runtime.supervisor.close();

 const maps=projectCopyIdentities({operationId:'same-copy-request',sourceSpaceId:local.spaceId,targetSpaceId:personal.spaceId,projects:[{id:'original',title:'Independent copy'}]}),identity=maps.forProject('original');
 const context=(direction:'source'|'target',check=authorize):AggregateCopyContext=>({direction,spaceId:direction==='source'?local.spaceId:personal.spaceId,authorize:check,project(id){assert.equal(id,direction==='source'?'original':maps.project('original'));return {title:direction==='source'?'Source':'Independent copy'};},hasArtifact:()=>false,canUploadProject:()=>false});
 return {source,target,local,personal,saved,identity,context,maps,calls:()=>calls,revoke(){active=false;}};
}

test('S-59 image copy preserves full saved bytes with independent identities and never copies connections or starts generation',async t=>{
 const f=await fixture(t),a=openImagesCopyOwner(f.source,f.context('source'))!,b=openImagesCopyOwner(f.target,f.context('target'))!;t.after(()=>{a.close();b.close();});
 const before=readFileSync(homeSqlitePath(f.source,'images'));writeFileSync(join(f.source,'images','assets','unreferenced-private.txt'),'not recorded by the owner');
 const preview=previewProjectCopy({sourceSpaceId:f.local.spaceId,projectIds:['original'],sources:[{ownerId:'io.molis.work.images',owner:a.owner}],authorize(){}});assert.equal(preview.view.assetCount,1);assert.deepEqual(preview.view.blockers,[]);
 const asset=a.owner.fork(preview.confirm(preview.view.fingerprint)[0]!.asset,f.identity);b.owner.apply(asset);b.owner.apply(asset);
 const received=b.owner.snapshot(f.maps.project('original'));assert.equal(received.length,1);const wire=received[0]!.value as {record:{id:string;project_id:string;prompt:string};images:{id:string;data_base64:string}[]};assert.notEqual(wire.record.id,f.saved.id);assert.notEqual(wire.images[0]!.id,f.saved.images[0]!.id);assert.equal(wire.record.prompt,'Keep literal original source ID');assert.deepEqual(Buffer.from(wire.images[0]!.data_base64,'base64'),png);assert.equal(f.calls(),1,'only the explicitly started source fixture generation ran');
 assert.doesNotMatch(JSON.stringify(received),/source-auth|only-in-source-secret-store|connection_id|runner_id|base_url/);assert.equal(readdirSync(join(f.target,'images','assets')).length,1);assert.deepEqual(readFileSync(homeSqlitePath(f.source,'images')),before);
 assert.throws(()=>a.owner.apply(asset));assert.throws(()=>b.owner.apply(a.owner.snapshot('original')[0]!));const sync=openImagesSyncStore(f.source);try{assert.throws(()=>sync.replica(f.context('source')),/空间不匹配/);}finally{sync.close();}
 f.revoke();assert.throws(()=>b.owner.apply(asset),/ACCOUNT_CHANGED/);
});

test('S-59 image copy rejects corrupted bytes before writing files and rejects closed source handles',async t=>{
 const f=await fixture(t),a=openImagesCopyOwner(f.source,f.context('source'))!,b=openImagesCopyOwner(f.target,f.context('target'))!;t.after(()=>{a.close();b.close();});
 const asset=a.owner.snapshot('original')[0]!,bad=structuredClone(asset);(bad.value as {images:{data_base64:string;byte_length:number}[]}).images[0]!.data_base64='eA==';(bad.value as {images:{byte_length:number}[]}).images[0]!.byte_length=1;
 assert.throws(()=>a.owner.fork(bad,f.identity));assert.equal(b.owner.snapshot(f.maps.project('original')).length,0);a.close();assert.throws(()=>a.owner.snapshot('original'),/已关闭/);
});

test('S-59 image copy final authority refusal rolls back both the saved record and normal sync queue',async t=>{
 const f=await fixture(t),a=openImagesCopyOwner(f.source,f.context('source'))!;let b:ReturnType<typeof openImagesCopyOwner>,inspecting=false,reject=true,observed=false;
 const check=()=>{if(b&&!inspecting&&reject){inspecting=true;try{if(b.owner.snapshot(f.maps.project('original')).length){observed=true;reject=false;throw new Error('FINAL_AUTHORITY_REVOKED');}}finally{inspecting=false;}}};
 b=openImagesCopyOwner(f.target,f.context('target',check))!;t.after(()=>{a.close();b?.close();});const asset=a.owner.fork(a.owner.snapshot('original')[0]!,f.identity);assert.throws(()=>b!.owner.apply(asset),/FINAL_AUTHORITY_REVOKED/);assert.ok(observed,'the refusal happened after the actual SQL row existed');assert.equal(b.owner.snapshot(f.maps.project('original')).length,0);
 const sync=openImagesSyncStore(f.target);try{assert.equal(sync.replica(f.context('target')).counts().pending,0);}finally{sync.close();}
});
