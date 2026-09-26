import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuildProject, buildManifest } from '../apps/local-host/src/plugin-builder/build-project.js';
import { runPluginChecks } from '../apps/local-host/src/plugin-builder/build-checks.js';
import type { BuildCheckOptions } from '../apps/local-host/src/plugin-builder/build-types.js';
import type { SandboxPluginContract } from '../packages/contracts/src/platform/plugin-sandbox.js';

const mac = { skip: process.platform !== 'darwin' };
function contract(): SandboxPluginContract { return { version: 1, pluginId: 'io.molis.work.generated.checks', revision: 'one', entities: [], pages: [], acceptance: [], operations: [
  { id: 'echo', kind: 'query', input: { type: 'string' }, output: { type: 'string' }, errors: [], effects: {}, examples: [{ input: 'hello', output: 'HELLO' }] },
  { id: 'later', kind: 'query', input: { type: 'null' }, output: { type: 'null' }, errors: [], effects: {}, examples: [{ input: null, output: null }] },
] }; }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'plugin-checks-test-')), c = contract(), manifest = buildManifest(c);
  const project = await createBuildProject(root, c, manifest, []);
  await writeFile(project.operationFiles.echo!, `import type {SandboxJson,SandboxSdk} from '@molis/plugin-sdk'; export default async function(input:SandboxJson,_sdk:SandboxSdk):Promise<SandboxJson>{if(typeof input!=='string')throw Error('string required');return input.toUpperCase()}`);
  await writeFile(project.testFiles.echo!, `import type {SandboxTest} from '@molis/plugin-sdk';export const tests:SandboxTest[]=[async(_sdk,call,assert)=>{assert.same(await call('test'),'TEST')}];`);
  const options: BuildCheckOptions = { root, contract: c, manifest, operationIds: ['echo'], services: {}, identity: { projectId: 'project', installationId: 'check', pluginId: c.pluginId, namespace: 'preview' }, grants: {} };
  return { root, project, options, close: () => rm(root, { recursive: true, force: true }) };
}

test('all six gates run actual code and tests in Seatbelt while unrelated stub remains disconnected', mac, async () => {
  const f = await fixture();
  try {
    const result = await runPluginChecks(f.options);
    assert.equal(result.passed, true, JSON.stringify(result.gates)); assert.deepEqual(result.gates.map(g => g.id), ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
    assert.ok(result.bundlePath); assert.match(await readFile(result.bundlePath!, 'utf8'), /echo/);
    assert.equal((await runPluginChecks(f.options)).passed, true, 'independent host recheck succeeds without trusting previous results');
    const unfinished = await runPluginChecks({ ...f.options, operationIds: ['later'] }); assert.equal(unfinished.passed, false); assert.match(unfinished.gates.find(g => g.id === 'G4')!.detail, /stub/);
    assert.ok(!(await readFile(join(f.root, 'developer/sdk.d.ts'), 'utf8')).includes('createSandboxRunner'));
  } finally { await f.close(); }
});

test('frozen manifest and entrypoint changes fail G1', mac, async () => {
  const f = await fixture();
  try {
    const path = join(f.root, 'manifest.json'); await chmod(path, 0o600); await writeFile(path, JSON.stringify({ ...f.options.manifest, effects: { storage: ['write'] } }));
    const result = await runPluginChecks(f.options); assert.equal(result.gates[0]?.passed, false); assert.match(result.gates[0]!.detail, /manifest/);
  } finally { await f.close(); }
});

test('host ignores Agent tsconfig and rejects Node globals and path imports', mac, async () => {
  for (const source of [
    `export default async function(){return process.env.HOME}`,
    `import fs from 'node:fs';export default async function(){return fs.readFileSync('/etc/passwd','utf8')}`,
  ]) {
    const f = await fixture();
    try { await writeFile(join(f.root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false, types: ['node'] } })); await writeFile(f.project.operationFiles.echo!, source); const result = await runPluginChecks(f.options); assert.equal(result.passed, false); assert.equal(result.gates.find(g => g.id === 'G2')?.passed, false); } finally { await f.close(); }
  }
});

test('G3 rejects unresolved dynamic imports even if Agent declares its own types', mac, async () => {
  const f = await fixture();
  try {
    await writeFile(f.project.operationFiles.echo!, `export default async function(input:string){const module=await import(input);return String(module)}`);
    const result = await runPluginChecks(f.options); assert.equal(result.passed, false); assert.equal(result.gates.find(g => g.id === 'G3')?.passed, false); assert.match(result.gates.find(g => g.id === 'G3')!.detail, /dynamic module/);
  } finally { await f.close(); }
});

test('G5 rejects missing, empty, assertion-free and failing Agent tests', mac, async () => {
  for (const source of [
    `export const tests=[];`,
    `import type {SandboxTest} from '@molis/plugin-sdk';export const tests:SandboxTest[]=[async()=>{}];`,
    `import type {SandboxTest} from '@molis/plugin-sdk';export const tests:SandboxTest[]=[async(_,call,assert)=>{assert.same(await call('a'),'wrong')}];`,
  ]) {
    const f = await fixture();
    try { await writeFile(f.project.testFiles.echo!, source); const result = await runPluginChecks(f.options); assert.equal(result.passed, false); assert.ok(result.gates.slice(0, 4).every(gate => gate.passed), JSON.stringify(result.gates)); assert.equal(result.gates.find(g => g.id === 'G5')?.passed, false, JSON.stringify(result.gates)); } finally { await f.close(); }
  }
});

test('G6 uses provided services after independent mock examples and keeps per-operation preview identities separate', mac, async () => {
  const f = await fixture();
  try {
    const root = await mkdtemp(join(tmpdir(), 'plugin-live-check-'));
    try {
      const c = contract(); c.operations = [{ ...c.operations[0]!, effects: { capabilities: ['uppercase'] } }];
      const manifest = buildManifest(c), project = await createBuildProject(root, c, manifest, []);
      await writeFile(project.operationFiles.echo!, `import type{SandboxJson,SandboxSdk}from'@molis/plugin-sdk';export default async function(input:SandboxJson,sdk:SandboxSdk){return sdk.capability.call('uppercase',input)}`);
      await writeFile(project.testFiles.echo!, `import type{SandboxTest}from'@molis/plugin-sdk';export const tests:SandboxTest[]=[async(_,call,assert)=>assert.same(await call('a'),'A')];`);
      const identities: string[] = [];
      const options: BuildCheckOptions = { ...f.options, root, contract: c, manifest, grants: { capabilities: ['uppercase'] }, mockServices: { capability: { async call(_ctx,_id,input) { return String(input).toUpperCase(); } } }, services: { capability: { async call(ctx,_id,input) { identities.push(ctx.identity.installationId); return String(input).toUpperCase(); } } } };
      const result = await runPluginChecks(options); assert.equal(result.passed, true, JSON.stringify(result.gates)); assert.equal(identities.length, 1); assert.match(identities[0]!, /preview-0/);
      const mismatch = await runPluginChecks({ ...options, services: { capability: { async call() { return 'wrong'; } } } }); assert.equal(mismatch.gates.find(g => g.id === 'G5')?.passed, true); assert.equal(mismatch.gates.find(g => g.id === 'G6')?.passed, false);
    } finally { await rm(root, { recursive: true, force: true }); }
  } finally { await f.close(); }
});

test('symlinked source and generated test Node access are rejected without host execution', mac, async () => {
  const f = await fixture();
  try {
    await symlink('/etc/passwd', join(f.root, 'src/leak.ts'));
    const result = await runPluginChecks(f.options); assert.equal(result.passed, false); assert.match(result.gates.find(g => g.id === 'G3')!.detail, /symlink/i);
  } finally { await f.close(); }
});

test('host contract examples reject code that passes the Agent own tests', mac, async () => {
  const f = await fixture();
  try {
    await writeFile(f.project.operationFiles.echo!, `export default async function(){return 'TEST'}`);
    const result = await runPluginChecks(f.options); assert.ok(result.gates.slice(0, 4).every(g => g.passed), JSON.stringify(result.gates)); assert.equal(result.gates.find(g => g.id === 'G5')?.passed, false); assert.match(result.gates.find(g => g.id === 'G5')!.detail, /contract example/);
  } finally { await f.close(); }
});

test('cancellation stops gate work and never publishes a successful bundle', mac, async () => {
  const f = await fixture(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('test cancelled')), 50);
  try { const result = await runPluginChecks({ ...f.options, signal: controller.signal }); assert.equal(result.passed, false); assert.equal(result.bundlePath, undefined); assert.ok(result.gates.some(g => /cancel|abort/i.test(g.detail)), JSON.stringify(result.gates)); } finally { clearTimeout(timer); await f.close(); }
});
