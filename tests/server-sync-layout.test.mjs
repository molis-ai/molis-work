import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

test('sync: the Worker composes the server crate instead of owning storage', () => {
  assert.deepEqual(readdirSync(new URL('apps/sync-worker/src/', root)), ['lib.rs']);
  const entry = read('apps/sync-worker/src/lib.rs');
  assert.match(entry, /#\[event\(fetch\)\]/);
  assert.match(entry, /#\[event\(scheduled\)\]/);
  assert.match(entry, /molis_work_server_sync::fetch\(req, env\)\.await/);
  assert.match(entry, /molis_work_server_sync::scheduled\(env\)\.await/);
  assert.doesNotMatch(entry, /\bmod\s|include!|\.prepare\(|\.d1\(|\.bucket\(/);
  assert.match(read('apps/sync-worker/Cargo.toml'), /molis-work-server-sync = \{ path = "\.\.\/\.\.\/server" \}/);
  assert.doesNotMatch(read('server/src/sync/lib.rs'), /#\[event\(/);
});

test('sync: server owns build manifests while business source shares src with IM', () => {
  assert.match(read('server/Cargo.toml'), /\[lib\]\s+path = "src\/sync\/lib\.rs"/);
  assert.ok(existsSync(new URL('server/Cargo.lock', root)));
  assert.ok(existsSync(new URL('server/src/im/', root)));
  assert.equal(existsSync(new URL('server/sync/Cargo.toml', root)), false);
  assert.equal(existsSync(new URL('server/src/sync/Cargo.toml', root)), false);
  const {config, error} = ts.parseConfigFileTextToJson('tsconfig.json', read('server/tsconfig.json'));
  assert.equal(error, undefined);
  assert.deepEqual(config.include, ['src/**/*.ts']);
});

test('sync: both deployment configs and D1 fixtures use the single server baseline', () => {
  const relative = '../../server/migrations/sync';
  for (const file of ['wrangler.jsonc', 'wrangler.production.example.jsonc']) {
    const {config, error} = ts.parseConfigFileTextToJson(file, read(`apps/sync-worker/${file}`));
    assert.equal(error, undefined);
    assert.equal(config.d1_databases[0].migrations_dir, relative);
    assert.deepEqual(config.build.watch_dir, ['src', '../../server/src/sync']);
    assert.ok(existsSync(new URL(`apps/sync-worker/${relative}/0001_sync.sql`, root)));
  }
  for (const file of ['test.mjs', 'testing.mjs']) {
    assert.ok(read(`apps/sync-worker/${file}`).includes(`${relative}/0001_sync.sql`));
  }
  assert.equal(existsSync(new URL('apps/sync-worker/migrations/0001_sync.sql', root)), false);
});
