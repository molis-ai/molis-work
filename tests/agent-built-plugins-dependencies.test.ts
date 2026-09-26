import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installBuildDependencies, satisfiesBuildVersion } from '../apps/local-host/src/plugin-builder/build-dependencies.js';

const mac = { skip: process.platform !== 'darwin' };
interface Entry { name: string; content?: string; type?: string; link?: string }
function tar(entries: Entry[]): Buffer {
  const output: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512), body = Buffer.from(entry.content ?? '');
    header.write(entry.name, 0, 100); header.write('0000644\0', 100, 8); header.write('0000000\0', 108, 8); header.write('0000000\0', 116, 8); header.write(body.length.toString(8).padStart(11, '0') + '\0', 124, 12); header.fill(32, 148, 156); header.write(entry.type ?? '0', 156); if (entry.link) header.write(entry.link, 157, 100); header.write('ustar\0', 257, 6);
    const checksum = header.reduce((sum, byte) => sum + byte, 0); header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
    output.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  output.push(Buffer.alloc(1024)); return gzipSync(Buffer.concat(output));
}
function registry(packages: Array<{ name: string; version: string; files?: Entry[]; license?: string | null; dependencies?: Record<string, string>; scripts?: Record<string, string>; badIntegrity?: boolean; tarball?: string }>): typeof fetch {
  const archives = new Map<string, Buffer>(), metadata = new Map<string, Record<string, unknown>>();
  for (const p of packages) {
    const pkg = { name: p.name, version: p.version, ...(p.license === null ? {} : { license: p.license ?? 'MIT' }), ...(p.dependencies ? { dependencies: p.dependencies } : {}), ...(p.scripts ? { scripts: p.scripts } : {}) };
    const archive = tar([{ name: 'package/package.json', content: JSON.stringify(pkg) }, { name: 'package/index.js', content: 'module.exports = value => value;' }, ...(p.files ?? [])]);
    const url = p.tarball ?? `https://registry.npmjs.org/${p.name}/-/${p.version}.tgz`;
    archives.set(url, archive);
    const versions = metadata.get(p.name) ?? {}; versions[p.version] = { ...pkg, dist: { tarball: url, integrity: 'sha512-' + (p.badIntegrity ? Buffer.alloc(64).toString('base64') : createHash('sha512').update(archive).digest('base64')) } }; metadata.set(p.name, versions);
  }
  return (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.redirect, 'error'); const name = String(url);
    if (archives.has(name)) return new Response(new Uint8Array(archives.get(name)!));
    const packageName = decodeURIComponent(new URL(name).pathname.slice(1));
    return metadata.has(packageName) ? new Response(JSON.stringify({ versions: metadata.get(packageName) })) : new Response('missing', { status: 404 });
  }) as typeof fetch;
}
async function fixture(dependencies: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'plugin-dependencies-test-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'generated-plugin', dependencies }));
  return { root, close: () => rm(root, { recursive: true, force: true }) };
}

test('dependency version selection accepts exact and ordinary caret/tilde without URL or wildcard ambiguity', () => {
  assert.equal(satisfiesBuildVersion('1.8.0', '^1.2.3'), true); assert.equal(satisfiesBuildVersion('2.0.0', '^1.2.3'), false);
  assert.equal(satisfiesBuildVersion('0.3.1', '^0.2.1'), false); assert.equal(satisfiesBuildVersion('0.0.3', '^0.0.2'), false);
  assert.equal(satisfiesBuildVersion('1.2.8', '~1.2.3'), true); assert.equal(satisfiesBuildVersion('1.3.0', '~1.2.3'), false);
  assert.equal(satisfiesBuildVersion('1.2.3', 'latest'), false); assert.equal(satisfiesBuildVersion('1.2.3-beta.1', '^1.2.3'), false);
});

test('actual Seatbelt installer verifies all versions, records licenses and never runs package scripts', mac, async () => {
  const f = await fixture({ parent: '^1.0.0' });
  const sentinel = join(f.root, 'script-executed');
  try {
    const packages = [{ name: 'parent', version: '1.0.0' }, { name: 'parent', version: '1.1.0', dependencies: { child: '~2.0.0' }, scripts: { postinstall: `touch ${sentinel}` } }, { name: 'child', version: '2.0.1', license: 'BSD-2-Clause' }, { name: 'child', version: '2.1.0' }];
    const fetch = registry(packages);
    const lock = await installBuildDependencies({ root: f.root, fetch });
    assert.deepEqual(lock.packages.map(p => [p.name, p.version, p.license]), [['parent', '1.1.0', 'MIT'], ['child', '2.0.1', 'BSD-2-Clause']]);
    assert.equal(lock.packages[0]?.scriptsIgnored, true); assert.match(lock.packages[0]!.integrity, /^sha512-/); assert.equal(lock.packages[1]?.path, 'node_modules/parent/node_modules/child');
    assert.equal(JSON.parse(await readFile(join(f.root, 'node_modules/parent/node_modules/child/package.json'), 'utf8')).version, '2.0.1');
    await assert.rejects(access(sentinel));
    assert.deepEqual(await installBuildDependencies({ root: f.root, fetch: registry([...packages, { name: 'parent', version: '1.2.0' }]) }), lock, 'reinstallation preserves the frozen version even when a newer matching release appears');
  } finally { await f.close(); }
});

test('installer rejects path escape, symlinks, hardlinks, native addons and missing license', mac, async () => {
  for (const variation of [
    { files: [{ name: 'package/../../escaped', content: 'bad' }] },
    { files: [{ name: '/tmp/escaped', content: 'bad' }] },
    { files: [{ name: 'package/link', type: '2', link: '/etc/passwd' }] },
    { files: [{ name: 'package/link', type: '1', link: 'package/package.json' }] },
    { files: [{ name: 'package/native.NODE', content: 'binary' }] },
    { license: null },
  ]) {
    const f = await fixture({ malicious: '1.0.0' });
    try { await assert.rejects(installBuildDependencies({ root: f.root, fetch: registry([{ name: 'malicious', version: '1.0.0', ...variation }]) })); await assert.rejects(access(join(f.root, 'node_modules/malicious'))); } finally { await f.close(); }
  }
});

test('official registry, archive integrity and expanded size are enforced before activation', mac, async () => {
  for (const variation of [{ badIntegrity: true }, { tarball: 'https://evil.example/package.tgz' }, { files: [{ name: 'package/large.txt', content: 'x'.repeat(10_000) }] }]) {
    const f = await fixture({ malicious: '1.0.0' });
    try { await assert.rejects(installBuildDependencies({ root: f.root, fetch: registry([{ name: 'malicious', version: '1.0.0', ...variation }]), packageBytes: 4096 })); } finally { await f.close(); }
  }
});

test('unapproved dependency sources and generated lifecycle commands are not executed', async () => {
  const f = await fixture({ package: 'file:/etc' });
  try {
    await assert.rejects(installBuildDependencies({ root: f.root }), /exact SemVer/);
    await writeFile(join(f.root, 'package.json'), JSON.stringify({ scripts: { test: 'touch should-not-exist' } }));
    await assert.rejects(installBuildDependencies({ root: f.root }), /shell scripts/);
  } finally { await f.close(); }
});

test('real official npm package installs through verified archive and Seatbelt extraction', { skip: process.env.MOLIS_PLUGIN_DEPENDENCY_E2E !== '1' || process.platform !== 'darwin', timeout: 30_000 }, async t => {
  const f = await fixture({ 'is-number': '7.0.0' });
  try { const lock = await installBuildDependencies({ root: f.root }); assert.equal(lock.packages[0]?.name, 'is-number'); assert.equal(lock.packages[0]?.version, '7.0.0'); assert.equal(lock.packages[0]?.license, 'MIT'); t.diagnostic(`Installed ${lock.packages[0]?.name}@${lock.packages[0]?.version}, ${lock.packages[0]?.bytes} bytes, SHA-512 verified`); } finally { await f.close(); }
});
