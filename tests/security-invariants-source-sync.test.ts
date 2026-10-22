import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {SourcesModule,sourceContentReplicationDefinition,sourceDeletedAt} from '@molis-ai/molis-work-module-sources';
import {createProjectReplicaSection,replicaTransaction,type ReplicaDatabase,type ReplicaInputValue,type ReplicaOutputValue} from '@molis-ai/molis-work-storage';
import type {SourceRecord} from '@molis-ai/molis-work-contracts/modules/sources';

const source=(label:string):SourceRecord=>({project_id:'project',source_id:'source',kind:'github',definition_id:'github.notifications',sync_kind:'github',name:label,description:label+' description',status:'active',enabled:true,origin:'molis_work',config:{connection_id:label+'-connection',repository:'owner/repository'},schedule:{mode:'interval',enabled:true,interval_minutes:30,next_pull_at:'2026-10-19T00:00:00.000Z'},connection_ref:label+'-reference',account_label:label,last_sync_at:'2026-10-18T00:00:00.000Z',last_outcome:'saved',last_error_code:null,imported_at:'2026-10-18T00:00:00.000Z',updated_at:'2026-10-18T00:00:00.000Z'});
function fixture(){
 const db=new Database(':memory:');db.pragma('foreign_keys=ON');db.exec("CREATE TABLE project_root(project_id TEXT PRIMARY KEY);INSERT INTO project_root VALUES('project');CREATE TABLE boards(project_id TEXT PRIMARY KEY);INSERT INTO boards VALUES('project')");const owner=new SourcesModule(db);
 const port:ReplicaDatabase={exec:sql=>db.exec(sql),prepare:sql=>db.prepare<ReplicaInputValue[],Record<string,ReplicaOutputValue>>(sql)};
 return {db,owner,port,section:createProjectReplicaSection(port,sourceContentReplicationDefinition(),'project')};
}
test('S-79 PCSYNC-01/22 Sources portable description excludes connection state and preserves target-only setup',t=>{
 const a=fixture(),b=fixture(),fresh=fixture();t.after(()=>[a,b,fresh].forEach(f=>f.db.close()));
 a.owner.commands.save(source('source-device'));b.owner.commands.save(source('target-device'));
 const wire=a.section.read();assert.doesNotMatch(JSON.stringify(wire),/source-device-connection|source-device-reference|next_pull_at|repository/);
 assert.equal(wire.feed_sources![0]!.enabled,0);assert.equal(wire.feed_sources![0]!.credential_ref,null);
 const incoming=b.section.validate(wire);replicaTransaction(b.port,()=>{b.section.clear();b.section.write(incoming);});
 const target=b.owner.query.get('project','source');assert.equal(target.name,'source-device');assert.equal(target.connection_ref,'target-device-reference');assert.equal(target.config.connection_id,'target-device-connection');assert.equal(target.enabled,true);assert.ok(Date.parse(target.updated_at)>Date.parse(source('target-device').updated_at));
 const newRows=fresh.section.validate(wire);replicaTransaction(fresh.port,()=>{fresh.section.clear();fresh.section.write(newRows);});const newSource=fresh.owner.query.get('project','source');assert.equal(newSource.enabled,false);assert.equal(newSource.status,'paused');assert.equal(newSource.connection_ref,null);assert.deepEqual(newSource.config,{});assert.deepEqual(newSource.schedule,{mode:'manual'});
 for(const change of [(r:typeof wire)=>{r.feed_sources![0]!.project_id='other';},(r:typeof wire)=>{r.feed_sources![0]!.config_json='{"connection_id":"not-permitted"}';},(r:typeof wire)=>{r.feed_sources![0]!.credential_ref='not-permitted';}]){const bad=structuredClone(wire);change(bad);assert.throws(()=>b.section.validate(bad));assert.equal(b.owner.query.get('project','source').connection_ref,'target-device-reference');}
});
test('S-79 PCSYNC-14/17 Sources restores retirement without reviving pulls and rollback retains target setup',t=>{
 const a=fixture(),b=fixture();t.after(()=>[a,b].forEach(f=>f.db.close()));a.owner.commands.save(source('source-device'));b.owner.commands.save(source('target-device'));
 const original=b.owner.query.get('project','source'),wire=a.section.read(),valid=b.section.validate(wire);valid.feed_sources![0]!.name=null;
 assert.throws(()=>replicaTransaction(b.port,()=>{b.section.clear();b.section.write(valid);}));assert.deepEqual(b.owner.query.get('project','source'),original);
 const at='2026-10-18T01:00:00.000Z';a.owner.commands.retire('project','source','retain_history',at);const retired=b.section.validate(a.section.read());replicaTransaction(b.port,()=>{b.section.clear();b.section.write(retired);});
 const value=b.owner.query.get('project','source');assert.equal(sourceDeletedAt(value),at);assert.equal(value.enabled,false);assert.deepEqual(value.schedule,{mode:'manual'});assert.equal(value.connection_ref,null);assert.equal(b.owner.events.list('project').length,2);
});
