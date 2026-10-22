import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, utimesSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { createAtomicFileDocument,ensureStorageSpace,personalStorageSpace } from '@molis-ai/molis-work-storage';
import {createPersonalPluginRegistrations,openHostShelfFiles} from '@molis-ai/molis-work-app-local-host';
import { openShelfStore, SHELF_DOCUMENT_PATH, hashBytes } from '@molis-ai/molis-work-module-shelf';
import { shelfTestAi,shelfTestReceipt } from './shelf-test-ai.js';

function fixture(t:import('node:test').TestContext,bound=false){
  const home=mkdtempSync(join(tmpdir(),'shelf-sync-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
  let active=true;const authorize=()=>{if(!active)throw new Error('REVOKED');};
  const spaceId=bound?ensureStorageSpace(home,personalStorageSpace('https://auth.example.test','work','alice')).spaceId:'personal:alice';
  const options={spaceId,authorize,storage:createAtomicFileDocument(join(home,SHELF_DOCUMENT_PATH),authorize)};
  const open=()=>openShelfStore(join(home,'shelf'),openHostShelfFiles(home),{disabled:true},{},undefined,options);
  return {home,options,open,revoke(){active=false;},filename:join(home,SHELF_DOCUMENT_PATH)};
}
function transfer(source:ReturnType<typeof fixture>,target:ReturnType<typeof fixture>,start=0){
  let revision=start;for(let i=0;i<50;i++){
    const operation=source.open().replica().next();if(!operation)return revision;
    target.open().replica().receive({...operation,revision:++revision});source.open().replica().acknowledge(operation.key,operation.operationId,revision);
  }throw new Error('Unexpected unbounded queue');
}

test('S-55 PCSYNC-11/15/22 Shelf transfers full text, binary, nested folders and terminal records without local paths or execution',async t=>{
  const a=fixture(t),b=fixture(t),source=a.open(),target=b.open();
  assert.equal(source.replica().hasProjectChanges!('unrelated-project'),false,'Home copies remain independent even with provenance');
  (await source.saveSettings({drop_wheel_enabled:false}));(await target.saveSettings({engine:'auto'}));(await source.addClipboard('private clipboard'));(await target.addClipboard('target clipboard'));
  const bytes=Buffer.from('beyond preview\n'.repeat(15000)),text=(await source.admit({filename:'long.md',bytes,origin_realpath:join(a.home,'original.md')})),binary=(await source.admit({filename:'raw.bin',bytes:Buffer.from([255,0,254,128])}));
  const folder=(await source.admitFolder({name:'directory',entries:[{relative:'z.txt',bytes:Buffer.from('last')},{relative:'nested/a.bin',bytes:Buffer.from([0,255])}]}));
  const origin=join(a.home,'original.md');writeFileSync(origin,bytes);
  const jobStore=openShelfStore(join(a.home,'shelf'),openHostShelfFiles(a.home),{disabled:true},{},shelfTestAi(),a.options),job=await jobStore.runJob({recipe:'summarize',item_id:text.item_id});
  assert.equal(job.job.status,'succeeded');let rev=transfer(a,b);
  assert.deepEqual(target.readFile(text.item_id).bytes,bytes);assert.deepEqual(target.readFile(binary.item_id).bytes,Buffer.from([255,0,254,128]));
  assert.deepEqual(target.readChild(folder.item_id,'nested/a.bin').bytes,Buffer.from([0,255]));assert.ok(job.result);assert.equal(target.readFile(job.result.item_id).bytes.toString(),source.readFile(job.result.item_id).bytes.toString());
  const received=JSON.parse(readFileSync(b.filename,'utf8'));assert.equal(received.version,2);assert.equal(received.settings.drop_wheel_enabled,true);assert.equal(received.clipboard[0].body,'target clipboard');
  assert.equal(received.jobs[0].runtime,'');assert.equal(received.jobs[0].isolation,'');assert.equal(received.jobs[0].execution,undefined);assert.equal(received.items.find((row:{item_id:string})=>row.item_id===text.item_id).origin_realpath,null);
  assert.equal(target.replica().next(),null);assert.equal((await target.snapshot()).materials.length,3,'receive never adds an example');
  const frozenBytes=source.readFile(text.item_id).bytes;(await source.writeCopy(text.item_id,'new complete body',hashBytes(frozenBytes)));
  const frozen=source.replica().next()!;(await source.writeCopy(text.item_id,'later local edit',hashBytes(source.readFile(text.item_id).bytes)));
  assert.match(JSON.stringify(frozen.value),/new complete body/);assert.doesNotMatch(JSON.stringify(frozen.value),/private clipboard|original\.md|model_selection|execution|origin_realpath/);
  target.replica().receive({...frozen,revision:++rev});source.replica().acknowledge(frozen.key,frozen.operationId,rev);
  assert.equal(target.readFile(text.item_id).bytes.toString(),'new complete body');assert.equal(source.replica().counts().pending,1);rev=transfer(a,b,rev);
  (await source.deleteCopy(text.item_id));rev=transfer(a,b,rev);assert.throws(()=>target.readFile(text.item_id),{code:'shelf.item_not_found'});assert.deepEqual(readFileSync(origin),bytes);
  assert.equal(target.replica().next(),null);assert.equal(received.jobs.length,1);assert.ok(rev>5);
});

test('S-55 PCSYNC-11/15 an explicitly emptied text copy remains a file, not a deletion or missing original',async t=>{
  const a=fixture(t),b=fixture(t),s=a.open(),d=b.open(),item=(await s.admit({filename:'empty.md',bytes:Buffer.from('before empty')}));let rev=transfer(a,b);
  (await s.writeCopy(item.item_id,'',hashBytes(s.readFile(item.item_id).bytes)));rev=transfer(a,b,rev);assert.equal(d.readFile(item.item_id).bytes.byteLength,0);assert.equal((await d.snapshot()).materials.length,1);assert.ok(rev>1);
});

test('S-55 PCSYNC-05/12 Shelf frozen bytes survive edits/deletion and conflict confirmation refuses later local content',async t=>{
  const a=fixture(t),b=fixture(t),s=a.open(),d=b.open(),item=(await s.admit({filename:'one.md',bytes:Buffer.from('base')}));let rev=transfer(a,b);
  (await s.writeCopy(item.item_id,'remote branch',hashBytes(s.readFile(item.item_id).bytes)));(await d.writeCopy(item.item_id,'local branch',hashBytes(d.readFile(item.item_id).bytes)));
  const op=s.replica().next()!;d.replica().receive({...op,revision:++rev});s.replica().acknowledge(op.key,op.operationId,rev);
  const seen=d.replica().inspectConflict!(op.key);assert.ok(seen);(await d.writeCopy(item.item_id,'new local branch',hashBytes(d.readFile(item.item_id).bytes)));
  assert.throws(()=>d.replica().resolve(op.key,'remote',seen.revision,seen.state));assert.equal(d.readFile(item.item_id).bytes.toString(),'new local branch');
  const latest=d.replica().inspectConflict!(op.key)!;d.replica().resolve(op.key,'remote',latest.revision,latest.state);assert.equal(d.readFile(item.item_id).bytes.toString(),'remote branch');
  assert.equal(d.replica().recoveries!().length,1);(await s.writeCopy(item.item_id,'frozen before delete',hashBytes(s.readFile(item.item_id).bytes)));const frozen=s.replica().next()!;
  (await s.deleteCopy(item.item_id));assert.deepEqual(s.replica().next(),frozen);assert.match(JSON.stringify(frozen.value),/frozen before delete/);
  s.replica().acknowledge(frozen.key,frozen.operationId,++rev);assert.equal(s.replica().next()!.value,null);
});

test('S-55 PCSYNC-06/15 Shelf rejects bad scope, body, paths, format and revoked writes without replacing unique files',async t=>{
  const a=fixture(t),b=fixture(t),s=a.open(),d=b.open(),item=(await s.admit({filename:'one.md',bytes:Buffer.from('unique original')})),op=s.replica().next()!;
  const values:unknown[]=[{...op.value as object,spaceId:'other'},JSON.parse(JSON.stringify(op.value)),JSON.parse(JSON.stringify(op.value))];
  (values[1] as {items:{files:{data:string}[]}[]}).items[0]!.files[0]!.data=Buffer.from('fake').toString('base64');
  (values[2] as {items:{record:{name:string}}[]}).items[0]!.record.name='../escape';
  values.forEach((value,index)=>{d.replica().receive({...op,operationId:'invalid-'+index,value,revision:index+1});assert.equal(d.replica().conflicts().length,1);assert.throws(()=>d.readFile(item.item_id));});
  assert.equal(existsSync(join(b.home,'escape')),false);assert.equal(s.readFile(item.item_id).bytes.toString(),'unique original');
  const prior=readFileSync(a.filename);assert.throws(()=>openShelfStore(join(a.home,'shelf'),openHostShelfFiles(a.home),{disabled:true}).settings(),{code:'shelf.invalid_file'});assert.deepEqual(readFileSync(a.filename),prior);
  a.revoke();(await assert.rejects(async ()=>(await s.hide(item.item_id)),/REVOKED/));assert.deepEqual(readFileSync(a.filename),prior);
});

test('S-55 PCSYNC-05/15 Shelf atomic CAS failure leaves the prior bytes reachable; stale text edits cannot overwrite them',async t=>{
  const f=fixture(t),s=f.open(),item=(await s.admit({filename:'one.md',bytes:Buffer.from('initial')})),port=f.options.storage;
  const stale=hashBytes(s.readFile(item.item_id).bytes);(await s.writeCopy(item.item_id,'latest',stale));const before=readFileSync(f.filename);
  (await assert.rejects(async ()=>(await s.writeCopy(item.item_id,'old edit',stale)),{code:'shelf.conflict'}));assert.deepEqual(readFileSync(f.filename),before);
  const loser=openShelfStore(join(f.home,'shelf'),openHostShelfFiles(f.home),{disabled:true},{},undefined,{...f.options,storage:{read:port.read,compareAndSet:()=>false}});
  (await assert.rejects(async ()=>(await loser.writeCopy(item.item_id,'CAS lost',hashBytes(s.readFile(item.item_id).bytes))),{code:'plugin.sync_conflict'}));
  assert.deepEqual(readFileSync(f.filename),before);assert.equal(s.readFile(item.item_id).bytes.toString(),'latest');
});

test('S-55 PCSYNC-12/15 Shelf unavailable original keeps its queue and identifies only that key, without freezing a partial upload',async t=>{
  const f=fixture(t),s=f.open(),bad=(await s.admit({filename:'missing.md',bytes:Buffer.from('not discarded')})),good=(await s.admit({filename:'ok.md',bytes:Buffer.from('keep moving')}));
  const filename=join(s.root,bad.relative_path),bytes=readFileSync(filename);rmSync(filename);
  const key=JSON.stringify(['item',bad.item_id]);assert.throws(()=>s.replica().next(),{code:'plugin.sync_unavailable',kind:'unavailable',details:{sync_key:key,sync_waiting:false}});
  const healthy=s.replica().next({excludeKeys:[key]})!;assert.equal(healthy.key,JSON.stringify(['item',good.item_id]));s.replica().acknowledge(healthy.key,healthy.operationId,1);
  writeFileSync(filename,bytes);assert.equal(s.replica().next()!.key,key);assert.equal(s.replica().counts().pending,1);
  const prior=readFileSync(f.filename);const other=openShelfStore(join(f.home,'shelf'),openHostShelfFiles(f.home),{disabled:true},{},undefined,{...f.options,spaceId:'personal:bob'});assert.throws(()=>other.replica().cursor());assert.deepEqual(readFileSync(f.filename),prior);
});

test('S-55 PCSYNC-12/15 Shelf live work waits on its own asset, while healthy items continue; receive never starts a job',async t=>{
  const a=fixture(t),b=fixture(t),s=a.open(),d=b.open(),item=(await s.admit({filename:'one.md',bytes:Buffer.from('working')})),healthy=(await s.admit({filename:'other.md',bytes:Buffer.from('healthy')}));let rev=transfer(a,b);
  let finish:((value:Awaited<ReturnType<ReturnType<typeof shelfTestAi>['generate']>>)=>void)|undefined;
  const ai=shelfTestAi(()=>new Promise(resolve=>{finish=resolve;})),active=openShelfStore(join(b.home,'shelf'),openHostShelfFiles(b.home),{disabled:true},{},ai,b.options),running=active.runJob({recipe:'summarize',item_id:item.item_id});
  for(let i=0;i<100&&!finish;i++)await setImmediate();assert.ok(finish);
  (await s.hide(item.item_id));(await s.hide(healthy.item_id));rev=transfer(a,b,rev);
  assert.equal((await d.snapshot()).materials.some(row=>row.item_id===item.item_id),true);assert.equal((await d.snapshot()).materials.some(row=>row.item_id===healthy.item_id),false);
  assert.equal(d.replica().conflicts()[0]!.waiting,true);assert.equal(d.replica().counts().pending,0,'live job is not uploaded');
  finish({text:'completed explicitly',execution:shelfTestReceipt});await running;
  d.replica().retryWaiting();assert.equal((await d.snapshot()).materials.some(row=>row.item_id===item.item_id),false);assert.equal(d.replica().conflicts().length,0);assert.ok(rev);
});


test('Shelf keeps complete never-uploaded binary and folder children in the deletion CAS, with offline undo',async t=>{
 const f=fixture(t),s=f.open(),binary=(await s.admit({filename:'unique.bin',bytes:Buffer.from([255,0,17,128])})),folder=(await s.admitFolder({name:'folder',entries:[{relative:'nested/a.bin',bytes:Buffer.from([1,2,255])}]}));
 for(const id of [binary.item_id,folder.item_id])(await s.deleteCopy(id));
 const records=s.replica().recoveries!().filter(row=>row.choice==='local_delete');assert.equal(records.length,2);assert.equal(s.replica().cursor(),0);
 for(const row of records){assert.equal(row.revision,0);s.replica().restoreRecovery!(row.id,'local',0);}
 assert.deepEqual(s.readFile(binary.item_id).bytes,Buffer.from([255,0,17,128]));assert.deepEqual(s.readChild(folder.item_id,'nested/a.bin').bytes,Buffer.from([1,2,255]));assert.equal(s.replica().cursor(),0);
 const original=(await s.admit({filename:'reject.bin',bytes:Buffer.from([254,22])})),port=f.options.storage,loser=openShelfStore(join(f.home,'shelf'),openHostShelfFiles(f.home),{disabled:true},{},undefined,{...f.options,storage:{read:port.read,compareAndSet:()=>false}});
 (await assert.rejects(async ()=>(await loser.deleteCopy(original.item_id)),{code:'plugin.sync_conflict'}));assert.deepEqual(s.readFile(original.item_id).bytes,Buffer.from([254,22]),'CAS failure must not remove the only original file');
});


test('Shelf bounded collection keeps current/shared paths, and checked CAS refuses a file collected after reuse staging',async t=>{
 const f=fixture(t),s=f.open(),item=(await s.admit({filename:'staged.md',bytes:Buffer.from('base')})),old=(await s.writeCopy(item.item_id,'reusable old body',hashBytes(s.readFile(item.item_id).bytes)));
 const oldPath=join(s.root,old.relative_path);(await s.writeCopy(item.item_id,'current complete body',hashBytes(s.readFile(item.item_id).bytes)));const current=s.readFile(item.item_id).bytes;
 const aged=new Date(Date.now()-172800000);utimesSync(oldPath,aged,aged);const filename=join(s.root,'files','unknown-partition');mkdirSync(filename);writeFileSync(join(filename,'must-stay'),'unknown');utimesSync(join(filename,'must-stay'),aged,aged);
 const external=join(f.home,'external.txt');writeFileSync(external,'outside owner');symlinkSync(external,join(s.root,'files','external-link'));
 const port=f.options.storage;let competed=false;
 const racer=openShelfStore(join(f.home,'shelf'),openHostShelfFiles(f.home),{disabled:true},{},undefined,{...f.options,storage:{...port,compareAndSetChecked(expected,next,verify){competed=true;s.replica().maintain!();return port.compareAndSetChecked!(expected,next,verify);}}});
 (await assert.rejects(async ()=>(await racer.writeCopy(item.item_id,'reusable old body',hashBytes(current))),{code:'shelf.sync_unavailable'}));assert.equal(competed,true);assert.equal(existsSync(oldPath),false);assert.deepEqual(s.readFile(item.item_id).bytes,current);
 assert.equal(readFileSync(join(filename,'must-stay'),'utf8'),'unknown');assert.equal(readFileSync(external,'utf8'),'outside owner');
 const lost=(await s.admit({filename:'old-delete.bin',bytes:Buffer.from([255,23])})),deletedPath=join(s.root,lost.relative_path);utimesSync(deletedPath,aged,aged);(await s.deleteCopy(lost.item_id));assert.equal(existsSync(deletedPath),false);
 const record=s.replica().recoveries!().find(row=>row.choice==='local_delete'&&JSON.stringify(s.replica().inspectRecovery!(row.id)).includes(lost.item_id))!;assert.ok(record);s.replica().restoreRecovery!(record.id,'local',0);assert.deepEqual(s.readFile(lost.item_id).bytes,Buffer.from([255,23]),'retained snapshot is self-contained after physical cleanup');
});

test('Shelf bounded collection advances beyond a large retained prefix across passes and restarts safely',async t=>{
 const f=fixture(t,true),s=f.open(),item=(await s.admit({filename:'current.md',bytes:Buffer.from('Keep current complete bytes')})),directory=join(s.root,'files'),unknown=join(directory,'aaaa_unknown');mkdirSync(unknown);
 for(let index=0;index<5100;index++)writeFileSync(join(unknown,String(index).padStart(5,'0')),'unknown owner path');
 const orphanDirectory=join(directory,'item_zzzzzz_aaaaaaaa');mkdirSync(orphanDirectory);const orphan=join(orphanDirectory,'orphan.bin');writeFileSync(orphan,'old unreferenced bytes');const aged=new Date(Date.now()-172800000);utimesSync(orphan,aged,aged);
 const registration=createPersonalPluginRegistrations(f.home,f.options.spaceId,'alice',f.options.authorize,async()=>{throw new Error('DISCOVERY_MUST_NOT_OPEN_CATALOG');},()=>false,()=>false).find(row=>row.selection.collection_id==='copies')!;assert.ok(registration);
 registration.withReplica(replica=>replica.maintain!());assert.equal(existsSync(orphan),true,'first bounded pass stops before the suffix');
 registration.withReplica(replica=>replica.maintain!());assert.equal(existsSync(orphan),false,'real Host calls reuse the same owner traversal cursor');
 assert.equal(readFileSync(join(unknown,'00000'),'utf8'),'unknown owner path');assert.equal(readFileSync(join(unknown,'05099'),'utf8'),'unknown owner path');assert.equal(s.readFile(item.item_id).bytes.toString(),'Keep current complete bytes');
 const reopened=f.open();reopened.replica().maintain!();assert.equal(reopened.readFile(item.item_id).bytes.toString(),'Keep current complete bytes','a new owner may safely restart traversal');
 f.revoke();assert.throws(()=>registration.withReplica(replica=>replica.cursor()),/REVOKED/,'a cached owner cannot outlive its authorization');
});
