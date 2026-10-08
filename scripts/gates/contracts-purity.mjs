// Contracts purity (specs/repository-anti-corruption N-11, W1-05).
//
// packages/contracts holds types, Schemas and side-effect-free small helpers. Behavior belongs to the package that owns it.
// This counts, per file of packages/contracts/src, what makes a helper more than a declaration:
//   effects         timers, AbortController, fetch, process, globalThis, require, Date.now(), new Date(), Math.random()
//   node-imports    imports of a Node built-in (node:fs, path, crypto, …)
//   mutable-state   a top-level let/var, or a mutable Map/Set/WeakMap/WeakSet kept at module level
//   http-status     a `status` / `statusCode` / `httpStatus` binding given a literal HTTP status (100–599)
//   long-fn:<name>  a top-level function or method of CONTRACT_HELPER_LINES lines or more (value: its lines)
// Every number may only fall and a file with no record starts at 0. The existing runtime code (createExecutionLifetime's
// timers, bindPluginActionRoute's status table, the manifest validators, the diff algorithm) is the baseline; moving it
// to its owner (W3-03) lowers the numbers.
import { builtinModules } from "node:module";
import ts from "typescript";
import { recordMetric } from "./record-metric.mjs";

/** A function this long is behavior, not a "small helper": the manifest validators and the diff are well over it. */
export const CONTRACT_HELPER_LINES = 20;
const CONTRACTS_SOURCE = /^packages\/contracts\/src\//;
const EFFECT_GLOBALS = new Set(["setTimeout", "setInterval", "clearTimeout", "clearInterval", "setImmediate", "clearImmediate", "queueMicrotask", "AbortController", "fetch", "XMLHttpRequest", "WebSocket", "process", "globalThis", "require"]);
const NON_DETERMINISTIC = new Map([["Date", new Set(["now"])], ["Math", new Set(["random"])], ["performance", new Set(["now"])], ["crypto", null]]);
const STATUS_NAMES = new Set(["status", "statusCode", "status_code", "httpStatus", "http_status"]);
const MUTABLE_COLLECTIONS = new Set(["Map", "Set", "WeakMap", "WeakSet"]);
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]));

const isNodeBuiltin = (specifier) => specifier.startsWith("node:") || BUILTINS.has(specifier.split("/")[0]);

/** Count the impure constructs of one source file. Exported for the gate's own test. */
export function purityOf(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const counts = { effects: 0, "node-imports": 0, "mutable-state": 0, "http-status": 0 };
  const longFunctions = {};
  const span = (node) => source.getLineAndCharacterOfPosition(node.getEnd()).line - source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  // An identifier that names a property, a parameter or a declaration is not a use of the global of the same name.
  const isUse = (node) => {
    const parent = node.parent;
    if (ts.isPropertyAccessExpression(parent)) return parent.expression === node;
    if (ts.isQualifiedName(parent)) return parent.left === node;
    if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return false;
    if (ts.isBindingElement(parent)) return parent.propertyName !== node && parent.name !== node;
    if (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)
      || ts.isParameter(parent) || ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent)) return parent.name !== node;
    return true;
  };
  const containsStatusNumber = (node) => {
    let found = false;
    const walk = (child) => {
      if (ts.isNumericLiteral(child) && Number(child.text) >= 100 && Number(child.text) <= 599) found = true;
      else ts.forEachChild(child, walk);
    };
    walk(node);
    return found;
  };
  // A name the file declares itself (a parameter called `process`, an imported `fetch`) is not the global of that name.
  const declared = new Set();
  const collect = (node) => {
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)) declared.add(node.name.text);
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) declared.add(node.name.text);
    if (ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node)) declared.add((node.name ?? node.propertyName)?.text);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const visit = (node) => {
    if (ts.isIdentifier(node) && EFFECT_GLOBALS.has(node.text) && !declared.has(node.text) && isUse(node)) counts.effects++;
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && NON_DETERMINISTIC.has(node.expression.text)) {
      const names = NON_DETERMINISTIC.get(node.expression.text);
      if (names === null || names.has(node.name.text)) counts.effects++;
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date" && !node.arguments?.length) counts.effects++;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier) && isNodeBuiltin(node.moduleSpecifier.text)) counts["node-imports"]++;
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")
      && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && isNodeBuiltin(node.arguments[0].text)) counts["node-imports"]++;
    const named = (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node)) && ts.isIdentifier(node.name) && STATUS_NAMES.has(node.name.text);
    if (named && node.initializer && containsStatusNumber(node.initializer)) counts["http-status"]++;
    ts.forEachChild(node, visit);
  };
  visit(source);
  const noteFunction = (name, node) => {
    const lines = span(node);
    if (name && lines >= CONTRACT_HELPER_LINES) longFunctions[name] = Math.max(longFunctions[name] ?? 0, lines);
  };
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) noteFunction(statement.name.text, statement);
    else if (ts.isVariableStatement(statement)) {
      const mutable = !(statement.declarationList.flags & ts.NodeFlags.Const);
      for (const declaration of statement.declarationList.declarations) {
        if (mutable) counts["mutable-state"]++;
        const init = declaration.initializer;
        if (!init) continue;
        if (ts.isIdentifier(declaration.name) && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) noteFunction(declaration.name.text, init);
        else if (!mutable && ts.isNewExpression(init) && ts.isIdentifier(init.expression) && MUTABLE_COLLECTIONS.has(init.expression.text) && !/Readonly/.test(declaration.type?.getText(source) ?? "")) counts["mutable-state"]++;
      }
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      for (const member of statement.members) if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) noteFunction(`${statement.name.text}.${member.name.text}`, member);
    }
  }
  return { counts, longFunctions };
}

export const contractsPurity = (helpers) => recordMetric(helpers, {
  id: "contractsPurity",
  recordKey: "contractsPurity",
  totalKey: "contractsPurityEntries",
  totalOf: (record) => Object.keys(record).length,
  title: `Contracts purity (effects, Node imports, mutable state, HTTP status codes, helpers of ${CONTRACT_HELPER_LINES}+ lines)`,
  summaryLabel: "contracts purity entries",
  measure(snapshot) {
    const record = {};
    for (const file of snapshot.files.filter((name) => CONTRACTS_SOURCE.test(name) && helpers.isSource(name))) {
      const text = snapshot.read(file);
      if (text === null) continue;
      const { counts, longFunctions } = purityOf(file, text);
      for (const [what, count] of Object.entries(counts)) if (count) record[`${file}#${what}`] = count;
      for (const [name, lines] of Object.entries(longFunctions)) record[`${file}#long-fn:${name}`] = lines;
    }
    return record;
  },
  message: (key, was, now, isNew) => {
    const what = key.split("#")[1] ?? "";
    const text = what.startsWith("long-fn:") ? `${isNew ? "new contracts function of " : "contracts function grew to "}${now} lines (${CONTRACT_HELPER_LINES}+ is behavior, not a small helper)`
      : `contracts purity ${what} ${was} → ${now}`;
    return `${text} in ${key}; packages/contracts holds types, Schemas and small pure helpers; put behavior in the package that owns it (docs/system/PACKAGE-BOUNDARIES.md §2)`;
  },
});
