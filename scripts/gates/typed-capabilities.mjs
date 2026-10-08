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
//                     `action`, or one that spreads a base descriptor and mints a new id on top of it (`{ ...base,
//                     capability_id: "x.y.v1" }`, a string literal and no `action`): they register as typed-only capabilities,
//                     outside the action directory
//   register-calls    registrations and uses of a typed definition, whatever the file calls them:
//                     - `registerCapability(…)`;
//                     - `.register(…)` on a receiver that is declared in the same file with a type that registers typed
//                       capabilities (LocalHost, CapabilityRegistry, the Agent and Schedule registrars: classes and interfaces
//                       with a `register` or `registerCapability` method whose first parameter is a typed definition; found in
//                       the snapshot too), built with `new`, held in a `typeof` of such a receiver, or reached through a function
//                       in this file or an exported function whose declared return type is such a type (`getHost().register(…)`);
//                     - a call of a function whose first parameter is a typed definition: one declared in this file (the local
//                       `register` helper of horizontal/agent-host/src/capability-registration.ts carries more than 40 of them; the
//                       kernel's normalizedDescriptor is a use, not a registration, and counts too) or an exported one found in
//                       the snapshot, also under an import rename;
//                     - a call of a local function (or of a method, as `this.method(…)`) that hands its first parameter on to any
//                       of these, whatever the parameter's type (`const reg = (d: any, h) => host.register(d, h)`), to a fixed
//                       point;
//                     - a call of something named `register` or `registerCapability` whose first argument is an inline
//                       descriptor literal (`capability_id` and `operation` or a spread, no `action`), whatever its receiver's
//                       type.
// Each may only fall; a file with no record starts at 0, so a new typed capability, a new registrar and a new consumer all
// fail. The runtime count (708 descriptors, 609 actions, 99 typed without action) is the same list seen from the registry.
//
// A literal that merely has the shape of a descriptor is counted too, because the cast is what a new author would leave out:
// today two of them are not registrations (a queue key in local-host.ts and an event projection in casebook/observer.ts).
// What it does not see (review does; there is no type checker behind it): a descriptor derived by spread without a literal id
// (`{ ...base, capability_id: id }`) and registered by variable through a receiver whose type is not written in the file that
// calls it (or only through a `typeof` of something imported); a wrapper in another file whose first parameter is untyped; an
// exported function that returns a registrar without saying so in its signature. The type names and functions it finds today
// (HostMethodCapability; LocalHost, MolisWorkLocalHost, CapabilityRegistry and the two registrar interfaces) are read back in
// tests/health-gates-structure.test.ts.
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
// A new id minted on top of a spread base: `{ ...base, capability_id: "x.y.v1" }`. The id is a string literal, not copied from
// another record (`capability_id: reference.capability_id`), which is what a reference, a call log or an action wrapper does.
const mintsIdOnSpread = (literal) => hasSpread(literal) && literal.properties.some((property) => ts.isPropertyAssignment(property) && nameText(property.name) === "capability_id" && ts.isStringLiteralLike(property.initializer));
const isDescriptorShaped = (literal) => !hasProperty(literal, "action")
  && ((DESCRIPTOR_MEMBERS.every((name) => hasProperty(literal, name)) && !hasSpread(literal)) || mintsIdOnSpread(literal));
const hasExportModifier = (node) => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
const FUNCTION_NODE = (node) => ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);
/** The name a function is called by: its own, or the variable it is assigned to (`const register = (…) => …`). */
const functionName = (fn) => (fn.name && ts.isIdentifier(fn.name) ? fn.name.text
  : fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : undefined);
/** The functions a source file declares at its top level with `export` (declarations, and `export const f = (…) => …`), by name. */
function exportedFunctions(source) {
  const found = [];
  for (const statement of source.statements) {
    if (!hasExportModifier(statement)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) found.push({ name: statement.name.text, fn: statement });
    else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const fn = declaration.initializer && unwrap(declaration.initializer);
        if (ts.isIdentifier(declaration.name) && fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) found.push({ name: declaration.name.text, fn });
      }
    }
  }
  return found;
}

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

/** The last segment of a `typeof a.b` operand. */
const queriedName = (name) => (ts.isIdentifier(name) ? name.text : name.right.text);
/** Does this type node name a registrar: a type that registers typed capabilities, or a `typeof` of a receiver that does? */
function isRegistrarType(type, typed, registrars, receivers) {
  if (!type) return false;
  if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) return type.types.some((member) => isRegistrarType(member, typed, registrars, receivers));
  if (ts.isParenthesizedTypeNode(type)) return isRegistrarType(type.type, typed, registrars, receivers);
  if (ts.isTypeLiteralNode(type)) return registersTyped(type.members, typed);
  if (ts.isTypeQueryNode(type)) return receivers.has(queriedName(type.exprName));
  return ts.isTypeReferenceNode(type) && registrars.has(referencedName(type));
}
/** Does the function take a typed definition as its first parameter? */
const takesTyped = (fn, typed) => { const type = fn.parameters[0]?.type; return Boolean(type) && mentions(type, typed, false); };
/** The declared return type of a function-like member, or of a property or variable typed as a function. */
function returnTypeOf(node) {
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return node.type;
  if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node) || ts.isParameter(node)) && node.type && ts.isFunctionTypeNode(node.type)) return node.type.type;
  return undefined;
}
const calleeName = (callee) => (ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined);

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

  // Exported functions, by name, that the call-site counts follow across files: those that take a typed definition as their first
  // parameter (a call of one registers or uses a typed capability), and those whose declared return type is a registrar
  // (`getHost().register(…)` registers through the function's result).
  const typedFunctions = new Set();
  const registrarFunctions = new Set();
  for (const file of files) {
    if (!mentionsAny(file, typeNames) && !mentionsAny(file, registrarTypes)) continue;
    const source = sourceOf(file);
    const typed = visibleNames(source, typeNames);
    const registrars = visibleNames(source, registrarTypes);
    for (const { name, fn } of exportedFunctions(source)) {
      if (takesTyped(fn, typed)) typedFunctions.add(name);
      if (isRegistrarType(returnTypeOf(fn), typed, registrars, new Set())) registrarFunctions.add(name);
    }
  }

  // `export { registerTyped as add } from "./helper.js"`: the new name means the same function.
  for (const names of [typedFunctions, registrarFunctions]) {
    for (let changed = true; changed;) {
      changed = false;
      for (const file of files) {
        if (!mentionsAny(file, names)) continue;
        for (const statement of sourceOf(file).statements) {
          if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
          for (const element of statement.exportClause.elements) {
            if (element.propertyName && names.has(element.propertyName.text) && !names.has(element.name.text)) { names.add(element.name.text); changed = true; }
          }
        }
      }
    }
  }

  /** The three counts of one source file. */
  const countsOf = (file) => {
    const counts = { "type-refs": 0, "without-action": 0, "register-calls": 0 };
    const text = textOf(file);
    if (!text.includes("capability_id") && !text.includes("registerCapability") && !mentionsAny(file, typeNames) && !mentionsAny(file, registrarTypes)
      && !mentionsAny(file, typedFunctions) && !mentionsAny(file, registrarFunctions)) return counts;
    const source = sourceOf(file);
    const typed = visibleNames(source, typeNames);
    const registrars = visibleNames(source, registrarTypes);
    const isTyped = (node) => { const name = referencedName(node); return name !== undefined && typed.has(name); };
    const isTypedType = (type) => Boolean(type) && ts.isTypeReferenceNode(type) && isTyped(type);

    // Receivers of `.register(…)`: names declared in this file with a registrar type (or built with `new Registrar(…)`, or taken
    // from one), and the functions that return one (`getHost().register(…)`), local or imported. Repeated until nothing is added,
    // because `typeof receiver` and `const host = getHost()` depend on what was found before them.
    const receivers = new Set();
    const chain = visibleNames(source, registrarFunctions);
    const named = declarations(source, (candidate) => (ts.isParameter(candidate) || ts.isVariableDeclaration(candidate) || ts.isPropertyDeclaration(candidate) || ts.isPropertySignature(candidate)) && ts.isIdentifier(candidate.name));
    const returning = declarations(source, (candidate) => functionName(candidate) !== undefined && returnTypeOf(candidate) !== undefined);
    const isReceiver = (expression) => {
      if (ts.isIdentifier(expression)) return receivers.has(expression.text);
      if (ts.isPropertyAccessExpression(expression)) return receivers.has(expression.name.text);
      if (ts.isNonNullExpression(expression) || ts.isParenthesizedExpression(expression) || ts.isAwaitExpression(expression)) return isReceiver(expression.expression);
      if (ts.isCallExpression(expression)) { const name = calleeName(expression.expression); return name !== undefined && chain.has(name); }
      if (ts.isNewExpression(expression)) return ts.isIdentifier(expression.expression) && registrars.has(expression.expression.text);
      return false;
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const node of named) {
        if (receivers.has(node.name.text)) continue;
        if (isRegistrarType(node.type, typed, registrars, receivers) || (node.initializer && isReceiver(unwrap(node.initializer)))) { receivers.add(node.name.text); changed = true; }
      }
      for (const node of returning) {
        const name = functionName(node);
        if (!chain.has(name) && isRegistrarType(returnTypeOf(node), typed, registrars, receivers)) { chain.add(name); changed = true; }
      }
    }

    // Functions whose calls are registrations: the exported ones that take a typed definition first, the ones declared here that
    // do, and (to a fixed point) the ones declared here that hand their first parameter on to a registration, whatever its type.
    const wrappers = visibleNames(source, typedFunctions);
    // `operation` is what a Schedule job or another record that merely names a capability_id does not have; a spread is a base
    // descriptor that may bring it.
    const inlineDescriptor = (call) => {
      const first = call.arguments[0] && unwrap(call.arguments[0]);
      return Boolean(first) && ts.isObjectLiteralExpression(first) && hasProperty(first, "capability_id") && !hasProperty(first, "action")
        && (hasProperty(first, "operation") || hasSpread(first));
    };
    const methodWrappers = new Set();
    const isRegisterCall = (call) => {
      const callee = call.expression;
      const name = calleeName(callee);
      if (name === "registerCapability") return true;
      if (ts.isIdentifier(callee) && wrappers.has(callee.text)) return true;
      if (ts.isPropertyAccessExpression(callee) && name === "register" && isReceiver(callee.expression)) return true;
      if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword && methodWrappers.has(name)) return true;
      // A descriptor written inline in a call of `register`: a registration, whatever the type of what it is called on.
      return REGISTER_METHODS.has(name) && inlineDescriptor(call);
    };
    const functions = declarations(source, FUNCTION_NODE).map((fn) => ({ fn, name: functionName(fn), into: wrappers })).filter(({ name }) => name !== undefined);
    // The same for the methods of a class, called as `this.method(…)`.
    const methods = declarations(source, ts.isMethodDeclaration).filter((method) => ts.isIdentifier(method.name)).map((fn) => ({ fn, name: fn.name.text, into: methodWrappers }));
    for (const { fn, name, into } of [...functions, ...methods]) if (takesTyped(fn, typed)) into.add(name);
    const handsOnFirstParameter = (fn) => {
      const parameter = fn.parameters[0];
      if (!parameter || !ts.isIdentifier(parameter.name) || !fn.body) return false;
      let found = false;
      const walk = (node) => {
        if (found) return;
        if (ts.isCallExpression(node) && isRegisterCall(node)) {
          const first = node.arguments[0] && unwrap(node.arguments[0]);
          if (first && ts.isIdentifier(first) && first.text === parameter.name.text) { found = true; return; }
        }
        ts.forEachChild(node, walk);
      };
      walk(fn.body);
      return found;
    };
    for (let changed = true; changed;) {
      changed = false;
      for (const { fn, name, into } of [...functions, ...methods]) if (!into.has(name) && handsOnFirstParameter(fn)) { into.add(name); changed = true; }
    }

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
      if (ts.isCallExpression(node) && isRegisterCall(node)) counts["register-calls"]++;
      ts.forEachChild(node, visit);
    };
    visit(source);
    counts["without-action"] = descriptors.size;
    return counts;
  };
  return { typeNames, registrarTypes, typedFunctions, registrarFunctions, countsOf };
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
