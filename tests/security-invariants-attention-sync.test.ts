import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {AttentionModule,attentionContentReplicationDefinition} from '@molis-ai/molis-work-module-attention-resumption';
import {bindDatabaseSpace,personalStorageSpace,createProjectContentReplicaFactory,installProjectReplicaJournal,replicaSchemaSql,type ReplicaDatabase,type ReplicaInputValue,type ReplicaOutputValue} from '@molis-ai/molis-work-storage';

function fixture(){
 const db=new Database(':memory:');db.pragma('foreign_keys=ON');db.exec("CREATE TABLE boards(project_id TEXT PRIMARY KEY);INSERT INTO boards VALUES('project')");let effects=0;
 const owner=new AttentionModule(db,{exists:()=>true},{eventSink(){effects++;}});
 const port:ReplicaDatabase={exec:sql=>db.exec(sql),prepare:sql=>db.prepare<ReplicaInputValue[],Record<string,ReplicaOutputValue>>(sql)};
 const space=personalStorageSpace('https://auth.example','work','user');bindDatabaseSpace(port,space);
 db.exec(replicaSchemaSql('attention'));
 const definition=attentionContentReplicationDefinition();installProjectReplicaJournal(port,'attention',[definition],['project']);
 const replica=createProjectContentReplicaFactory([definition],'attention','project_attention')(port,{spaceId:space.spaceId,projectId:'project',title:'Test',authorize(){}});
 return {db,owner,replica,effects:()=>effects};
}
const create=(f:ReturnType<typeof fixture>)=>f.owner.commands.create({project_id:'project',entry_id:'entry',subject_type:'feed_item',subject_id:'missing-on-new-device',reason:'manual',detail:{source_id:'saved-source'}}).entry;

test('S-68 PCSYNC-14/22 Inbox restores references and fixed history without invoking subject or judgment effects',t=>{
 const a=fixture(),b=fixture();t.after(()=>[a,b].forEach(f=>f.db.close()));const first=create(a);a.owner.commands.setStatus('project',first.entry_id,'done',first.revision);
 const mutation=a.replica.next()!;assert.ok(mutation);b.replica.receive({...mutation,revision:1});
 const value=b.owner.query.get('project','entry');assert.equal(value.status,'done');assert.equal(value.subject_id,'missing-on-new-device');assert.deepEqual(value.detail,{source_id:'saved-source'});assert.equal(b.owner.events.list('project').length,2);assert.equal(b.effects(),0);assert.equal(b.replica.next(),null,'remote restore is not a local modification');
 const before=b.owner.query.list('project'),events=b.owner.events.list('project');
 let revision=1;for(const change of [(r:Record<string,unknown>)=>{r.project_id='other';},(r:Record<string,unknown>)=>{r.detail_json='{"body":"copied content"}';},(r:Record<string,unknown>)=>{r.status='running';},(r:Record<string,unknown>)=>{r.reason='source_fault';},(r:Record<string,unknown>)=>{r.completed_at=null;}]){
  const wire=structuredClone(mutation.value) as {facts:{attention_content:{inbox_entries:Record<string,unknown>[]}}};change(wire.facts.attention_content.inbox_entries[0]!);
  b.replica.receive({key:mutation.key,operationId:crypto.randomUUID(),base:1,value:wire,revision:++revision});assert.equal(b.replica.counts().conflicts,1,'invalid content is isolated, not adopted');assert.throws(()=>b.replica.resolve(mutation.key,'remote',revision));assert.deepEqual(b.owner.query.list('project'),before);assert.deepEqual(b.owner.events.list('project'),events);assert.equal(b.effects(),0);
 }
});
test('S-68 PCSYNC-15/17 equal numeric revisions cannot let a stale editor overwrite an adopted Inbox branch',t=>{
 const a=fixture(),b=fixture();t.after(()=>[a,b].forEach(f=>f.db.close()));create(a);create(b);a.owner.commands.setStatus('project','entry','done',1);b.owner.commands.setStatus('project','entry','dismissed',1);
 const shown=b.owner.query.get('project','entry');assert.equal(shown.revision,2);const mutation=a.replica.next()!;b.replica.receive({...mutation,revision:1});assert.equal(b.replica.counts().conflicts,1);
 b.replica.resolve(mutation.key,'remote',1);const adopted=b.owner.query.get('project','entry');assert.equal(adopted.status,'done');assert.ok(adopted.revision>shown.revision);
 const before=b.owner.events.list('project');assert.throws(()=>b.owner.commands.setStatus('project','entry','open',shown.revision),{code:'attention.revision_conflict'});assert.deepEqual(b.owner.query.get('project','entry'),adopted);assert.deepEqual(b.owner.events.list('project'),before);
});
