// What the error gates read out of the TypeScript sources (specs/repository-anti-corruption W3-02-B). One parse of each file
// serves four counts, all of them per file, all of them only allowed to fall (scripts/gates/error-metrics.mjs turns them into
// metrics, scripts/gates/error-owners.mjs adds the fourth, the owner of a code):
//
//   errorSubclasses       A class declaration or expression that extends something named `…Error` (Error, TypeError, ActionError,
//                         `errors.PluginError`). The model is ActionError with a code, a kind and details (packages/contracts/src/
//                         platform/action-errors.ts, the one class that is not counted); an owner's failures are a table of codes made
//                         with `defineErrorCodes`, not a class.
//   errorCodeShape        A code written as a string literal that is not `<owner>.<reason>` in lower-case words (CODE_SHAPE, the same
//                         expression as ACTION_ERROR_CODE in the contracts; tests/health-gates-errors.test.ts pins the two together).
//   errorStatusDecisions  A 400–599 number that a test of an error chooses: `error.code === "x" ? 404 : 400`, `if (error instanceof
//                         NotFound) return 404`, `switch (error.code) { case …: return 409 }`, a table keyed by a code
//                         (`{ "todo.not_found": 404 }`). The status of a failure comes from its kind, in one place: packages/plugin-sdk/
//                         src/errors.ts (exempt).
//   (the owner of a code lives in error-owners.mjs; it reads the code sites listed here)
//
// WHAT A CODE SITE IS. The code of an error is the argument that the error class takes as `code`, found by reading the class:
// `new FeedDomainError(message, code)` has its code second because the constructor says so. The index is built from every class
// declaration with a heritage of `…Error` (by name; a class without a constructor takes its base's), so a new error class is
// followed without a list. Besides `new …Error("x.y", …)` the sites are the codes of `defineErrorCodes("prefix", { reason: kind })`
// (prefix.reason) and the first argument of a call to one of the error factories the Goals modules use (`error`, `errorFactory`,
// `createError`, `fail`, with a message as the second argument and a dotted word as the first; `console.error` and loggers are not).
//
// WHAT IT DOES NOT SEE (a known limit, not a decision). The biggest group is a code written as a property: `code: "plugin_revoked"` in a
// result object, a response body or `Object.assign(new Error(), { code })`, and a constructor that takes an options object
// (`new SearchError({ code: "provider_unavailable", … })`); at W3-02-B that is about 300 literals in about 100 files (some of them keyboard
// codes, not errors), so the counts reaching zero does not mean every code is renamed. Two more groups of the same kind: a code
// handed to one of the four factories that has no dot (LOOKS_LIKE_CODE below asks for a dot, so exactly the wrong shapes are not
// read: 49 sites in 2 files, the `fail("REUSE_…", …)` of plugins/native/alchemist/src/work-reuse/service.ts and the
// `fail("invalid_url", …)` of plugins/official-integrations/catalog/src/document-import.ts, each a local `fail` that throws its own
// error), and a class field `code = "…"` (only the constructor parameter named `code` is read: 4 literals in 4 files). Besides: a code
// that is not a literal (a variable, a template with a substitution, a helper that builds `prefix + "." + reason`), a factory under another name
// (`requireCognia(…)`), an error class whose name does not end in `Error`, a base class that is not declared in the repository, two
// classes of one name with different constructors (the first one with a `code` parameter wins), a status chosen from `error.kind` or
// `error.status` (`kind` and `status` are too common as property names to mean "an error" here), a status written into a table that
// is not keyed by a string code, a number kept in a variable first (`const notFound = 404`). Browser programs inside template
// literals are not code to the parser.
import ts from "typescript";

/** Lower-case words joined by dots, the owner first. Same expression as ACTION_ERROR_CODE (action-errors.ts); a test keeps them equal. */
export const CODE_SHAPE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/u;
/** What a factory's first argument must look like to be taken for a code: dotted words, no spaces (a message has some). */
const LOOKS_LIKE_CODE = /^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)+$/;
const FACTORY_CALLEES = new Set(["error", "errorFactory", "createError", "fail"]);
const LOG_RECEIVERS = new Set(["console", "logger", "log"]);
const CODE_NAMES = new Set(["code", "errorCode", "error_code"]);
/** What a caught or passed error is usually called: `error instanceof NotFound` is a test of an error whatever the class is called. */
const ERROR_VALUE_NAMES = /^(?:error|err|cause|failure|exception|e)$/;
/** A call that hands a number to the response: `sendJson(res, 404, …)`, `respond(404, …)`, `res.writeHead(404)`, `status(404)`. */
const STATUS_CALLEE = /json|send|respond|reply|writehead|status|response|fail|reject|refuse/i;
const HAS_STATUS_NUMBER = /\b[45]\d\d\b/;
/** The one place that turns a kind into a status number. */
export const STATUS_HOME = "packages/plugin-sdk/src/errors.ts";
/** The model's own base class: the one `…Error` class that is meant to exist, so it is not counted as a subclass. */
export const MODEL_CLASS = { file: "packages/contracts/src/platform/action-errors.ts", name: "ActionError" };

const lastName = (expression) => (ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined);
const literalText = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined);
const lineOf = (source, node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
const isStatusNumber = (node) => ts.isNumericLiteral(node) && /^\d{3}$/.test(node.text) && Number(node.text) >= 400 && Number(node.text) <= 599;
const extendsName = (node) => {
  const clause = node.heritageClauses?.find((heritage) => heritage.token === ts.SyntaxKind.ExtendsKeyword);
  return clause ? lastName(clause.types[0].expression) : undefined;
};

// ---- is this an error being tested -----------------------------------------------------------------------------------------
/** The initializer of the `const`/`let` a name refers to, looked up in the blocks around the use (no scopes, no shadowing: the nearest declaration). */
function initializerOf(identifier) {
  for (let node = identifier.parent; node; node = node.parent) {
    for (const statement of node.statements ?? []) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.name.text === identifier.text && declaration.initializer) return declaration.initializer;
    }
  }
  return undefined;
}

/**
 * A condition that looks at an error: `x instanceof …Error` (or `error instanceof Anything`), or a read of `code` (`error.code`, `code`, `error["code"]`), also through a
 * name that was computed from one (`const conflict = /stale/.test(code); … conflict ? 409 : 400`, followed two names deep).
 */
function testsAnError(condition, depth = 0) {
  let found = false;
  const visit = (node) => {
    if (found || ts.isFunctionLike(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && (/Error$/.test(lastName(node.right) ?? "") || ERROR_VALUE_NAMES.test(lastName(node.left) ?? ""))) found = true;
    else if (ts.isPropertyAccessExpression(node) && CODE_NAMES.has(node.name.text)) found = true;
    else if (ts.isElementAccessExpression(node) && CODE_NAMES.has(literalText(node.argumentExpression) ?? "")) found = true;
    else if (ts.isIdentifier(node) && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
      if (CODE_NAMES.has(node.text)) found = true;
      else if (depth < 2) { const initializer = initializerOf(node); if (initializer) found = testsAnError(initializer, depth + 1); }
    } else ts.forEachChild(node, visit);
  };
  visit(condition);
  return found;
}

/** Whether the branch of a test of an error holds the number: an `if`/`?:`/`&&` of such a test, or a `switch` on it. Stops at a function. */
function chosenByAnErrorTest(literal) {
  let child = literal;
  for (let node = literal.parent; node && !ts.isFunctionLike(node) && !ts.isSourceFile(node); child = node, node = node.parent) {
    if (ts.isConditionalExpression(node) && child !== node.condition && testsAnError(node.condition)) return true;
    if (ts.isIfStatement(node) && child !== node.expression && testsAnError(node.expression)) return true;
    if (ts.isCaseClause(node) && child !== node.expression && testsAnError(node.parent.parent.expression)) return true;
    if (ts.isDefaultClause(node) && testsAnError(node.parent.parent.expression)) return true;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === node.right && testsAnError(node.left)) return true;
  }
  return false;
}

/**
 * Whether the number sits where a status goes: returned, the value of a property or a variable, assigned, an argument of a call that
 * answers (`sendJson`, `respond`, …) or of a `new …Error(…)`. A number in a comparison (`response.status === 404`), in an array
 * (`[404, 405].includes(…)`) or an argument of `slice(0, 500)` is not a status the code chooses.
 */
function inStatusPosition(literal) {
  let node = literal;
  for (let parent = node.parent; ; parent = node.parent) {
    const passesThrough = ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent) || ts.isNonNullExpression(parent)
      || (ts.isConditionalExpression(parent) && node !== parent.condition)
      || (ts.isBinaryExpression(parent) && node === parent.right && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(parent.operatorToken.kind));
    if (!passesThrough) break;
    node = parent;
  }
  const parent = node.parent;
  if (ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === node)) return true;
  if ((ts.isPropertyAssignment(parent) || ts.isVariableDeclaration(parent)) && parent.initializer === node) return true;
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === node) return true;
  if (ts.isCallExpression(parent) && parent.arguments.includes(node)) return STATUS_CALLEE.test(lastName(parent.expression) ?? "");
  if (ts.isNewExpression(parent) && parent.arguments?.includes(node)) return /Error$/.test(lastName(parent.expression) ?? "");
  return false;
}

/** The numbers of a file that a test of an error chooses, and the entries of a table keyed by a string code. */
function statusDecisionsOf(source) {
  const found = [];
  const visit = (node) => {
    if (isStatusNumber(node) && inStatusPosition(node) && chosenByAnErrorTest(node)) found.push({ line: lineOf(source, node), what: node.text });
    else if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && LOOKS_LIKE_CODE.test(node.name.text) && isStatusNumber(node.initializer)) {
      found.push({ line: lineOf(source, node), what: `"${node.name.text}": ${node.initializer.text}` });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

// ---- one file -------------------------------------------------------------------------------------------------------------
/**
 * What one file holds, before the class index resolves it: its `…Error` classes (and the position of their `code` parameter),
 * the `new …Error(…)` calls with their first literal arguments, the codes that need no class, and the status decisions.
 */
export function scanFile(file, text) {
  const found = { subclasses: [], classes: [], news: [], codes: [], status: [] };
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isClassLike(node)) {
      const base = extendsName(node);
      if (base && /Error$/.test(base)) {
        found.subclasses.push({ line: lineOf(source, node), name: node.name?.text, what: `${node.name?.text ?? "(anonymous class)"} extends ${base}` });
        if (ts.isClassDeclaration(node) && node.name) {
          const constructor = node.members.find((member) => ts.isConstructorDeclaration(member));
          found.classes.push({ name: node.name.text, base, codeIndex: constructor ? constructor.parameters.findIndex((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === "code") : undefined });
        }
      }
    } else if (ts.isNewExpression(node)) {
      const name = lastName(node.expression);
      if (name && /Error$/.test(name)) found.news.push({ line: lineOf(source, node), name, args: (node.arguments ?? []).map(literalText) });
    } else if (ts.isCallExpression(node)) {
      const name = lastName(node.expression);
      if (name === "defineErrorCodes") {
        const prefix = literalText(node.arguments[0]), reasons = node.arguments[1];
        if (prefix !== undefined && reasons && ts.isObjectLiteralExpression(reasons)) {
          for (const property of reasons.properties) {
            const reason = property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : undefined;
            if (reason !== undefined) found.codes.push({ line: lineOf(source, property), code: `${prefix}.${reason}` });
          }
        }
      } else if (name && FACTORY_CALLEES.has(name) && node.arguments.length >= 2) {
        const receiver = ts.isPropertyAccessExpression(node.expression) ? node.expression.expression.getText(source) : "";
        const code = literalText(node.arguments[0]);
        if (code !== undefined && LOOKS_LIKE_CODE.test(code) && !LOG_RECEIVERS.has(receiver)) found.codes.push({ line: lineOf(source, node), code });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (HAS_STATUS_NUMBER.test(text)) found.status = statusDecisionsOf(source);
  return found;
}

// ---- the whole snapshot ---------------------------------------------------------------------------------------------------
/** The position of the `code` argument of each error class, by name (null: the class takes none). A class without a constructor takes its base's. */
function codePositions(scans) {
  const declared = new Map();
  for (const { classes } of scans.values()) for (const entry of classes) declared.set(entry.name, [...(declared.get(entry.name) ?? []), entry]);
  const resolved = new Map();
  const resolve = (name, path) => {
    if (resolved.has(name)) return resolved.get(name);
    if (path.has(name) || !declared.has(name)) return null;
    const next = new Set(path).add(name);
    const positions = declared.get(name).map((entry) => (entry.codeIndex === undefined ? resolve(entry.base, next) : entry.codeIndex >= 0 ? entry.codeIndex : null));
    const position = positions.find((index) => index !== null) ?? null;
    resolved.set(name, position);
    return position;
  };
  for (const name of declared.keys()) resolve(name, new Set());
  return resolved;
}

const passes = new WeakMap();
/**
 * Measures a snapshot: { subclasses, shape, status } as { file: count }, `sites` as { file: [{ line, code }] }, and `details` as
 * { count record: { file: [text] } } so a failure can name the line. `isSource` is the entry's own test for a source file.
 */
export function measureErrors(snapshot, isSource) {
  let result = passes.get(snapshot);
  if (result) return result;
  const scans = new Map();
  for (const file of snapshot.files) {
    if (!isSource(file)) continue;
    const text = snapshot.read(file);
    if (text !== null) scans.set(file, scanFile(file, text));
  }
  const positions = codePositions(scans);
  result = { subclasses: {}, shape: {}, status: {}, sites: {}, details: new Map() };
  const note = (record, file, line, text) => {
    record[file] = (record[file] ?? 0) + 1;
    const lines = result.details.get(record) ?? {};
    (lines[file] ??= []).push(`line ${line}: ${text}`);
    result.details.set(record, lines);
  };
  for (const [file, scan] of scans) {
    for (const entry of scan.subclasses) if (!(file === MODEL_CLASS.file && entry.name === MODEL_CLASS.name)) note(result.subclasses, file, entry.line, entry.what);
    if (file !== STATUS_HOME) for (const entry of scan.status) note(result.status, file, entry.line, entry.what);
    const sites = [...scan.codes];
    for (const call of scan.news) {
      const position = positions.get(call.name);
      if (position !== undefined && position !== null && call.args[position] !== undefined) sites.push({ line: call.line, code: call.args[position] });
    }
    for (const site of sites) {
      (result.sites[file] ??= []).push(site);
      if (!CODE_SHAPE.test(site.code)) note(result.shape, file, site.line, JSON.stringify(site.code));
    }
  }
  passes.set(snapshot, result);
  return result;
}
