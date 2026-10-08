// Typed Host capabilities: no new entries (specs/repository-anti-corruption N-12, W1-05; decision 2026-10-07).
//
// A HostCapabilityDefinition is the old, second way to register a capability. Called through LocalHost.invoke it skips the
// action service's schema validation, execution limits and call log. The decision: external capabilities go through the
// unified action service only; the typed registry stays as a host-internal channel (agent.*, schedule.*, the workspace
// writers) and gets no new entries. This counts, per source file:
//   type-refs         references to the type HostCapabilityDefinition and to every type alias that wraps it (today
//                     HostMethodCapability, found in the snapshot, not listed here), also under an import or re-export rename: a definition
//                     `as HostCapabilityDefinition<…>`, a parameter that accepts one, a heritage clause
//   without-action    object literals that are descriptors with no `action` property: one cast to or typed as one of those
//                     types, or any literal that has capability_id, version and operation (the members of a descriptor) and no
//                     `action`: they register as typed-only capabilities, outside the action directory
//   register-calls    calls of `registerCapability(…)`, and calls of `.register(…)` on a receiver that is declared in the same
//                     file with a type that registers typed capabilities (LocalHost, CapabilityRegistry, the Agent and
//                     Schedule registrars: classes and interfaces with a `register` or `registerCapability` method whose first
//                     parameter is a typed definition; found in the snapshot too)
// Each may only fall; a file with no record starts at 0, so a new typed capability, a new registrar and a new consumer all
// fail. The runtime count (708 descriptors, 609 actions, 99 typed without action) is the same list seen from the registry.
//
// A literal that merely has the shape of a descriptor is counted too, because the cast is what a new author would leave out:
// today two of them are not registrations (a queue key in local-host.ts and an event projection in casebook/observer.ts).
// What it does not see (review does): a descriptor minted by a factory in another file and registered through a receiver whose
// type is not written in the file that calls it. The type names it finds today (HostMethodCapability; LocalHost,
// MolisWorkLocalHost, CapabilityRegistry and the two registrar interfaces) are read back in tests/health-gates-structure.test.ts.
import ts from "typescript";
import { recordMetric } from "./record-metric.mjs";

const TYPE_NAME = "HostCapabilityDefinition";
const REGISTER_METHODS = new Set(["register", "registerCapability"]);
const DESCRIPTOR_MEMBERS = ["capability_id", "version", "operation"];

const nameText = (name) => (name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined);
const unwrap = (expression) => {
  let node = expression;
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
};
const hasProperty = (literal, name) => literal.properties.some((property) => nameText(property.name) === name);
const hasSpread = (literal) => literal.properties.some((property) => ts.isSpreadAssignment(property));
const isDescriptorShaped = (literal) => DESCRIPTOR_MEMBERS.every((name) => hasProperty(literal, name)) && !hasProperty(literal, "action") && !hasSpread(literal);

/** The name a type reference, an `import("…").Name<…>` type or a heritage clause points at (the last segment). */
function referencedName(node) {
  if (ts.isTypeReferenceNode(node)) return ts.isIdentifier(node.typeName) ? node.typeName.text : node.typeName.right.text;
  if (ts.isImportTypeNode(node) && node.qualifier) return ts.isIdentifier(node.qualifier) ? node.qualifier.text : node.qualifier.right.text;
  if (ts.isExpressionWithTypeArguments(node)) return ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined;
  return undefined;
}

/** `names`, plus the local names this file gives them with `import { Name as Local }`. */
function visibleNames(source, names) {
  const visible = new Set(names);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const element of statement.importClause.namedBindings.elements) if (names.has((element.propertyName ?? element.name).text)) visible.add(element.name.text);
  }
  return visible;
}

/** Does the type node mention one of `names` (a conditional type's `extends` clause only reads a type, so it is skipped)? */
function mentions(node, names, skipExtends) {
  const name = referencedName(node);
  if (name !== undefined && names.has(name)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (found || (skipExtends && ts.isConditionalTypeNode(node) && child === node.extendsType)) return;
    found = mentions(child, names, skipExtends);
  });
  return found;
}

/** The first parameter's type of a `register(…)`-like member of a class, interface or type literal. */
function registeredParameterType(member) {
  if (!REGISTER_METHODS.has(nameText(member.name))) return undefined;
  if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) return member.parameters[0]?.type;
  if ((ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) && member.type && ts.isFunctionTypeNode(member.type)) return member.type.parameters[0]?.type;
  return undefined;
}
const registersTyped = (members, names) => members.some((member) => {
  const parameter = registeredParameterType(member);
  return parameter !== undefined && mentions(parameter, names, false);
});

/**
 * What the counts need to know about a snapshot: the type names that mean a typed capability (HostCapabilityDefinition and the
 * aliases that wrap it, to a fixed point over the repository) and the types that register one. Parses only the files that
 * mention a candidate name. Exported for the gate's own test.
 */
export function createTypedCapabilityIndex(snapshot, files) {
  const sources = new Map();
  const texts = new Map();
  const textOf = (file) => { if (!texts.has(file)) texts.set(file, snapshot.read(file) ?? ""); return texts.get(file); };
  const sourceOf = (file) => { if (!sources.has(file)) sources.set(file, ts.createSourceFile(file, textOf(file), ts.ScriptTarget.Latest, true)); return sources.get(file); };
  const mentionsAny = (file, names) => { const text = textOf(file); return [...names].some((name) => text.includes(name)); };
  const declarations = (source, test) => { const found = []; const visit = (node) => { if (test(node)) found.push(node); ts.forEachChild(node, visit); }; visit(source); return found; };

  const typeNames = new Set([TYPE_NAME]);
  for (let changed = true; changed;) {
    changed = false;
    for (const file of files) {
      if (!mentionsAny(file, typeNames)) continue;
      const source = sourceOf(file);
      const visible = visibleNames(source, typeNames);
      for (const alias of declarations(source, ts.isTypeAliasDeclaration)) {
        if (!typeNames.has(alias.name.text) && mentions(alias.type, visible, true)) { typeNames.add(alias.name.text); changed = true; }
      }
      // `export type { HostCapabilityDefinition as Other } from "…"`: the new name means the same type.
      for (const statement of source.statements) {
        if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
        for (const element of statement.exportClause.elements) {
          if (element.propertyName && visible.has(element.propertyName.text) && !typeNames.has(element.name.text)) { typeNames.add(element.name.text); changed = true; }
        }
      }
    }
  }

  const registrarTypes = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const file of files) {
      if (!mentionsAny(file, typeNames) && !mentionsAny(file, registrarTypes)) continue;
      const source = sourceOf(file);
      const typed = visibleNames(source, typeNames);
      const registrars = visibleNames(source, registrarTypes);
      for (const node of declarations(source, (candidate) => ts.isClassDeclaration(candidate) || ts.isInterfaceDeclaration(candidate) || ts.isTypeAliasDeclaration(candidate))) {
        const name = node.name?.text;
        if (!name || registrarTypes.has(name)) continue;
        const members = ts.isTypeAliasDeclaration(node) ? (ts.isTypeLiteralNode(node.type) ? node.type.members : []) : node.members;
        const inherits = (node.heritageClauses ?? []).some((clause) => clause.types.some((type) => registrars.has(referencedName(type))));
        if (registersTyped(members, typed) || inherits) { registrarTypes.add(name); changed = true; }
      }
    }
  }

  /** The three counts of one source file. */
  const countsOf = (file) => {
    const counts = { "type-refs": 0, "without-action": 0, "register-calls": 0 };
    const text = textOf(file);
    if (!text.includes("capability_id") && !text.includes("registerCapability") && !mentionsAny(file, typeNames) && !mentionsAny(file, registrarTypes)) return counts;
    const source = sourceOf(file);
    const typed = visibleNames(source, typeNames);
    const registrars = visibleNames(source, registrarTypes);
    const isTyped = (node) => { const name = referencedName(node); return name !== undefined && typed.has(name); };
    const isTypedType = (type) => Boolean(type) && ts.isTypeReferenceNode(type) && isTyped(type);

    // Names declared in this file with a registrar type (or built with `new Registrar(…)`): the receivers of `.register(…)`.
    const registrarOf = (type) => Boolean(type) && (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type) ? type.types.some(registrarOf)
      : ts.isParenthesizedTypeNode(type) ? registrarOf(type.type)
        : ts.isTypeLiteralNode(type) ? registersTyped(type.members, typed)
          : ts.isTypeReferenceNode(type) && registrars.has(referencedName(type)));
    const receivers = new Set();
    for (const node of declarations(source, (candidate) => ts.isParameter(candidate) || ts.isVariableDeclaration(candidate) || ts.isPropertyDeclaration(candidate) || ts.isPropertySignature(candidate))) {
      if (!ts.isIdentifier(node.name)) continue;
      const created = node.initializer && ts.isNewExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && registrars.has(node.initializer.expression.text);
      if (registrarOf(node.type) || created) receivers.add(node.name.text);
    }
    const receiverName = (expression) => (ts.isIdentifier(expression) ? expression.text : ts.isPropertyAccessExpression(expression) ? expression.name.text
      : ts.isNonNullExpression(expression) || ts.isParenthesizedExpression(expression) ? receiverName(expression.expression) : undefined);

    // A descriptor literal without `action` (and without a spread that could bring one) is a typed-only capability. A set, so a
    // literal that is both cast to the type and shaped like a descriptor counts once.
    const descriptors = new Set();
    const noteLiteral = (expression) => {
      const literal = unwrap(expression);
      if (literal && ts.isObjectLiteralExpression(literal) && !hasProperty(literal, "action") && !hasSpread(literal)) descriptors.add(literal);
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
      if (isTyped(node)) counts["type-refs"]++;
      if ((ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isTypeAssertionExpression(node)) && isTypedType(node.type)) noteLiteral(node.expression);
      if (ts.isVariableDeclaration(node) && isTypedType(node.type) && node.initializer) noteLiteral(node.initializer);
      if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && isTypedType(node.type)) functionReturns(node).forEach(noteLiteral);
      if (ts.isObjectLiteralExpression(node) && isDescriptorShaped(node)) descriptors.add(node);
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if ((ts.isIdentifier(callee) && callee.text === "registerCapability") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "registerCapability")) counts["register-calls"]++;
        else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "register" && receivers.has(receiverName(callee.expression))) counts["register-calls"]++;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    counts["without-action"] = descriptors.size;
    return counts;
  };
  return { typeNames, registrarTypes, countsOf };
}

export const typedCapabilities = (helpers) => recordMetric(helpers, {
  id: "typedCapabilities",
  recordKey: "typedCapabilities",
  totalKey: "typedCapabilitiesTotal",
  title: "Typed Host capabilities (references to HostCapabilityDefinition and its aliases, descriptors without action, typed registrations)",
  summaryLabel: "typed capability sites",
  measure(snapshot) {
    const record = {};
    const files = snapshot.files.filter(helpers.isSource);
    const index = createTypedCapabilityIndex(snapshot, files);
    for (const file of files) {
      for (const [what, count] of Object.entries(index.countsOf(file))) if (count) record[`${file}#${what}`] = count;
    }
    return record;
  },
  message: (key, was, now) => `typed Host capability ${key.split("#")[1]} in ${key.split("#")[0]} ${was} → ${now}; register new capabilities as actions in the action service (specs/action-architecture/spec.md §3); the typed registry stays a host-internal channel and gets no new entries`,
});
