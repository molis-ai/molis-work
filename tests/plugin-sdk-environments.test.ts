import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const sdk = join(root, "packages/plugin-sdk");

function diagnosticsOf(program: ts.Program) {
  return ts.getPreEmitDiagnostics(program).map(diagnostic => ({
    file: diagnostic.file ? relative(root, diagnostic.file.fileName) : "",
    code: diagnostic.code,
    token: diagnostic.file?.text.slice(diagnostic.start, diagnostic.start! + diagnostic.length!),
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
  }));
}

test("PG055-08: the production Node SDK and /ui compilation rejects DOM globals", () => {
  const configPath = join(sdk, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath), undefined, configPath);
  assert.deepEqual(parsed.errors, []);
  const options = { ...parsed.options, noEmit: true };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  const targets = [join(sdk, "src/index.ts"), join(sdk, "src/ui.ts")];
  // Append real misuses to production files in memory, leaving the checked-out tree and build inputs untouched.
  host.getSourceFile = (file, language, onError, createNew) => targets.includes(file)
    ? ts.createSourceFile(file, readFileSync(file, "utf8") + "\ndocument.title;\nwindow.innerWidth;\n", language, true)
    : read(file, language, onError, createNew);
  const diagnostics = diagnosticsOf(ts.createProgram(parsed.fileNames, options, host));
  assert.deepEqual(diagnostics.map(({ file, code, token }) => ({ file, code, token })), targets.flatMap(file => [
    { file: relative(root, file), code: 2584, token: "document" },
    { file: relative(root, file), code: 2304, token: "window" },
  ]), JSON.stringify(diagnostics));
});

function withPublicPackages(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "molis-sdk-environments-"));
  try {
    writeFileSync(join(directory, "package.json"), JSON.stringify({ type: "module" }));
    // Only the two public packages' shipped files are available to resolution, with no workspace source or private packages.
    for (const name of ["contracts", "plugin-sdk"]) {
      const source = join(root, "packages", name);
      const destination = join(directory, "node_modules/@molis-ai", `molis-work-${name}`);
      mkdirSync(destination, { recursive: true });
      cpSync(join(source, "dist"), join(destination, "dist"), { recursive: true });
      cpSync(join(source, "package.json"), join(destination, "package.json"));
    }
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function compileConsumer(directory: string, environment: "node" | "browser", source: string) {
  const file = join(directory, "consumer.ts");
  writeFileSync(file, source);
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: environment === "node" ? ["lib.es2022.d.ts"] : ["lib.es2022.d.ts", "lib.dom.d.ts"],
    types: environment === "node" ? ["node"] : [],
    typeRoots: [join(root, "node_modules/@types")],
  };
  return diagnosticsOf(ts.createProgram([file], options));
}

test("PG055-09: public Node and /ui declarations compile without DOM and do not introduce DOM globals", () => {
  withPublicPackages(directory => {
    const source = `
      import { redactSecrets, type PluginDefinition } from "@molis-ai/molis-work-plugin-sdk";
      import { renderButton, renderPluginStageShell, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
      export const scrub = (definition: PluginDefinition): string => redactSecrets(definition.manifest.plugin_id);
      export const html: string = renderPluginStageShell({ surface: "demo", label: "Demo", dataset: "demo",
        body: renderButton({ label: "Go", icon: "folder" }) + icon("folder") });
      export const bytes: Buffer = Buffer.from(html);
    `;
    assert.deepEqual(compileConsumer(directory, "node", source), []);
    const rejected = compileConsumer(directory, "node", source + "\ndocument.title;\nwindow.innerWidth;\n");
    assert.deepEqual(rejected.map(({ code, token }) => ({ code, token })), [
      { code: 2584, token: "document" }, { code: 2304, token: "window" },
    ], JSON.stringify(rejected));
  });
});

test("PG055-10: public browser declarations and page globals compile without Node types and retain DOM argument types", () => {
  withPublicPackages(directory => {
    const source = `
      import { placeFloating, placeOverlay, pinAt, followScroll, scrollShouldFollow, type FloatingAnchor }
        from "@molis-ai/molis-work-plugin-sdk/browser";
      import type { Reflow, InteractionClientHost, MediaZoom, ScrollFollower }
        from "@molis-ai/molis-work-plugin-sdk/page-globals";
      import { renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
      const panel = document.createElement("div");
      panel.innerHTML = renderButton({ label: "Go" });
      const anchor: FloatingAnchor = { left: 0, right: 10, top: 0, bottom: 10 };
      const spot: { left: number; top: number } = placeFloating(anchor, { width: 100, height: 50 }, { width: 800, height: 600 }, "below");
      pinAt(panel, spot.left, spot.top);
      placeOverlay(panel, anchor, "above");
      const stop: () => void = followScroll(panel, () => panel.focus());
      const follows: boolean = scrollShouldFollow(panel, panel);
      const reflow: Reflow = (list, change) => { list.appendChild(panel); change(); };
      const host: InteractionClientHost = { onAction: (id, button) => { button.value = id; } };
      const zoom: MediaZoom | undefined = window.molisMediaZoom?.(panel, document.createElement("img"));
      const follower: ScrollFollower | undefined = window.molisFollow?.(panel);
      window.molisReflow?.(panel, () => panel.append("ready"));
      window.molisFit?.(document.createElement("textarea"));
      export { stop, follows, reflow, host, zoom, follower };
    `;
    assert.deepEqual(compileConsumer(directory, "browser", source), []);
    const rejected = compileConsumer(directory, "browser", source + '\npinAt("not an element", 0, 0);\nwindow.molisFit?.(document.createElement("div"));\n');
    assert.deepEqual(rejected.map(({ code, token }) => ({ code, token })), [
      { code: 2345, token: '"not an element"' }, { code: 2345, token: 'document.createElement("div")' },
    ], JSON.stringify(rejected));
  });
});
