// The steps of an upgrade chain, read from the source of the file that declares them, with no build. The two gates that read a chain,
// store-versions.mjs (a library's steps behind a row of the maintenance list) and initial-versions.mjs (a persistent format's chain), both
// read it here, so they agree on what a chain is. What cannot be read exactly is no chain, and each caller fails on that.
import ts from "typescript";

/** The expression under `as`, `satisfies` and parentheses. */
export const unwrapExpression = (node) => {
  while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression;
  return node;
};

/**
 * Every variable the file declares, by name, with its initializer. Only a name declared once, by `const`, keeps its value; any other
 * (`let`, `var`, two declarations of one name in different scopes) maps to null, so a name that could mean two things means nothing.
 */
export function constantsIn(tree) {
  const found = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const constant = ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
      found.set(node.name.text, found.has(node.name.text) || !constant ? null : unwrapExpression(node.initializer) ?? null);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/**
 * The `from` of each step: an array literal of object literals whose `from` is a number literal, written in place or as the name of such a
 * `const` array in the same file (one name, followed once). Undefined for anything else: a spread, a computed `from`, a name imported or
 * declared twice, a name that names another name.
 */
export function stepFroms(node, constants) {
  let list = unwrapExpression(node);
  if (list && ts.isIdentifier(list)) list = constants.get(list.text) ?? undefined;
  if (!list || !ts.isArrayLiteralExpression(list)) return undefined;
  const froms = [];
  for (const element of list.elements) {
    const step = unwrapExpression(element);
    const from = step && ts.isObjectLiteralExpression(step)
      ? step.properties.find((property) => ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === "from") : undefined;
    const value = from ? unwrapExpression(from.initializer) : undefined;
    if (!value || !ts.isNumericLiteral(value)) return undefined;
    froms.push(Number(value.text));
  }
  return froms;
}
