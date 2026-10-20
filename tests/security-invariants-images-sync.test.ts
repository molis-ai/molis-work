import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, symlinkSync, writeFileSync,utimesSync,existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {ImagesService} from '@molis-ai/molis-work-plugin-images';
import { openImagesSyncStore } from '@molis-ai/molis-work-plugin-images';
import { ensureStorageSpace, personalStorageSpace, openBaselineHomeSqlite } from '@molis-ai/molis-work-storage';

test('S-33 PCSYNC-01/23 image restoration refuses foreign identities, execution state and filesystem paths without effects',t=>{
 const home=mkdtempSync(join(tmpdir(),'image-sync-boundary-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
 const store=openImagesSyncStore(home);t.after(()=>store.close());
 assert.throws(()=>store.replica({spaceId:'other',authorize(){},canUploadProject:()=>true,project:()=>({title:'P'}),hasArtifact:()=>false}),/空间不匹配/);
 const replica=store.replica({spaceId:space.spaceId,authorize(){},canUploadProject:()=>true,project:()=>({title:'P'}),hasArtifact:()=>false});
 const record={id:'image',project_id:'project',connection_name:'',api_format:'openai-images',model:'saved',prompt:'text',size:'',aspect_ratio:'',status:'succeeded',error:'',created_at:'2026-10-18T00:00:00Z',finished_at:null};
 const value={format:1,spaceId:space.spaceId,project:{id:'project',title:'P'},record,images:[]};
 const key=JSON.stringify(['project','image','image']);
 let revision=0;
 for(const bad of [{...value,spaceId:'foreign'},{...value,record:{...record,status:'running'}},{...value,record:{...record,runner_id:'execution'}},{...value,images:[{id:'x',filename:'../../private',mime_type:'image/png',byte_length:1,data_base64:'eA=='}]}]){
  replica.receive({key,operationId:'bad:'+revision,base:0,revision:++revision,value:bad});
  assert.equal(replica.conflicts().length,1,'owner rejection retains the original event without a business write');
  assert.equal(replica.hasProjectChanges!('project'),true);assert.equal(replica.hasProjectChanges!('unrelated'),false);
  assert.throws(()=>replica.resolve(key,'remote',revision));assert.equal(replica.counts().pending,0);
  const db=new DatabaseSync(join(home,'images','images.db'),{readOnly:true});try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM jobs').get()!.n,0);}finally{db.close();}
 }
 replica.receive({key,operationId:'good',base:0,revision:++revision,value});replica.resolve(key,'remote',revision);assert.equal(replica.cursor(),revision);assert.equal(replica.counts().pending,0);
});
test('S-33 PCSYNC-12 Images v1 is refused with original bytes unchanged',t=>{
 const root=mkdtempSync(join(tmpdir(),'sync-old-schema-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const home=join(root,'images'),space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
 const db=openBaselineHomeSqlite(home,'images',{version:1,schema:readFileSync(new URL('./fixtures/home-store-schemas/images.sql',import.meta.url),'utf8')});db.close();const file=join(home,'images','images.db'),before=readFileSync(file);
 assert.throws(()=>openImagesSyncStore(home),{code:'storage.schema_version_mismatch'});assert.deepEqual(readFileSync(file),before);
});

test('S-33 PCSYNC-11 the Images owner refuses a symlinked assets directory before exporting bytes',t=>{
 const home=mkdtempSync(join(tmpdir(),'images-symlink-refusal-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
 const sync=openImagesSyncStore(home);t.after(()=>sync.close());const external=join(home,'external');mkdirSync(external);const secret=Buffer.from('not-an-authorized-saved-image');writeFileSync(join(external,'aa.png'),secret);symlinkSync(external,join(home,'images','assets'));
 const db=new DatabaseSync(join(home,'images','images.db'));try{db.prepare("INSERT INTO jobs VALUES ('image','project','request','hash','','','openai-images','saved','prompt','','','succeeded',?,'','2026-10-18T00:00:00Z',NULL,NULL)").run(JSON.stringify([{id:'picture',mime_type:'image/png',byte_length:secret.length,filename:'aa.png'}]));}finally{db.close();}
 const r=sync.replica({spaceId:space.spaceId,authorize(){},canUploadProject:()=>true,project:()=>({title:'P'}),hasArtifact:()=>false});assert.throws(()=>r.next(),/目录不能指向/);assert.equal(r.counts().pending,1);assert.deepEqual(readFileSync(join(external,'aa.png')),secret);
});


test('Images deletion preserves an unfrozen original and bounded GC keeps shared references, with offline undo',async t=>{
 const home=mkdtempSync(join(tmpdir(),'images-local-retention-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const space=personalStorageSpace('https://auth.example.test','work','alice');ensureStorageSpace(home,space);
 const service=new ImagesService({homeDirectory:home,resolveConnectionKey:()=>null,selectConnection(){},selectedConnectionId:()=>null,clearConnection(){}});t.after(()=>service.close());
 const sync=openImagesSyncStore(home);t.after(()=>sync.close());const context={spaceId:space.spaceId,authorize(){},canUploadProject:()=>true,project:()=>({title:'P'}),hasArtifact:()=>false},replica=sync.replica(context);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6L8UAAAAASUVORK5CYII=','base64'),directory=join(home,'images','assets'),filename='aaaaaaaa.png';writeFileSync(join(directory,filename),png);
 const db=new DatabaseSync(join(home,'images','images.db'));t.after(()=>db.close());const image={id:'picture',filename,mime_type:'image/png',byte_length:png.length};
 for(const id of ['first','shared'])db.prepare("INSERT INTO jobs VALUES (?,'project',?,'hash','','','openai-images','saved','prompt','','','succeeded',?,'','2026-10-18T00:00:00Z',NULL,NULL)").run(id,'request-'+id,JSON.stringify([image]));
 const old=new Date(Date.now()-172800000);utimesSync(join(directory,filename),old,old);service.deleteJob('project','first');assert.equal(existsSync(join(directory,filename)),true,'another live job protects shared bytes');
 service.deleteJob('project','shared');assert.equal(existsSync(join(directory,filename)),false,'only old unreferenced bytes are collected after durable preimages');
 const records=replica.recoveries!().filter(row=>row.choice==='local_delete');assert.equal(records.length,2);assert.ok(replica.counts().pending>0);
 for(const row of records){assert.equal(row.revision,0);replica.restoreRecovery!(row.id,'local',0);}
 const restored=service.getJob('project','first');assert.deepEqual(readFileSync(join(directory,restored.images[0]!.filename)),png);assert.equal(replica.cursor(),0,'local undo never invents a server head');
});
