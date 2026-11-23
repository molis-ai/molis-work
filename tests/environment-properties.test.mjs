import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { assertPortAvailable, loadProperties, required, selectEnvironment } from '../scripts/environment-properties.mjs';
import { sessionGeneration } from '../scripts/environment-session.mjs';

test('ENV-01: environment selection is explicit and source startup forbids prod', () => {
  for (const args of [[], ['dev'], ['--env', 'prod'], ['--env', 'staging'], ['--env', 'dev', '--port', '1']])
    assert.throws(() => selectEnvironment(args, 'start'));
  assert.equal(selectEnvironment(['--env', 'test'], 'start'), 'test');
  assert.equal(selectEnvironment(['--env', 'prod'], 'deploy'), 'prod');
  assert.throws(() => selectEnvironment(['--env', 'dev'], 'deploy'));
});

test('ENV-02/03: properties are strict and are the sole business configuration input', t => {
  const dir = mkdtempSync(join(tmpdir(), 'molis-env-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const name of ['config', 'secrets']) mkdirSync(join(dir, name));
  const root = pathToFileURL(dir + '/');
  const rules = { target: required }, secretRules = { key: required };
  const read = (env = 'dev') => loadProperties(root, env, rules, secretRules);
  const file = join(dir, 'config', 'dev.properties');
  const secrets = join(dir, 'secrets', 'dev.properties');
  writeFileSync(file, '# comment\ntarget=指定\\=地址\n');
  assert.throws(() => read(), /unreadable/u);
  writeFileSync(secrets, 'key=fake-test-sentinel\n');
  process.env.target = 'injected';
  t.after(() => delete process.env.target);
  assert.equal(read().config.target, '指定=地址');
  assert.ok(Object.isFrozen(read().config));
  assert.throws(() => read('test'), /unreadable/u);
  for (const content of ['target=a\ntarget=b', 'unknown=fake-test-sentinel', 'key=fake-test-sentinel', 'target=a\\q', 'target=']) {
    writeFileSync(file, content);
    assert.throws(() => read(), error => !error.message.includes('fake-test-sentinel'));
  }
  // Empty secretRules allows a fresh checkout without a gitignored secrets/<env>.properties file,
  // while still strictly validating the file when it is present.
  writeFileSync(file, 'target=ok\n');
  const emptyDir = mkdtempSync(join(tmpdir(), 'molis-env-empty-secrets-'));
  t.after(() => rmSync(emptyDir, { recursive: true, force: true }));
  mkdirSync(join(emptyDir, 'config'));
  writeFileSync(join(emptyDir, 'config', 'dev.properties'), 'target=fresh-clone\n');
  const emptyRoot = pathToFileURL(emptyDir + '/');
  assert.deepEqual(loadProperties(emptyRoot, 'dev', rules, {}), { config: { target: 'fresh-clone' }, secrets: {} });
  mkdirSync(join(emptyDir, 'secrets'));
  writeFileSync(join(emptyDir, 'secrets', 'dev.properties'), 'unexpected=1\n');
  assert.throws(() => loadProperties(emptyRoot, 'dev', rules, {}), /Invalid configuration/u);
});

test('ENV-12: a local environment switch changes the session generation on every transition', t => {
  const dir = mkdtempSync(join(tmpdir(), 'molis-session-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const first = sessionGeneration('account', 'dev', dir);
  assert.equal(sessionGeneration('account', 'dev', dir), first);
  const test = sessionGeneration('account', 'test', dir);
  assert.notEqual(test, first);
  assert.notEqual(sessionGeneration('account', 'dev', dir), first);
  assert.notEqual(sessionGeneration('account', 'test', dir), test);
});

test('ENV-04: a bound loopback port is rejected without stopping its owner', async t => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.close());
  await assert.rejects(assertPortAvailable(server.address().port), /EADDRINUSE/u);
  assert.ok(server.listening);
});
