import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {randomBytes, createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {openMolisWorkProjectCatalog} from '@molis-ai/molis-work-app-desktop';
import {createMolisWorkLocalHost} from '@molis-ai/molis-work-app-local-host';
import {LocalSqliteStorage} from '@molis-ai/molis-work-storage';
import {createMolisWorkWebServer} from '../apps/desktop/launchers/web/server.js';
import {MolisWorkCasebookClient, CasebookError, PURPOSE} from '../apps/local-host/src/casebook/client.js';
import {assertProjectRecoverySchema} from '../apps/local-host/src/project-migrations.js';
import {PROJECT_RECOVERY_COLUMNS} from '../apps/local-host/src/project-recovery-details.js';

test('recovery accepts retired migration 37 history but still requires 38 and rejects future versions', () => {
  // Metadata only: exercise the production guard without opening any project database.
  const inspect = (ids: number[]) => assertProjectRecoverySchema({db: {prepare(sql: string) {
    if (sql === 'SELECT migration_id FROM schema_migrations') return {all: () => ids.map(migration_id => ({migration_id}))};
    if (sql === "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?") return {get: () => ({present: 1})};
    if (sql === 'SELECT name FROM pragma_table_info(?)') return {all: (table: string) => PROJECT_RECOVERY_COLUMNS[table]!.map(name => ({name}))};
    throw new Error(`Unexpected metadata query: ${sql}`);
  }}} as Parameters<typeof assertProjectRecoverySchema>[0]);
  const old = Array.from({length: 36}, (_, i) => i + 1);
  assert.doesNotThrow(() => inspect([...old, 37, 38]));
  assert.doesNotThrow(() => inspect([...old, 38]));
  assert.throws(() => inspect([...old, 37]), {code: 'project_recovery_requires_migration'});
  assert.throws(() => inspect([...old, 37, 38, 39]), {code: 'project_recovery_unsupported_schema'});
});

test('authorized recovery reports only missing schema metadata through HTTP without migrating or joining', async t => {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'casebook-recovery-details-'));
  const catalog = await openMolisWorkProjectCatalog({homeDirectory});
  const project = await catalog.createProject({display_name: '隔离旧项目', actor_id: 'fixture'});
  catalog.close();
  // Deliberately old fixture only. No real project database is opened by this test.
  const fixture = new LocalSqliteStorage(project.database_path);
  fixture.db.exec('DELETE FROM schema_migrations WHERE migration_id=36; ALTER TABLE goal_event_requirements DROP COLUMN source_json; DROP TABLE goal_event_trusted_decisions');
  fixture.checkpoint(); fixture.close();
  const digest = () => createHash('sha256').update(readFileSync(project.database_path)).digest('hex');
  const before = digest(); let opens = 0;
  const host = createMolisWorkLocalHost({onRuntimeOpen: () => {opens++;}});
  const token = randomBytes(32).toString('hex');
  const server = createMolisWorkWebServer({homeDirectory, localHost: host, casebook: {grants: [{token, project_ref: project.project_id}], restoreProjects: [project.project_id]}});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {await new Promise<void>(r => server.close(() => r())); await host.close(); rmSync(homeDirectory, {recursive: true, force: true});});
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const request = {project_ref: project.project_id, purpose: PURPOSE};
  const raw = (credential: string, projectRef = project.project_id, origin?: string) => fetch(`${baseUrl}/casebook/v1/${projectRef}/authorization`, {method: 'POST', headers: {'content-type': 'application/json', authorization: `Bearer ${credential}`, ...(origin ? {origin} : {})}, body: JSON.stringify({...request, project_ref: projectRef})});
  assert.deepEqual(await (await raw('invalid-credential')).json(), {code: 'not_authorized'});
  assert.deepEqual(await (await raw(token, 'another-project')).json(), {code: 'not_authorized'});
  assert.deepEqual(await (await raw(token, project.project_id, baseUrl)).json(), {code: 'invalid_request'});
  assert.equal(opens, 0);
  const expected = {missing_migration_ids: [36], missing_tables: ['goal_event_trusted_decisions'], missing_columns: {goal_event_requirements: ['source_json']}};
  const response = await raw(token); assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {code: 'project_recovery_requires_migration', details: expected});
  const client = new MolisWorkCasebookClient({baseUrl, token, projectRef: project.project_id});
  await assert.rejects(client.readInteractionAuthorization(request), error => {
    assert.ok(error instanceof CasebookError);
    assert.equal(error.code, 'project_recovery_requires_migration');
    assert.deepEqual(error.details, expected); return true;
  });
  assert.equal(host.status().projects.length, 0);
  assert.equal(digest(), before);
  const check = new LocalSqliteStorage(project.database_path, {readonly: true});
  assert.equal(check.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'casebook_%'").get().count, 0); check.close();
});

test('client preserves safe recovery details, tolerates old errors and discards unknown metadata', async t => {
  const safe = {missing_migration_ids: [36], missing_tables: [], missing_columns: {goal_event_requirements: ['source_json']}};
  let body: unknown;
  const server = createServer((_req, res) => {res.writeHead(503, {'content-type': 'application/json'}); res.end(JSON.stringify(body));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(r => server.close(() => r())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const client = new MolisWorkCasebookClient({baseUrl: `http://127.0.0.1:${address.port}`, token: randomBytes(32).toString('hex'), projectRef: 'project'});
  for (const [code, details, expected] of [
    ['project_recovery_requires_migration', safe, safe],
    ['project_recovery_requires_migration', undefined, undefined],
    ['source_unavailable', safe, undefined],
    ['project_recovery_requires_migration', {...safe, database_path: '/private/secret.db'}, undefined],
    ['project_recovery_requires_migration', {...safe, missing_tables: ['private-business-title']}, undefined],
    ['project_recovery_requires_migration', {...safe, missing_columns: {goal_event_requirements: ['private-token']}}, undefined],
    ['project_recovery_requires_migration', {...safe, missing_migration_ids: [1000]}, undefined],
  ] as const) {
    body = {code, details};
    await assert.rejects(client.readInteractionAuthorization({project_ref: 'project', purpose: PURPOSE}), error => {
      assert.ok(error instanceof CasebookError); assert.equal(error.code, code); assert.deepEqual(error.details, expected); return true;
    });
  }
});
