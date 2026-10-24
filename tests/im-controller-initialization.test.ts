import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

// Compile against the real factory declarations produced by pnpm build. The browser methods are not executed here.
const methodFactories = ['Shell', 'Composer', 'Sync', 'Rooms', 'Topics', 'Navigate', 'Dialogs', 'Startup'];
const imports = methodFactories.map(name => `import { createIm${name} } from './controller-${name.toLowerCase()}.js';`).join('\n');
const constructionChecks = methodFactories.map(name => `
  declare const base${name}: Parameters<typeof createIm${name}>[0];
  base${name}.api('/session');
  createIm${name}(base${name}${name === 'Shell' ? '' : ', context'});
  // @ts-expect-error Invitations are installed after the method factories have returned.
  base${name}.invitations.open('room', 'Room');
  // @ts-expect-error Other layers' methods cannot be read during construction.
  base${name}.render('group');
  // @ts-expect-error A construction input is not a completed controller.
  const ready${name}: ImCtx = base${name};
  // @ts-expect-error Page listeners require the completed controller.
  createImPage(base${name});
  // @ts-expect-error Click listeners require the completed controller.
  createImClicks(base${name});
`).join('\n');

// RAC-IMCTX-01: construction dependencies stay narrow.
test('RAC-IMCTX-01: controller factories cannot read uninstalled members or pass an incomplete context to listeners', () => {
  const file = fileURLToPath(new URL('../packages/im-ui/dist/browser/__initialization-check.ts', import.meta.url));
  const source = `
    import type { ImCtx } from './controller-types.js';
    import { createImPage } from './controller-page.js';
    import { createImClicks } from './controller-clicks.js';
    ${imports}
    declare const ready: ImCtx;
    const context = () => ready;
    ${constructionChecks}
    createImPage(ready);
    createImClicks(ready);
    const { api, ...missingService } = baseShell;
    // @ts-expect-error Construction still requires all of its base services.
    createImComposer(missingService, context);
  `;
  const options: ts.CompilerOptions = {
    strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'], types: [],
  };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, onError, createNew) => name === file
    ? ts.createSourceFile(file, source, language, true) : read(name, language, onError, createNew);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.deepEqual(diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
});

// RAC-IMCTX-02: compile the production assembly, including omissions made in that same source rather than a second assembly.
test('RAC-IMCTX-02: production assembly retains its type and rejects a missing method or invitation controller', () => {
  const file = fileURLToPath(new URL('../packages/im-ui/src/browser/controller.ts', import.meta.url));
  const configPath = fileURLToPath(new URL('../packages/im-ui/tsconfig.json', import.meta.url));
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, dirname(configPath));
  const source = readFileSync(file, 'utf8');
  const compile = (text: string) => {
    const options = { ...parsed.options, noEmit: true };
    const host = ts.createCompilerHost(options), read = host.getSourceFile.bind(host);
    host.getSourceFile = (name, language, onError, createNew) => name === file
      ? ts.createSourceFile(file, text, language, true) : read(name, language, onError, createNew);
    return ts.createProgram(parsed.fileNames, options, host);
  };
  const production = compile(source), checker = production.getTypeChecker(), tree = production.getSourceFile(file)!;
  assert.deepEqual(ts.getPreEmitDiagnostics(production), [], 'the unmodified production controller compiles');
  let methods: ts.VariableDeclaration | undefined, complete: ts.VariableDeclaration | undefined;
  let startup: ts.CallExpression | undefined, invitations: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === 'methods') methods = node;
      if (node.name.text === 'c') complete = node;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'createImStartup') startup = node;
    if (ts.isObjectLiteralExpression(node) && node.properties.some(p => ts.isPropertyAssignment(p) && p.name.getText(tree) === 'invitations')) invitations = node;
    ts.forEachChild(node, visit);
  };
  visit(tree);
  assert.ok(methods && complete?.initializer && startup && invitations);
  const omit = (node: ts.Node) => source.slice(0, node.getStart(tree)) + '{}' + source.slice(node.getEnd());
  const rejected = (text: string, member: string) => ts.getPreEmitDiagnostics(compile(text)).some(d =>
    d.file?.fileName === file && [2322, 2739, 2740, 2741].includes(d.code) && ts.flattenDiagnosticMessageText(d.messageText, '\n').includes(member));
  assert.deepEqual({
    methodsTyped: !(checker.getTypeAtLocation(methods.name).flags & ts.TypeFlags.Any),
    completedInitializerTyped: !(checker.getTypeAtLocation(complete.initializer).flags & ts.TypeFlags.Any),
    missingStartupRejected: rejected(omit(startup), 'startup'),
    missingInvitationsRejected: rejected(omit(invitations), 'invitations'),
  }, { methodsTyped: true, completedInitializerTyped: true, missingStartupRejected: true, missingInvitationsRejected: true });
});
