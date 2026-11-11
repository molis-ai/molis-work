#!/usr/bin/env node
// The C-stage translation gate: stable keys are read from the SDK call sites and their forwarding functions. The corresponding
// registered locale files must exist, carry the right owner and agree on arguments. Load the SDK validator from source:
// this pass runs before the workspace is built and checks the same file grammar as runtime and package validation.
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { buildSync } from "esbuild";
import { isMainScript } from "../script-paths.mjs";

const HAN = /\p{Script=Han}/u;
const PLATFORM_REGISTRY = "packages/design-system/resources/registry.json";
const sdkRoot = fileURLToPath(new URL("../../packages/plugin-sdk/src/ui/", import.meta.url));
const contractSource = new URL("../../packages/contracts/src/platform/", import.meta.url);
const sdkBundle = buildSync({ stdin: { contents: 'export { STABLE_KEY } from "./text-keys.ts"; export { parseLocalePack, inspectLocaleSet } from "./locale-pack.ts"; export { parseUiLanguageCatalog } from "./language-catalog.ts";', resolveDir: sdkRoot },
  alias: {
    "@molis-ai/molis-work-contracts/platform/ui": fileURLToPath(new URL("ui.ts", contractSource)),
    "@molis-ai/molis-work-contracts/platform/actions": fileURLToPath(new URL("actions.ts", contractSource)),
  }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent" });
const { STABLE_KEY, parseLocalePack, inspectLocaleSet, parseUiLanguageCatalog } = await import("data:text/javascript;base64," + Buffer.from(sdkBundle.outputFiles[0].contents).toString("base64"));

export { STABLE_KEY };

export const ownerOf = (file) => {
  const parts = file.split("/");
  if (parts[0] === "plugins") return parts[2] ?? parts[1];
  if (["apps", "horizontal", "modules", "packages", "server"].includes(parts[0])) return parts[1] ?? parts[0];
  return parts[0];
};
const nameOf = (name) => {
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return null;
};
const unwrap = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
};
// "a" + "b" + `c` is "abc"; null when any part is not a literal.
const literalText = (node) => {
  node = unwrap(node);
  if (!node) return null;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = literalText(node.left), right = literalText(node.right);
    return left !== null && right !== null ? left + right : null;
  }
  return null;
};
// The literals an argument can be and whether part of it is not static. `prefix` is the literal head of a built key, which
// stable keys use to name a family (`jelly.status.${state}`).
const keysOf = (argument, tables) => {
  const node = unwrap(argument);
  const direct = literalText(node);
  if (direct !== null) return { keys: [direct], dynamic: false };
  // A constant table of the same file: `L(LABEL[state])`, `L(LABEL.ready)`, or a constant string read through its name.
  const table = ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node) ? calleeText(node.expression) : ts.isIdentifier(node) ? node.text : null;
  if (table !== null && tables.has(table)) return { keys: [...tables.get(table)], dynamic: false };
  if (ts.isConditionalExpression(node)) {
    const a = keysOf(node.whenTrue, tables), b = keysOf(node.whenFalse, tables);
    return { keys: [...a.keys, ...b.keys], dynamic: a.dynamic || b.dynamic, prefix: a.prefix ?? b.prefix };
  }
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind;
    if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
      const a = keysOf(node.left, tables), b = keysOf(node.right, tables);
      return { keys: [...a.keys, ...b.keys], dynamic: true, prefix: a.prefix ?? b.prefix };
    }
    if (operator === ts.SyntaxKind.PlusToken) return { keys: [], dynamic: true, prefix: literalText(node.left) ?? undefined };
  }
  if (ts.isTemplateExpression(node)) return { keys: [], dynamic: true, prefix: node.head.text };
  return { keys: [], dynamic: true };
};
// `const LABEL = { a: "中文", b: "中文" }` / `const NAMES = ["中文", …]` / `const TITLE = "中文"`: the Chinese (or stable-key) literals each name holds.
const discoverTables = (tree) => {
  const tables = new Map();
  const collect = (node, into) => {
    node = unwrap(node);
    if (!node) return;
    if (ts.isStringLiteralLike(node)) { if (HAN.test(node.text) || STABLE_KEY.test(node.text)) into.add(node.text); }
    else if (ts.isObjectLiteralExpression(node)) node.properties.forEach((property) => { if (ts.isPropertyAssignment(property)) collect(property.initializer, into); });
    else if (ts.isArrayLiteralExpression(node)) node.elements.forEach((element) => collect(element, into));
    else if (ts.isCallExpression(node) && calleeText(node.expression) === "Object.freeze") collect(node.arguments[0], into);
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const into = new Set();
      collect(node.initializer, into);
      if (into.size) tables.set(node.name.text, new Set([...(tables.get(node.name.text) ?? []), ...into]));
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return tables;
};
// `a.b.c`, `this.t` or `L` as text; null for anything computed.
const calleeText = (expression) => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (expression.kind === ts.SyntaxKind.ThisKeyword) return "this";
  if (ts.isPropertyAccessExpression(expression)) {
    const inner = calleeText(expression.expression);
    return inner === null ? null : `${inner}.${expression.name.text}`;
  }
  return null;
};

const NO_ARGUMENTS = Object.freeze([]);
const FIRST_ARGUMENT = Object.freeze([0]);
const argumentIndexes = (callee, wrappers, declared) => {
  if (!callee) return NO_ARGUMENTS;
  if (callee === "globalThis.t" || callee === "globalThis.t.text" || callee === "readText") return FIRST_ARGUMENT;
  const name = callee.endsWith(".text") ? callee.slice(0, -5) : callee;
  if (declared.has(name) || name.startsWith("this.") && declared.has(name.slice(5))) return FIRST_ARGUMENT;
  const indexes = wrappers.get(callee) ?? wrappers.get(callee.startsWith("this.") ? callee.slice(5) : callee);
  return indexes ? [...indexes].sort((a, b) => a - b) : NO_ARGUMENTS;
};
// A const alias of the actual SDK/typed translator keeps its first argument, including an alias inside a browser script.
function textAliases(tree, names) {
  const aliases = [], declared = new Set(names);
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.parent.flags & ts.NodeFlags.Const && ts.isIdentifier(node.name) && node.initializer) {
      const value = calleeText(unwrap(node.initializer));
      if (value !== null) aliases.push([node.name.text, value]);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (let last = -1; last !== declared.size;) {
    last = declared.size;
    for (const [alias, value] of aliases) if (argumentIndexes(value, new Map(), declared).length) declared.add(alias);
  }
  return declared;
}

// Functions that hand parameters to a translator are translators within their file, by name (their callers carry the keys, so
// the forwarding call itself is not a dynamic call). Every forwarded parameter counts, not only the first: a function that
// translates a title and a hint has two keys at every call. `seed` is what the other files of the same browser program have
// already shown (linkPrograms). A few rounds settle chains (`button` -> `tx` -> `L`) and wrappers that gain a second parameter
// once the callee they forward to is known.
const discoverWrappers = (tree, declared, seed) => {
  const bindings = [];
  const functionLike = (node) => { const inner = unwrap(node); return inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) ? inner : null; };
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) bindings.push({ name: node.name.text, fn: node });
    else if (ts.isMethodDeclaration(node) && node.body && nameOf(node.name)) bindings.push({ name: nameOf(node.name), fn: node });
    else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && functionLike(node.initializer)) bindings.push({ name: node.name.text, fn: functionLike(node.initializer) });
    else if (ts.isPropertyAssignment(node) && nameOf(node.name) && functionLike(node.initializer)) bindings.push({ name: nameOf(node.name), fn: functionLike(node.initializer) });
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const localNames = new Set(bindings.map(binding => binding.name));
  const wrappers = new Map([...(seed ?? [])].filter(([name]) => !localNames.has(name)).map(([name, indexes]) => [name, new Set(indexes)])), forwards = new Set();
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (const { name, fn } of bindings) {
      if (!fn.body) continue;
      const parameters = fn.parameters.map((parameter) => (ts.isIdentifier(parameter.name) ? parameter.name.text : null));
      const found = new Set(), handed = [];
      const inspect = (node) => {
        if (ts.isCallExpression(node)) {
          for (const index of argumentIndexes(calleeText(node.expression), wrappers, declared)) {
            const argument = unwrap(node.arguments[index]);
            if (argument && ts.isIdentifier(argument) && parameters.includes(argument.text)) { handed.push(argument); found.add(parameters.indexOf(argument.text)); }
          }
        }
        ts.forEachChild(node, inspect);
      };
      inspect(fn.body);
      if (!found.size) continue;
      handed.forEach((argument) => forwards.add(argument));
      const known = wrappers.get(name) ?? new Set();
      if ([...found].some((index) => !known.has(index))) { wrappers.set(name, new Set([...known, ...found])); changed = true; }
    }
    if (!changed) break;
  }
  return { wrappers, forwards };
};

// Embedded browser programs can forward keys across nearby source files.
const resolveModule = (from, specifier, known) => {
  const joined = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  const stem = joined.replace(/\.m?js$/, "");
  return [`${stem}.ts`, `${stem}.mts`, `${joined}.ts`, `${stem}/index.ts`].find((candidate) => known.has(candidate)) ?? null;
};
const mergeInto = (into, from) => {
  let grew = false;
  for (const [name, indexes] of from) {
    const known = into.get(name) ?? new Set();
    for (const index of indexes) if (!known.has(index)) { known.add(index); grew = true; }
    into.set(name, known);
  }
  return grew;
};

/**
 * A browser program is often several files: `client.ts` defines `tx` and `button`, and joins the script constants of
 * `client-views.ts` and `client-flows.ts`, which call them without defining them. So the wrappers of the browser scripts of one
 * owner's files that import one another are shared among those files (by name, with every forwarded parameter), and a file
 * next to such a script (it imports one, or one imports it) is read with them too. A name that two scripts of one program
 * define differently is a translator for the parameters either one forwards, which is the safe side for a check that looks
 * for Chinese with no English. Returns the scans of the files that were read again with what the others define.
 */
export function linkPrograms(scans, read, readModule) {
  const known = new Set(scans.keys());
  const near = new Map();
  const link = (a, b) => near.set(a, (near.get(a) ?? new Set()).add(b));
  for (const [file, scan] of scans) {
    for (const specifier of scan.imports) {
      const target = resolveModule(file, specifier, known);
      if (target && target !== file && ownerOf(target) === ownerOf(file)) { link(file, target); link(target, file); }
    }
  }
  const scripted = new Set([...scans.values()].filter((scan) => scan.scripts > 0).map((scan) => scan.file));
  const seen = new Set(), seeds = new Map(), again = new Map();
  for (const start of scripted) {
    if (seen.has(start)) continue;
    const members = [], queue = [start];
    for (seen.add(start); queue.length;) {
      const file = queue.pop();
      members.push(file);
      for (const next of near.get(file) ?? []) if (scripted.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
    const pool = new Map();
    for (const file of members) mergeInto(pool, scans.get(file).scriptWrappers);
    if (!pool.size) continue;
    // Several files: read each again with what the others define, until no file learns another wrapper (`section` in one
    // file calls `tx` in another, and `field` in a third calls `section`).
    for (let round = 0; members.length > 1 && round < 4; round++) {
      let grew = false;
      for (const file of members) {
        const scan = scanFile(file, read(file), pool, readModule);
        again.set(file, scan);
        scans.set(file, scan);
        grew = mergeInto(pool, scan.scriptWrappers) || grew;
      }
      if (!grew) break;
    }
    for (const file of members) for (const next of near.get(file) ?? []) if (!scripted.has(next)) mergeInto(seeds.get(next) ?? seeds.set(next, new Map()).get(next), pool);
  }
  for (const [file, shared] of seeds) {
    const scan = scanFile(file, read(file), shared, readModule);
    again.set(file, scan);
    scans.set(file, scan);
  }
  return again;
}

const sourceOf = (file, text, js = false) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, js ? ts.ScriptKind.JS : ts.ScriptKind.TS);
const words = (source) => {
  const names = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== "@molis-ai/molis-work-plugin-sdk/ui") continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements)
      if ((item.propertyName?.text ?? item.name.text) === "t") names.add(item.name.text);
  }
  return names;
};
// Recognize the typed text port as well as SDK imports. Follow a named function type through local imports so
// an injected Say/TranslateText parameter is checked without a list of files or receiver names.
const typeText = node => node?.getText().replace(/\s+/gu, "") ?? "";
function translatorShape(parameters, returns) {
  const vars = typeText(parameters[1]?.type);
  return parameters.length >= 2 && typeText(parameters[0].type) === "string"
    && (/^(?:Readonly<)?Record<string,(?:string\|number|number\|string)>(?:>)?$/u.test(vars) || vars === "TextValues")
    && (!returns || typeText(returns) === "string");
}

function translatorType(type, source, readModule, seen = new Set()) {
  if (!type) return false;
  if (ts.isFunctionTypeNode(type)) return translatorShape(type.parameters, type.type);
  if (ts.isParenthesizedTypeNode(type)) return translatorType(type.type, source, readModule, seen);
  if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return false;
  return translatorAlias(type.typeName.text, source, readModule, seen);
}

function translatorAlias(name, source, readModule, seen) {
  const key = source.fileName + ":" + name;
  if (seen.has(key)) return false;
  seen.add(key);
  for (const node of source.statements) {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === name) return translatorType(node.type, source, readModule, seen);
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteralLike(node.moduleSpecifier)) continue;
    const bindings = node.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const binding = bindings.elements.find(item => item.name.text === name);
    if (!binding) continue;
    const definition = readModule?.(source.fileName, node.moduleSpecifier.text);
    if (definition && translatorAlias(binding.propertyName?.text ?? name, definition, readModule, seen)) return true;
  }
  return false;
}

function declaredTranslators(source, readModule) {
  const names = new Set();
  const visit = node => {
    if ((ts.isParameter(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node))
      && nameOf(node.name) && translatorType(node.type, source, readModule)) names.add(nameOf(node.name));
    if (ts.isMethodSignature(node) && nameOf(node.name) && translatorShape(node.parameters, node.type)) names.add(nameOf(node.name));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}
const title = (node, source) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
const testCall = (name) => /^(?:globalThis\.)?(?:L|LF|LFor)$/u.test(name ?? "");
const escapeRegExp = (text) => text.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
const scriptPattern = (names) => new RegExp(String.raw`(?:\bglobalThis\.t(?:\.text)?\b|(?:\bt(?:\.text)?|\buiText(?:\.text)?|\breadText|\bL(?:F|For)?${names?.size ? `|${[...names.keys()].map(escapeRegExp).join("|")}` : ""})\()`);

export function scanFile(file, text, shared, readModule) {
  const source = sourceOf(file, text), imports = new Set([...words(source), ...declaredTranslators(source, readModule)]);
  const result = { file, calls: [], dynamic: [], retired: [], mentions: new Set(), scripts: 0, scriptWrappers: new Map(),
    imports: source.statements.filter(node => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".")).map(node => node.moduleSpecifier.text) };
  function inspect(tree, first, embedded = false) {
    const declared = textAliases(tree, imports);
    const { wrappers, forwards } = discoverWrappers(tree, declared, embedded ? shared : undefined), tables = discoverTables(tree);
    if (embedded) {
      result.scripts++;
      for (const [name, indexes] of wrappers) result.scriptWrappers.set(name, new Set([...(result.scriptWrappers.get(name) ?? []), ...indexes]));
    }
    function visit(node) {
      const line = first + title(node, tree) - 1;
      if (ts.isCallExpression(node)) {
        const callee = calleeText(node.expression);
        if (testCall(callee) || callee === "host.translate") result.retired.push({ file, line, callee });
        for (const index of argumentIndexes(callee, wrappers, declared)) {
          if (!node.arguments[index]) continue;
          const found = keysOf(node.arguments[index], tables);
          // An optional wrapper can use an empty label to omit the control's words. Direct SDK calls still require a key.
          const direct = argumentIndexes(callee, new Map(), declared).length > 0;
          for (const key of found.keys) if (key || direct) result.calls.push({ file, line, key, callee, embedded });
          if (found.dynamic && !forwards.has(unwrap(node.arguments[index]))) result.dynamic.push({ file, line, callee, prefix: found.prefix, embedded });
        }
      }
      if (ts.isStringLiteralLike(node) && STABLE_KEY.test(node.text)) result.mentions.add(node.text);
      if (!embedded && (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
        const raw = ts.isTaggedTemplateExpression(node.parent) && node.parent.template === node && calleeText(node.parent.tag) === "String.raw";
        const part = literal => raw ? literal.rawText ?? "" : literal.text;
        const body = ts.isNoSubstitutionTemplateLiteral(node) ? part(node)
          : part(node.head) + node.templateSpans.map((span, index) => `__SUB${index}__${part(span.literal)}`).join("");
        if (scriptPattern(shared).test(body)) inspect(sourceOf(file + "#script", body, true), line, true);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
  }
  inspect(source, 1);
  return result;
}

const readJson = (snapshot, file, problems) => {
  const raw = snapshot.read(file);
  if (!raw) { problems.push(`${file}: declared file missing`); return null; }
  const tree = ts.parseJsonText(file, raw);
  const visit = node => {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set();
      for (const property of node.properties) {
        const name = nameOf(property.name);
        if (name === null) continue;
        if (seen.has(name)) problems.push(`${file}:${title(property, tree)}: repeated key ${name}`);
        seen.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  try { return JSON.parse(raw); } catch { problems.push(`${file}: invalid JSON`); return null; }
};

const byKey = (obj, key) => obj?.properties.find(property => ts.isPropertyAssignment(property) && nameOf(property.name) === key)?.initializer;
const recordAt = (obj, key) => { const value = unwrap(byKey(obj, key)); return value && ts.isObjectLiteralExpression(value) ? value : null; };

/** Resolve a literal declared in the manifest's own module or imported from the package, without executing the plugin. */
function declaredIdentity(node, source, snapshot, known, seen = new Set()) {
  const literal = literalText(node);
  if (literal !== null) return literal;
  if (!node || !ts.isIdentifier(node)) return null;
  const key = source.fileName + "/" + node.text;
  if (seen.has(key)) return null;
  seen.add(key);
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations.find(item => nameOf(item.name) === node.text);
      if (declaration) return declaredIdentity(declaration.initializer, source, snapshot, known, seen);
    }
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const binding = bindings.elements.find(item => item.name.text === node.text);
    if (!binding) continue;
    const specifier = statement.moduleSpecifier.text;
    const contract = "@molis-ai/molis-work-contracts/";
    const candidate = specifier.startsWith(contract) ? "packages/contracts/src/" + specifier.slice(contract.length) + ".ts" : null;
    const file = candidate && known.has(candidate) ? candidate : resolveModule(source.fileName, specifier, known);
    const text = file && snapshot.read(file);
    if (!file || !text) return null;
    return declaredIdentity(binding.propertyName ?? binding.name, sourceOf(file, text), snapshot, known, seen);
  }
  return null;
}

const OFFICIAL_PLUGINS = "plugins/official-integrations/";
const CATALOG_PLUGIN = OFFICIAL_PLUGINS + "catalog/";

function addConnectorOwner(owners, problems, directory, owner, locales) {
  const { default: fallback, available } = locales ?? {};
  if (typeof owner !== "string" || !owner || !Array.isArray(available) || !available.includes(fallback)
    || available.some(tag => typeof tag !== "string" || !tag) || new Set(available).size !== available.length
    || [...owners.values()].some(entry => entry.owner === owner || entry.directory === directory)) {
    problems.push(directory + ": invalid or duplicate connector locale declaration");
    return;
  }
  owners.set(directory, { owner, directory, languages: available, default: fallback });
}

function addOfficialConnectorOwners(snapshot, owners, problems) {
  for (const file of snapshot.files.filter(file => /^plugins\/official-integrations\/[^/]+\/manifest\.json$/u.test(file))) {
    const manifest = readJson(snapshot, file, problems);
    if (manifest?.ui?.messages || manifest?.ui?.translations) problems.push(file + ": retired ui text fields");
    if (manifest?.ui?.locales) addConnectorOwner(owners, problems, path.posix.dirname(file) + "/locales", manifest.plugin_id, manifest.ui.locales);
  }
  const model = CATALOG_PLUGIN + "src/catalog.ts", factory = CATALOG_PLUGIN + "src/index.ts";
  const factorySource = sourceOf(factory, snapshot.read(factory) ?? "");
  const manifest = factorySource.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "catalogIntegrationManifest");
  const body = manifest?.body?.statements.find(ts.isReturnStatement)?.expression;
  const ui = body && ts.isObjectLiteralExpression(body) ? recordAt(body, "ui") : null;
  const declaration = unwrap(byKey(ui, "locales"));
  if (!declaration) return;
  const variable = (source, name) => source.statements.filter(ts.isVariableStatement).flatMap(statement => [...statement.declarationList.declarations])
    .find(item => ts.isIdentifier(item.name) && item.name.text === name)?.initializer;
  const catalog = unwrap(variable(sourceOf(model, snapshot.read(model) ?? ""), "CATALOG"));
  const language = unwrap(ts.isIdentifier(declaration) ? variable(factorySource, declaration.text) : declaration);
  const pluginId = body && ts.isObjectLiteralExpression(body) ? unwrap(byKey(body, "plugin_id")) : null;
  if (!catalog || !ts.isArrayLiteralExpression(catalog) || !language || !ts.isObjectLiteralExpression(language) || !pluginId
    || !ts.isTemplateExpression(pluginId) || pluginId.templateSpans.length !== 1 || pluginId.templateSpans[0].expression.getText(factorySource) !== "connectorId") {
    problems.push(factory + ": cannot read the connector locale declarations");
    return;
  }
  const fallback = literalText(byKey(language, "default")), available = unwrap(byKey(language, "available"));
  const locales = { default: fallback, available: available && ts.isArrayLiteralExpression(available) ? available.elements.map(literalText) : [] };
  for (const row of catalog.elements) {
    const id = ts.isCallExpression(row) && literalText(row.arguments[0]);
    if (!id || !/^[a-z][a-z0-9-]*$/u.test(id)) { problems.push(model + ": invalid locale owner in catalog entry"); continue; }
    addConnectorOwner(owners, problems, CATALOG_PLUGIN + "providers/" + id + "/locales", pluginId.head.text + id + pluginId.templateSpans[0].literal.text, locales);
  }
}

function declaredOwners(snapshot, problems) {
  const owners = new Map(), known = new Set(snapshot.files), hasRegistry = known.has(PLATFORM_REGISTRY);
  if (hasRegistry) {
    const registry = readJson(snapshot, PLATFORM_REGISTRY, problems);
    const packages = new Map(snapshot.files.filter(file => /^(apps|packages|horizontal)\/[^/]+\/package.json$/u.test(file))
      .map(file => { const record = readJson(snapshot, file, problems); return [record?.name, path.posix.dirname(file)]; }));
    const platform = registry?.resources?.find(row => row.kind === "locale" && row.owner === "workbench");
    const descriptor = platform && packages.has(platform.package) ? packages.get(platform.package) + "/" + path.posix.dirname(platform.path) + "/languages.json" : null;
    const raw = descriptor ? snapshot.read(descriptor) : null;
    const checked = typeof raw === "string" ? parseUiLanguageCatalog(raw, descriptor) : null;
    if (checked && !checked.ok) for (const issue of checked.problems) problems.push(`${issue.file}:${issue.line ?? 1} ${issue.path}: ${issue.code}: ${issue.reason}`);
    if (descriptor && !checked) problems.push(descriptor + ": language catalog missing");
    for (const row of registry?.resources ?? []) {
      if (row.kind !== "locale") continue;
      const root = packages.get(row.package);
      if (!root || !checked?.ok || owners.has(row.owner)) { problems.push(`${PLATFORM_REGISTRY}: invalid locale owner ${row.owner}`); continue; }
      owners.set(row.owner, { owner: row.owner, directory: root + "/" + row.path, languages: checked.value.languages.map(row => row.tag), default: checked.value.default, platform: true });
    }
    if (!owners.has("workbench")) problems.push(`${PLATFORM_REGISTRY}: workbench locale owner missing`);
  }
  for (const file of snapshot.files.filter(file => /^plugins\/native\/[^/]+\/src\/manifest\.ts$/u.test(file))) {
    const owner = file.split("/")[2], src = sourceOf(file, snapshot.read(file) ?? "");
    let words = null, plugin = null;
    const visit = node => {
      if (ts.isObjectLiteralExpression(node)) {
        const ui = recordAt(node, "ui");
        if (ui && byKey(ui, "contributions") && byKey(node, "plugin_id")) {
          if (byKey(ui, "messages") || byKey(ui, "translations")) problems.push(`${file}: ui.messages and ui.translations have been replaced by ui.locales`);
          words ??= recordAt(ui, "locales");
          plugin ??= declaredIdentity(byKey(node, "plugin_id"), src, snapshot, known);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
    const list = unwrap(byKey(words, "available")), def = literalText(byKey(words, "default"));
    if (!words || !list || !ts.isArrayLiteralExpression(list) || !def) { problems.push(`${file}: declare the owner's ui.locales and its default language`); continue; }
    const languages = list.elements.map(literalText);
    if (!languages.includes(def) || new Set(languages).size !== languages.length || languages.some(tag => !tag)) { problems.push(`${file}: invalid ui.locales languages`); continue; }
    if (!plugin) { problems.push(`${file}: cannot read the locale owner from its Manifest plugin_id`); continue; }
    owners.set(owner, { owner: plugin, directory: `plugins/native/${owner}/locales`, languages, default: def });
  }
  addOfficialConnectorOwners(snapshot, owners, problems);
  return owners;
}

function readMessages(snapshot, definition, locale, problems) {
  const file = `${definition.directory}/${locale}.json`, raw = snapshot.read(file);
  if (raw === null) { problems.push(`${file}: declared file missing`); return null; }
  const result = parseLocalePack(raw, { file });
  if (!result.ok) {
    for (const issue of result.problems) problems.push(`${issue.file}:${issue.line} ${issue.path}: ${issue.code}: ${issue.reason}`);
    return null;
  }
  if (result.value.owner !== definition.owner || result.value.locale !== locale) {
    problems.push(`${file}: wrong owner or language`); return null;
  }
  return result.value;
}

function inspectPacks(snapshot, problems) {
  const owners = declaredOwners(snapshot, problems), all = new Map(), files = new Set();
  for (const [prefix, definition] of owners) {
    const packs = definition.languages.flatMap(tag => {
      files.add(`${definition.directory}/${tag}.json`);
      return readMessages(snapshot, definition, tag, problems) ?? [];
    });
    for (const issue of inspectLocaleSet(packs, definition)) {
      if (issue.blocking || ((definition.platform || issue.locale === "en") && issue.code === "ui.locale_missing_key"))
        problems.push(`${issue.file}: ${issue.code}${issue.key ? " " + issue.key : ""}: ${issue.reason}`);
    }
    const english = packs.find(pack => pack.locale === "en");
    if (!english) problems.push(`${definition.directory}/en.json: no declared English pack`);
    const baseline = packs.find(pack => pack.locale === definition.default);
    for (const key of Object.keys(baseline?.messages ?? {})) {
      if (all.has(key)) problems.push(`${definition.directory}: duplicate owner of ${key}`);
      all.set(key, { prefix });
    }
  }
  for (const file of snapshot.files) if (/^(?:plugins\/native\/[^/]+|plugins\/official-integrations\/[^/]+(?:\/providers\/[^/]+)?|apps\/workbench\/resources)\/locales\/[^/]+\.json$/u.test(file)
    && !files.has(file)) problems.push(`${file}: no locale declaration reaches this file`);
  return { all, files };
}

export function scanTree(snapshot, isSource = isProductSource) {
  const scans = new Map(), known = new Set(snapshot.files), definitions = new Map();
  const readModule = (from, specifier) => {
    const file = specifier.startsWith(".") ? resolveModule(from, specifier, known) : null;
    if (!file) return null;
    if (!definitions.has(file)) definitions.set(file, sourceOf(file, snapshot.read(file) ?? ""));
    return definitions.get(file);
  };
  for (const file of snapshot.files.filter(isSource)) {
    const text = snapshot.read(file);
    if (text !== null) scans.set(file, scanFile(file, text, undefined, readModule));
  }
  linkPrograms(scans, file => snapshot.read(file), readModule);
  const files = [...scans.values()], calls = files.flatMap(file => file.calls), dynamicCalls = files.flatMap(file => file.dynamic), problems = [];
  const { all, files: packFiles } = inspectPacks(snapshot, problems);
  for (const { file, line, callee } of files.flatMap(file => file.retired)) problems.push(`${file}:${line}: retired translator ${callee}; read an owned key with t or say`);
  for (const call of calls) {
    if (!STABLE_KEY.test(call.key)) { problems.push(`${call.file}:${call.line}: expected a stable text key at ${call.callee}: ${JSON.stringify(call.key)}`); continue; }
    const word = all.get(call.key);
    if (!word) problems.push(`${call.file}:${call.line}: no registered default word for ${call.key}`);
    else if (call.file.startsWith("plugins/native/") && word.prefix !== ownerOf(call.file) && !call.key.startsWith("common."))
      problems.push(`${call.file}:${call.line}: ${call.key} belongs to another producer`);
  }
  const mentions = new Set(files.flatMap(file => [...file.mentions]));
  return { files, calls, dynamicCalls, problems: [...new Set(problems)], keys: all.size, packs: packFiles.size,
    dead: [...all.keys()].filter(key => !mentions.has(key)) };
}

export const summarise = scan => ({ keys: scan.keys, packs: scan.packs, calls: scan.calls.length, dynamicCalls: scan.dynamicCalls.length,
  errors: scan.problems, deadKeys: scan.dead.length });
export const missingErrors = result => result.errors;

export function createTranslationMetric(host) {
  const summary = result => `${result.keys} stable words, ${result.packs} locale files, ${result.errors?.length ?? 0} translation problems`;
  return {
    id: "translations",
    measure: snapshot => summarise(scanTree(snapshot, host.isSource)),
    toBaseline: result => ({ localeWordCount: result.keys }),
    fromBaseline(json) { host.requireShape(Number.isSafeInteger(json.localeWordCount), "localeWordCount"); return { keys: json.localeWordCount }; },
    absolute: result => result.errors,
    grew: () => [],
    lowered: () => false,
    lines: result => [summary(result), `  ${result.calls} resolved calls, ${result.dynamicCalls} dynamic calls, ${result.deadKeys} unreferenced keys (reported)`],
    summary,
  };
}

const AREAS = /^(apps|horizontal|modules|packages|plugins|server|tooling)\//;
export const isProductSource = (file) => AREAS.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts")
  && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);

export function workingTreeSnapshot(root) {
  const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  return { files, read: (file) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } } };
}

export function main(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const flags = new Set();
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--root") root = path.resolve(argv[++index]);
    else if (["--missing", "--dead", "--calls", "--json"].includes(argv[index])) flags.add(argv[index]);
    else { process.stderr.write(`unknown translation gate option: ${argv[index]}\n`); return 2; }
  }
  const scan = scanTree(workingTreeSnapshot(root));
  const result = summarise(scan);
  if (flags.has("--json")) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else {
    process.stdout.write(createTranslationMetric({}).lines(result).join("\n") + "\n");
    if (flags.has("--missing")) for (const issue of scan.problems) process.stdout.write(issue + "\n");
    if (flags.has("--calls")) for (const call of scan.calls) process.stdout.write(`${call.file}:${call.line} ${call.key}\n`);
    if (flags.has("--dead")) for (const key of scan.dead) process.stdout.write(`unreferenced: ${key}\n`);
  }
  return scan.problems.length ? 1 : 0;
}
if (isMainScript(import.meta.url)) process.exitCode = main(process.argv.slice(2));
