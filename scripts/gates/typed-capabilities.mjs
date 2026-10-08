// Typed Host capabilities: no new entries (specs/repository-anti-corruption N-12, W1-05; decision 2026-10-07).
//
// A HostCapabilityDefinition is the old, second way to register a capability. Called through LocalHost.invoke it skips the
// action service's schema validation, execution limits and call log. The decision: external capabilities go through the
// unified action service only; the typed registry stays as a host-internal channel (agent.*, schedule.*, the workspace
// writers) and gets no new entries. This counts, per source file:
//   type-refs         references to the type HostCapabilityDefinition (a definition `as HostCapabilityDefinition<…>`, a
//                     parameter that accepts one, a heritage clause): the sites that make up the mechanism
//   without-action    descriptors that are written as an object literal typed HostCapabilityDefinition with no `action`
//                     property: they register as typed-only capabilities, outside the action directory
//   register-calls    calls of `registerCapability(…)`, the typed registration entry
// Each may only fall; a file with no record starts at 0, so a new typed capability, a new registrar and a new consumer all
// fail. The runtime count (708 descriptors, 609 actions, 99 typed without action) is the same list seen from the registry.
import ts from "typescript";
import { recordMetric } from "./record-metric.mjs";

const TYPE_NAME = "HostCapabilityDefinition";

const isCapabilityType = (type) => Boolean(type) && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) && type.typeName.text === TYPE_NAME;
const hasActionProperty = (literal) => literal.properties.some((property) => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === "action");
const hasSpread = (literal) => literal.properties.some((property) => ts.isSpreadAssignment(property));

/** The three counts of one source file. Exported for the gate's own test. */
export function typedCapabilityCounts(file, text) {
  const counts = { "type-refs": 0, "without-action": 0, "register-calls": 0 };
  if (!/HostCapabilityDefinition|registerCapability/.test(text)) return counts;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  // A descriptor literal without `action` (and without a spread that could bring one) is a typed-only capability.
  const noteLiteral = (expression) => {
    let literal = expression;
    while (literal && (ts.isParenthesizedExpression(literal) || ts.isAsExpression(literal) || ts.isSatisfiesExpression(literal))) literal = literal.expression;
    if (literal && ts.isObjectLiteralExpression(literal) && !hasActionProperty(literal) && !hasSpread(literal)) counts["without-action"]++;
  };
  const functionReturns = (fn) => {
    if (fn.body && !ts.isBlock(fn.body)) return [fn.body];
    const found = [];
    const walk = (node) => {
      if (ts.isReturnStatement(node) && node.expression) found.push(node.expression);
      if (node !== fn && ts.isFunctionLike(node)) return;
      ts.forEachChild(node, walk);
    };
    if (fn.body) ts.forEachChild(fn.body, walk);
    return found;
  };
  const visit = (node) => {
    if (isCapabilityType(node)) counts["type-refs"]++;
    else if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression) && node.expression.text === TYPE_NAME) counts["type-refs"]++;
    if ((ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) && isCapabilityType(node.type)) noteLiteral(node.expression);
    if (ts.isTypeAssertionExpression(node) && isCapabilityType(node.type)) noteLiteral(node.expression);
    if (ts.isVariableDeclaration(node) && isCapabilityType(node.type) && node.initializer) noteLiteral(node.initializer);
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && isCapabilityType(node.type)) functionReturns(node).forEach(noteLiteral);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if ((ts.isIdentifier(callee) && callee.text === "registerCapability") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "registerCapability")) counts["register-calls"]++;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return counts;
}

export const typedCapabilities = (helpers) => recordMetric(helpers, {
  id: "typedCapabilities",
  recordKey: "typedCapabilities",
  totalKey: "typedCapabilitiesTotal",
  title: "Typed Host capabilities (HostCapabilityDefinition references, descriptors without action, registerCapability calls)",
  summaryLabel: "typed capability sites",
  measure(snapshot) {
    const record = {};
    for (const file of snapshot.files.filter(helpers.isSource)) {
      const text = snapshot.read(file);
      if (text === null) continue;
      for (const [what, count] of Object.entries(typedCapabilityCounts(file, text))) if (count) record[`${file}#${what}`] = count;
    }
    return record;
  },
  message: (key, was, now) => `typed Host capability ${key.split("#")[1]} in ${key.split("#")[0]} ${was} → ${now}; register new capabilities as actions in the action service (specs/action-architecture/spec.md §3); the typed registry stays a host-internal channel and gets no new entries`,
});
