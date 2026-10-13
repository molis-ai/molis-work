// Gate: @molis-ai/molis-work-contracts has no placeholder subpath (specs/repository-anti-corruption §4.9/§4.12, R-11).
// A rule with no baseline: the six that existed were deleted in W2-01, so any hit is a failure (scripts/gates/doc-gates.mjs).
//
// A placeholder is a subpath whose source exports nothing but one `ContractDescriptor` constant (a name, a maturity word and
// a doc pointer, no types or functions) AND that nothing uses: no import of it anywhere outside the contracts package, and
// no package that names it as its `contract`. A descriptor-only subpath that a package metadata still points at (platform/
// kernel, platform/testing) is not counted; it is a stale-looking but wired entry, and the packages decide its fate.
// Each placeholder is one problem, whether the subpath is new or an old one that nobody uses any more.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ts = createRequire(fileURLToPath(import.meta.url))("typescript");

export const CONTRACTS_PACKAGE = "packages/contracts/package.json";
const SPECIFIER = /@molis-ai\/molis-work-contracts\/([a-z0-9][a-z0-9/-]*)/g;
// What can use a subpath: TypeScript sources and tests, package metadata, the package list.
const CONSUMER_FILE = /\.(?:ts|mts)$|(?:^|\/)package\.json$|^scripts\/workspace-packages\.mjs$/;

/** True when the source exports exactly one const, built `as const satisfies ContractDescriptor`, and nothing else. */
export function isDescriptorOnly(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const exported = [];
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) return false;
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : [];
    if (!modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (!ts.isVariableStatement(statement)) return false;
    for (const declaration of statement.declarationList.declarations) exported.push(declaration);
  }
  if (exported.length !== 1) return false;
  const init = exported[0].initializer;
  return Boolean(init) && ts.isSatisfiesExpression(init) && init.type.getText(source) === "ContractDescriptor";
}

function placeholderSubpaths(snapshot) {
  const manifest = snapshot.read(CONTRACTS_PACKAGE);
  if (manifest === null) return [];
  let exportsMap;
  try { exportsMap = JSON.parse(manifest).exports ?? {}; } catch { return []; }
  const descriptorOnly = [];
  for (const [subpath, target] of Object.entries(exportsMap)) {
    const built = typeof target === "string" ? target : target?.import ?? target?.default;
    if (subpath === "." || typeof built !== "string") continue;
    const sourceFile = `packages/contracts/src/${built.replace(/^\.\/dist\//, "").replace(/\.js$/, ".ts")}`;
    const text = snapshot.read(sourceFile);
    if (text !== null && isDescriptorOnly(sourceFile, text)) descriptorOnly.push(subpath);
  }
  if (!descriptorOnly.length) return [];
  const used = new Set();
  for (const file of snapshot.files) {
    if (file.startsWith("packages/contracts/") || !CONSUMER_FILE.test(file) || file.startsWith(".impeccable/") || file.includes("/node_modules/")) continue;
    const text = snapshot.read(file);
    if (text === null) continue;
    for (const match of text.matchAll(SPECIFIER)) used.add(match[1]);
  }
  return descriptorOnly.filter((subpath) => !used.has(subpath.slice(2))).sort();
}

const HINT = "put the types or functions in the subpath, or delete it (a contract starts when something uses it)";

/** One problem per placeholder subpath: its source exports only a descriptor, and nothing imports it or names it as a package contract. */
export const contractPlaceholderProblems = (snapshot) => placeholderSubpaths(snapshot)
  .map((subpath) => `descriptor-only, unused contracts subpath in ${subpath}; ${HINT}`);
