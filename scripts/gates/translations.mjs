#!/usr/bin/env node
// Translation check (specs/repository-anti-corruption decision #16, slice W1-08): one scan over every translator call and
// every dictionary in the source tree, instead of a hand-kept list of files. It is also a health-gate metric:
// scripts/check-health-gates.mjs adds `createTranslationMetric(...)` to its METRICS, so CI runs it with the merge-base
// comparison that already protects the other numbers.
//
// What it checks
//   missing   a translator call whose literal key has no entry in any dictionary. Absolute: the head must have none.
//   conflict  one Chinese key that two entries translate differently (across dictionaries, or twice in one). Frozen: the
//             committed baseline lists today's conflicts (key -> number of different English texts) and a conflict may only
//             disappear or stay as it is. A new key, or one more variant of an old key, fails. With --base the comparison is
//             the merge-base's own scan, so rewriting the baseline in a PR hides nothing.
//   unserved  a `*_EN` dictionary that the English catalog the Host serves (SERVED_ROOT, `EN`) never imports, directly or through
//             a dictionary that it imports: its English would never be shown. Absolute: the head must have none.
//   dead      a dictionary key no source file mentions as a literal. Reported, not enforced: dynamic keys have to become
//             constants or stable keys first (W5-03). The count is printed; `--dead` lists the keys.
//   stable    the target scheme: a key such as `jelly.calendar.empty` with `{ zh, en }` in its owner's dictionary. Checked as
//             soon as one exists, so files can move one at a time (apps/workbench/README.md, section 界面文字).
//             One definition per key, a key starts with its owner, zh and en use the same {placeholders}, a key is used only
//             by its owner (shared words are `common.*`).
//
// What counts as a translator call (the first argument, or every argument a wrapper forwards)
//   L(…)  x.L(…)  p.text(…)  primitives.text(…)  translate(…)  x.translate(…)  this.t(…)
//   a parameter or property typed `(text: string, values?: Record<string, string | number>) => string`
//   a function of the same file that hands parameters to a translator (`const t = v => p.escape(p.text(v))`): all of them are
//   keys at its callers, so `relationGroup("上游", "这个 Goal 的归属与完成依赖", …)` has two
//   the same inside the browser scripts that live in template literals (they are parsed as JavaScript). A browser program is often
//   several files (`client.ts` defines `tx` and `button` and joins the scripts of `client-views.ts` and `client-flows.ts`), so the
//   wrappers of the scripts of one owner's files that import one another are shared among those files (linkPrograms), and a file
//   next to such a script is read with them too. Files that are not connected that way keep their own names.
// A key written as `a ? "x" : "y"`, `x || "y"`, a sum of literals, or `TABLE[key]` / `TABLE.name` / `NAME` of a constant
// table in the same file is read as its literals; anything else is a dynamic call and is only counted. Not followed: a wrapper
// that a server-side file defines and another file imports (measured 2026-10-08: following them adds 9 calls and no missing
// English, and 90 more dynamic calls). Their keys still count as mentioned, so they are
// not reported dead.
// Limit (known, not closed): wrappers are matched by name, not by scope. In a browser program the names the other files define
// are shared, and they win over a function of the same name that a file defines itself: apps/workbench/src/settings-memory.ts has
// `button(text, variant, label)` that never translates, and reads as the shared `button(action, label)` of home-talk.ts, so its
// 13 calls `button("mw-btn--secondary")` are recorded as translator calls (the file scanned alone has none). A key without Chinese
// is ignored by every rule, so today that changes nothing. What it could do: a Chinese literal passed to such a helper at an index
// the shared one translates would be asked for an English text although the helper never shows it. Closing it takes name
// resolution by scope (which binding a call sees), a parser's job; if it happens, rename the local helper.
//
//   node scripts/gates/translations.mjs [--root <dir>] [--missing] [--conflicts] [--dead] [--calls] [--owners] [--json]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const HAN = /\p{Script=Han}/u;
// `owner.area.name`: lower-case segments, 2 to 5 of them. Flat and literal on purpose, so `git grep jelly.calendar.empty`
// finds the definition and every use.
export const STABLE_KEY = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9_-]*){1,4}$/;
const DICTIONARY_NAME = /(?:^|_)EN$/;
const PLACEHOLDER = /\{([A-Za-z_]\w*)\}/g;
// Shared vocabulary every owner may use; defined in the Workbench's own dictionary.
const SHARED_OWNER = "common";
// Where English goes for a renderer or host file that has no dictionary of its own: the Workbench's list of renderer gaps.
const GAP_DICTIONARY = "apps/workbench/src/i18n/renderer-gap-en.ts";
const FUNCTIONS_DICTIONARY = "apps/workbench/src/functions/en.ts";
// The one file that builds the catalog the Host serves (`EN`, read by apps/workbench/src/i18n.ts): it imports the plugins'
// dictionaries, the Workbench's own and functions/en.ts. Keep this in step with it when the catalog is assembled elsewhere.
export const SERVED_ROOT = "apps/workbench/src/i18n/en.ts";
const SERVED_CATALOG = "EN";

// ---- who owns a file ----------------------------------------------------------------------------------------------------
export const ownerOf = (file) => {
  const parts = file.split("/");
  if (parts[0] === "plugins") return parts[2] ?? parts[1];
  if (["apps", "horizontal", "modules", "packages", "server"].includes(parts[0])) return parts[1] ?? parts[0];
  return parts[0];
};
// The prefixes a stable key defined in this file may start with: its owner's directory name (the Workbench also owns `common`).
const prefixesOf = (file) => (ownerOf(file) === "workbench" ? ["workbench", SHARED_OWNER] : [ownerOf(file)]);

// ---- reading syntax -----------------------------------------------------------------------------------------------------
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
const lineAt = (tree, node, first) => first + tree.getLineAndCharacterOfPosition(node.getStart(tree)).line;

// ---- translator calls ---------------------------------------------------------------------------------------------------
const typeText = (node) => (node ? node.getText().replace(/\s+/g, "") : "");
// `(text: string, values?: Record<string, string | number>) => string`, as a function type or a method signature: the shape
// every injected translator has (apps/workbench/src/arrival/shell.ts, plugins/native/inbox/src/projection.ts, horizontal/placement).
const isTranslatorShape = (parameters, returnType) => parameters.length >= 2
  && typeText(parameters[0].type) === "string"
  && /^Record<string,string\|number>$/.test(typeText(parameters[1].type))
  && (!returnType || typeText(returnType) === "string");
const declaredTranslators = (source) => {
  const names = new Set();
  const visit = (node) => {
    const fn = node.type && ts.isFunctionTypeNode(node.type) ? node.type : null;
    const typed = fn && (ts.isParameter(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) && isTranslatorShape(fn.parameters, fn.type);
    if ((typed || (ts.isMethodSignature(node) && isTranslatorShape(node.parameters, node.type))) && nameOf(node.name)) names.add(nameOf(node.name));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
};
// Which arguments of this callee are keys: [0] for the known entry points, every parameter a wrapper hands to a translator for a
// wrapper (`relationGroup(title, hint)` translates both), [] when it is not a translator.
const NO_ARGUMENTS = Object.freeze([]);
const FIRST_ARGUMENT = Object.freeze([0]);
const argumentIndexes = (callee, wrappers, declared) => {
  if (callee === null) return NO_ARGUMENTS;
  if (callee === "L" || callee.endsWith(".L") || callee === "p.text" || callee === "primitives.text") return FIRST_ARGUMENT;
  if (callee === "translate" || callee.endsWith(".translate") || callee === "this.t") return FIRST_ARGUMENT;
  const last = callee.slice(callee.lastIndexOf(".") + 1);
  if (declared.has(last) && (callee === last || callee.startsWith("this."))) return FIRST_ARGUMENT;
  const indexes = wrappers.get(callee.startsWith("this.") ? callee.slice(5) : callee);
  return indexes ? [...indexes].sort((a, b) => a - b) : NO_ARGUMENTS;
};
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
  const wrappers = new Map([...(seed ?? [])].map(([name, indexes]) => [name, new Set(indexes)])), forwards = new Set();
  for (let round = 0; round < 4; round++) {
    let changed = false;
    for (const { name, fn } of bindings) {
      if (name === "L" || !fn.body) continue;
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

// ---- dictionaries ---------------------------------------------------------------------------------------------------------
// A dictionary is `const X_EN = { "中文": "English", … }` or `Object.assign(X_EN, { … })`, or any object literal with stable
// keys whose values carry `zh` and `en`.
const objectOf = (node) => {
  node = unwrap(node);
  if (node && ts.isCallExpression(node) && calleeText(node.expression) === "Object.freeze") return objectOf(node.arguments[0]);
  return node && ts.isObjectLiteralExpression(node) ? node : null;
};
const entriesOf = (literal, source) => literal.properties.filter(ts.isPropertyAssignment).flatMap((property) => {
  const key = nameOf(property.name);
  return key === null ? [] : [{ key, value: literalText(property.initializer), line: lineAt(source, property, 1) }];
});
const stableEntryOf = (property, source) => {
  const key = nameOf(property.name);
  const body = key !== null && STABLE_KEY.test(key) ? objectOf(property.initializer) : null;
  if (!body) return null;
  const member = (name) => body.properties.find((candidate) => ts.isPropertyAssignment(candidate) && nameOf(candidate.name) === name);
  const zh = member("zh"), en = member("en");
  if (!zh && !en) return null;
  return { key, zh: zh ? literalText(zh.initializer) : null, en: en ? literalText(en.initializer) : null, line: lineAt(source, property, 1) };
};
const mentionable = (text) => text.length <= 600 && (HAN.test(text) || STABLE_KEY.test(text));
// The dictionaries a file refers to, by the dictionary they feed: `{ A_EN: Set(B_EN, C_EN) }` for `const A_EN = { ...B_EN }` and
// `Object.assign(A_EN, C_EN)`, and `""` for a use that feeds none (a function, an array). A use is every mention of a `*_EN` name
// under its exported name (`import { A_EN as B_EN }` makes B_EN mean A_EN), except where the name is declared, filled
// (`Object.assign(X_EN, …)`, first argument), a property key, or imported or re-exported.
const dictionaryUses = (source) => {
  const aliases = new Map();
  const collect = (node) => {
    if (ts.isImportSpecifier(node) && node.propertyName) aliases.set(node.name.text, node.propertyName.text);
    ts.forEachChild(node, collect);
  };
  collect(source);
  const usesBy = new Map();
  const visit = (node, owner) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && DICTIONARY_NAME.test(node.name.text)) {
      if (node.initializer) visit(node.initializer, node.name.text);
      return;
    }
    if (ts.isCallExpression(node) && calleeText(node.expression) === "Object.assign" && node.arguments[0] && ts.isIdentifier(node.arguments[0])) {
      const target = aliases.get(node.arguments[0].text) ?? node.arguments[0].text;
      if (DICTIONARY_NAME.test(target)) { node.arguments.slice(1).forEach((argument) => visit(argument, target)); return; }
    }
    if (ts.isIdentifier(node) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
      const exported = aliases.get(node.text) ?? node.text;
      if (DICTIONARY_NAME.test(exported)) usesBy.set(owner, (usesBy.get(owner) ?? new Set()).add(exported));
    }
    ts.forEachChild(node, (child) => visit(child, owner));
  };
  visit(source, "");
  return usesBy;
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whether a template literal is worth parsing as a browser script: it calls L, or a wrapper that the other files of its program
// define (`tx(`, or `globalThis.L(`): a call by one of those names.
const scriptPattern = (shared) => new RegExp(`(?:^|[^\\w$])(?:L${shared?.size ? `|${[...shared.keys()].map(escapeRegExp).join("|")}` : ""})\\(`);

/**
 * Everything one file says about translations. `shared` is `name -> indexes` of the wrappers that the browser scripts of the
 * other files of the same program define (linkPrograms), so a `section('标题')` in one file is followed to the `tx` another
 * file defines.
 */
export function scanFile(file, text, shared) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declared = declaredTranslators(source);
  const result = {
    file, entries: [], stable: [], dictionaries: [], usesBy: dictionaryUses(source), calls: [], dynamic: [], mentions: new Set(),
    // for linkPrograms: the relative modules it imports, how many browser scripts it holds, and the wrappers those define
    imports: source.statements.filter((node) => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".")).map((node) => node.moduleSpecifier.text),
    scripts: 0, scriptWrappers: new Map(),
  };
  const looksLikeScript = scriptPattern(shared);

  // One syntax tree: the file itself, or a browser script found in one of its template literals (`first` is the line the
  // template starts on). Only the file itself holds dictionaries.
  const visitTree = (tree, first, embedded) => {
    const { wrappers, forwards } = discoverWrappers(tree, declared, embedded ? shared : undefined);
    if (embedded) {
      result.scripts++;
      for (const [name, indexes] of wrappers) result.scriptWrappers.set(name, new Set([...(result.scriptWrappers.get(name) ?? []), ...indexes]));
    }
    const tables = discoverTables(tree);
    const visit = (node) => {
      if (!embedded) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && DICTIONARY_NAME.test(node.name.text)) {
          const literal = objectOf(node.initializer);
          if (literal) { result.dictionaries.push({ name: node.name.text, line: lineAt(tree, node, 1) }); result.entries.push(...entriesOf(literal, tree)); return; }
        }
        if (ts.isCallExpression(node) && calleeText(node.expression) === "Object.assign" && node.arguments[0] && ts.isIdentifier(node.arguments[0]) && DICTIONARY_NAME.test(node.arguments[0].text)) {
          for (const argument of node.arguments.slice(1)) {
            const literal = objectOf(argument);
            if (literal) result.entries.push(...entriesOf(literal, tree));
          }
          result.dictionaries.push({ name: node.arguments[0].text, line: lineAt(tree, node, 1) });
          return;
        }
        if (ts.isPropertyAssignment(node)) {
          const stable = stableEntryOf(node, tree);
          if (stable) { result.stable.push(stable); return; }
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = calleeText(node.expression);
        for (const index of argumentIndexes(callee, wrappers, declared)) {
          if (!node.arguments[index]) continue;
          const found = keysOf(node.arguments[index], tables);
          const line = lineAt(tree, node, first);
          for (const key of found.keys) result.calls.push({ file, line, key, callee, embedded });
          if (found.dynamic && !forwards.has(unwrap(node.arguments[index]))) result.dynamic.push({ file, line, callee, prefix: found.prefix, embedded });
        }
      }
      if (ts.isStringLiteralLike(node) && mentionable(node.text)) result.mentions.add(node.text);
      if (!embedded && (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
        // The program the browser gets is the cooked text of the template, except under String.raw, where it is the text as
        // written: there `'\n'` stays an escape inside a string and `/^https?:\/\//` stays a regular expression, instead of
        // a real line break and a `//` comment that would hide every call after it on the line.
        const raw = ts.isTaggedTemplateExpression(node.parent) && node.parent.template === node && calleeText(node.parent.tag) === "String.raw";
        const part = (literal) => (raw ? literal.rawText ?? "" : literal.text);
        const body = ts.isNoSubstitutionTemplateLiteral(node) ? part(node)
          : part(node.head) + node.templateSpans.map((span, index) => `__SUB${index}__${part(span.literal)}`).join("");
        if (looksLikeScript.test(body)) {
          const script = ts.createSourceFile(`${file}#script`, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
          visitTree(script, lineAt(tree, node, first), true);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  };
  visitTree(source, 1, false);
  return result;
}

// ---- the whole tree -------------------------------------------------------------------------------------------------------------
const placeholdersOf = (text) => [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]))].sort().join(",");
const variantsOf = (list) => new Set(list.map((item) => item.value)).size;

// `./x.js` in `a/b.ts` is `a/x.ts` (or `x.mts`, or `x/index.ts`); null when it is not a scanned file.
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
export function linkPrograms(scans, read) {
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
        const scan = scanFile(file, read(file), pool);
        again.set(file, scan);
        scans.set(file, scan);
        grew = mergeInto(pool, scan.scriptWrappers) || grew;
      }
      if (!grew) break;
    }
    for (const file of members) for (const next of near.get(file) ?? []) if (!scripted.has(next)) mergeInto(seeds.get(next) ?? seeds.set(next, new Map()).get(next), pool);
  }
  for (const [file, shared] of seeds) {
    const scan = scanFile(file, read(file), shared);
    again.set(file, scan);
    scans.set(file, scan);
  }
  return again;
}

/** Scan every readable file of a snapshot ({ files, read }) that `isSource` accepts. */
export function scanTree(snapshot, isSource) {
  const texts = new Map(), scans = new Map();
  for (const file of snapshot.files.filter(isSource)) {
    const text = snapshot.read(file);
    if (text === null) continue;
    texts.set(file, text);
    scans.set(file, scanFile(file, text));
  }
  linkPrograms(scans, (file) => texts.get(file));
  return analyse([...scans.values()]);
}

/**
 * The dictionaries the served catalog never reaches. `EN` is served; a name is served when a served dictionary uses it
 * (`GOALS_EN` spreads `GOALS_DIALOGS_EN`, the root merges `Object.assign(EN, X_EN)`), or when it is used outside any
 * dictionary of a file that declares a served one. It follows names, not module paths, so it needs no resolver for package
 * specifiers; the cost is that two files declaring the same name are served together.
 */
export function unservedDictionaries(files) {
  const root = files.find((file) => file.file === SERVED_ROOT);
  if (!root || !root.dictionaries.some((item) => item.name === SERVED_CATALOG)) return [];
  // `EN` is the root's own; another file's `EN` is not the catalog.
  const isCatalog = (file, name) => name === SERVED_CATALOG && file === root;
  const declaredBy = new Map();
  for (const file of files) for (const { name } of file.dictionaries) if (name !== SERVED_CATALOG || isCatalog(file, name)) declaredBy.set(name, [...(declaredBy.get(name) ?? []), file]);
  const served = new Set([SERVED_CATALOG]), queue = [SERVED_CATALOG];
  const reach = (name) => { if (!served.has(name)) { served.add(name); queue.push(name); } };
  while (queue.length) {
    const name = queue.pop();
    for (const file of declaredBy.get(name) ?? []) for (const owner of [name, ""]) file.usesBy.get(owner)?.forEach(reach);
  }
  const seen = new Set(), unserved = [];
  for (const file of files) {
    for (const item of file.dictionaries) {
      const id = `${file.file}\0${item.name}`;
      if ((served.has(item.name) && (item.name !== SERVED_CATALOG || isCatalog(file, item.name))) || seen.has(id)) continue;
      seen.add(id);
      unserved.push({ name: item.name, file: file.file, line: item.line });
    }
  }
  return unserved;
}

export function analyse(files) {
  const dictionaryFiles = new Set(files.filter((file) => file.entries.length || file.stable.length).map((file) => file.file));
  const byKey = new Map();
  let entryCount = 0;
  for (const file of files) {
    for (const entry of file.entries) {
      entryCount++;
      byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), { file: file.file, line: entry.line, value: entry.value }]);
    }
  }
  const duplicated = [...byKey].filter(([, list]) => list.length > 1);
  const conflicts = new Map();
  for (const [key, list] of duplicated) {
    const known = list.filter((item) => item.value !== null);
    if (variantsOf(known) > 1) conflicts.set(key, known);
  }

  const stableByKey = new Map();
  const stableErrors = [];
  for (const file of files) {
    for (const entry of file.stable) {
      const at = `${file.file}:${entry.line}`;
      stableByKey.set(entry.key, [...(stableByKey.get(entry.key) ?? []), { file: file.file, line: entry.line }]);
      const allowed = prefixesOf(file.file);
      if (!allowed.includes(entry.key.split(".")[0])) stableErrors.push(`stable key ${entry.key} (${at}) must start with its owner: ${allowed.join(" or ")}`);
      if (!entry.zh || !entry.en) stableErrors.push(`stable key ${entry.key} (${at}) needs both zh and en as non-empty literal text`);
      else if (placeholdersOf(entry.zh) !== placeholdersOf(entry.en)) stableErrors.push(`stable key ${entry.key} (${at}): zh and en use different {placeholders}`);
    }
  }
  for (const [key, list] of stableByKey) {
    if (list.length > 1) stableErrors.push(`stable key ${key} is defined ${list.length} times (${list.map((item) => `${item.file}:${item.line}`).join(", ")}); one key, one definition`);
  }

  const calls = files.flatMap((file) => file.calls);
  const dynamicCalls = files.flatMap((file) => file.dynamic);
  const missing = new Map();
  for (const call of calls) {
    const stable = STABLE_KEY.test(call.key) && !HAN.test(call.key);
    if (!stable && !HAN.test(call.key)) continue; // a name with no Chinese in it (Gmail, Google) reads the same in both languages
    const known = stable ? stableByKey.has(call.key) : byKey.has(call.key);
    if (!known) {
      const entry = missing.get(call.key) ?? { key: call.key, kind: stable ? "stable" : "text", sites: [] };
      entry.sites.push({ file: call.file, line: call.line });
      missing.set(call.key, entry);
    } else if (stable) {
      const owner = call.key.split(".")[0];
      if (!prefixesOf(call.file).includes(owner) && owner !== SHARED_OWNER) stableErrors.push(`${call.file}:${call.line} uses ${call.key}, which belongs to ${owner}; a key is used by its owner only (shared words are ${SHARED_OWNER}.*)`);
    }
  }

  // Dead: no source file mentions the key as a literal, and no built key (`jelly.status.${state}`) covers it.
  const mentions = new Set();
  for (const file of files) for (const text of file.mentions) mentions.add(text);
  const families = dynamicCalls.map((call) => call.prefix).filter((prefix) => prefix && prefix.endsWith(".") && STABLE_KEY.test(`${prefix}x`));
  const dead = [];
  for (const [key, list] of byKey) if (!mentions.has(key)) dead.push({ key, kind: "text", files: [...new Set(list.map((item) => item.file))] });
  for (const [key, list] of stableByKey) {
    if (!mentions.has(key) && !families.some((prefix) => key.startsWith(prefix))) dead.push({ key, kind: "stable", files: [...new Set(list.map((item) => item.file))] });
  }
  return { files, dictionaryFiles, entryCount, byKey, duplicated, conflicts, stableByKey, stableErrors, calls, dynamicCalls, missing, dead, unserved: unservedDictionaries(files) };
}

// ---- numbers for the gate and the report -----------------------------------------------------------------------------------------
const quote = (text) => JSON.stringify(text.length > 60 ? `${text.slice(0, 57)}…` : text);
const where = (sites, limit = 3) => `${sites.slice(0, limit).map((site) => `${site.file}:${site.line}`).join(", ")}${sites.length > limit ? ` and ${sites.length - limit} more` : ""}`;

/** The compact, serialisable result the metric hands to the gate (the scan itself rides along as a non-enumerable `detail`). */
export function summarise(scan) {
  const conflicts = {};
  for (const [key, list] of [...scan.conflicts].sort(([a], [b]) => a.localeCompare(b, "zh"))) conflicts[key] = variantsOf(list);
  const missing = [...scan.missing.values()].sort((a, b) => a.sites[0].file.localeCompare(b.sites[0].file) || a.sites[0].line - b.sites[0].line);
  const sameFileOnly = [...scan.conflicts.values()].filter((list) => new Set(list.map((item) => item.file)).size === 1).length;
  const result = {
    dictionaries: scan.dictionaryFiles.size,
    entries: scan.entryCount,
    distinctKeys: scan.byKey.size,
    duplicatedKeys: scan.duplicated.length,
    conflicts,
    conflictsInOneFile: sameFileOnly,
    stableKeys: scan.stableByKey.size,
    calls: scan.calls.length,
    callFiles: new Set(scan.calls.map((call) => call.file)).size,
    dynamicCalls: scan.dynamicCalls.length,
    deadKeys: scan.dead.length,
    missingKeys: missing.length,
    unservedDictionaries: scan.unserved.length,
    stableErrors: scan.stableErrors.length,
  };
  Object.defineProperty(result, "detail", { value: { scan, missing }, enumerable: false });
  return result;
}

// The dictionary nearest to the file that makes the call (same owner, longest shared directory), else the list of gaps.
const suggestDictionary = (scan, file) => {
  if (file.startsWith("apps/workbench/src/functions/") && scan.dictionaryFiles.has(FUNCTIONS_DICTIONARY)) return FUNCTIONS_DICTIONARY;
  const owner = ownerOf(file);
  const own = [...scan.dictionaryFiles].filter((candidate) => ownerOf(candidate) === owner);
  if (owner === "workbench" || !own.length) return scan.dictionaryFiles.has(GAP_DICTIONARY) ? GAP_DICTIONARY : own[0] ?? "the owner's dictionary";
  const shared = (candidate) => { const a = file.split("/"), b = candidate.split("/"); let n = 0; while (n < a.length - 1 && a[n] === b[n]) n++; return n; };
  const stem = (name) => path.posix.basename(name).split(/[-.]/)[0]; // tree-ui.ts goes with tree-en.ts
  const rank = (candidate) => [shared(candidate), Number(stem(candidate) === stem(file)), Number(/(^|\/)en\.ts$/.test(candidate))];
  return own.sort((a, b) => { const x = rank(a), y = rank(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || a.localeCompare(b); })[0];
};

export function missingErrors(result) {
  const { scan, missing } = result.detail;
  const lines = missing.slice(0, 200).map((item) => {
    const hint = item.kind === "stable" ? `define it with { zh, en } in the ${prefixesOf(item.sites[0].file)[0]} dictionary` : `add its English to ${suggestDictionary(scan, item.sites[0].file)}`;
    return `no English for ${quote(item.key)} (${where(item.sites)}); ${hint}`;
  });
  if (missing.length > 200) lines.push(`… and ${missing.length - 200} more missing keys (node scripts/gates/translations.mjs --missing)`);
  return lines;
}

export const unservedErrors = (result) => result.detail.scan.unserved.map((item) =>
  `dictionary ${item.name} (${item.file}:${item.line}) is not part of the English the Host serves, so its texts are never shown in English; import ${item.name} in ${SERVED_ROOT} (or in a dictionary that it imports) and spread it into ${SERVED_CATALOG}`);

/** The conflict rule: against the merge-base's (or the committed baseline's) key -> variants, nothing may be new or grow. */
export function conflictGrowth(head, reference) {
  const errors = [];
  for (const [key, count] of Object.entries(head.conflicts)) {
    const before = reference.conflicts[key] ?? 0;
    if (count <= before) continue;
    const variants = [...new Map((head.detail?.scan.conflicts.get(key) ?? []).map((item) => [item.value, item])).values()]
      .map((item) => `${quote(item.value)} (${item.file}:${item.line})`).join(" | ");
    errors.push(before
      ? `translation conflict grew: ${quote(key)} has ${count} different English texts, was ${before}: ${variants}`
      : `new translation conflict: ${quote(key)} is translated ${count} ways: ${variants}; keep one entry in the owner's dictionary, or give each meaning its own stable key`);
  }
  return errors;
}

// ---- the health-gate metric -------------------------------------------------------------------------------------------------------
/** `host` is what check-health-gates.mjs already has: isSource (which files are product source), requireShape and isRecord. */
export function createTranslationMetric(host) {
  return {
    id: "translations",
    measure: (snapshot) => summarise(scanTree(snapshot, host.isSource)),
    toBaseline: (result) => ({ translationConflictTotal: Object.keys(result.conflicts).length, translationConflicts: result.conflicts }),
    fromBaseline(json) {
      host.requireShape(host.isRecord(json.translationConflicts) && Object.values(json.translationConflicts).every(Number.isInteger), "translationConflicts");
      return { conflicts: json.translationConflicts };
    },
    absolute: (result) => [...missingErrors(result), ...unservedErrors(result), ...result.detail.scan.stableErrors],
    grew: (head, reference) => conflictGrowth(head, reference),
    lowered: (head, reference) => Object.keys(head.conflicts).length < Object.keys(reference.conflicts).length
      || Object.entries(head.conflicts).some(([key, count]) => reference.conflicts[key] !== undefined && count < reference.conflicts[key]),
    lines(head, reference, env) {
      const top = env.top ?? 10;
      const out = [`Translations: ${head.dictionaries} dictionaries, ${head.entries} entries (${head.distinctKeys} distinct keys, ${head.duplicatedKeys} defined more than once), ${head.stableKeys} stable keys`,
        `  ${head.calls} translator calls with a literal key in ${head.callFiles} files, ${head.dynamicCalls} dynamic calls`,
        `  missing English: ${head.missingKeys}; unserved dictionaries: ${head.unservedDictionaries}; stable-key problems: ${head.stableErrors}; dead keys (reported only): ${head.deadKeys}`,
        `  conflicting keys: ${Object.keys(head.conflicts).length}${head.conflictsInOneFile ? ` (${head.conflictsInOneFile} inside one file)` : ""}${reference ? `, base ${Object.keys(reference.conflicts).length}` : ""}; most variants first:`];
      const rows = Object.entries(head.conflicts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"));
      for (const [key, count] of rows.slice(0, top)) out.push(`  ${String(count).padStart(5)}${reference ? String(reference.conflicts[key] ?? "new").padStart(7) : ""}  ${quote(key)}`);
      if (rows.length > top) out.push(`  … ${rows.length - top} more (--top N, or node scripts/gates/translations.mjs --conflicts)`);
      return out;
    },
    summary: (result) => `${Object.keys(result.conflicts).length} translation conflicts, ${result.missingKeys} missing English, ${result.unservedDictionaries} unserved dictionaries`,
  };
}

// ---- command line ---------------------------------------------------------------------------------------------------------------------
const AREAS = /^(apps|horizontal|modules|packages|plugins|server|tooling)\//;
export const isProductSource = (file) => AREAS.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts")
  && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);

export function workingTreeSnapshot(root) {
  const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  return { files, read: (file) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } } };
}

// How entangled each owner is with the others, to choose which one moves to stable keys first (apps/workbench/README.md).
export function ownerTable(scan) {
  const definedBy = new Map(), calledBy = new Map(), own = new Map();
  const bump = (map, key, owner) => map.set(key, (map.get(key) ?? new Set()).add(owner));
  const row = (owner) => own.get(owner) ?? own.set(owner, { owner, files: new Set(), calls: 0, embedded: 0, dynamic: 0, keys: new Set(), dictionary: new Set(), conflicts: 0, dead: 0, missing: 0 }).get(owner);
  for (const file of scan.files) for (const entry of file.entries) { bump(definedBy, entry.key, ownerOf(file.file)); row(ownerOf(file.file)).dictionary.add(entry.key); }
  for (const call of scan.calls) {
    const data = row(ownerOf(call.file));
    data.files.add(call.file); data.calls++; data.keys.add(call.key); if (call.embedded) data.embedded++;
    bump(calledBy, call.key, ownerOf(call.file));
  }
  for (const call of scan.dynamicCalls) row(ownerOf(call.file)).dynamic++;
  for (const key of scan.conflicts.keys()) for (const owner of definedBy.get(key) ?? []) row(owner).conflicts++;
  for (const item of scan.dead) for (const owner of new Set(item.files.map(ownerOf))) row(owner).dead++;
  for (const item of scan.missing.values()) row(ownerOf(item.sites[0].file)).missing++;
  return [...own.values()].map((data) => {
    const called = [...data.keys].filter((key) => HAN.test(key));
    return {
      owner: data.owner, files: data.files.size, calls: data.calls, embedded: data.embedded, dynamic: data.dynamic,
      keys: called.length, dictionary: data.dictionary.size,
      // keys it uses that another owner's dictionary defines: they need their own entries when the file moves
      foreign: called.filter((key) => !data.dictionary.has(key)).length,
      // keys of its own dictionary that another owner's code also uses: they stay until that code moves too
      usedByOthers: [...data.dictionary].filter((key) => [...(calledBy.get(key) ?? [])].some((owner) => owner !== data.owner)).length,
      conflicts: data.conflicts, dead: data.dead, missing: data.missing,
    };
  }).sort((a, b) => a.calls - b.calls || a.owner.localeCompare(b.owner));
}

export function main(argv) {
  const flags = new Set();
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--root") root = path.resolve(argv[++index]);
    else if (["--missing", "--conflicts", "--dead", "--calls", "--owners", "--json"].includes(argv[index])) flags.add(argv[index]);
    else { console.error(`unknown argument ${argv[index]}\nusage: translations.mjs [--root <dir>] [--missing] [--conflicts] [--dead] [--calls] [--owners] [--json]`); return 2; }
  }
  const scan = scanTree(workingTreeSnapshot(root), isProductSource);
  const result = summarise(scan);
  if (flags.has("--json")) { console.log(JSON.stringify(result, null, 2)); return 0; }
  console.log(createTranslationMetric({ isSource: isProductSource }).lines(result, undefined, { top: 0 }).slice(0, 4).join("\n"));
  if (flags.has("--missing")) for (const line of [...missingErrors(result), ...unservedErrors(result)]) console.log(`missing: ${line}`);
  if (flags.has("--conflicts")) {
    for (const [key, list] of [...scan.conflicts].sort(([a], [b]) => a.localeCompare(b, "zh"))) {
      console.log(`\n${quote(key)}: ${variantsOf(list)} English texts`);
      for (const item of list) console.log(`    ${item.file}:${item.line}  ${quote(item.value)}`);
    }
  }
  if (flags.has("--dead")) for (const item of scan.dead) console.log(`dead: ${quote(item.key)}  ${item.files.join(", ")}`);
  if (flags.has("--calls")) for (const call of scan.calls) console.log(`${call.file}:${call.line}  ${call.callee}(${JSON.stringify(call.key)})`);
  if (flags.has("--owners")) {
    const columns = ["files", "calls", "embedded", "dynamic", "keys", "dictionary", "foreign", "usedByOthers", "conflicts", "dead", "missing"];
    console.log(`\n${"owner".padEnd(16)}${columns.map((name) => name.padStart(13)).join("")}`);
    for (const row of ownerTable(scan)) console.log(`${row.owner.padEnd(16)}${columns.map((name) => String(row[name]).padStart(13)).join("")}`);
    console.log("\nembedded: calls inside browser scripts; foreign: keys it uses that another owner's dictionary defines; usedByOthers: keys of its own dictionary another owner also uses.");
  }
  return result.missingKeys || result.unservedDictionaries || result.stableErrors ? 1 : 0;
}

// exitCode, not exit(): a pipe is not drained when the process exits at once, and --dead is long.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
