import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAtomicFileDocument } from '@molis-ai/molis-work-storage';
import { createSyncDocument } from '@molis-ai/molis-work-plugin-sdk';

const childCode = `
import { createAtomicFileDocument } from '@molis-ai/molis-work-storage';
const [file, expected, next, mode] = process.argv.slice(1);
let checks = 0;
const port = createAtomicFileDocument(file, () => {
  if (mode === 'crash' && ++checks === 2) { process.send('locked'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); }
});
process.on('message', () => {
  try { process.send({ accepted: port.compareAndSet(expected === 'ABSENT' ? null : expected, next) }); }
  catch (error) { process.send({ error: String(error) }); }
  finally { process.disconnect(); }
});
process.send('ready');
`;
function fixture(t: import('node:test').TestContext) {
  const home = mkdtempSync(join(tmpdir(), 'atomic-document-')); t.after(() => rmSync(home, { recursive: true, force: true }));
  const filename = join(home, 'document.json'); return { home, filename, port: createAtomicFileDocument(filename, () => {}) };
}
async function child(t: import('node:test').TestContext, file: string, expected: string | null, value: string, mode = 'race') {
  const process = spawn(globalThis.process.execPath, ['--input-type=module', '-e', childCode, file, expected ?? 'ABSENT', value, mode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  t.after(() => { if (process.exitCode === null && process.signalCode === null) process.kill('SIGTERM'); });
  await new Promise<void>((resolve, reject) => { process.once('error', reject); process.once('message', value => value === 'ready' ? resolve() : reject(new Error(String(value)))); });
  return process;
}
const message = (process: ReturnType<typeof spawn>) => new Promise<unknown>((resolve, reject) => { process.once('message', resolve); process.once('error', reject); process.once('exit', () => reject(new Error('child exited before message'))); });

test('S-42 PCSYNC-05/15 two independent processes cannot both replace the same observed file', { timeout: 15000 }, async t => {
  const f = fixture(t); assert.equal(f.port.read(), null); assert.equal(f.port.compareAndSet(null, 'original'), true);
  const children = await Promise.all(['left', 'right'].map(value => child(t, f.filename, 'original', value)));
  const results = children.map(message); children.forEach(process => process.send!('go'));
  const outcomes = await Promise.all(results) as { accepted: boolean }[];
  assert.deepEqual(outcomes.map(row => row.accepted).sort(), [false, true]);
  assert.ok(['left', 'right'].includes(f.port.read()!)); assert.equal(f.port.compareAndSet('original', 'stale overwrite'), false);
});

test('S-42 PCSYNC-05/12 a crashed lock holder is released by SQLite, not by deleting an assumed stale lock', { timeout: 15000 }, async t => {
  const f = fixture(t); assert.equal(f.port.compareAndSet(null, 'unique original'), true);
  const process = await child(t, f.filename, 'unique original', 'never committed', 'crash'), locked = message(process); process.send!('go'); assert.equal(await locked, 'locked');
  const exited = new Promise<void>(resolve => process.once('exit', () => resolve())); process.kill('SIGKILL'); await exited;
  assert.equal(f.port.read(), 'unique original'); assert.equal(f.port.compareAndSet('unique original', 'explicit next'), true);
  assert.equal(f.port.read(), 'explicit next');
});

test('S-42 PCSYNC-06/15 invalid UTF-8, linked files and revoked commits preserve the unique original', t => {
  const f = fixture(t); writeFileSync(f.filename, Buffer.from([255, 254])); const bad = readFileSync(f.filename);
  assert.throws(() => f.port.read(), { code: 'storage.document_invalid' }); assert.throws(() => f.port.compareAndSet(null, '{}')); assert.deepEqual(readFileSync(f.filename), bad);
  const linked = join(f.home, 'linked.json'); symlinkSync(f.filename, linked); const port = createAtomicFileDocument(linked, () => {});
  assert.throws(() => port.read(), { code: 'storage.document_invalid' }); assert.throws(() => port.compareAndSet(null, '{}')); assert.deepEqual(readFileSync(f.filename), bad);
  writeFileSync(f.filename, 'preserved');
  const other=join(f.home,'other.json');symlinkSync(f.filename,other+'.lock.sqlite');assert.throws(()=>createAtomicFileDocument(other,()=>{}).compareAndSet(null,'never'),{code:'storage.document_invalid'});assert.equal(existsSync(other),false);
  for(const at of [3,4]){let checks=0;const revoked=createAtomicFileDocument(f.filename,()=>{if(++checks===at)throw new Error('REVOKED');});
   assert.throws(()=>revoked.compareAndSet('preserved','late result'),/REVOKED/);assert.equal(f.port.read(),'preserved');}
});

test('S-42 PCSYNC-15 BOM bytes participate in the exact file token and lossy Unicode writes are refused',t=>{
 const f=fixture(t);assert.equal(f.port.compareAndSet(null,'\ufefforiginal'),true);const shown=f.port.read();assert.equal(shown,'\ufefforiginal');
 writeFileSync(f.filename,'original');assert.equal(f.port.compareAndSet(shown,'stale'),false);assert.equal(f.port.read(),'original');
 assert.throws(()=>f.port.compareAndSet('original','\ud800'),{code:'storage.document_invalid'});assert.equal(f.port.read(),'original');
});

test('S-42 PCSYNC-05/15 shared SDK document commits business facts and its journal in the same conditional file', t => {
  const f = fixture(t), open = () => createSyncDocument<Record<string, string>>({ spaceId: 'personal:alice', storage: f.port, authorize() {}, initial: () => ({}),
    validate(value) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(row => typeof row !== 'string')) throw new Error('INVALID'); return value as Record<string, string>; },
    observe: value => new Map(Object.entries(value)), read: (value, key) => value[key] ?? null,
    apply(value, key, incoming) { if (incoming === null) delete value[key]; else if (typeof incoming === 'string') value[key] = incoming; else throw new Error('INVALID'); },
  });
  const owner = open(); owner.update(data => { data.note = 'original'; }); const frozen = owner.replica.next()!;
  open().update(data => { data.note = 'newer edit'; }); owner.replica.acknowledge(frozen.key, frozen.operationId, 1);
  assert.equal(open().read().note, 'newer edit'); assert.equal(owner.replica.counts().pending, 1);
  const before = readFileSync(f.filename); assert.throws(() => owner.update(data => { data.note = 'bad'; throw new Error('REFUSE'); }), /REFUSE/); assert.deepEqual(readFileSync(f.filename), before);
  assert.equal(JSON.parse(f.port.read()!).data.note, 'newer edit'); assert.ok(JSON.parse(f.port.read()!).changes.length > 0);
});


test('file checked replacement validates inside the CAS fence and refusal never commits a missing-file reference',t=>{
 const f=fixture(t);assert.equal(f.port.compareAndSet(null,'original'),true);let checks=0;
 assert.equal(f.port.compareAndSetChecked('stale','never',()=>{checks++;}),false);assert.equal(checks,0,'stale input cannot run owner effects');
 assert.throws(()=>f.port.compareAndSetChecked('original','missing-file',()=>{checks++;assert.equal(f.port.read(),'original');throw new Error('OWNER_FILE_MISSING');}),/OWNER_FILE_MISSING/);assert.equal(f.port.read(),'original');assert.equal(checks,1);
 assert.equal(f.port.withReadLock(source=>source),'original');assert.equal(f.port.compareAndSetChecked('original','complete',()=>{checks++;}),true);assert.equal(f.port.read(),'complete');
});
