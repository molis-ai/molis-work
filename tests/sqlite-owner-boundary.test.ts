import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { nativeSqliteOwnerBoundary } from '@molis-ai/molis-work-storage';

test('Home owner boundary executes ordinary SQL but refuses foreign tables and connection controls', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE records(id TEXT PRIMARY KEY, body TEXT); CREATE TABLE private_data(value TEXT);');
    const execute = nativeSqliteOwnerBoundary(db, new Set(['records']), new Map());
    const run = (sql: string, mode: 'read' | 'write' = 'read') => execute(sql, [], mode, () => db.prepare(sql).all());
    run("INSERT INTO records VALUES('one','body')", 'write');
    assert.equal(run('SELECT count(*) AS n FROM records')[0]!.n, 1);
    assert.equal(run('SELECT rowid FROM records LIMIT 1').length, 1);
    assert.equal(run('SELECT EXISTS(SELECT 1 FROM records) AS present')[0]!.present, 1);
    assert.equal(run('WITH selected AS(SELECT * FROM records)SELECT body FROM selected')[0]!.body, 'body');
    assert.deepEqual(run("SELECT value FROM json_each('[1,2]')").map(row => row.value), [1,2]);
    for (const sql of ['SELECT * FROM private_data', 'SELECT count(*) FROM private_data', 'SELECT count(*) FROM sqlite_schema', 'SELECT * FROM sqlite_schema', "UPDATE records SET body='changed'", 'PRAGMA user_version', "ATTACH ':memory:' AS extra", 'CREATE TABLE extra(id)', "SELECT load_extension('/tmp/extension')", 'WITH RECURSIVE r(x)AS(SELECT 1 UNION ALL SELECT x+1 FROM r WHERE x<4)SELECT * FROM r']) {
      assert.throws(() => run(sql));
    }
    assert.equal(run('SELECT body FROM records')[0]!.body, 'body');
    // Host operations recover their own authority after a refusal.
    assert.equal(db.prepare('SELECT count(*) AS n FROM private_data').get()!.n, 0);
  } finally { db.close(); }
});

test('only the exact complete-baseline trigger can write a technical journal; CTE origin spoofing and tampering are rejected', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE records(id TEXT); CREATE TABLE journal(value TEXT); CREATE TABLE secret(value TEXT); CREATE TRIGGER sync_owner_track AFTER INSERT ON records BEGIN INSERT INTO journal VALUES(NEW.id); END;');
    const expected = String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='sync_owner_track'").get()!.sql);
    const execute = nativeSqliteOwnerBoundary(db, new Set(['records']), new Map([['sync_owner_track',expected]]));
    const run = (sql: string, mode: 'read' | 'write') => execute(sql, [], mode, () => db.prepare(sql).all());
    run("INSERT INTO records VALUES('one')", 'write');
    assert.equal(db.prepare('SELECT value FROM journal').get()!.value, 'one');
    assert.throws(() => run('SELECT * FROM journal', 'read'));
    assert.throws(() => run('WITH "sync_owner_track" AS(SELECT * FROM secret) SELECT * FROM "sync_owner_track"', 'read'));
    db.exec('DROP TRIGGER sync_owner_track; CREATE TRIGGER sync_owner_track AFTER INSERT ON records BEGIN INSERT INTO secret VALUES(NEW.id); END;');
    assert.throws(() => run("INSERT INTO records VALUES('two')", 'write'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM records').get()!.n, 1);
  } finally { db.close(); }
});

test('declared business triggers retain owner access without acquiring technical-table privileges', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE records(id TEXT); CREATE TABLE deleted(id TEXT); CREATE TABLE journal(value TEXT); CREATE TRIGGER remember_delete AFTER DELETE ON records BEGIN INSERT INTO deleted VALUES(OLD.id); END; INSERT INTO records VALUES(\'one\');');
    const business = new Map([['remember_delete',String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='remember_delete'").get()!.sql)]]);
    let execute = nativeSqliteOwnerBoundary(db, new Set(['records','deleted']), new Map(), business);
    execute('DELETE FROM records', [], 'write', () => db.prepare('DELETE FROM records').run());
    assert.equal(db.prepare('SELECT id FROM deleted').get()!.id, 'one');
    db.exec('DROP TRIGGER remember_delete; CREATE TRIGGER remember_delete AFTER INSERT ON records BEGIN INSERT INTO journal VALUES(NEW.id); END;');
    business.set('remember_delete',String(db.prepare("SELECT sql FROM sqlite_schema WHERE name='remember_delete'").get()!.sql));
    execute = nativeSqliteOwnerBoundary(db, new Set(['records','deleted']), new Map(), business);
    assert.throws(() => execute("INSERT INTO records VALUES('two')", [], 'write', () => db.prepare("INSERT INTO records VALUES('two')").run()));
    assert.equal(db.prepare('SELECT count(*) AS n FROM journal').get()!.n, 0);
  } finally { db.close(); }
});

test('null-schema count and rowid reads never borrow an owner name from an attached or temporary table', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE records(id INTEGER PRIMARY KEY, body TEXT); INSERT INTO records VALUES(1,\'owner\');');
    const boundary=nativeSqliteOwnerBoundary(db,new Set(['records']),new Map());
    const run=(sql:string)=>boundary(sql,[],'read',()=>db.prepare(sql).all());
    assert.equal(run('SELECT count(*) AS n FROM records')[0]!.n,1);
    assert.equal(run('SELECT id FROM records LIMIT 1')[0]!.id,1);
    db.exec("ATTACH ':memory:' AS other;CREATE TABLE other.records(id INTEGER PRIMARY KEY);INSERT INTO other.records VALUES(2);");
    assert.throws(()=>run('SELECT count(*) FROM other.records'));
    assert.throws(()=>run('SELECT count(*) FROM records'),'ambiguous null-schema names fail closed');
    assert.equal(run('SELECT count(*) AS n FROM main.records')[0]!.n,1);
    db.exec('DETACH other;CREATE TEMP TABLE records(id INTEGER PRIMARY KEY);INSERT INTO temp.records VALUES(3);');
    assert.throws(()=>run('SELECT count(*) FROM records'));
    assert.throws(()=>run('SELECT id FROM records LIMIT 1'));
    assert.throws(()=>run('SELECT count(*) FROM temp.records'));
    assert.equal(run('SELECT count(*) AS n FROM main.records')[0]!.n,1);
  } finally {db.close();}
});

test('live schema inspection has bounded query cost as trusted triggers grow, and still rejects a subsequent change', t => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE records(id TEXT); CREATE TABLE journal(value TEXT);');
    for (let index = 0; index < 64; index++) db.exec(`CREATE TRIGGER sync_track_${index} AFTER INSERT ON records BEGIN INSERT INTO journal VALUES(NEW.id); END;`);
    const expected = new Map((db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger'").all() as {name:string;sql:string}[]).map(row => [row.name,row.sql]));
    const boundary = nativeSqliteOwnerBoundary(db, new Set(['records']), expected);
    const prepare = db.prepare.bind(db); let queries = 0;
    t.mock.method(db, 'prepare', (sql: string) => { queries++; return prepare(sql); });
    const read = () => boundary('SELECT count(*) AS n FROM records', [], 'read', () => db.prepare('SELECT count(*) AS n FROM records').get());
    assert.equal(read()!.n, 0);
    assert.ok(queries <= 4, `a single read must not issue a metadata query per trigger (${queries} queries)`);
    t.diagnostic(`SQL calls for one owner read with 64 trusted triggers: ${queries}`);
    db.exec('DROP TRIGGER sync_track_63');
    assert.throws(read, {code:'actions.forbidden'}, 'the next read inspects the live schema; it cannot reuse stale trust');
  } finally { db.close(); }
});

test('live schema inspection refuses foreign tables with case-variant JSON table-function names', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE records(id TEXT);');
    const boundary = nativeSqliteOwnerBoundary(db, new Set(['records']), new Map());
    const read = (sql: string) => boundary(sql, [], 'read', () => db.prepare(sql).all());
    for (const name of ['JSON_EACH', 'Json_Tree']) {
      db.exec(`CREATE TABLE ${name}(value TEXT); INSERT INTO ${name} VALUES('foreign secret');`);
      assert.throws(() => read(`SELECT value FROM ${name}`));
      assert.throws(() => read(`SELECT count(*) FROM ${name}`));
      db.exec(`DROP TABLE ${name}`);
    }
    assert.deepEqual(read("SELECT value FROM json_each('[1,2]')").map(row => row.value), [1,2]);
  } finally { db.close(); }
});
