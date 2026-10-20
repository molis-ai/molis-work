import { constants } from 'node:fs';
import { mkdir, readdir, realpath, readFile, writeFile, open, lstat } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { assertContract, assertEffects, assertJson } from '@molis-ai/molis-work-plugin-sandbox';
import type { SandboxEffects, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { BuildManifest, BuildProject, DeveloperCapabilities } from './build-types.js';

export const SDK_MODULE = '@molis/plugin-sdk';
export const TEST_TYPES = `
export interface SandboxTestAssert {
  same(actual: SandboxJson, expected: SandboxJson): void;
  includes(actual: SandboxJson, expected: SandboxJson): void;
  rejectsCode(call: () => Promise<unknown>, code: string): Promise<void>;
}
export type SandboxTest = (sdk: SandboxSdk, call: (input: SandboxJson) => Promise<SandboxJson>, assert: SandboxTestAssert) => Promise<void>;
`;
export function effectsFromContract(contract: SandboxPluginContract): SandboxEffects {
  const result: Record<string, string[]> = {};
  for (const operation of contract.operations) for (const [key, values] of Object.entries(operation.effects)) result[key] = [...new Set([...(result[key] ?? []), ...(values ?? [])])].sort();
  return result as SandboxEffects;
}
export function buildManifest(contract: SandboxPluginContract): BuildManifest {
  return { version: 1, pluginId: contract.pluginId, revision: contract.revision, effects: effectsFromContract(contract) };
}
export function operationEntry(contract: SandboxPluginContract): string {
  return contract.operations.map((_op, index) => `import operation${index} from './operations/${index}.js';`).join('\n')
    + `\nexport const operations = {\n${contract.operations.map((op, index) => `${JSON.stringify(op.id)}: operation${index}`).join(',\n')}\n};\n`;
}
export async function sdkDeclaration(): Promise<string> {
  const location = fileURLToPath(import.meta.resolve('@molis-ai/molis-work-contracts/platform/plugin-sandbox')).replace(/\.js$/, '.d.ts');
  const declaration = await readFile(location, 'utf8');
  if (!declaration.includes('interface SandboxSdk')) throw new Error('Packaged SandboxSdk declaration is unavailable; build contracts first');
  return declaration.replace(/^\/\/# sourceMappingURL=.*$/m, '') + TEST_TYPES;
}

/** Never overwrite an existing project. Revisions get their own host-created root. */
export async function createBuildProject(root: string, contract: SandboxPluginContract, manifest: BuildManifest, developerCapabilities: DeveloperCapabilities): Promise<BuildProject> {
  assertContract(contract); assertEffects(manifest.effects); assertJson(developerCapabilities);
  if (JSON.stringify(canonical(manifest)) !== JSON.stringify(canonical(buildManifest(contract)))) throw new Error('Manifest must be derived exactly from contract effects');
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink() || (await readdir(root)).length) throw new Error('Build root must be an empty directory, not a symbolic link');
  root = await realpath(root);
  for (const directory of ['src/operations', 'tests/operations', 'developer']) await mkdir(join(root, directory), { recursive: true });
  const frozen = (path: string, content: string) => writeFile(join(root, path), content, { flag: 'wx', mode: 0o444 });
  await frozen('contract.json', JSON.stringify(contract, null, 2));
  await frozen('manifest.json', JSON.stringify(manifest, null, 2));
  await frozen('src/index.ts', operationEntry(contract));
  await frozen('developer/sdk.d.ts', await sdkDeclaration());
  await frozen('developer/capabilities.json', JSON.stringify(developerCapabilities, null, 2));
  await frozen('developer/README.md', `# Plugin backend

Implement only the frozen contract in contract.json. Each src/operations/<index>.ts exports one async default
function (input, sdk) returning exactly the operation's output shape (no extra fields). Shared helpers may live in
other src/*.ts files. Import types from '${SDK_MODULE}'. Await every SDK call. No Node globals, filesystem, network,
subprocesses, eval or dynamic imports; plain JavaScript (Date, Math, JSON, Map…) is fine.

SDK: sdk.storage.get(key) → value or null; sdk.storage.set(key, value); sdk.storage.delete(key);
sdk.storage.list(prefix) → [{ key, value }]. Values are JSON. Storage belongs to this installation only.
Declared errors: throw Object.assign(new Error('说明'), { code: 'not_found' }).
The clock is real: use new Date() for today or this month, never a fixed date; tests pass dates in, never assert today's.

Platform capabilities: only the ids in the operation's effects.capabilities, and only after installation approval.
model.generate — declare what the model is asked in the operation file that calls it:
export const prompts = [{ id: 'summary', title: '要点提炼', purpose: '把笔记提炼成事后回看用的要点', body: '提炼出事后回看时最需要的结论、决定和待办…' }];
then const { text } = await sdk.capability.call('model.generate', { prompt: 'summary', input }) as { text: string };
(the prompt id is a literal). The person's configured text model, one answer, no tools; the person can read and edit
the prompt. In tests, examples, checks and acceptance a fixed stand-in answers: text = '［模型替身］' + the first 40
characters of input. Assert on that prefix or on what you save, never on a real answer. Say the format you need in the
prompt body and parse tolerantly; keep the raw text if parsing fails. Write in the body who the step is for and what a
good answer is, not counts or lengths the product does not need; when a count or length is a product limit (a card
shows three lines), say why in the body and check the returned text in code, failing when it does not fit.

Example operation (src/operations/1.ts):

    import type { SandboxJson, SandboxSdk } from '${SDK_MODULE}';
    export default async function operation(input: SandboxJson, sdk: SandboxSdk): Promise<SandboxJson> {
      const { text } = input as { text: string };
      const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await sdk.storage.set('note:' + id, { id, text: text.trim(), createdAt: Date.now() });
      return { id, text: text.trim() };
    }

Tests (tests/operations/<index>.ts) export a nonempty array of async functions (sdk, call, assert). call(input)
runs this operation's production code. The tests of one operation run in order and share one isolated store, and
they may write to it to prepare data. Assertions: assert.same(actual, expected), assert.includes(actual, subset),
await assert.rejectsCode(() => call(input), 'code'). Every test must assert something.

    import type { SandboxTest } from '${SDK_MODULE}';
    export const tests: SandboxTest[] = [
      async (sdk, call, assert) => {
        const saved = await call({ text: '  买牛奶 ' });
        assert.includes(saved, { text: '买牛奶' });
        assert.same((await sdk.storage.list('note:')).length, 1);
      },
    ];
`);
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'generated-plugin', version: '0.0.0', private: true, type: 'module', dependencies: {} }, null, 2), { flag: 'wx', mode: 0o600 });
  const operationFiles: Record<string, string> = {}, testFiles: Record<string, string> = {};
  for (const [index, operation] of contract.operations.entries()) {
    const operationPath = join(root, `src/operations/${index}.ts`), testPath = join(root, `tests/operations/${index}.ts`);
    await writeFile(operationPath, operationStub(operation.id), { flag: 'wx', mode: 0o600 });
    await writeFile(testPath, `import type { SandboxTest } from '${SDK_MODULE}';\n// Add behavioral tests, including relevant failure/recovery cases.\nexport const tests: SandboxTest[] = [];\n`, { flag: 'wx', mode: 0o600 });
    operationFiles[operation.id] = operationPath; testFiles[operation.id] = testPath;
  }
  return { root, sdkPath: join(root, 'developer/sdk.d.ts'), operationFiles, testFiles };
}

/** The generated implementation an operation starts from; checks and G4 recognise it by NOT_IMPLEMENTED. */
export function operationStub(operationId: string): string {
  return `import type { SandboxJson, SandboxSdk } from '${SDK_MODULE}';\nexport default async function operation(_input: SandboxJson, _sdk: SandboxSdk): Promise<SandboxJson> {\n  throw Object.assign(new Error('Implement ${operationId}'), { code: 'NOT_IMPLEMENTED' });\n}\n`;
}
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
/** Carry authored helpers and dependency declarations, never generated entrypoints, installed packages or grants. */
export async function copyBuildRevisionInputs(source: string, target: string): Promise<void> {
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Revision source must not be a symbolic link');
  const files = new Map<string, Buffer>();
  let total = 0;
  const capture = async (name: string, limit = 2 * 1024 * 1024) => {
    const bytes = await readBuildFile(source, name, limit);
    total += bytes.length;
    if (files.size >= 512 || total > 80 * 1024 * 1024) throw new Error('Revision inputs exceed limit');
    files.set(name, bytes);
  };
  const walk = async (name: string) => {
    for (const entry of await readdir(join(source, name), { withFileTypes: true })) {
      const path = name + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Revision inputs must not contain symbolic links');
      if (entry.isDirectory()) await walk(path);
      else if (!entry.isFile() || !path.endsWith('.ts')) throw new Error('Revision inputs must be TypeScript files');
      else if (path !== 'src/index.ts' && !/^(?:src|tests)\/operations\/[0-9]+\.ts$/.test(path)) await capture(path);
    }
  };
  await walk('src'); await walk('tests');
  for (const name of ['package.json', 'package-lock.json', 'dependency-lock.json', 'tsconfig.json']) {
    try { await capture(name, name === 'package.json' ? 128 * 1024 : 4 * 1024 * 1024); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  // All source reads have completed before modifying the newly host-created revision.
  for (const [name, bytes] of files) {
    await mkdir(dirname(join(target, name)), { recursive: true, mode: 0o700 });
    await writeFile(join(target, name), bytes, { mode: 0o600 });
  }
}
/** Operation files follow stable operation ids, not the index assigned by a new contract revision. */
export async function copyUnchangedBuildOperations(source: string, target: string, before: SandboxPluginContract, after: SandboxPluginContract, connected: readonly string[], settledRoot: string): Promise<void> {
  for (const [index, operation] of after.operations.entries()) {
    const old = before.operations.findIndex(item => item.id === operation.id);
    if (old < 0 || !isDeepStrictEqual(canonical(before.operations[old]), canonical(operation))) continue;
    for (const kind of ['src', 'tests']) {
      try {
        const bytes = await readBuildFile(source, `${kind}/operations/${old}.ts`);
        await writeFile(join(target, kind, 'operations', index + '.ts'), bytes, { mode: 0o600 });
        if (kind === 'src' && connected.includes(operation.id)) {
          const settled = join(settledRoot, 'src/operations');
          await mkdir(settled, { recursive: true, mode: 0o700 });
          await writeFile(join(settled, index + '.ts'), bytes, { mode: 0o600 });
        }
      } catch { continue; /* A missing or unsafe operation is written again by the code agent. */ }
    }
  }
}
/** Snapshot only selected operation tests and shared helpers, under the same bounds as authored source. */
export async function copyBuildCheckSources(root: string, contract: SandboxPluginContract, operationIds: readonly string[], settled: ((index: number, id: string) => Promise<Buffer>) | undefined, put: (name: string, bytes: Buffer) => Promise<void>): Promise<void> {
  let count = 0;
  const walk = async (directory: string) => {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const name = directory + '/' + entry.name;
      if (entry.isSymbolicLink()) throw new Error('Source symlinks are prohibited: ' + name);
      if (entry.isDirectory()) { await walk(name); continue; }
      if (/^tests\/operations\/[0-9]+\.ts$/.test(name)) continue;
      if (!entry.isFile() || !name.endsWith('.ts') || ++count > 512) throw new Error('Only bounded TypeScript source files are accepted');
      const current = /^src\/operations\/([0-9]+)\.ts$/.exec(name), index = current ? Number(current[1]) : -1;
      const operation = contract.operations[index];
      await put(name, settled && operation && !operationIds.includes(operation.id) ? await settled(index, operation.id) : await readBuildFile(root, name));
    }
  };
  await walk('src'); await walk('tests');
  // Require every selected test, even when a directory entry was missing.
  for (const id of operationIds) {
    const name = 'tests/operations/' + contract.operations.findIndex(operation => operation.id === id) + '.ts';
    if (++count > 512) throw new Error('Only bounded TypeScript source files are accepted');
    await put(name, await readBuildFile(root, name));
  }
}
export function pathInside(root: string, path: string): boolean { const rel = relative(root, resolve(path)); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'); }
/** Reject symbolic links at every component, then bounded no-follow reads. */
export async function readBuildFile(root: string, path: string, maxBytes = 2 * 1024 * 1024): Promise<Buffer> {
  const full = resolve(root, path);
  if (!pathInside(root, full)) throw new Error(`Build path escapes root: ${path}`);
  let current = root;
  for (const part of relative(root, full).split('/')) { current = join(current, part); if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${path}`); }
  const handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > maxBytes) throw new Error(`Build file exceeds limit: ${path}`); const buffer = Buffer.alloc(stat.size + 1); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0); if (bytesRead !== stat.size) throw new Error(`Build file changed during read: ${path}`); return buffer.subarray(0, bytesRead); } finally { await handle.close(); }
}
