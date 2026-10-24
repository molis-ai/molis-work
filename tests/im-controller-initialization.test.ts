import assert from 'node:assert/strict';
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

// RAC-IMCTX-01/02: construction dependencies stay narrow, and only complete assembly reaches listeners.
test('RAC-IMCTX-01/02: controller factories cannot read uninstalled members or pass an incomplete context to listeners', () => {
  const file = fileURLToPath(new URL('../packages/im-ui/dist/browser/__initialization-check.ts', import.meta.url));
  const source = `
    import type { ImCtx } from './controller-types.js';
    import { createImPage } from './controller-page.js';
    import { createImClicks } from './controller-clicks.js';
    ${imports}
    declare const ready: ImCtx;
    const context = () => ready;
    ${constructionChecks}
    const methods = {
      ${methodFactories.map(name => `...createIm${name}(baseShell${name === 'Shell' ? '' : ', context'})`).join(',\n')}
    };
    // @ts-expect-error Method assembly still lacks the invitation controller.
    const missingInvitations: ImCtx = { ...baseShell, ...methods };
    const complete: ImCtx = { ...baseShell, ...methods, invitations: ready.invitations };
    createImPage(complete);
    createImClicks(complete);
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
