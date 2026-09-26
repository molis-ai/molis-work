import { builtinModules } from 'node:module';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readdir, lstat, realpath, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import * as esbuild from 'esbuild';
import { assertContract, createSandboxRunner } from '@molis-ai/molis-work-plugin-sandbox';
import type { SandboxRunner, SandboxServices } from '@molis-ai/molis-work-plugin-sandbox';
import type { SandboxJson, SandboxOperationContract, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { BuildCheckOptions, BuildCheckResult, BuildDependencyLock, BuildGateId } from './build-types.js';
import { buildManifest, canonical, operationEntry, pathInside, readBuildFile, sdkDeclaration, SDK_MODULE } from './build-project.js';
import { installBuildDependencies } from './build-dependencies.js';

export type { BuildCheckOptions, BuildCheckResult, BuildGate } from './build-types.js';
const GATES: BuildGateId[] = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'];
const BUILTINS = new Set(builtinModules.map(name => name.replace(/^node:/, '')));

/** Same host-owned path for Agent self-checks and the independent final verification. */
export async function runPluginChecks(options: BuildCheckOptions): Promise<BuildCheckResult> {
  options = { ...options, contract: structuredClone(options.contract), manifest: structuredClone(options.manifest), identity: structuredClone(options.identity), grants: structuredClone(options.grants), operationIds: [...options.operationIds] };
  const result: BuildCheckResult = { passed: false, gates: [] };
  let current: BuildGateId = 'G1', temporary: string | undefined;
  const pass = (id: BuildGateId, detail: string) => result.gates.push({ id, passed: true, detail });
  try {
    options.signal?.throwIfAborted(); assertContract(options.contract);
    if (options.identity.namespace !== 'preview' || options.identity.pluginId !== options.contract.pluginId) throw new Error('Checks require this plugin\'s preview identity');
    if (!options.operationIds.length || new Set(options.operationIds).size !== options.operationIds.length || options.operationIds.some(id => !options.contract.operations.some(op => op.id === id))) throw new Error('Select unique operations from the frozen contract');
    const root = await realpath(options.root), selected = options.contract.operations.filter(op => options.operationIds.includes(op.id));
    const expected = buildManifest(options.contract);
    for (const [path, value] of [['manifest.json', expected], ['contract.json', options.contract]] as const) {
      const actual = JSON.parse((await readBuildFile(root, path)).toString());
      if (!isDeepStrictEqual(canonical(actual), canonical(value))) throw new Error(`${path} differs from host-frozen authority`);
    }
    if (!isDeepStrictEqual(canonical(options.manifest), canonical(expected))) throw new Error('Manifest effects differ from the contract');
    if ((await readBuildFile(root, 'src/index.ts')).toString() !== operationEntry(options.contract)) throw new Error('Host-owned entrypoint was changed');
    const declaration = await sdkDeclaration();
    if ((await readBuildFile(root, 'developer/sdk.d.ts')).toString() !== declaration) throw new Error('Host-owned SDK declarations were changed');
    pass('G1', 'Frozen contract, operation map, SDK declarations and manifest effects match host authority');

    // Dependency declarations need installation before TypeScript resolution. Classify
    // a download, archive or lock failure as G3 instead of a misleading type error.
    current = 'G3';
    const dependencies = await installBuildDependencies({ root, signal: options.signal }); result.dependencies = dependencies;
    temporary = await realpath(await mkdtemp(join(tmpdir(), 'molis-plugin-checks-')));
    const files = new Map<string, string>();
    let total = 0;
    const put = async (name: string, bytes: Buffer) => {
      total += bytes.length; if (total > 80 * 1024 * 1024) throw new Error('Build snapshot exceeds limit');
      const target = join(temporary!, name); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes, { mode: 0o400 });
      files.set(target, bytes.toString('utf8'));
    };
    const copySources = async (directory: string) => {
      const path = join(root, directory);
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error(`Source symlinks are prohibited: ${directory}/${entry.name}`);
        const name = `${directory}/${entry.name}`;
        if (entry.isDirectory()) await copySources(name);
        else if (entry.isFile()) { if (!name.endsWith('.ts') || files.size > 512) throw new Error('Only bounded TypeScript source files are accepted'); await put(name, await readBuildFile(root, name)); }
      }
    };
    await copySources('src');
    for (const operation of selected) {
      const index = options.contract.operations.indexOf(operation), path = `tests/operations/${index}.ts`;
      await put(path, await readBuildFile(root, path));
    }
    await put('developer/sdk.d.ts', Buffer.from(declaration));
    for (const pkg of dependencies.packages) for (const file of pkg.files) {
      const name = `${pkg.path}/${file.path}`, bytes = await readBuildFile(root, name, 16 * 1024 * 1024);
      if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Installed dependency changed after verification: ${name}`);
      await put(name, bytes);
    }
    const snapshot = temporary;
    current = 'G2';
    await isolatedTypecheck(snapshot, files, selected.map(op => `tests/operations/${options.contract.operations.indexOf(op)}.ts`), options.signal);
    pass('G2', 'Strict host-owned TypeScript configuration passed with ES2022 and SDK declarations only; no Node ambient types');

    current = 'G3';
    const bundle = await bundleCode(snapshot, files, dependencies, join(snapshot, 'src/index.ts'));
    const productionPath = join(snapshot, 'production.mjs'); await writeFile(productionPath, bundle, { mode: 0o400 });
    pass('G3', `Self-contained ESM bundle produced; ${dependencies.packages.length} npm package versions verified, scripts disabled`);

    current = 'G4';
    for (const operation of selected) {
      const source = files.get(join(snapshot, `src/operations/${options.contract.operations.indexOf(operation)}.ts`))!;
      const ast = ts.createSourceFile('operation.ts', source, ts.ScriptTarget.ES2022, true);
      let stub = false; const visit = (node: ts.Node) => { if (ts.isStringLiteral(node) && node.text === 'NOT_IMPLEMENTED') stub = true; ts.forEachChild(node, visit); }; visit(ast);
      if (stub) throw new Error(`${operation.id} still contains its generated implementation stub`);
    }
    const probe = await startRunner(options, productionPath, options.contract, mockHost(options.mockServices), 'contract');
    await probe.stop();
    pass('G4', `${selected.length} selected operations implemented; sandbox export set matches the entire frozen contract`);

    current = 'G5'; let tests = 0, examples = 0;
    for (const operation of selected) {
      options.signal?.throwIfAborted();
      const index = options.contract.operations.indexOf(operation);
      const testSource = testEntry(index, operation.id);
      const testBundle = await bundleCode(snapshot, files, dependencies, undefined, testSource);
      const testPath = join(snapshot, `test-${index}.mjs`); await writeFile(testPath, testBundle, { mode: 0o400 });
      // Tests run against isolated mock services, so they may seed the store (e.g. to test a query with data).
      // The operation's real permissions are still enforced by the examples below and by G6.
      const seeding = { ...operation.effects, storage: ['read', 'write'] as Array<'read' | 'write'> };
      const testContract: SandboxPluginContract = { ...options.contract, entities: [], pages: [], acceptance: [], operations: [{ ...operation, kind: 'command', effects: seeding, input: { type: 'null' }, output: { type: 'integer', minimum: 1 }, examples: [{ input: null, output: 1 }] }] };
      const runner = await startRunner({ ...options, grants: { ...options.grants, storage: ['read', 'write'] } }, testPath, testContract, mockHost(options.mockServices), `tests-${index}`);
      try { tests += await runner.call(operation.id, null) as number; } finally { await runner.stop(); }
      const sampleRunner = await startRunner(options, productionPath, options.contract, mockHost(options.mockServices), `mock-${index}`);
      try { for (const example of operation.examples) { await runExample(sampleRunner, operation, example); examples++; } } finally { await sampleRunner.stop(); }
    }
    pass('G5', `${tests} Agent tests and ${examples} contract examples passed inside Seatbelt against isolated mock services`);

    current = 'G6'; let live = 0;
    for (const operation of selected) {
      options.signal?.throwIfAborted();
      const runner = await startRunner(options, productionPath, options.contract, options.services, `preview-${options.contract.operations.indexOf(operation)}`);
      try { for (const example of operation.examples) { await runExample(runner, operation, example); live++; } } finally { await runner.stop(); }
    }
    pass('G6', `${live} contract examples passed with host-provided services and separate preview identities`);
    options.signal?.throwIfAborted();
    const output = join(root, 'build');
    try { if ((await lstat(output)).isSymbolicLink()) throw new Error('Build output cannot be a symbolic link'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await mkdir(output, { recursive: true });
    const candidate = join(output, `bundle-${randomUUID()}.mjs`); await writeFile(candidate, bundle, { mode: 0o400 });
    const target = join(output, 'plugin.mjs'); await rename(candidate, target);
    result.bundlePath = target; result.passed = true;
  } catch (error) {
    if (!result.gates.some(gate => gate.id === current)) result.gates.push({ id: current, passed: false, detail: error instanceof Error ? error.message : String(error) });
    for (const id of GATES) if (!result.gates.some(gate => gate.id === id)) result.gates.push({ id, passed: false, detail: `Not run because ${current} failed` });
  } finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
  result.gates.sort((a, b) => GATES.indexOf(a.id) - GATES.indexOf(b.id));
  return result;
}

function typecheck(root: string, files: Map<string, string>, tests: string[]): void {
  const sdk = join(root, 'developer/sdk.d.ts');
  const config: ts.CompilerOptions = { strict: true, noEmit: true, noImplicitAny: true, skipLibCheck: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ['lib.es2022.d.ts'], types: [], allowJs: false, resolveJsonModule: true, noUncheckedIndexedAccess: true };
  const base = ts.createCompilerHost(config), lib = dirname(ts.getDefaultLibFilePath(config));
  const allowed = (path: string) => files.has(resolve(path)) || pathInside(lib, path);
  const host: ts.CompilerHost = { ...base, fileExists: path => allowed(path) && base.fileExists(path), readFile: path => allowed(path) ? files.get(resolve(path)) ?? base.readFile(path) : undefined,
    getSourceFile: (path, languageVersion) => { const contents = allowed(path) ? files.get(resolve(path)) ?? base.readFile(path) : undefined; return contents === undefined ? undefined : ts.createSourceFile(path, contents, languageVersion); },
    resolveModuleNames: (names, containingFile) => names.map(name => name === SDK_MODULE ? { resolvedFileName: sdk, extension: ts.Extension.Dts } : ts.resolveModuleName(name, containingFile, config, host).resolvedModule),
  };
  const program = ts.createProgram([join(root, 'src/index.ts'), ...tests.map(path => join(root, path)), sdk], config, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw new Error(diagnostics.slice(0, 24).map(d => `${d.file ? relative(root, d.file.fileName) + ':' + (d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1) + ' ' : ''}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`).join('\n'));
}

/** Recursive untrusted types must not monopolize the host event loop or heap. */
async function isolatedTypecheck(root: string, files: Map<string, string>, tests: string[], signal?: AbortSignal): Promise<void> {
  const compiler = fileURLToPath(import.meta.resolve('typescript')), node = await realpath(process.execPath);
  const worker = join(root, 'host-typecheck.mjs'), config = join(root, 'host-typecheck.json');
  await writeFile(config, JSON.stringify({ root, files: [...files.keys()], tests }), { mode: 0o400 });
  await writeFile(worker, `import ts from ${JSON.stringify(pathToFileURL(compiler).href)};import{dirname,join,relative,resolve,isAbsolute}from'node:path';import{readFileSync}from'node:fs';const __name=v=>v;const SDK_MODULE=${JSON.stringify(SDK_MODULE)};const pathInside=${pathInside.toString()};const typecheck=${typecheck.toString()};const config=JSON.parse(readFileSync(process.argv[2],'utf8'));try{typecheck(config.root,new Map(config.files.map(p=>[p,readFileSync(p,'utf8')])),config.tests)}catch(error){process.stderr.write(error.message);process.exitCode=1}`, { mode: 0o400 });
  const quote = (value: string) => JSON.stringify(value);
  const profile = `(version 1)(deny default)(allow process-exec(literal ${quote(node)}))(deny process-fork)(allow signal(target self))(allow sysctl-read)(allow file-read-metadata)(allow file-read*(literal "/")(literal ${quote(node)})(subpath ${quote(root)})(subpath ${quote(dirname(dirname(compiler)))})(subpath "/System/Library")(subpath "/usr/lib"))(deny network*)(deny file-write*)`;
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, node, '--no-addons', '--max-old-space-size=192', worker, config], { cwd: root, env: {}, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostics = '', reason: Error | undefined;
    const kill = (error: Error) => { reason ??= error; if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } } };
    const timer = setTimeout(() => kill(new Error('Type checking exceeded its 30 second budget')), 30_000), abort = () => kill(new Error('Type checking cancelled'));
    signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) abort();
    const collect = (chunk: Buffer) => { diagnostics += chunk.toString(); if (diagnostics.length > 32_000) kill(new Error('Type checking diagnostics exceeded limit')); };
    child.stdout.on('data', collect); child.stderr.on('data', collect); child.on('error', reject);
    child.on('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', abort); if (reason || code !== 0) reject(reason ?? new Error(diagnostics || 'Type checker process failed')); else resolvePromise(); });
  });
}

function checkCode(path: string, source: string): void {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.ES2022, true, path.endsWith('.json') ? ts.ScriptKind.JSON : ts.ScriptKind.TS);
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === SDK_MODULE) throw new Error('SDK imports must be type-only; sdk is supplied to each operation');
    if (ts.isCallExpression(node)) {
      const dynamic = node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require');
      if (dynamic && (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0]!))) throw new Error(`Unresolved dynamic module in ${path}`);
      if (ts.isIdentifier(node.expression) && ['eval', 'Function'].includes(node.expression.text)) throw new Error(`Dynamic code execution is prohibited in ${path}`);
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') throw new Error(`Dynamic code execution is prohibited in ${path}`);
    ts.forEachChild(node, visit);
  }; visit(ast);
}

async function bundleCode(root: string, files: Map<string, string>, dependencies: BuildDependencyLock, entry?: string, stdin?: string): Promise<string> {
  const packagePaths = dependencies.packages.map(pkg => join(root, pkg.path));
  const allowed = (path: string) => files.has(path) && (pathInside(join(root, 'src'), path) || pathInside(join(root, 'tests'), path) || packagePaths.some(pkg => pathInside(pkg, path)));
  const built = await esbuild.build({ absWorkingDir: root, ...(entry ? { entryPoints: [entry] } : { stdin: { contents: stdin!, sourcefile: 'host-test-entry.ts', loader: 'ts' as const, resolveDir: root } }),
    bundle: true, write: false, platform: 'neutral', format: 'esm', target: 'es2022', mainFields: ['browser', 'module', 'main'], conditions: ['browser', 'import', 'default'], logLevel: 'silent', sourcemap: false,
    plugins: [{ name: 'vetted-build-files', setup(build) {
      build.onResolve({ filter: /.*/ }, async args => {
        if (args.pluginData?.checked) return;
        if (args.path.startsWith('node:') || BUILTINS.has(args.path) || args.path === SDK_MODULE) return { errors: [{ text: `Runtime import prohibited: ${args.path}` }] };
        const resolved = await build.resolve(args.path, { importer: args.importer, resolveDir: args.resolveDir || root, kind: args.kind, pluginData: { checked: true } });
        if (resolved.errors.length) return resolved;
        if (resolved.external || !allowed(resolved.path)) return { errors: [{ text: `Import is outside source or vetted npm lock: ${args.path}` }] };
        return { path: resolved.path };
      });
      build.onLoad({ filter: /.*/ }, args => {
        if (!allowed(args.path)) return { errors: [{ text: 'Unvetted build input' }] };
        const contents = files.get(args.path)!; checkCode(relative(root, args.path), contents);
        const extension = extname(args.path);
        return { contents, loader: extension === '.json' ? 'json' : extension === '.ts' || extension === '.mts' ? 'ts' : 'js' };
      });
    } }],
  });
  if (built.outputFiles.length !== 1 || built.outputFiles[0]!.contents.length > 8 * 1024 * 1024) throw new Error('Bundle must be one bounded JavaScript file');
  return built.outputFiles[0]!.text;
}

async function startRunner(options: BuildCheckOptions, bundlePath: string, contract: SandboxPluginContract, services: SandboxServices, suffix: string): Promise<SandboxRunner> {
  options.signal?.throwIfAborted();
  const runner = await createSandboxRunner({ bundlePath, contract, identity: { ...options.identity, installationId: `${options.identity.installationId}:${suffix}:${randomUUID()}`, namespace: 'preview' }, grants: options.grants, services });
  const abort = () => { void runner.stop(); }; options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) { await runner.stop(); options.signal.throwIfAborted(); }
  return { pid: runner.pid, call: (id, input) => runner.call(id, input), async stop() { options.signal?.removeEventListener('abort', abort); await runner.stop(); } };
}
function mockHost(overrides?: SandboxServices): SandboxServices {
  const storage = new Map<string, SandboxJson>(), artifacts = new Map<string, SandboxJson>(); let next = 0;
  return {
    storage: { async transaction(context, mutate) { const snapshot = new Map(storage); const result = mutate(snapshot); context.signal.throwIfAborted(); storage.clear(); for (const [key, value] of snapshot) storage.set(key, structuredClone(value)); return result; } },
    artifacts: { async get(_context, reference) { const value = artifacts.get(`${reference.artifact_id}:${reference.version}`); if (value === undefined) throw new Error('Mock artifact version does not exist'); return value; }, async put(_context, value) { const artifact_id = `mock-artifact-${++next}`; artifacts.set(`${artifact_id}:1`, structuredClone(value)); return { artifact_id, version: 1 }; } },
    events: { async publish() {} },
    ...overrides,
  };
}
function includes(actual: SandboxJson, expected: SandboxJson): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) return Boolean(actual && typeof actual === 'object' && !Array.isArray(actual) && Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && includes((actual as Record<string, SandboxJson>)[key]!, value)));
  return isDeepStrictEqual(actual, expected);
}
async function runExample(runner: SandboxRunner, operation: SandboxOperationContract, example: SandboxOperationContract['examples'][number]): Promise<void> {
  if (example.error !== undefined) { try { await runner.call(operation.id, example.input); } catch (error) { if ((error as { code?: string }).code === example.error) return; throw error; } throw new Error(`${operation.id} example expected error ${example.error}`); }
  const actual = await runner.call(operation.id, example.input);
  if (Object.hasOwn(example, 'output') ? !isDeepStrictEqual(actual, example.output) : !includes(actual, example.outputIncludes!)) throw new Error(`${operation.id} contract example produced an unexpected output`);
}
function testEntry(index: number, operationId: string): string {
  return `import {operations as production} from './src/index.ts';\nimport {tests} from './tests/operations/${index}.ts';\nconst canonical=${canonical.toString()};\nconst equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));\nconst subset=(a,b)=>b&&typeof b==='object'&&!Array.isArray(b)?Boolean(a&&typeof a==='object'&&!Array.isArray(a)&&Object.entries(b).every(([k,v])=>Object.hasOwn(a,k)&&subset(a[k],v))):equal(a,b);\nexport const operations={${JSON.stringify(operationId)}:async(_,sdk)=>{if(!Array.isArray(tests)||!tests.length||tests.length>100)throw Error('Each operation requires 1-100 Agent tests');let completed=0;for(const test of tests){if(typeof test!=='function')throw Error('Test must be async function');let assertions=0;const assert={same:(a,b)=>{assertions++;if(!equal(a,b))throw Error('same assertion failed')},includes:(a,b)=>{assertions++;if(!subset(a,b))throw Error('includes assertion failed')},rejectsCode:async(call,code)=>{assertions++;try{await call()}catch(e){if(e?.code===code)return;throw Error('Wrong rejection code')}throw Error('Expected rejection')}};await test(sdk,input=>production[${JSON.stringify(operationId)}](input,sdk),assert);if(!assertions)throw Error('Test made no assertions');completed++}return completed}};`;
}
