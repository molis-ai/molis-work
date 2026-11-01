import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { readSandboxPackage } from '@molis-ai/molis-work-app-local-host';
import { effectsFromContract, sandboxPluginManifest } from '@molis-ai/molis-work-plugin-sdk';
import { parsePluginPackage, verifyPluginPackageSignature } from '@molis-ai/molis-work-plugin-runtime';
import { packageContract, packageFiles, newPublisher } from './fixtures/sandbox-package.js';

const cli = fileURLToPath(new URL('../tooling/plugin-cli/dist/main.js', import.meta.url));
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

test('SDK-1 fixed effects and Manifest fields are shared by external sandbox authors for both target scopes', () => {
  const contract = packageContract(); contract.operations[1]!.effects.storage = ['write', 'read'];
  contract.operations[1]!.effects.projects = ['exist'];
  assert.deepEqual(effectsFromContract(contract), { storage: ['read', 'write'], projects: ['exist'] });
  for (const scope of ['home', 'project'] as const) for (const presentation of [false, true]) {
    const manifest = sandboxPluginManifest({ pluginId: contract.pluginId, name: 'Authored notes', version: '3.0.0',
      publisher: { publisher_id: 'author', signature: 'fixed-key' }, effects: effectsFromContract(contract), presentation,
      ...(scope === 'home' ? { runtime: { scope: 'home' } } : {}) });
    assert.equal(manifest.runtime?.scope ?? 'project', scope);
    assert.equal(manifest.entrypoints[0]!.entrypoint, './plugin.mjs');
    assert.deepEqual(manifest.permissions, [{ permission: 'storage:private', required: true, reason: '保存这个插件自己的数据' },
      { permission: 'projects:exist', required: false, reason: '检查已持有的项目编号是否仍存在' }]);
    assert.deepEqual(manifest.capabilities.consumes, presentation ? ['ui.plugin-presentation'] : []);
    assert.deepEqual(manifest.requires?.map(item => [item.capability_id, item.version]) ?? [], presentation ? [['ui.plugin-presentation', 1]] : []);
  }
});

test('PACK-1 real pack-sandbox, sign, verify and Host reader preserve declared text bytes and exclude unrelated files', () => {
  const directory = mkdtempSync(join(tmpdir(), 't149-pack-'));
  try {
    const publisher = newPublisher(), root = join(directory, 'source'); mkdirSync(root);
    const { files } = packageFiles(publisher.identity);
    for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content!);
    // Neither the old BuildManifest nor a directory file list can become the distribution Manifest.
    writeFileSync(join(root, 'manifest.json'), '{"version":1,"pluginId":"old-build-only"}');
    writeFileSync(join(root, 'package.json'), '{"files":["private.pem","unrelated.txt"]}');
    writeFileSync(join(root, 'unrelated.txt'), 'not distributed');
    mkdirSync(join(root, 'agent')); const body = '  审核证据。\n保留原文空白。  ';
    writeFileSync(join(root, 'agent', 'review.md'), body);
    const privateFile = join(directory, 'private.pem'), publicFile = join(directory, 'public.pem');
    writeFileSync(privateFile, publisher.keys.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    writeFileSync(publicFile, publisher.keys.publicKey.export({ type: 'spki', format: 'pem' }));
    const unsigned = join(directory, 'unsigned.json'), signed = join(directory, 'signed.json');
    const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    const args = ['--name', 'Authored notes', '--version', '2.0.0', '--publisher-id', 'author', '--publisher-key-id', publisher.identity,
      '--scope', 'home', '--icon', 'package', '--compatible-from', '1.0.0', '--agent', JSON.stringify([{ name: '审核', purpose: '检查证据', body: 'agent/review.md' }])];
    const packed = invoke('pack-sandbox', root, unsigned, ...args); assert.equal(packed.status, 0, packed.stderr);
    assert.equal(invoke('sign', unsigned, privateFile, signed).status, 0);
    assert.equal(invoke('verify', signed, publicFile).status, 0);
    const bundle = verifyPluginPackageSignature(JSON.parse(readFileSync(signed, 'utf8'))).bundle, kept = readSandboxPackage(bundle.payload);
    assert.equal(kept.manifest.runtime?.scope, 'home'); assert.equal(kept.manifest.version, '2.0.0');
    assert.deepEqual(kept.permissions, { storage: ['read', 'write'] });
    assert.deepEqual(bundle.payload.files.map(file => file.path).sort(), ['agent/review.md', 'contract.json', 'interface.json', 'manifest.json', 'plugin.mjs', 'prompts.json']);
    assert.equal(Buffer.from(bundle.payload.files.find(file => file.path === 'agent/review.md')!.content_base64, 'base64').toString('utf8'), body);
    assert.deepEqual(kept.manifest.agent?.roles?.map(role => role.name), ['审核']);
    assert.deepEqual(kept.manifest.upgrade_compatibility, { compatible_from_versions: ['1.0.0'] });
    const saved = readFileSync(unsigned); assert.equal(invoke('pack-sandbox', root, unsigned, ...args).status, 1);
    assert.ok(saved.equals(readFileSync(unsigned)), 'an existing output is never overwritten');
    for (const name of ['agent/review.md', 'plugin.mjs']) {
      const tampered = structuredClone(bundle); tampered.payload.files.find(file => file.path === name)!.content_base64 = Buffer.from('changed').toString('base64');
      assert.throws(() => verifyPluginPackageSignature(tampered), refused('plugin.signature_invalid'));
    }
    const other = newPublisher(); assert.throws(() => verifyPluginPackageSignature({ ...bundle, publisher_key: { algorithm: 'ed25519', spki_base64: other.signer.public_key_spki_base64 } }), refused('plugin.signer_mismatch'));
    const mismatch = structuredClone(bundle); mismatch.payload.manifest.name = 'Changed';
    assert.throws(() => parsePluginPackage(mismatch), refused('plugin.package_invalid'));
    const extra = structuredClone(bundle.payload); extra.files.push({ path: 'package.json', content_base64: Buffer.from('{}').toString('base64') });
    assert.throws(() => readSandboxPackage(extra), refused('plugin.declaration_invalid'));
    assert.doesNotMatch(packed.stdout + packed.stderr, /PRIVATE KEY/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('PACK-1 pack-sandbox rejects missing, unsafe and oversized inputs without creating an output', () => {
  const directory = mkdtempSync(join(tmpdir(), 't149-pack-refusal-'));
  try {
    const { files } = packageFiles('placeholder'), publisher = newPublisher();
    const args = ['--name', 'Notes', '--version', '1.0.0', '--publisher-id', 'author', '--publisher-key-id', publisher.identity];
    const root = join(directory, 'source'); mkdirSync(root); mkdirSync(join(root, 'agent'));
    const reset = () => { for (const [name, value] of Object.entries(files)) { rmSync(join(root, name), { force: true }); writeFileSync(join(root, name), value!); } };
    let serial = 0;
    const reject = (flags: string[] = []) => { const out = join(directory, 'refused-' + serial++ + '.json'), result = spawnSync(process.execPath, [cli, 'pack-sandbox', root, out, ...args, ...flags], { encoding: 'utf8' }); assert.equal(result.status, 1, result.stdout); assert.equal(existsSync(out), false); };
    reset(); rmSync(join(root, 'prompts.json')); reject();
    reset(); rmSync(join(root, 'plugin.mjs')); symlinkSync(join(directory, 'outside'), join(root, 'plugin.mjs')); reject();
    reset(); writeFileSync(join(root, 'plugin.mjs'), Buffer.alloc(8 * 1024 * 1024 + 1, 32)); reject();
    reset(); reject(['--agent', JSON.stringify([{ name: 'x', purpose: 'x', body: 'agent/../../outside' }])]);
    writeFileSync(join(directory, 'outside'), 'outside'); symlinkSync(join(directory, 'outside'), join(root, 'agent', 'linked.md'));
    reject(['--methods', JSON.stringify([{ name: 'x', purpose: 'x', body: 'agent/linked.md' }])]);
    writeFileSync(join(root, 'agent', 'large.md'), Buffer.alloc(32_001, 32));
    reject(['--agent', JSON.stringify([{ name: 'x', purpose: 'x', body: 'agent/large.md' }])]);
    reject(['--agent', 'null']); reject(['--scope', 'unknown']); reject(['--permission', 'all']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
