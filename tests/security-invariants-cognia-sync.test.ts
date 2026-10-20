import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openCogniaStore, openCogniaSyncStore } from '@molis-ai/molis-work-plugin-cognia';
import {builtinSyncBindings} from '@molis-ai/molis-work-app-workbench';
import {createSyncJsonContent} from '@molis-ai/molis-work-plugin-sdk';
import { ensureStorageSpace, personalStorageSpace, openBaselineHomeSqlite } from '@molis-ai/molis-work-storage';

test('S-34 PCSYNC-01/11/22 knowledge refuses a local scanner path, corrupt original bytes and missing fixed citation',t=>{
 const root=mkdtempSync(join(tmpdir(),'cognia-sync-boundary-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const space=personalStorageSpace('https://auth.example.test','work','alice');
 const homes=['a','b'].map(n=>join(root,n));homes.forEach(h=>ensureStorageSpace(h,space));
 const owner=openCogniaStore(homes[0]),target=openCogniaStore(homes[1]);t.after(()=>{owner.close();target.close();});
 const m=owner.createMaterial({title:'Safe',body:'Unique original'}),source=openCogniaSyncStore(homes[0]),destination=openCogniaSyncStore(homes[1]);t.after(()=>{source.close();destination.close();});
 const context={spaceId:space.spaceId,authorize(){},canUploadProject:()=>false,project:()=>({title:'not used'}),hasArtifact:()=>false};
 const a=source.replica(context),b=destination.replica(context),next=a.next()!;const original=structuredClone(next.value) as {spaceId:string;graph:{sources:{locator:string}[];versions:{data:string}[];materials:{body:string}[];drafts:unknown[]}};
 assert.equal(a.hasProjectChanges!('unrelated-project'),false,'global knowledge ownership is independent of project references');
 const bads=[()=>{const v=structuredClone(original);v.spaceId='foreign';return v;},()=>{const v=structuredClone(original);v.graph.sources[0]!.locator='local:/private';return v;},()=>{const v=structuredClone(original);v.graph.versions[0]!.data=Buffer.from('changed').toString('base64');return v;},()=>{const v=structuredClone(original);v.graph.materials[0]!.body='not matching fixed version';return v;},()=>{const v=structuredClone(original);v.graph.drafts=[{draft:{id:'d',title:'Bad',body:'[S1]',domain_id:null,mode:'query',saved_id:null,created_at:'2026-10-18T00:00:00Z',references:[{label:'S1',material_id:'missing',revision:1,title:'T',path:'x.md',body:'X'}]},archived:0}];return v;}];
 let revision=0;for(const make of bads){b.receive({...next,operationId:'bad:'+revision,revision:++revision,value:make()});assert.equal(b.conflicts().length,1);assert.throws(()=>b.resolve(next.key,'remote',revision));assert.deepEqual(target.materials(),[]);assert.equal(owner.read(m.id).body,'Unique original');}
 b.receive({...next,operationId:'good',revision:++revision});b.resolve(next.key,'remote',revision);assert.equal(target.read(m.id).body,'Unique original');assert.equal(b.next(),null,'applying content has no new work or replication echo');
});
test('S-34 PCSYNC-12 Cognia v1 is rejected intact instead of silently adding synchronization tables',t=>{
 const home=mkdtempSync(join(tmpdir(),'cognia-old-schema-'));t.after(()=>rmSync(home,{recursive:true,force:true}));ensureStorageSpace(home,personalStorageSpace('https://auth.example.test','work','alice'));
 const db=openBaselineHomeSqlite(home,'cognia',{version:1,schema:readFileSync(new URL('./fixtures/home-store-schemas/cognia.sql',import.meta.url),'utf8')});db.close();const file=join(home,'cognia','cognia.db'),before=readFileSync(file);assert.throws(()=>openCogniaSyncStore(home),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(file),before);
});
test('S-34 PCSYNC-14 malformed knowledge projections are permanent owner refusals before any byte read',async()=>{
 const spaceId='test-personal',key=JSON.stringify(['cognia','knowledge']);
 const binding=builtinSyncBindings().find(row=>row.collection.id==='knowledge')!.binding,codec=binding.content!({spaceId,authorize(){}});
 for(const value of [null,[],{graph:null}])assert.throws(()=>codec.encode(key,value),{code:'cognia.invalid',kind:'invalid'});
 const malformed={graph:{versions:[null]},padding:'x'.repeat(70000)},transport=createSyncJsonContent({spaceId,authorize(){}}).encode(key,malformed);let reads=0;
 await assert.rejects(codec.decode(key,transport.value,async ref=>{reads++;const block=transport.blobs.find(row=>row.digest===ref.digest);assert.ok(block,'owner cannot request a raw version after seeing a null entry');return block.bytes;}),{code:'cognia.invalid',kind:'invalid'});
 assert.equal(reads,transport.blobs.length,'only declared JSON blocks are read; malformed original bytes are never requested');
});
