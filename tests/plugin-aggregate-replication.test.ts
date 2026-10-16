import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {ensureStorageSpace,personalStorageSpace,homeSqlitePath,type AggregateReplicaContext} from '@molis-ai/molis-work-storage';
import type {SyncEvent,SyncReplicaAdapter} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {openFormStore} from '@molis-ai/molis-work-plugin-form';
import {openDatasetStore} from '@molis-ai/molis-work-plugin-dataset';
import {openPptStore} from '@molis-ai/molis-work-plugin-ppt';
import {openLingguangStore} from '@molis-ai/molis-work-plugin-lingguang';

function fixture(t:any){
  const root=mkdtempSync(join(tmpdir(),'plugin-replication-')),homes=[join(root,'a'),join(root,'b')];
  const space=personalStorageSpace('http://127.0.0.1:8787','work','alice');homes.forEach(h=>ensureStorageSpace(h,space));
  let active=true,enabled=true,ready=true,revision=0;
  const context:AggregateReplicaContext={spaceId:space.spaceId,authorize(){if(!active)throw new Error('REVOKED');},canUploadProject:p=>enabled&&p==='project',project(p){assert.equal(p,'project');return {title:'测试项目'};},hasArtifact:()=>ready};
  const stores:{close():void}[]=[];
  const open=<S extends {close():void}>(factory:(home:string)=>S,i:number):S=>{const s=factory(homes[i]!);stores.push(s);return s;};
  const events:SyncEvent[]=[];
  function send(a:SyncReplicaAdapter,b:SyncReplicaAdapter){for(let i=0;i<40;i++){const m=a.next();if(!m)return;const e={...m,revision:++revision};events.push(e);a.receive(e);b.receive(e);}throw new Error('replication echo');}
  t.after(()=>{stores.forEach(s=>s.close());rmSync(root,{recursive:true,force:true});});
  return {homes,space,context,open,send,events,nextRevision:()=>++revision,disable:()=>enabled=false,revoke:()=>active=false,ready:(v:boolean)=>ready=v};
}

test('Form transfers captured questions, idempotent submissions and tombstones; remote writes invalidate editor CAS',t=>{
  const f=fixture(t),a=f.open(openFormStore,0),b=f.open(openFormStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const form=a.create({project_id:'project',title:'调查'});
  const edited=a.update(form.id,{questions:[{id:'q',title:'意见',type:'text',required:true}]});
  a.publish(form.id);const answer=a.submit(form.id,{q:'你好'},'project',{requestId:'request-1'});
  f.send(ra,rb);const saved=b.get(form.id);assert.equal(saved.title,'调查');assert.deepEqual(b.listSubmissions(form.id),a.listSubmissions(form.id));
  assert.equal(b.submit(form.id,{q:'你好'},'project',{requestId:'request-1'}).id,answer.id);
  a.update(form.id,{title:'调查修订'});f.send(ra,rb);assert.ok(b.get(form.id).version>saved.version);
  assert.throws(()=>b.update(form.id,{title:'过期写入',expected_version:saved.version}),/改变|修改/);
  assert.equal(rb.next(),null);a.delete(form.id);f.send(ra,rb);assert.throws(()=>b.get(form.id),/找不到/);
  assert.ok(edited.questions.length===1);
});

test('Dataset transfers saved immutable snapshots and permits owner rollback on another device',t=>{
  const f=fixture(t),a=f.open(openDatasetStore,0),b=f.open(openDatasetStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const d=a.create({project_id:'project',title:'预算'});a.importCsv(d.id,'项目,金额\n设计,100\n开发,200');const version=a.saveVersion(d.id,'原始版本');a.update(d.id,{title:'最新预算'});
  f.send(ra,rb);assert.deepEqual(b.listVersions(d.id),a.listVersions(d.id));assert.deepEqual(b.get(d.id).rows,a.get(d.id).rows);
  b.rollback(d.id,version.id,'project',b.get(d.id).version);assert.equal(b.get(d.id).title,'预算');f.send(rb,ra);assert.equal(a.get(d.id).title,'预算');
});

test('PPT preserves slides, notes and colors; both sides survive conflicts and restart',t=>{
  const f=fixture(t),a=f.open(openPptStore,0),b=f.open(openPptStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const d=a.create({project_id:'project',title:'方案'});a.update(d.id,{color_primary:'#123456',slides:[{id:'slide',title:'首页',bullets:['内容'],notes:'讲者备注'}]});f.send(ra,rb);
  assert.deepEqual(b.get(d.id).slides,a.get(d.id).slides);assert.equal(b.get(d.id).color_primary,'#123456');
  a.update(d.id,{title:'设备 A'});b.update(d.id,{title:'设备 B'});f.send(ra,rb);
  assert.equal(rb.counts().conflicts,1);assert.equal(b.get(d.id).title,'设备 B');
  const again=f.open(openPptStore,1).replica(f.context);assert.equal(again.counts().conflicts,1);again.resolve(again.conflicts()[0]!.key,'remote');assert.equal(b.get(d.id).title,'设备 A');assert.equal(again.next(),null);
  const db=new DatabaseSync(homeSqlitePath(f.homes[1]!,'ppt'));try{const backup=db.prepare('SELECT local_json FROM replica_resolutions').get()!;assert.match(String(backup.local_json),/设备 B/);}finally{db.close();}
});

test('Lingguang restores completed conversation turns, ordering and workflow idempotency without generating replies',t=>{
  const f=fixture(t),a=f.open(openLingguangStore,0),b=f.open(openLingguangStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const spark=a.create({project_id:'project',title:'点子',body:'原文',request_id:'delivery-1'});const opened=a.openConversation([spark.id],'project');
  a.addReply(opened.conversation.id,'怎么做','完成的回复','project',opened);f.send(ra,rb);
  assert.deepEqual(b.conversation(opened.conversation.id,'project').messages,a.conversation(opened.conversation.id,'project').messages);
  assert.equal(b.create({project_id:'project',title:'点子',body:'原文',request_id:'delivery-1'}).id,spark.id);
  const stale=b.get(spark.id);a.update(spark.id,{body:'新原文'});f.send(ra,rb);assert.throws(()=>b.update(spark.id,{body:'旧输入',expected_updated_at:stale.updated_at}),/修改/);
  a.discard([spark.id]);f.send(ra,rb);assert.equal(b.get(spark.id).status,'discarded');assert.equal(rb.next(),null);
});

test('Publication is never transferred or overwritten, and missing fixed artifacts wait then retry',t=>{
  const f=fixture(t),a=f.open(openPptStore,0),b=f.open(openPptStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const p=a.create({project_id:'project'}),intent=a.beginPublication(p.id,'project','alice');assert.throws(()=>ra.next(),/发布/);
  a.completePublication(p.id,'project',intent,{artifact_id:'ppt-'+p.id,version:1});f.ready(false);f.send(ra,rb);assert.equal(rb.conflicts()[0]?.waiting,true);assert.throws(()=>b.get(p.id),/找不到/);
  f.ready(true);rb.retryWaiting!();assert.equal(b.get(p.id).artifact_version,1);assert.equal(rb.counts().conflicts,0);
  b.beginPublication(p.id,'project','alice');a.update(p.id,{title:'远端改动'});f.send(ra,rb);assert.equal(rb.counts().conflicts,1);assert.throws(()=>rb.resolve(rb.conflicts()[0]!.key,'remote'),/发布/);assert.ok(b.get(p.id).publication_pending);
});

test('Invalid fields, wrong space, cross-project collisions and oversized payloads do not partially apply',t=>{
  const f=fixture(t),a=f.open(openPptStore,0),b=f.open(openPptStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const p=a.create({project_id:'project',title:'safe'});f.send(ra,rb);const source=f.events[0]!;
  for(const change of [(v:any)=>v.spaceId='other',(v:any)=>v.record.secret='oops',(v:any)=>v.record.slides_json='[]',(v:any)=>v.record.title='x'.repeat(600000)]){
    const v=structuredClone(source.value);change(v);rb.receive({...source,operationId:crypto.randomUUID(),value:v,revision:f.nextRevision()});assert.equal(b.get(p.id).title,'safe');assert.equal(rb.counts().conflicts,1);
  }
  assert.throws(()=>b.replica({...f.context,spaceId:'other'}),/空间/);
  const db=new DatabaseSync(homeSqlitePath(f.homes[1]!,'ppt'));try{db.prepare("UPDATE presentations SET project_id='another-project' WHERE id=?").run(p.id);}finally{db.close();}
  assert.throws(()=>rb.resolve(rb.conflicts()[0]!.key,'remote'),/其他项目/);
});

test('Disabled project and revoked account never yield queued uploads; local Home is not admitted',t=>{
  const f=fixture(t),a=f.open(openPptStore,0);a.create({project_id:'project'});const r=a.replica(f.context);f.disable();assert.equal(r.next(),null);f.revoke();assert.throws(()=>r.next(),/REVOKED/);
  const local=join(f.homes[0]!,'local');const s=f.open(()=>openPptStore(local),0);assert.throws(()=>s.replica(f.context),/空间/);
});

test('Lingguang waits for missing sparks before restoring a conversation',t=>{
  const f=fixture(t),a=f.open(openLingguangStore,0),b=f.open(openLingguangStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const spark=a.create({project_id:'project',title:'关联想法'}),conversation=a.openConversation([spark.id],'project');
  const first=ra.next()!;ra.receive({...first,revision:1});const second=ra.next()!;assert.match(second.key,/conversation/);
  rb.receive({...second,revision:1});assert.equal(rb.conflicts()[0]?.waiting,true);assert.throws(()=>b.conversation(conversation.conversation.id,'project'),/找不到/);
  rb.receive({...first,revision:2});rb.retryWaiting!();assert.equal(rb.counts().conflicts,0);assert.equal(b.conversation(conversation.conversation.id,'project').sparks[0]!.id,spark.id);assert.equal(rb.next(),null);
});

test('A lost receipt stays frozen across connections while later local edits remain queued',t=>{
  const f=fixture(t),a=f.open(openPptStore,0),b=f.open(openPptStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const p=a.create({project_id:'project',title:'第一版'}),mutation=ra.next()!;
  a.update(p.id,{title:'后来的编辑'});const reopened=f.open(openPptStore,0).replica(f.context);assert.deepEqual(reopened.next(),mutation);
  const receipt={...mutation,revision:f.nextRevision()};reopened.receive(receipt);rb.receive(receipt);assert.equal(b.get(p.id).title,'第一版');
  f.send(reopened,rb);assert.equal(b.get(p.id).title,'后来的编辑');assert.equal(reopened.counts().pending,0);
});

test('Remote deletion and recreation cannot reset a target editor version',t=>{
  const f=fixture(t),a=f.open(openPptStore,0),b=f.open(openPptStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const p=a.create({project_id:'project'});f.send(ra,rb);const original=f.events[0]!;
  for(let i=0;i<4;i++){a.update(p.id,{title:'版'+i});f.send(ra,rb);}
  const version=b.get(p.id).version;a.delete(p.id);f.send(ra,rb);rb.receive({...original,operationId:'restore',revision:f.nextRevision()});assert.ok(b.get(p.id).version>version);
  assert.throws(()=>b.update(p.id,{title:'过期输入',expected_version:version}),/改变|修改/);
});

test('Owner rollback rolls back child and root sync journal entries together',t=>{
  const f=fixture(t),a=f.open(openFormStore,0),b=f.open(openFormStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const form=a.create({project_id:'project'});f.send(ra,rb);
  const db=new DatabaseSync(homeSqlitePath(f.homes[0]!,'form'));try{db.exec('BEGIN');db.prepare('UPDATE forms SET title=? WHERE id=?').run('never commit',form.id);db.exec('ROLLBACK');}finally{db.close();}
  assert.equal(ra.next(),null);assert.notEqual(a.get(form.id).title,'never commit');
});

test('Dataset historical publication status is preserved as history, never resumed on the target',t=>{
  const f=fixture(t),a=f.open(openDatasetStore,0),b=f.open(openDatasetStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const d=a.create({project_id:'project'}),intent=a.beginPublication(d.id,'project','alice');const saved=a.saveVersion(d.id,'发布时快照');
  a.completePublication(d.id,'project',intent,{artifact_id:'dataset-'+d.id,version:1});f.send(ra,rb);
  assert.deepEqual(b.listVersions(d.id)[0],saved);assert.equal(b.get(d.id).publication_pending,undefined);
  b.rollback(d.id,saved.id,'project');assert.equal(b.get(d.id).publication_pending,undefined);
});

test('Form rejects a tampered captured answer and a child ID owned by another form atomically',t=>{
  const f=fixture(t),a=f.open(openFormStore,0),b=f.open(openFormStore,1),ra=a.replica(f.context),rb=b.replica(f.context);
  const d=a.create({project_id:'project'});a.update(d.id,{questions:[{id:'rating',title:'评分',type:'rating',required:true}]});a.submit(d.id,{rating:'5'});f.send(ra,rb);
  const source=f.events[0]!,bad=structuredClone(source.value) as any;bad.children.submissions[0].answers_json=JSON.stringify({rating:'99'});
  rb.receive({...source,operationId:'invalid-answer',value:bad,revision:f.nextRevision()});assert.equal(rb.counts().conflicts,1);assert.equal(b.listSubmissions(d.id)[0]!.answers.rating,'5');
  const other=b.create({project_id:'project'}),row=b.submit(other.id,{});const collision=structuredClone(source.value) as any;collision.children.submissions[0].id=row.id;
  rb.receive({...source,operationId:'wrong-child-owner',value:collision,revision:f.nextRevision()});assert.equal(b.listSubmissions(other.id)[0]!.id,row.id);assert.equal(b.listSubmissions(d.id)[0]!.answers.rating,'5');
});
