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

test('authorized recovery of a project at another schema version reports only its code through HTTP, without migrating or joining', async t => {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'casebook-recovery-details-'));
  const catalog = await openMolisWorkProjectCatalog({homeDirectory});
  const project = await catalog.createProject({display_name: '隔离旧项目', actor_id: 'fixture'});
  catalog.close();
  // A database without this build's version, as one from before the baseline would be. No real project database is opened.
  const fixture = new LocalSqliteStorage(project.database_path);
  fixture.db.exec('PRAGMA user_version = 0');
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
  const response = await raw(token); assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {code: 'project_recovery_unsupported_schema'});
  const client = new MolisWorkCasebookClient({baseUrl, token, projectRef: project.project_id});
  await assert.rejects(client.readInteractionAuthorization(request), error => {
    assert.ok(error instanceof CasebookError);
    assert.equal(error.code, 'project_recovery_unsupported_schema'); return true;
  });
  assert.equal(host.status().projects.length, 0);
  assert.equal(digest(), before);
  const check = new LocalSqliteStorage(project.database_path, {readonly: true});
  // The project has the Casebook tables from its baseline; refusing recovery joined nothing.
  assert.equal(check.db.prepare("SELECT COUNT(*) AS count FROM casebook_interaction_scopes").get().count, 0); check.close();
});

test('client keeps only the error codes it knows and never carries what else a source sends', async t => {
  let body: unknown;
  const server = createServer((_req, res) => {res.writeHead(503, {'content-type': 'application/json'}); res.end(JSON.stringify(body));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise<void>(r => server.close(() => r())));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const client = new MolisWorkCasebookClient({baseUrl: `http://127.0.0.1:${address.port}`, token: randomBytes(32).toString('hex'), projectRef: 'project'});
  for (const [code, expected] of [
    ['project_recovery_unsupported_schema', 'project_recovery_unsupported_schema'],
    ['project_recovery_missing', 'project_recovery_missing'],
    ['source_unavailable', 'source_unavailable'],
    ['project_recovery_requires_migration', 'source_unavailable'],
    ['private-business-title', 'source_unavailable'],
  ] as const) {
    body = {code, details: {database_path: '/private/secret.db'}};
    await assert.rejects(client.readInteractionAuthorization({project_ref: 'project', purpose: PURPOSE}), error => {
      assert.ok(error instanceof CasebookError); assert.equal(error.code, expected); assert.deepEqual(Object.keys(error), ['code']); return true;
    });
  }
});
