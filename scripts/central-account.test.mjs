// WUA-05/06/07/08/09: real Auth, temporary D1/Home, provider/delivery mocks only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createAccountService, parseAccountEnvironment, validateAccountContract } from '@molis-ai/molis-work-service-account';
import { accountSessionForHost, createMolisWorkLocalHost } from '@molis-ai/molis-work-app-local-host';
import { createDesktopWebHost } from '@molis-ai/molis-work-app-desktop';
import provenance from '../horizontal/account/src/upstream/provenance.json' with { type: 'json' };

const source = process.env.MOLIS_AUTH_SOURCE;
assert.ok(source && isAbsolute(source), 'MOLIS_AUTH_SOURCE must name an explicit local Auth checkout');
for (const [file, hash] of Object.entries(provenance.sha256)) assert.equal(createHash('sha256').update(readFileSync(resolve(source, 'contracts/unified-account', file))).digest('hex'), hash, file);
const { getRustProxy, initializeLocalRuntime } = await import(pathToFileURL(resolve(source, 'worker/scripts/local-runtime.mjs')).href);
const probe = net.createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const authOrigin = 'http://127.0.0.1:8787', productOrigin = `http://127.0.0.1:${port}`;
const config = parseAccountEnvironment({ environmentId: 'unified-local', environmentKind: 'LOCAL', authOrigin, productOrigin,
  clientId: 'molis-work-unified-local', applicationId: 'molis-work-unified-local-app', policyProfile: 'unified-account-v2',
  redirectAllowlist: [productOrigin + '/account/callback'], providerMode: 'MOCK', deliveryMode: 'MOCK' });
const proxy = await getRustProxy({ AUTH_ORIGIN: authOrigin, UNIFIED_ACCOUNT_CONFIG: JSON.stringify({ environmentId: 'unified-local', kind: 'LOCAL', authOrigin, deliveryMode: 'MOCK', providerMode: 'MOCK' }) });
process.env.MOLIS_WORK_SECRET_BACKEND = 'file';
process.env.MOLIS_WORK_ENCRYPTION_KEY = '';
const home = await mkdtemp(join(tmpdir(), 'work02-central-'));
let host, server;
try {
  await initializeLocalRuntime(proxy);
  const seed = readFileSync(resolve(source, 'worker/unified-account-local-seed.sql'), 'utf8').replaceAll('http://127.0.0.1:4207', productOrigin);
  for (const sql of seed.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean)) await proxy.env.DB.prepare(sql).run();
  const secret = () => randomBytes(32).toString('base64url');
  const challenge = value => createHash('sha256').update(value).digest('base64url');
  const control = { assertCurrent() {} };
  let online = true, refreshes = 0;
  const centralFetch = (url, init) => {
    if (!online) return Promise.reject(new TypeError('isolated offline'));
    if (init?.body && JSON.parse(init.body).grantType === 'refresh_token') refreshes++;
    return proxy.fetch(new Request(url, init));
  };
  async function phoneLogin(clientConfig) {
    // Advance only the disposable delivery cooldown; Auth registration tests own rate-limit assertions.
    await proxy.env.DB.prepare('UPDATE auth_rate_bucket SET expires_at=0').run();
    const proof = secret(), verifier = secret();
    const service = createAccountService(clientConfig, { currentCredential: () => null,
      resolveSecret: async reference => reference === 'proof' ? proof : null, fetch: centralFetch });
    const proofControl = { ...control, initiatorProofRef: 'proof' };
    const transaction = (await service.invoke('createTransaction', { body: { clientId: clientConfig.clientId,
      redirectUri: clientConfig.redirectAllowlist[0], state: secret(), purpose: 'LOGIN', method: 'PHONE_OTP',
      codeChallenge: challenge(verifier), codeChallengeMethod: 'S256', initiatorChallenge: challenge(proof) } }, control)).data;
    const params = { transactionId: transaction.transactionId };
    const sent = (await service.invoke('createChallenge', { params, body: { channel: 'SMS', address: '+8613800000502' } }, proofControl)).data;
    const delivery = await proxy.env.DB.prepare('SELECT m.credential FROM auth_mock_delivery m JOIN auth_verification_challenge c ON c.delivery_id=m.delivery_id WHERE c.id=?').bind(sent.challengeId).first();
    const verified = (await service.invoke('verifyChallenge', { params: { ...params, challengeId: sent.challengeId }, body: { credential: delivery.credential } }, proofControl)).data;
    await service.invoke('signInPhone', { params, body: { verificationProof: verified.verificationProof } }, proofControl);
    const completed = (await service.invoke('completeTransaction', { params, body: {} }, proofControl)).data;
    return (await service.invoke('exchangeToken', { body: { grantType: 'authorization_code', clientId: clientConfig.clientId,
      code: completed.code, redirectUri: clientConfig.redirectAllowlist[0], codeVerifier: verifier } }, control)).data;
  }
  const tokens = await phoneLogin(config), controlToken = secret();
  const clubOrigin = 'http://127.0.0.1:3000';
  const clubConfig = parseAccountEnvironment({ ...config, productOrigin: clubOrigin, redirectAllowlist: [clubOrigin + '/account/callback'],
    clientId: 'molis-club-unified-local', applicationId: 'molis-club-unified-local-app' });
  const clubTokens = await phoneLogin(clubConfig);
  const clubRead = () => proxy.fetch(new Request(authOrigin + '/api/v2/users/me', { headers: { Authorization: `Bearer ${clubTokens.accessToken}`, Origin: clubOrigin } }));
  async function startHost() {
    host = createMolisWorkLocalHost({ homeDirectory: home, completeText: null });
    server = createDesktopWebHost({ ptyClientFilePath: () => join(home, 'unused-asset.js') })({ homeDirectory: home, localHost: host,
      controlToken, account: { environment: config, fetch: centralFetch } });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return accountSessionForHost(host);
  }
  const read = () => fetch(productOrigin + '/api/account/session', { headers: { Origin: productOrigin, 'x-molis-work-control-token': controlToken, Connection: 'close' } });
  let manager = await startHost();
  const initial = await manager.completeLogin(manager.beginLogin(control), tokens, control);
  const response = await read(); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.data.user.userId, initial.user.userId);
  for (const value of [tokens.accessToken, tokens.refreshToken, 'secretRef']) assert.ok(!JSON.stringify(body).includes(value));
  assert.equal(validateAccountContract('AccountViewResponse', body), true);
  const update = { idempotencyKey: secret(), body: { displayName: 'Work Persistent Session', expectedVersion: initial.user.version } };
  await manager.invoke('updateProfile', update, control); await manager.invoke('updateProfile', update, control);
  assert.deepEqual((await manager.invoke('listMyTenants', {}, control)).data.items, []);

  await host.close(); manager = await startHost();
  const restored = (await (await read()).json()).data;
  assert.equal(restored.user.userId, initial.user.userId); assert.equal(restored.session.loginSessionId, tokens.session.loginSessionId);
  assert.equal(restored.user.displayName, 'Work Persistent Session');
  // Server-side expiry despite a locally fresh access timestamp exercises exactly one read-only recovery.
  await proxy.env.DB.prepare('UPDATE auth_login_access_token SET expires_at=? WHERE login_session_id=?').bind(Date.now() - 1000, tokens.session.loginSessionId).run();
  const concurrent = await Promise.all([manager.readSession(control), manager.readSession(control)]);
  assert.ok(concurrent.every(view => view.state === 'AUTHENTICATED')); assert.equal(refreshes, 1);
  assert.equal(concurrent[0].session.lastActiveAt, restored.session.lastActiveAt, 'refresh/read never count as activity');
  await manager.activity({ eventId: secret(), kind: 'INTERACT' }, control);
  await host.close(); manager = await startHost();
  assert.equal((await manager.readSession(control)).state, 'AUTHENTICATED'); assert.equal(refreshes, 1);
  online = false;
  const cached = await manager.readSession(control); assert.equal(cached.state, 'OFFLINE_CACHED');
  assert.deepEqual(Object.keys(cached).sort(), ['state', 'user']);
  await assert.rejects(manager.invoke('listMyTenants', {}, control), error => error.code === 'account.unavailable');
  online = true;
  const ordinaryKey = secret();
  assert.deepEqual(await manager.logout('CURRENT_LOGIN', ordinaryKey, control), { localCleared: true, remoteRevocation: 'CONFIRMED' });
  assert.equal((await clubRead()).status, 200, 'ordinary Work logout preserves the independent Club session');
  await host.close(); manager = await startHost();
  assert.equal((await manager.readSession(control)).state, 'ANONYMOUS');
  assert.equal((await manager.logout('CURRENT_LOGIN', ordinaryKey, control)).remoteRevocation, 'CONFIRMED');

  const second = await phoneLogin(config);
  await manager.completeLogin(manager.beginLogin(control), second, control);
  assert.equal((await manager.logout('ALL_MOLIS_PRODUCTS', secret(), control)).remoteRevocation, 'CONFIRMED');
  assert.equal((await clubRead()).status, 401);
  const third = await phoneLogin(config);
  await manager.completeLogin(manager.beginLogin(control), third, control);
  const revoked = await proxy.fetch(new Request(authOrigin + '/api/v2/sessions/current/logout', { method: 'POST',
    headers: { Authorization: `Bearer ${third.accessToken}`, Origin: productOrigin, 'Content-Type': 'application/json', 'Idempotency-Key': secret() }, body: '{}' }));
  assert.equal(revoked.status, 200);
  assert.equal((await manager.readSession(control)).state, 'EXPIRED', 'central revocation is rechecked before safe authenticated view');
  const fourth = await phoneLogin(config);
  await manager.completeLogin(manager.beginLogin(control), fourth, control);
  online = false;
  assert.deepEqual(await manager.logout('ALL_MOLIS_PRODUCTS', secret(), control), { localCleared: true, remoteRevocation: 'UNCONFIRMED' });
  await host.close(); manager = await startHost(); online = true;
  assert.equal((await manager.readSession(control)).state, 'ANONYMOUS', 'offline logout cannot recover Tokens after restart');
  process.stdout.write('PASS WORK-02 real Auth: mock login, encrypted restart, concurrent refresh, explicit activity, offline refusal, independent/global logout and remote revocation\n');

} finally {
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  await host?.close();
  await proxy.dispose();
  await rm(home, { recursive: true, force: true });
}
