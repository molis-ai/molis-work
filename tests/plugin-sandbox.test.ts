import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SandboxEffects, SandboxIdentity, SandboxJson, SandboxPluginContract } from '../packages/contracts/src/platform/plugin-sandbox.js';
import { createSandboxRunner, type SandboxLimits, type SandboxServices, type SandboxRunner } from '../packages/plugin-sandbox/dist/index.js';

const identity: SandboxIdentity = { projectId: 'project-a', installationId: 'installation-a', pluginId: 'test', namespace: 'preview' };
function contract(effects: SandboxEffects = {}): SandboxPluginContract {
  return { version: 1, pluginId: 'test', revision: 'one', entities: [], pages: [], acceptance: [], operations: [{ id: 'run', kind: 'command', input: { type: 'string' }, output: { type: 'string' }, effects, errors: [], examples: [{ input: '', output: '' }] }] };
}
async function fixture(body: string, options: { effects?: SandboxEffects; grants?: SandboxEffects; services?: SandboxServices; limits?: Partial<SandboxLimits> } = {}): Promise<{ runner: SandboxRunner; close(): Promise<void>; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'sandbox-test-'));
  const bundlePath = join(directory, 'plugin.mjs');
  await writeFile(bundlePath, body);
  try {
    const runner = await createSandboxRunner({ bundlePath, contract: contract(options.effects), identity, grants: options.grants ?? {}, services: options.services ?? {}, limits: options.limits });
    return { runner, directory, async close() { await runner.stop(); await rm(directory, { recursive: true, force: true }); } };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
const mac = { skip: process.platform !== 'darwin' };
const code = (expected: string) => (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === expected);

test('real Seatbelt process has empty environment and cannot read/write host files or execute children', mac, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sandbox-protected-'));
  const secretPath = join(directory, 'secret.txt'); await writeFile(secretPath, 'must-not-read');
  const f = await fixture(`import fs from 'node:fs'; import cp from 'node:child_process';
    export const operations={run:async(input)=>{
      const result={env:Object.keys(process.env)};
      try{fs.readFileSync(input);result.read='allowed'}catch(e){result.read=e.code}
      try{process.binding('fs').readFileUtf8(input,0);result.nativeRead='allowed'}catch(e){result.nativeRead=e.code}
      try{fs.writeFileSync(input,'overwrite');result.write='allowed'}catch(e){result.write=e.code}
      for(const executable of ['/bin/sh',process.execPath]){const r=cp.spawnSync(executable,['-c','true']);result[executable]=r.error?.code??r.status}
      return JSON.stringify(result);
    }};`);
  try {
    const result = JSON.parse(await f.runner.call('run', secretPath) as string);
    assert.deepEqual(result.env, []); assert.equal(result.read, 'EPERM'); assert.equal(result.write, 'EPERM');
    assert.equal(result.nativeRead, 'EPERM');
    assert.equal(result['/bin/sh'], 'EPERM');
    assert.equal(result[process.execPath], 'EPERM');
  } finally { await f.close(); await rm(directory, { recursive: true, force: true }); }
});

test('direct loopback and public network access fail inside real sandbox', mac, async () => {
  const f = await fixture(`import net from 'node:net'; export const operations={run:async(host)=>new Promise(resolve=>{const s=net.connect({host,port:443});s.on('connect',()=>{s.destroy();resolve('allowed')});s.on('error',e=>resolve(e.code));})};`);
  try { for (const target of ['127.0.0.1', '1.1.1.1', '::1']) assert.equal(await f.runner.call('run', target), 'EPERM'); } finally { await f.close(); }
});

test('SDK awaits real host services, scopes private storage by channel identity and enforces quota', mac, async () => {
  const entries = new Map<string, SandboxJson>(); const identities: SandboxIdentity[] = [];
  const storage: NonNullable<SandboxServices['storage']> = { async transaction(context, mutate) { identities.push({ ...context.identity }); const next = new Map(entries); const result = mutate(next); context.signal.throwIfAborted(); entries.clear(); for (const [k, v] of next) entries.set(k, v); return result; } };
  const f = await fixture(`export const operations={run:async(input,sdk)=>{try{await sdk.storage.set('value',input);return await sdk.storage.get('value')}catch(e){return e.code}}};`, { effects: { storage: ['read', 'write'] }, grants: { storage: ['read', 'write'] }, services: { storage }, limits: { storageBytes: 64 } });
  try {
    assert.equal(await f.runner.call('run', 'first'), 'first');
    assert.equal(await f.runner.call('run', 'x'.repeat(100)), 'STORAGE_QUOTA');
    assert.equal(entries.get('value'), 'first');
    assert.ok(identities.length >= 3); assert.ok(identities.every(v => JSON.stringify(v) === JSON.stringify(identity)));
  } finally { await f.close(); }
});

test('both effect declaration and explicit installation grant are mandatory', mac, async () => {
  let touched = 0;
  for (const configuration of [{ effects: { capabilities: ['safe'] }, grants: {} }, { effects: {}, grants: { capabilities: ['safe'] } }]) {
    const f = await fixture(`export const operations={run:async(_,sdk)=>{try{await sdk.capability.call('safe',{identity:{pluginId:'victim'}});return 'allowed'}catch(e){return e.code}}};`, { ...configuration, services: { capability: { async call() { touched++; return null; } } } });
    try { assert.equal(await f.runner.call('run', ''), 'NOT_AUTHORIZED'); } finally { await f.close(); }
  }
  assert.equal(touched, 0);
});

test('SDK async capability and resource services preserve result and bound identity', mac, async () => {
  const effects = { capabilities: ['upper'], resources: ['guide.txt'] };
  const f = await fixture(`export const operations={run:async(input,sdk)=>await sdk.capability.call('upper',input)+'/'+await sdk.resource.read('guide.txt')};`, { effects, grants: effects, services: {
    capability: { async call(context, id, input) { assert.deepEqual(context.identity, identity); assert.equal(id, 'upper'); await new Promise(r => setTimeout(r, 20)); return String(input).toUpperCase(); } },
    resource: { async read(_context, name) { assert.equal(name, 'guide.txt'); return 'guide'; } },
  } });
  try { assert.equal(await f.runner.call('run', 'hello'), 'HELLO/guide'); } finally { await f.close(); }
});

test('operation queues are independently bounded and stop rejects pending work', mac, async () => {
  const f = await fixture(`export const operations={run:async(input)=>{await new Promise(r=>setTimeout(r,300));return input}};`, { limits: { operationQueue: 2 } });
  const g = await fixture(`export const operations={run:async(input)=>input};`);
  try {
    const first = f.runner.call('run', 'one'), second = f.runner.call('run', 'two');
    const outcomes = Promise.allSettled([first, second]);
    await assert.rejects(f.runner.call('run', 'three'), code('QUEUE_FULL'));
    assert.equal(await g.runner.call('run', 'independent'), 'independent');
    await f.runner.stop();
    assert.ok((await outcomes).every(result => result.status === 'rejected'));
    assert.throws(() => process.kill(f.runner.pid, 0), code('ESRCH'));
  } finally { await f.close(); await g.close(); }
});

test('infinite loop is terminated by host deadline and leaves no process', mac, async () => {
  const f = await fixture(`export const operations={run:async()=>{while(true){}}};`, { limits: { operationTimeoutMs: 250 } });
  try { await assert.rejects(f.runner.call('run', ''), code('OPERATION_TIMEOUT')); await f.runner.stop(); assert.throws(() => process.kill(f.runner.pid, 0), code('ESRCH')); } finally { await f.close(); }
});

test('external RSS watchdog terminates native Buffer allocation, including outside V8 heap', mac, async () => {
  const f = await fixture(`export const operations={run:async()=>{const buffers=[];while(true){buffers.push(Buffer.alloc(16*1024*1024,1));await new Promise(r=>setTimeout(r,10))}}};`, { limits: { heapMb: 32, rssMb: 80, operationTimeoutMs: 4000 } });
  try { await assert.rejects(f.runner.call('run', ''), code('MEMORY_LIMIT')); await f.runner.stop(); assert.throws(() => process.kill(f.runner.pid, 0), code('ESRCH')); } finally { await f.close(); }
});

test('malformed stdout, forged identity and output outside schema terminate the channel', mac, async () => {
  for (const body of [
    `export const operations={run:async()=>{process.stdout.write('noise\\n');return ''}};`,
    `export const operations={run:async()=>{process.stdout.write(JSON.stringify({type:'sdk',id:'forged',callId:'other',method:'storage.get',args:['key'],identity:{pluginId:'victim'}})+'\\n');return ''}};`,
    `export const operations={run:async()=>({unexpected:true})};`,
  ]) {
    const f = await fixture(body);
    try { await assert.rejects(f.runner.call('run', ''), error => code('PROTOCOL_ERROR')(error) || code('SCHEMA_MISMATCH')(error)); } finally { await f.close(); }
  }
});

test('oversized frames and rate excess are rejected', mac, async () => {
  const f = await fixture(`export const operations={run:async()=>{process.stdout.write('x'.repeat(20000));return ''}};`, { limits: { messageBytes: 4096 } });
  try { await assert.rejects(f.runner.call('run', ''), code('CHANNEL_LIMIT')); } finally { await f.close(); }
  const g = await fixture(`export const operations={run:async(input)=>input};`, { limits: { operationsPerMinute: 1 } });
  try { assert.equal(await g.runner.call('run', 'one'), 'one'); await assert.rejects(g.runner.call('run', 'two'), code('RATE_LIMIT')); } finally { await g.close(); }
});

test('SDK host timeout is bounded and unavailable ports fail closed', mac, async () => {
  const effects = { capabilities: ['slow'] };
  for (const services of [{}, { capability: { call: async () => new Promise<SandboxJson>(() => {}) } }]) {
    const f = await fixture(`export const operations={run:async(_,sdk)=>{try{await sdk.capability.call('slow',null);return 'allowed'}catch(e){return e.code}}};`, { effects, grants: effects, services, limits: { serviceTimeoutMs: 50 } });
    try { assert.equal(await f.runner.call('run', ''), 'capability' in services ? 'SERVICE_TIMEOUT' : 'SERVICE_UNAVAILABLE'); } finally { await f.close(); }
  }
});

test('SDK concurrency overflow terminates the channel and aborts outstanding host work', mac, async () => {
  const effects = { capabilities: ['slow'] }; let aborted = false;
  const f = await fixture(`export const operations={run:async(_,sdk)=>{await Promise.all([sdk.capability.call('slow',null),sdk.capability.call('slow',null),sdk.capability.call('slow',null)]);return ''}};`, { effects, grants: effects, limits: { sdkQueue: 2 }, services: { capability: { async call(context) { return new Promise((_resolve, reject) => context.signal.addEventListener('abort', () => { aborted = true; reject(context.signal.reason); }, { once: true })); } } } });
  try { await assert.rejects(f.runner.call('run', ''), { code: 'QUEUE_FULL' }); await f.runner.stop(); assert.equal(aborted, true); } finally { await f.close(); }
});

test('idle CPU work after an operation is killed by cumulative CPU watchdog', mac, async () => {
  const f = await fixture(`export const operations={run:async()=>{setTimeout(()=>{while(true){}},10);return 'started'}};`, { limits: { cpuMs: 100, operationTimeoutMs: 4000 } });
  try {
    assert.equal(await f.runner.call('run', ''), 'started');
    // Host remains responsive, and the process dies without another operation deadline.
    const deadline = Date.now() + 4000;
    let alive = true;
    while (alive && Date.now() < deadline) { await new Promise(r => setTimeout(r, 100)); try { process.kill(f.runner.pid, 0); } catch { alive = false; } }
    assert.equal(alive, false);
    await assert.rejects(f.runner.call('run', ''), { code: 'CPU_LIMIT' });
  } finally { await f.close(); }
});

test('startup top-level infinite loop is bounded before runner becomes callable', mac, async () => {
  await assert.rejects(fixture(`while(true){}; export const operations={run:async()=>''};`, { limits: { startupTimeoutMs: 200 } }), { code: 'START_TIMEOUT' });
});
