// Two interim counts for action inputs (specs/action-input-contracts AIC-20, roadmap decision 29). They may only fall while the N22
// slices move handlers to input types read from the schema: the new and the old way live side by side until batch 55 ends, and
// nothing in the types stops a new `input as X` or a new hand-written input type. N22-G replaces them with absolute rules and
// deletes them; what to delete is listed in scripts/gates/README.md.
//
// handlerInputCasts, per file, a file with no record starts at 0. A cast (`input as X`, `<X>input`, in parentheses or with `!`;
// `input as unknown as X` is one) whose operand is the parameter itself, in:
//   - the second parameter of a function written as `handle`: `handle: (context, input) => …`, `handle: function (context, input) …`,
//     a method `handle(context, input) { … }` in an object or a class, a class field, also inside a package's own `define`/`bind`;
//   - the first parameter of the function passed to `bindActionHandler` or `bindOwnerPluginAction`, as a plain or a member call.
// A nested function that binds the same name is another variable and is left out. A `const` of that name in a nested block
// is not told apart, and is counted; the shape does not occur today.
//
// handwrittenActionInputs, per file, the same way. An input type written by hand where an action is defined: the first type
// argument of `createActionDefinition`, or the type argument a wrapper passes on as that one. A wrapper is a function, declared
// by name, whose own type parameter goes unchanged into that position, or into the first argument of a declared
// `ActionDefinition<…>` return type (a helper that builds the literal itself, as modules/judgment-rules does until #1933). A wrapper
// exported from one file is followed by name through a named import. Not counted: `InferActionInput<…>`, a call with no type
// arguments, `define<O>()(…)`, a type parameter of the enclosing function. packages/contracts is left out: a public contract keeps
// its hand-written interface on purpose (specs/action-input-contracts §4.4).
//
// WHICH FILES: what the static checks read (scripts/gates/lint.mjs isLintFile), except tests: nothing under a tests/ or test/
// directory and no *.test.* file. Syntax only, with no type checker, so both sides need nothing but the tracked text.
//
// WHAT THEY DO NOT SEE is listed in tooling/gates/README.md.
import ts from "typescript";
import { countMetric, sumOf } from "./count-metric.mjs";
import { isLintFile } from "./lint.mjs";

const isTestFile = (file) => /(^|\/)tests?\//.test(file) || /\.test\.(?:ts|mts|mjs)$/.test(file);
const isCounted = (file) => isLintFile(file) && !isTestFile(file);
const MENTIONS_A_HANDLER = /\b(?:handle|bindActionHandler|bindOwnerPluginAction)\b/;
// Which argument of the call is the handler; its first parameter is the input.
const HANDLER_ARGUMENT = new Map([["bindActionHandler", 1], ["bindOwnerPluginAction", 2]]);

const castOperand = (node) => {
  while (ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
};
/** The function a value is, through parentheses and a cast of the function itself; null when it is anything else (a name, a call). */
const functionOf = (value) => {
  let node = value;
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) ? node : null;
};
const binds = (name, binding) => (ts.isIdentifier(binding) ? binding.text === name
  : binding.elements.some((element) => !ts.isOmittedExpression(element) && binds(name, element.name)));
const isHandleName = (name) => (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) && name.text === "handle";

const castsOf = (handler, parameter) => {
  if (!handler?.body || !parameter || !ts.isIdentifier(parameter.name)) return 0;
  const name = parameter.name.text;
  let count = 0;
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.parameters?.some((inner) => binds(name, inner.name))) return;
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const operand = castOperand(node.expression);
      if (ts.isIdentifier(operand) && operand.text === name) count++;
    }
    ts.forEachChild(node, visit);
  };
  visit(handler.body);
  return count;
};

export const countHandlerInputCasts = (file, text) => {
  if (!MENTIONS_A_HANDLER.test(text)) return 0;
  let count = 0;
  const visit = (node) => {
    if ((ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) && isHandleName(node.name)) {
      const handler = functionOf(node.initializer);
      count += castsOf(handler, handler?.parameters[1]);
    } else if (ts.isMethodDeclaration(node) && isHandleName(node.name)) {
      count += castsOf(node, node.parameters[1]);
    } else if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression;
      if (ts.isIdentifier(callee) && HANDLER_ARGUMENT.has(callee.text)) {
        const handler = functionOf(node.arguments[HANDLER_ARGUMENT.get(callee.text)]);
        count += castsOf(handler, handler?.parameters[0]);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest));
  return count;
};

// ---- hand-written input types ------------------------------------------------------------------------------------------
const DEFINER = "createActionDefinition";
const MENTIONS_A_DEFINITION = /\b(?:createActionDefinition|ActionDefinition)\s*</;

const bareTypeName = (type) => (type && ts.isTypeReferenceNode(type) && !type.typeArguments && ts.isIdentifier(type.typeName) ? type.typeName.text : null);
const ownerOfTypeParameter = (node, name) => {
  for (let scope = node.parent; scope; scope = scope.parent) if (scope.typeParameters?.some((parameter) => parameter.name.text === name)) return scope;
  return null;
};
/** The declaration that names a function: itself, or the variable it is the value of; null for a method or a property. */
const namingDeclaration = (fn) => {
  if (ts.isFunctionDeclaration(fn)) return fn.name ? fn : null;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null;
  let node = fn.parent;
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) node = node.parent;
  return ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) ? node : null;
};
const parseWithParents = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

/** The wrappers one file declares: { local: name -> which of its type arguments is the input, exported: the same for what it exports }. */
const wrappersOf = (source) => {
  const local = new Map(), exported = new Map(), exportedNames = [];
  const record = (fn, parameter) => {
    const declaration = fn && namingDeclaration(fn);
    if (!declaration) return;
    const name = declaration.name.text;
    local.set(name, fn.typeParameters.findIndex((candidate) => candidate.name.text === parameter));
    if (ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Export) exported.set(name, local.get(name));
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === DEFINER) {
      const parameter = bareTypeName(node.typeArguments?.[0]);
      if (parameter) record(ownerOfTypeParameter(node, parameter), parameter);
    } else if (ts.isFunctionLike(node) && node.body && node.typeParameters && node.type && ts.isTypeReferenceNode(node.type) && node.type.typeName.getText(source) === "ActionDefinition") {
      const parameter = bareTypeName(node.type.typeArguments?.[0]);
      if (parameter && node.typeParameters.some((candidate) => candidate.name.text === parameter)) record(node, parameter);
    } else if (ts.isExportDeclaration(node) && !node.moduleSpecifier && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) exportedNames.push([(element.propertyName ?? element.name).text, element.name.text]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const [name, as] of exportedNames) if (local.has(name)) exported.set(as, local.get(name));
  return { local, exported };
};

const isHandwritten = (type) => {
  if (ts.isTypeReferenceNode(type) && (ts.isIdentifier(type.typeName) ? type.typeName : type.typeName.right).text === "InferActionInput") return false;
  const name = bareTypeName(type);
  return !(name && ownerOfTypeParameter(type, name));
};

/** `exported` is what every counted file exports as a wrapper, and createActionDefinition itself. */
const countInFile = (source, local, exported) => {
  const known = new Map();
  for (const statement of source.statements) {
    const named = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : null;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (exported.has(imported)) known.set(element.name.text, exported.get(imported));
    }
  }
  for (const [name, index] of local) known.set(name, index);
  known.set(DEFINER, 0);
  let count = 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.typeArguments) {
      const callee = ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === DEFINER ? node.expression.name : node.expression;
      const type = ts.isIdentifier(callee) && known.has(callee.text) ? node.typeArguments[known.get(callee.text)] : undefined;
      if (type && isHandwritten(type)) count++;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
};

/** The count of each file in `texts` (a Map of path to text), which is every file a wrapper may be declared or imported in. */
export const countHandwrittenInputs = (texts) => {
  const parsed = new Map(), exported = new Map([[DEFINER, 0]]);
  for (const [file, text] of texts) {
    if (!MENTIONS_A_DEFINITION.test(text)) continue;
    const source = parseWithParents(file, text), wrappers = wrappersOf(source);
    parsed.set(file, { source, local: wrappers.local });
    for (const [name, index] of wrappers.exported) exported.set(name, index);
  }
  const names = new RegExp(`\\b(?:${[...exported.keys()].join("|")})\\b`);
  const counts = {};
  for (const [file, text] of texts) {
    const seen = parsed.get(file) ?? (names.test(text) ? { source: parseWithParents(file, text), local: new Map() } : null);
    const count = seen ? countInFile(seen.source, seen.local, exported) : 0;
    if (count) counts[file] = count;
  }
  return counts;
};

// ---- the metrics --------------------------------------------------------------------------------------------------------
export const actionInputMetrics = (kit) => [countMetric(kit, {
  id: "handlerInputCasts",
  baselineKey: "handlerInputCasts",
  totalKey: "handlerInputCastsTotal",
  measure(snapshot) {
    const counts = {};
    for (const file of snapshot.files) {
      if (!isCounted(file)) continue;
      const count = countHandlerInputCasts(file, snapshot.read(file) ?? "");
      if (count) counts[file] = count;
    }
    return counts;
  },
  grewWhat: "`as` on an action handler's input",
  grewHint: "read the input type from the schema and bind with bindActionHandler (specs/action-input-contracts §5.4); a schema too loose for the handler is tightened, not cast",
  title: "`as` on action handler inputs (interim, until N22-G)",
  summary: (counts) => `${sumOf(counts)} handler input casts`,
}), countMetric(kit, {
  id: "handwrittenActionInputs",
  baselineKey: "handwrittenActionInputs",
  totalKey: "handwrittenActionInputsTotal",
  measure(snapshot) {
    const texts = new Map();
    for (const file of snapshot.files) {
      if (!isCounted(file) || file.startsWith("packages/contracts/")) continue;
      const text = snapshot.read(file);
      if (text !== null) texts.set(file, text);
    }
    return countHandwrittenInputs(texts);
  },
  grewWhat: "input types written by hand where an action is defined",
  grewHint: "read it from the schema: define<InferActionInput<typeof schema>, O>, with `as const` on the schema, or the curried define<O>()(…) (specs/action-input-contracts §5.4)",
  title: "Action input types written by hand at the definition (interim, until N22-G)",
  summary: (counts) => `${sumOf(counts)} hand-written action inputs`,
})];
