// `as` on an action handler's input (specs/action-input-contracts AIC-20, roadmap decision 29): an interim count that may only
// fall while the N22 slices move handlers to input types read from the schema. The new and the old way live side by side until
// batch 55 ends, and nothing in the types stops a new `input as X`. N22-G replaces this with an absolute rule and deletes it: this
// file, its two lines in scripts/check-health-gates.mjs, its row in tooling/gates/README.md and its test.
//
// WHAT IS COUNTED, per file, a file with no record starts at 0. A cast (`input as X`, `<X>input`, in parentheses or with `!`;
// `input as unknown as X` is one) whose operand is the parameter itself, in:
//   - the second parameter of a function written as `handle`: `handle: (context, input) => …`, `handle: function (context, input) …`,
//     a method `handle(context, input) { … }` in an object or a class, a class field, also inside a package's own `define`/`bind`;
//   - the first parameter of the function passed to `bindActionHandler` or `bindOwnerPluginAction`, as a plain or a member call.
// A nested function that binds the same name is another variable and is left out. A `const` of that name in a nested block
// is not told apart, and is counted; the shape does not occur today.
//
// WHICH FILES: what the static checks read (scripts/gates/lint.mjs isLintFile), except tests: nothing under a tests/ or test/
// directory and no *.test.* file. It reads syntax only, with no type checker, so both sides need nothing but the tracked text.
//
// WHAT IT DOES NOT SEE is listed in tooling/gates/README.md (a field of the input, another variable, a function given by name, …).
import ts from "typescript";
import { countMetric, sumOf } from "./count-metric.mjs";
import { isLintFile } from "./lint.mjs";

const isTestFile = (file) => /(^|\/)tests?\//.test(file) || /\.test\.(?:ts|mts|mjs)$/.test(file);
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

export const handlerInputCasts = (kit) => countMetric(kit, {
  id: "handlerInputCasts",
  baselineKey: "handlerInputCasts",
  totalKey: "handlerInputCastsTotal",
  measure(snapshot) {
    const counts = {};
    for (const file of snapshot.files) {
      if (!isLintFile(file) || isTestFile(file)) continue;
      const count = countHandlerInputCasts(file, snapshot.read(file) ?? "");
      if (count) counts[file] = count;
    }
    return counts;
  },
  grewWhat: "`as` on an action handler's input",
  grewHint: "read the input type from the schema and bind with bindActionHandler (specs/action-input-contracts §5.4); a schema too loose for the handler is tightened, not cast",
  title: "`as` on action handler inputs (interim, until N22-G)",
  summary: (counts) => `${sumOf(counts)} handler input casts`,
});
