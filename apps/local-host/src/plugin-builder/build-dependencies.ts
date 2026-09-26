import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, realpath, rm, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { BuildDependency, BuildDependencyLock, BuildDependencyOptions } from './build-types.js';
import { readBuildFile } from './build-project.js';

const REGISTRY = 'https://registry.npmjs.org' as const;
const NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
interface Metadata { name: string; version: string; license?: string | { type?: string }; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }>; dist: { tarball: string; integrity: string } }
export function satisfiesBuildVersion(version: string, range: string): boolean {
  if (!VERSION.test(version)) return false;
  if (VERSION.test(range)) return version === range;
  const match = /^(\^|~)(\d+\.\d+\.\d+)$/.exec(range);
  if (!match || version.includes('-')) return false;
  const parts = (value: string) => value.split(/[.+]/).slice(0, 3).map(Number);
  const v = parts(version), min = parts(match[2]!);
  const compare = (a: number[], b: number[]) => (a[0]! - b[0]!) || (a[1]! - b[1]!) || (a[2]! - b[2]!);
  const upper = match[1] === '~' ? [min[0]!, min[1]! + 1, 0] : min[0]! > 0 ? [min[0]! + 1, 0, 0] : min[1]! > 0 ? [0, min[1]! + 1, 0] : [0, 0, min[2]! + 1];
  return compare(v, min) >= 0 && compare(v, upper) < 0;
}
function validRequirement(name: string, range: unknown): asserts range is string {
  if (!NAME.test(name) || name.length > 214 || name.split('/').some(p => p === '.' || p === '..') || typeof range !== 'string' || !(VERSION.test(range) || /^[~^]\d+\.\d+\.\d+$/.test(range))) throw new Error(`Dependency ${name} must use an exact SemVer, ^x.y.z or ~x.y.z from npm`);
}
function official(url: string): URL {
  const result = new URL(url);
  if (result.origin !== REGISTRY || result.username || result.password || result.hash) throw new Error('Dependency requests must use the official npm registry');
  return result;
}
async function download(url: string, options: BuildDependencyOptions, max: number): Promise<Buffer> {
  official(url); options.signal?.throwIfAborted();
  const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(20_000)]);
  const response = await (options.fetch ?? fetch)(url, { signal, redirect: 'error', headers: { Accept: 'application/vnd.npm.install-v1+json' } });
  if (!response.ok || !response.body) throw new Error(`npm request failed (${response.status})`);
  const chunks: Buffer[] = []; let bytes = 0;
  const reader = response.body.getReader();
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > max) throw new Error('npm response exceeds size limit'); chunks.push(Buffer.from(value)); } } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

// Trusted installer program, not package code. It is the only process permitted to
// write package files; no lifecycle hook, binary or package entrypoint is executed.
const UNPACK = String.raw`
import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path'; import crypto from 'node:crypto';
const [archive,target,limitText]=process.argv.slice(2), limit=Number(limitText);
const data=zlib.gunzipSync(fs.readFileSync(archive),{maxOutputLength:limit+4*1024*1024});
let offset=0,total=0,count=0; const files=[]; let extended={}; let longName;
const text=(buffer)=>buffer.toString('utf8').replace(/\0.*$/s,'');
const octal=(buffer)=>{const value=text(buffer).trim();if(value&&!/^[0-7]+$/.test(value))throw Error('Invalid tar number');return value?parseInt(value,8):0};
while(offset+512<=data.length){
 const header=data.subarray(offset,offset+512);if(header.every(v=>v===0))break;
 const expected=octal(header.subarray(148,156));let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:header[i];if(sum!==expected)throw Error('Invalid tar checksum');
 const size=octal(header.subarray(124,136));if(!Number.isSafeInteger(size)||size<0||size>limit||offset+512+size>data.length)throw Error('Invalid tar size');
 const content=data.subarray(offset+512,offset+512+size);offset+=512+Math.ceil(size/512)*512;
 const type=String.fromCharCode(header[156]||48);
 if(type==='x'||type==='g'){
   if(type==='g')throw Error('Global PAX metadata is not supported');
   extended={};let cursor=0;while(cursor<content.length){const space=content.indexOf(32,cursor);const length=Number(content.subarray(cursor,space).toString());if(space<0||!Number.isSafeInteger(length)||length<=space-cursor+1||cursor+length>content.length)throw Error('Invalid PAX metadata');const entry=content.subarray(space+1,cursor+length-1).toString();const equals=entry.indexOf('=');if(equals<1)throw Error('Invalid PAX field');const key=entry.slice(0,equals);if(key==='linkpath')throw Error('Tar links are prohibited');if(key==='path')extended.path=entry.slice(equals+1);cursor+=length}continue;
 }
 if(type==='L'){longName=text(content);continue}
 if(type!=='0'&&type!=='5')throw Error('Tar links, devices and special entries are prohibited');
 let name=extended.path||longName||[text(header.subarray(345,500)),text(header.subarray(0,100))].filter(Boolean).join('/');extended={};longName=undefined;
 name=name.replace(/\/$/,'');const parts=name.split('/');if(parts.shift()!=='package'||parts.some(v=>!v||v==='.'||v==='..')||name.includes('\\')||name.includes('\0')||path.isAbsolute(name))throw Error('Tar path escapes package');
 if(!parts.length){if(type==='5')continue;throw Error('Invalid package entry')}
 const rel=parts.join('/');if(rel.toLowerCase().endsWith('.node'))throw Error('Native addons are prohibited');
 if(++count>4096)throw Error('Too many package entries');const destination=path.join(target,rel);fs.mkdirSync(path.dirname(destination),{recursive:true});
 if(type==='5'){fs.mkdirSync(destination,{recursive:true});continue}
 total+=size;if(total>limit)throw Error('Package expanded size limit exceeded');fs.writeFileSync(destination,content,{flag:'wx',mode:0o444});files.push({path:rel,bytes:size,sha256:crypto.createHash('sha256').update(content).digest('hex')});
}
if(!files.some(f=>f.path==='package.json'))throw Error('Package metadata is missing');process.stdout.write(JSON.stringify({bytes:total,files}));
`;

async function unpack(stage: string, archive: string, target: string, max: number, signal?: AbortSignal): Promise<Pick<BuildDependency, 'bytes' | 'files'>> {
  if (process.platform !== 'darwin') throw new Error('Dependency installation requires macOS Seatbelt');
  await mkdir(target, { recursive: true });
  const worker = archive + '.unpack.mjs'; await writeFile(worker, UNPACK, { mode: 0o400, flag: 'wx' });
  const node = await realpath(process.execPath), root = await realpath(stage), executable = await realpath(worker), tarball = await realpath(archive);
  const quote = (v: string) => JSON.stringify(v);
  const profile = `(version 1)(deny default)(allow process-exec (literal ${quote(node)}))(deny process-fork)(allow signal (target self))(allow sysctl-read)(allow file-read-metadata)(allow file-read* (literal "/") (literal ${quote(node)}) (literal ${quote(executable)}) (literal ${quote(tarball)}) (subpath "/System/Library") (subpath "/usr/lib") (subpath ${quote(root)}))(allow file-write* (subpath ${quote(await realpath(target))}))(deny network*)`;
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, node, '--no-addons', '--max-old-space-size=96', worker, archive, target, String(max)], { cwd: stage, env: {}, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let output = '', error = '', failure: Error | undefined;
    const kill = (reason: Error) => { failure ??= reason; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } } };
    const timer = setTimeout(() => kill(new Error('Dependency unpack timed out')), 10_000);
    const abort = () => kill(new Error('Dependency installation cancelled')); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    child.stdout.on('data', chunk => { output += String(chunk); if (output.length > 1024 * 1024) kill(new Error('Unpack result exceeds limit')); });
    child.stderr.on('data', chunk => { error += String(chunk); if (error.length > 8192) kill(new Error('Unpack diagnostics exceed limit')); });
    child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (failure || code !== 0) reject(failure ?? new Error(`Dependency rejected by sandbox unpacker: ${error.slice(0, 2000)}`)); else { try { resolve(JSON.parse(output)); } catch { reject(new Error('Invalid unpack result')); } } });
  });
}

/** Fetches verified archives on the host; extraction and installation run without network or scripts. */
export async function installBuildDependencies(options: BuildDependencyOptions): Promise<BuildDependencyLock> {
  const root = await realpath(options.root), pkg = JSON.parse((await readBuildFile(root, 'package.json', 128 * 1024)).toString()) as { dependencies?: Record<string, string>; devDependencies?: unknown; scripts?: unknown };
  if (pkg.devDependencies && Object.keys(pkg.devDependencies).length) throw new Error('Declare runtime dependencies only; build tools are supplied by the host');
  if (pkg.scripts && Object.keys(pkg.scripts).length) throw new Error('Generated projects cannot define lifecycle or shell scripts');
  const requested = pkg.dependencies ?? {};
  if (!requested || typeof requested !== 'object' || Array.isArray(requested)) throw new Error('dependencies must be an object');
  for (const [name, range] of Object.entries(requested)) validRequirement(name, range);
  const packageBytes = options.packageBytes ?? 16 * 1024 * 1024, totalBytes = options.totalBytes ?? 64 * 1024 * 1024, archiveBytes = options.archiveBytes ?? 8 * 1024 * 1024, maxPackages = options.maxPackages ?? 64;
  const lock: BuildDependencyLock = { version: 1, registry: REGISTRY, requested: { ...requested }, packages: [] };
  let previous: BuildDependencyLock | undefined;
  try {
    const candidate = JSON.parse((await readBuildFile(root, 'dependency-lock.json', 4 * 1024 * 1024)).toString()) as BuildDependencyLock;
    if (candidate.version !== 1 || candidate.registry !== REGISTRY || !Array.isArray(candidate.packages)) throw new Error('Invalid dependency lock');
    if (isDeepStrictEqual(candidate.requested, requested)) previous = candidate;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const stage = await mkdtemp(join(dirname(root), '.plugin-dependencies-'));
  const tree = join(stage, 'tree'); await mkdir(join(tree, 'node_modules'), { recursive: true });
  const metadata = new Map<string, Record<string, Metadata>>(); let expanded = 0;
  try {
    const install = async (name: string, range: string, parent: string, ancestors: Map<string, string>, depth: number): Promise<void> => {
      validRequirement(name, range); options.signal?.throwIfAborted();
      if (ancestors.has(name) && satisfiesBuildVersion(ancestors.get(name)!, range)) return;
      if (depth > 12 || lock.packages.length >= maxPackages) throw new Error('Dependency graph exceeds depth or package count limit');
      let versions = metadata.get(name);
      if (!versions) { const response = JSON.parse((await download(`${REGISTRY}/${encodeURIComponent(name)}`, options, 8 * 1024 * 1024)).toString()) as { versions?: Record<string, Metadata> }; if (!response.versions || typeof response.versions !== 'object') throw new Error(`Invalid npm metadata for ${name}`); versions = response.versions; metadata.set(name, versions); }
      const matches = Object.keys(versions).filter(version => satisfiesBuildVersion(version, range)).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
      const packagePath = `${parent}node_modules/${name}`;
      const locked = previous?.packages.find(p => p.path === packagePath);
      if (locked && (locked.name !== name || !satisfiesBuildVersion(locked.version, range))) throw new Error('Locked dependency does not satisfy its declaration');
      const selected = locked?.version ?? matches[0]; if (!selected) throw new Error(`No supported version satisfies ${name}@${range}`);
      const entry = versions[selected]!;
      if (!entry || entry.name !== name || entry.version !== selected || !entry.dist || typeof entry.dist.tarball !== 'string') throw new Error('npm metadata identity mismatch');
      const integrity = entry.dist.integrity?.split(/\s+/).find(v => /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(v));
      if (!integrity) throw new Error(`${name}@${selected} must provide SHA-512 archive integrity`);
      if (locked && (locked.integrity !== integrity || locked.tarball !== entry.dist.tarball)) throw new Error('Registry archive differs from frozen dependency lock');
      official(entry.dist.tarball);
      const bytes = await download(entry.dist.tarball, options, archiveBytes);
      if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== integrity) throw new Error(`Integrity mismatch for ${name}@${selected}`);
      const archive = join(stage, `archive-${lock.packages.length}.tgz`); await writeFile(archive, bytes, { mode: 0o400 });
      const destination = join(tree, packagePath);
      const extracted = await unpack(stage, archive, destination, Math.min(packageBytes, totalBytes - expanded), options.signal);
      expanded += extracted.bytes;
      if (expanded > totalBytes) throw new Error('Total dependency expanded size limit exceeded');
      const installed = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8')) as Metadata & { scripts?: Record<string, string> };
      if (installed.name !== name || installed.version !== selected || !isDeepStrictEqual(installed.dependencies ?? {}, entry.dependencies ?? {})) throw new Error('Archive metadata differs from registry metadata');
      const license = typeof installed.license === 'string' ? installed.license : installed.license?.type;
      if (!license) throw new Error(`${name}@${selected} does not declare its license`);
      lock.packages.push({ name, version: selected, path: packagePath, integrity, tarball: entry.dist.tarball, license, bytes: extracted.bytes, scriptsIgnored: Boolean(installed.scripts && Object.keys(installed.scripts).length), files: extracted.files });
      const chain = new Map(ancestors); chain.set(name, selected);
      const dependencies = { ...installed.dependencies, ...installed.optionalDependencies };
      for (const [peer, requirement] of Object.entries(installed.peerDependencies ?? {})) if (!installed.peerDependenciesMeta?.[peer]?.optional && !Object.hasOwn(dependencies, peer)) dependencies[peer] = requirement;
      for (const [dependency, requirement] of Object.entries(dependencies)) await install(dependency, requirement, packagePath + '/', chain, depth + 1);
    };
    for (const [name, range] of Object.entries(requested)) await install(name, range, '', new Map(), 0);
    options.signal?.throwIfAborted();
    // Existing state remains intact until every package is verified and installed.
    const lockPath = join(stage, 'dependency-lock.json'); await writeFile(lockPath, JSON.stringify(lock, null, 2), { mode: 0o444 });
    const old = join(stage, 'old-node_modules'); let moved = false;
    try { await rename(join(root, 'node_modules'), old); moved = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await rename(join(tree, 'node_modules'), join(root, 'node_modules')); await rename(lockPath, join(root, 'dependency-lock.json')); }
    catch (error) { await rm(join(root, 'node_modules'), { recursive: true, force: true }); if (moved) await rename(old, join(root, 'node_modules')); throw error; }
    return lock;
  } finally { await rm(stage, { recursive: true, force: true }); }
}
