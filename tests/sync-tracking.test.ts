import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { compileSyncTrackingSql, syncTrackingSeedSql, replicaSchemaSql } from '@molis-ai/molis-work-storage';
import type { SyncTrackedTable } from '@molis-ai/molis-work-contracts/platform/plugin-sync';

test('declarative tracking follows old and new parents atomically and ignores receiver writes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE parents(id TEXT PRIMARY KEY,project_id TEXT);CREATE TABLE children(id TEXT PRIMARY KEY,parent_id TEXT,project_id TEXT);${replicaSchemaSql('owner')}`);
    db.exec("INSERT INTO owner_replica_state(id,device,cursor,applying) VALUES(1,'device',0,0);INSERT INTO parents VALUES('a','p'),('b','p');");
    const tracking: SyncTrackedTable[] = [{table: 'children', key: [{column: 'project_id'}, {literal: 'replica_literal'}, {column: 'id'}], lookup: {table: 'parents', match: [{column: 'id', rowColumn: 'parent_id'}, {column: 'project_id', rowColumn: 'project_id'}]}}];
    db.exec(compileSyncTrackingSql(tracking, 'owner'));
    db.exec("INSERT INTO children VALUES('child','a','p');UPDATE children SET parent_id='b';");
    assert.deepEqual(db.prepare('SELECT key FROM owner_replica_changes ORDER BY seq').all().map(row => row.key), ['["p","replica_literal","a"]','["p","replica_literal","b"]','["p","replica_literal","a"]']);
    db.exec('DELETE FROM owner_replica_changes;UPDATE owner_replica_state SET applying=1;DELETE FROM children;');
    assert.equal(db.prepare('SELECT count(*) AS n FROM owner_replica_changes').get()!.n, 0);
  } finally { db.close(); }
});
test('tracker seeds only matching owner rows and keeps the highest edit revision', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE molis_storage_space(singleton INTEGER PRIMARY KEY, descriptor TEXT);INSERT INTO molis_storage_space VALUES(1,'{"ownerUserId":"alice"}');CREATE TABLE items(id TEXT PRIMARY KEY,actor TEXT,revision INTEGER);CREATE TABLE versions(id TEXT PRIMARY KEY,revision INTEGER);${replicaSchemaSql('owner')}`);
    db.exec("INSERT INTO owner_replica_state(id,device,cursor,applying) VALUES(1,'device',0,0);INSERT INTO items VALUES('mine','alice',3),('other','bob',9);");
    const tracking: SyncTrackedTable[] = [{table: 'items', key: [{literal: 'item'}, {column: 'id'}], where: [{column: 'actor', op: 'eq', value: {actorId: true}}], revision: {table: 'versions', key: [{column:'id',rowColumn:'id'}], column:'revision',rowColumn:'revision'}}];
    db.exec(syncTrackingSeedSql(tracking, 'owner'));
    assert.deepEqual(db.prepare('SELECT key FROM owner_replica_changes').all().map(row => row.key), ['["item","mine"]']);
    db.exec(compileSyncTrackingSql(tracking, 'owner'));
    db.exec("UPDATE items SET revision=4 WHERE id='mine';UPDATE items SET revision=2 WHERE id='mine';UPDATE items SET revision=12 WHERE id='other';");
    assert.equal(db.prepare("SELECT revision FROM versions WHERE id='mine'").get()!.revision, 4);
    assert.equal(db.prepare("SELECT revision FROM versions WHERE id='other'").get(), undefined);
  } finally { db.close(); }
});

test('structured update conditions ignore running process progress and retain terminal edits', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE plans(id TEXT PRIMARY KEY,title TEXT,state TEXT,runtime_session_id TEXT);${replicaSchemaSql('owner')}`);
    db.exec("INSERT INTO owner_replica_state(id,device,cursor,applying) VALUES(1,'device',0,0)");
    const tracking: SyncTrackedTable[] = [{table:'plans',key:[{column:'id'}],updateAny:[
      {changed:['title']},
      {changed:['state'],where:[{column:'state',op:'in',values:['completed','failed']},{column:'runtime_session_id',op:'not-null'}]},
    ]}];
    db.exec(compileSyncTrackingSql(tracking,'owner'));
    db.exec("INSERT INTO plans VALUES('plan','Original','queued',NULL);DELETE FROM owner_replica_changes;UPDATE plans SET state='running',runtime_session_id='owned';");
    assert.equal(db.prepare('SELECT count(*) n FROM owner_replica_changes').get()!.n,0);
    db.exec("UPDATE plans SET state='completed';");
    assert.equal(db.prepare('SELECT count(*) n FROM owner_replica_changes').get()!.n,1);
    db.exec("DELETE FROM owner_replica_changes;UPDATE plans SET title='Renamed';");
    assert.equal(db.prepare('SELECT count(*) n FROM owner_replica_changes').get()!.n,1);
  } finally { db.close(); }
});
