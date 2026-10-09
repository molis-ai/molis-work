// Contracts purity (specs/repository-anti-corruption N-11, W1-05).
//
// packages/contracts holds types, Schemas and side-effect-free small helpers. Behavior belongs to the package that owns it.
// This counts, per file of packages/contracts/src, what makes a helper more than a declaration:
//   effects         timers, AbortController, fetch, process, globalThis, require, Date.now(), new Date(), Math.random()
//   node-imports    imports of a Node built-in (node:fs, path, crypto, …)
//   mutable-state   a top-level (or namespace-level) let/var; a mutable Map/Set/WeakMap/WeakSet kept at module level; a
//                   top-level `const` object or array literal that the same file writes to (`cache[key] = …`, `cache.count++`,
//                   `delete cache[key]`, `list.push(…)`, `Object.assign(cache, …)`), unless it is `as const` or typed Readonly…
//   http-status     a `status` / `statusCode` / `httpStatus` binding given a literal HTTP status (100–599)
//   long-fn:<name>  a function of CONTRACT_HELPER_LINES lines or more (value: its lines), whatever form it has: a declaration, an
//                   arrow or function expression kept in a variable, a method or accessor or constructor of a class or of an
//                   object literal (`validators.validateThing`), a class property holding a function, a function handed to a call
//                   or exported as the default. Functions nested in another function are part of it and not counted again; an
//                   anonymous one is named `<anonymous#N>` by order in the file.
// Every number may only fall and a file with no record starts at 0. The existing runtime code (createExecutionLifetime's
// timers, bindPluginActionRoute's status table, the manifest validators, the diff algorithm) is the baseline; moving it
// to its owner (W3-03) lowers the numbers.
//
// What it does not see (no type checker, no cross-file flow; review does): a literal written to through an alias
// (`const alias = cache; alias.x = 1`), handed to a function that writes to it (`fill(cache)`), or written to from another file
// that imports it; a literal in a name the file reuses inside a function (any local of that name makes the function skip the
// check, so a write there is not counted); a global reached as `window.setTimeout`, `self.fetch` or a computed key;
// `globalThis` is counted but what is read off it later is not; a module-level state kept in a class's static field or in a
// closure (`const counter = makeCounter()`); a status code kept in a variable that is not named like one (`const code = 404`).
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

/** An expression without the parentheses and the `as`/`satisfies`/`!` around it; `as const` stays (it makes a literal readonly). */
function unwrapAssertions(expression) {
  let node = expression;
  while (ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)
    || (ts.isAsExpression(node) && !(ts.isTypeReferenceNode(node.type) && ts.isIdentifier(node.type.typeName) && node.type.typeName.text === "const"))) node = node.expression;
  return node;
}

const MUTATING_METHODS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);
const MUTATING_STATICS = new Map([["Object", new Set(["assign", "defineProperty", "defineProperties", "setPrototypeOf"])], ["Reflect", new Set(["set", "defineProperty", "deleteProperty", "setPrototypeOf"])]]);
const isAssignment = (operator) => operator >= ts.SyntaxKind.FirstAssignment && operator <= ts.SyntaxKind.LastAssignment;

/**
 * Which of `names` (module-level object and array literals) the file writes to: a member assignment, `++`/`--` or `delete` on a
 * member, a mutating array method, `Object.assign` and the like. A function that declares a local of the same name is skipped
 * (the name there is not the module's).
 */
function writtenTo(source, names) {
  const written = new Set();
  if (!names.size) return written;
  const rootOf = (expression) => {
    let node = expression;
    while (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isAsExpression(node)) node = node.expression;
    return ts.isIdentifier(node) ? node.text : undefined;
  };
  const isMember = (node) => ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
  const note = (expression, shadowed) => { const root = rootOf(expression); if (root !== undefined && names.has(root) && !shadowed.has(root)) written.add(root); };
  const localsOf = (fn) => {
    const locals = new Set();
    const collect = (node) => {
      if ((ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)) && ts.isIdentifier(node.name)) locals.add(node.name.text);
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) locals.add(node.name.text);
      ts.forEachChild(node, collect);
    };
    collect(fn);
    return locals;
  };
  const walk = (node, shadowed) => {
    if (ts.isFunctionLike(node) && node.body) {
      const own = [...localsOf(node)].filter((name) => names.has(name) && !shadowed.has(name));
      shadowed = own.length ? new Set([...shadowed, ...own]) : shadowed;
    }
    if (ts.isBinaryExpression(node) && isAssignment(node.operatorToken.kind) && isMember(node.left)) note(node.left, shadowed);
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) && isMember(node.operand)) note(node.operand, shadowed);
    if (ts.isDeleteExpression(node) && isMember(node.expression)) note(node.expression, shadowed);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callee = node.expression;
      if (MUTATING_METHODS.has(callee.name.text)) note(callee.expression, shadowed);
      if (ts.isIdentifier(callee.expression) && MUTATING_STATICS.get(callee.expression.text)?.has(callee.name.text) && node.arguments[0]) note(node.arguments[0], shadowed);
    }
    ts.forEachChild(node, (child) => walk(child, shadowed));
  };
  walk(source, new Set());
  return written;
}

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
  // ---- long functions: every function-like node with a body, once, under the name its context gives it ----------------------------
  // Two long functions that the context names alike (the callbacks of one call) are told apart by order: `name`, `name#2`.
  const seen = new Map();
  const noteFunction = (name, node) => {
    const lines = span(node);
    if (lines < CONTRACT_HELPER_LINES) return;
    const nth = (seen.get(name) ?? 0) + 1;
    seen.set(name, nth);
    longFunctions[nth === 1 ? name : `${name}#${nth}`] = lines;
  };
  const hasBody = (node) => (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.body !== undefined;
  const hasDefaultModifier = (node) => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
  /** What a declaration or member is called by, or undefined for a node that names nothing (a call, an array, a block). */
  const labelOf = (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) return node.name?.text ?? (hasDefaultModifier(node) ? "default" : undefined);
    if (ts.isVariableDeclaration(node)) return ts.isIdentifier(node.name) ? node.name.text : undefined;
    if (ts.isConstructorDeclaration(node)) return "constructor";
    if (ts.isExportAssignment(node)) return "default";
    if (ts.isModuleDeclaration(node)) return node.name.text;
    if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) {
      const name = node.name;
      return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : "[computed]";
    }
    return undefined;
  };
  let anonymous = 0;
  const nameOfFunction = (fn) => {
    const labels = [];
    for (let node = fn; node && node.kind !== ts.SyntaxKind.SourceFile; node = node.parent) {
      const label = labelOf(node);
      if (label !== undefined && labels[0] !== label) labels.unshift(label);
    }
    return labels.length ? labels.join(".") : `<anonymous#${++anonymous}>`;
  };
  const findFunctions = (node) => {
    if (hasBody(node)) { noteFunction(nameOfFunction(node), node); return; }
    ts.forEachChild(node, findFunctions);
  };
  findFunctions(source);

  // ---- module-level mutable state ---------------------------------------------------------------------------------------------
  const stateCandidates = new Set();
  const scanStatements = (statements) => {
    for (const statement of statements) {
      if (ts.isModuleDeclaration(statement) && statement.body && ts.isModuleBlock(statement.body)) scanStatements(statement.body.statements);
      if (!ts.isVariableStatement(statement)) continue;
      const mutable = !(statement.declarationList.flags & ts.NodeFlags.Const);
      for (const declaration of statement.declarationList.declarations) {
        if (mutable) counts["mutable-state"]++;
        const init = declaration.initializer;
        if (!init || mutable) continue;
        const declaredReadonly = /Readonly/.test(declaration.type?.getText(source) ?? "");
        if (declaredReadonly) continue;
        const value = unwrapAssertions(init);
        if (ts.isNewExpression(value) && ts.isIdentifier(value.expression) && MUTABLE_COLLECTIONS.has(value.expression.text)) counts["mutable-state"]++;
        else if (ts.isIdentifier(declaration.name) && (ts.isObjectLiteralExpression(value) || ts.isArrayLiteralExpression(value))) stateCandidates.add(declaration.name.text);
      }
    }
  };
  scanStatements(source.statements);
  counts["mutable-state"] += writtenTo(source, stateCandidates).size;
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
