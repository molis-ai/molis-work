import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import test from "node:test";
import ts from "typescript";

// RAC-564 (specs/repository-anti-corruption/slices/w5-02-registry.md §B1): the platform decides from its own registration
// (`apps/local-host/src/plugin-registry.ts`), never from the shell's copy of the catalog. Read as an import graph: of the names the
// workbench takes from its catalog modules, the Host imports only shell rendering that takes the Host's entries or titles a tab, and,
// until ac-artifacts' A3 derives them from the installed Manifests, the artifact types' five (and their type).

const WORKBENCH = "@molis-ai/molis-work-app-workbench";
const CATALOG_MODULES = ["./plugin-catalog.js", "./builtin-plugins.js"];
/** Shell rendering the Host still calls: `sideOpenedPlugins` takes the Host's own entries, `pluginTabTitles` only titles tabs. */
const RENDERING = ["sideOpenedPlugins", "pluginTabTitles"];
/** A3 删: the artifact types' five, left for ac-artifacts. This list only shrinks. */
const ARTIFACT_FIVE = ["HOST_ARTIFACT_PRODUCERS", "artifactContinuers", "artifactReferrerActions", "artifactTypeDeclarations", "declaredArtifactTypes", "ArtifactTypeDeclaration"];

const root = new URL("../", import.meta.url).pathname;

function catalogNamesFrom(index: string): Set<string> {
  const names = new Set<string>();
  const source = ts.createSourceFile("index.ts", index, ts.ScriptTarget.Latest, true);
  for (const node of source.statements) {
    if (!ts.isExportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteralLike(node.moduleSpecifier) || !CATALOG_MODULES.includes(node.moduleSpecifier.text)) continue;
    assert.ok(node.exportClause && ts.isNamedExports(node.exportClause), "nothing of the catalog is exported unnamed");
    for (const element of node.exportClause.elements) names.add(element.name.text);
  }
  assert.ok(names.has("BUILTIN_PLUGIN_CATALOG") && names.has("pluginMarketCards"), "the catalog modules' names are read from the workbench entry");
  return names;
}

/** Only statically selected members may leave a namespace; passing/aliasing the entire module would hide its facts. */
function checkNamespace(source: ts.SourceFile, namespace: ts.NamespaceImport, checkName: (name: string) => void): void {
  // graph.mjs's parseImports(detail) exposes names for named imports, but null for namespaces; it also omits import types.
  // Bind this one file without resolving/loading dependencies, so a same-named local parameter is not mistaken for the import.
  const options = { noResolve: true, noLib: true, types: [] };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = file => file === source.fileName ? source : undefined;
  const checker = ts.createProgram([source.fileName], options, host).getTypeChecker();
  const symbol = checker.getSymbolAtLocation(namespace.name);
  assert.ok(symbol, "namespace import has a local binding");
  const opaque = () => assert.fail(`${source.fileName}: workbench namespace must select a static member`);
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node !== namespace.name) {
      const parent = node.parent;
      const referenced = ts.isShorthandPropertyAssignment(parent) ? checker.getShorthandAssignmentValueSymbol(parent)
        : ts.isExportSpecifier(parent) ? checker.getExportSpecifierLocalTargetSymbol(parent) : checker.getSymbolAtLocation(node);
      if (referenced === symbol) {
        let use: ts.Node = node;
        while (ts.isParenthesizedExpression(use.parent) || ts.isAsExpression(use.parent) || ts.isTypeAssertionExpression(use.parent) || ts.isNonNullExpression(use.parent) || ts.isSatisfiesExpression(use.parent)) use = use.parent;
        const outer = use.parent;
        if (ts.isPropertyAccessExpression(outer) && outer.expression === use) checkName(outer.name.text);
        else if (ts.isQualifiedName(outer) && outer.left === use) checkName(outer.right.text);
        else if (ts.isElementAccessExpression(outer) && outer.expression === use && ts.isStringLiteralLike(outer.argumentExpression)) checkName(outer.argumentExpression.text);
        else if (ts.isVariableDeclaration(outer) && outer.initializer === use && ts.isObjectBindingPattern(outer.name)) {
          for (const element of outer.name.elements) {
            const name = element.propertyName ?? element.name;
            if (element.dotDotDotToken || !(ts.isIdentifier(name) || ts.isStringLiteralLike(name))) opaque();
            else checkName(name.text);
          }
        } else opaque();
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function assertHostImports(sources: Iterable<readonly [string, string]>, index: string): void {
  const catalogNames = catalogNamesFrom(index);
  const allowed = new Set([...RENDERING, ...ARTIFACT_FIVE]);
  for (const [file, text] of sources) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const checkName = (name: string) => assert.ok(!catalogNames.has(name) || allowed.has(name), `${file}: ${name}: the platform decides from apps/local-host/src/plugin-registry.ts`);
    const isWorkbench = (specifier: string): boolean => {
      const target = posix.normalize(posix.join(posix.dirname(file), specifier));
      assert.ok(!specifier.startsWith(".") || !(target === "apps/workbench" || target.startsWith("apps/workbench/")), `${file} does not reach into the workbench's files`);
      return specifier === WORKBENCH || specifier.startsWith(`${WORKBENCH}/`);
    };
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) && isWorkbench(node.moduleSpecifier.text)) {
        if (ts.isImportDeclaration(node)) {
          const clause = node.importClause, bindings = clause?.namedBindings;
          assert.ok(!clause?.name, `${file}: workbench default import hides its members`);
          if (bindings && ts.isNamespaceImport(bindings)) checkNamespace(source, bindings, checkName);
          else if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) checkName((element.propertyName ?? element.name).text);
        } else {
          assert.ok(node.exportClause && ts.isNamedExports(node.exportClause), `${file}: workbench re-export must name its members`);
          for (const element of node.exportClause.elements) checkName((element.propertyName ?? element.name).text);
        }
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal) && isWorkbench(node.argument.literal.text)) {
        assert.ok(node.qualifier, `${file}: workbench import type must name its member`);
        let name = node.qualifier;
        while (ts.isQualifiedName(name)) name = name.left;
        checkName(name.text);
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && isWorkbench(node.arguments[0].text)) {
        assert.fail(`${file} does not load the workbench at run time`);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression) && isWorkbench(node.moduleReference.expression.text)) {
        assert.fail(`${file}: workbench import must name its members`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|mts)$/.test(entry.name) ? [path] : [];
  });
}

test("RAC-564 the Host takes no catalog or platform fact from the workbench: only shell rendering and the artifact types' five (A3 删)", () => {
  const index = readFileSync(join(root, "apps/workbench/src/index.ts"), "utf8");
  assertHostImports(sourceFiles(join(root, "apps/local-host/src")).map(file => [file.slice(root.length), readFileSync(file, "utf8")] as const), index);
});

// These are source variants of a real Host file, passed through the same assertion as the production source walk.
const fixtureFile = "apps/local-host/src/workbench-renderer.ts";
const fixtureSource = readFileSync(join(root, fixtureFile), "utf8");
const fixtureIndex = readFileSync(join(root, "apps/workbench/src/index.ts"), "utf8");
const checkVariant = (extra: string, index = fixtureIndex) => assertHostImports([[fixtureFile, `${fixtureSource}\n${extra}\n`]], index);

test("RAC-564 named aliases, namespace rendering and A3 members, and import types remain allowed", () => {
  checkVariant(`
    import { sideOpenedPlugins as renderShell, ${ARTIFACT_FIVE.map(name => `${name} as Named${name}`).join(", ")} } from "${WORKBENCH}";
    export { pluginTabTitles as tabTitles } from "${WORKBENCH}";
    import type { ArtifactTypeDeclaration as ArtifactShape } from "${WORKBENCH}";
    import * as AnyShellAlias from "${WORKBENCH}";
    void AnyShellAlias.sideOpenedPlugins; void AnyShellAlias["pluginTabTitles"];
    void AnyShellAlias.createWorkbenchRenderer;
    ${ARTIFACT_FIVE.filter(name => name !== "ArtifactTypeDeclaration").map(name => `void AnyShellAlias.${name};`).join("\n")}
    type Artifact = AnyShellAlias.ArtifactTypeDeclaration;
    type ImportedArtifact = import ( "${WORKBENCH}" ).ArtifactTypeDeclaration;
    import type * as TypeShell from "${WORKBENCH}";
    type TypeArtifact = TypeShell.ArtifactTypeDeclaration;
    const { sideOpenedPlugins: render, pluginTabTitles: titles } = AnyShellAlias;
    function shadow(AnyShellAlias: { BUILTIN_PLUGIN_CATALOG: number }) { return AnyShellAlias.BUILTIN_PLUGIN_CATALOG; }
    const text = 'import * as Fake from "${WORKBENCH}"; Fake.BUILTIN_PLUGIN_CATALOG';
    // import { BUILTIN_PLUGIN_CATALOG } from "${WORKBENCH}";
  `);
});

test("RAC-564 catalog facts are rejected through every named alias, namespace member and type/export path", () => {
  for (const name of catalogNamesFrom(fixtureIndex)) {
    if (RENDERING.includes(name) || ARTIFACT_FIVE.includes(name)) continue;
    for (const extra of [
      `import { ${name} as arbitraryAlias } from "${WORKBENCH}";`,
      `import * as ArbitraryAlias from "${WORKBENCH}"; void ArbitraryAlias.${name};`,
    ]) assert.throws(() => checkVariant(extra), /the platform decides/, extra);
  }
  for (const extra of [
    `import type { BUILTIN_PLUGIN_CATALOG as Hidden } from "${WORKBENCH}";`,
    `export { BUILTIN_PLUGIN_CATALOG as Hidden } from "${WORKBENCH}";`,
    `type Hidden = typeof import ( "${WORKBENCH}" ).BUILTIN_PLUGIN_CATALOG;`,
    `import type * as Types from "${WORKBENCH}"; type Hidden = typeof Types.BUILTIN_PLUGIN_CATALOG;`,
    `import * as WB from "${WORKBENCH}"; void WB["BUILTIN_PLUGIN_CATALOG"];`,
    `import * as WB from "${WORKBENCH}"; void (WB as object).BUILTIN_PLUGIN_CATALOG;`,
    `import * as WB from "${WORKBENCH}"; const { BUILTIN_PLUGIN_CATALOG: hidden } = WB;`,
  ]) assert.throws(() => checkVariant(extra), /the platform decides/, extra);
  assert.throws(() => checkVariant(`import { HiddenFacts as ArbitraryAlias } from "${WORKBENCH}";`, `${fixtureIndex}\nexport { BUILTIN_PLUGIN_CATALOG as HiddenFacts } from "./plugin-catalog.js";`), /the platform decides/);
});

test("RAC-564 opaque namespaces, runtime imports and relative workbench access cannot hide facts", () => {
  for (const extra of [
    `import * as WB from "${WORKBENCH}"; const AnotherAlias = WB; void AnotherAlias.BUILTIN_PLUGIN_CATALOG;`,
    `import * as WB from "${WORKBENCH}"; const { ...rest } = WB;`,
    `import * as WB from "${WORKBENCH}"; void { WB };`,
    `import * as WB from "${WORKBENCH}"; export { WB as Hidden };`,
    `import * as WB from "${WORKBENCH}"; void WB[chosenMember];`,
  ]) assert.throws(() => checkVariant(extra), /namespace must select a static member/, extra);
  for (const extra of [`export * from "${WORKBENCH}";`, `export * as Hidden from "${WORKBENCH}";`]) assert.throws(() => checkVariant(extra), /re-export must name/, extra);
  for (const extra of [
    `void import ( "${WORKBENCH}" );`,
    `void import("${WORKBENCH}").BUILTIN_PLUGIN_CATALOG;`,
    `async function load() { return (await import("${WORKBENCH}/index.js")).BUILTIN_PLUGIN_CATALOG; }`,
  ]) assert.throws(() => checkVariant(extra), /does not load the workbench at run time/, extra);
  for (const extra of [
    `import { sideOpenedPlugins } from "../../workbench/src/index.js";`,
    `import { sideOpenedPlugins } from "../../workbench";`,
    `export { BUILTIN_PLUGIN_CATALOG as Hidden } from "../../workbench/src/index.js";`,
    `import * as WB from "../../workbench/dist/index.js"; void WB.BUILTIN_PLUGIN_CATALOG;`,
    `type Hidden = import("../../workbench/src/index.js").ArtifactTypeDeclaration;`,
    `void import("../../workbench/src/index.js");`,
  ]) assert.throws(() => checkVariant(extra), /does not reach into the workbench's files/, extra);
  for (const extra of ['export * from "./plugin-catalog.js";', 'export * as Hidden from "./builtin-plugins.js";']) {
    assert.throws(() => checkVariant("", `${fixtureIndex}\n${extra}`), /nothing of the catalog is exported unnamed/, extra);
  }
});
