// Expand browser program syntax and keep each piece's source owner. No repository function is executed.
import path from "node:path";
import ts from "typescript";
import { createBrowserGraph, unwrapBrowserNode as unwrap, browserName } from "./browser-graph.mjs";

const SCRIPT_NAME = /(?:^|_)(?:SCRIPT|CLIENT)(?:$|_FACTORY$)|^CLIENT$/;
const MAX_ALTERNATIVES = 256;
const piece = (node, text) => ({ file: node.getSourceFile().fileName, start: node.getStart(), text });
const where = (node) => {
  const tree = node.getSourceFile(), at = tree.getLineAndCharacterOfPosition(node.getStart());
  return `${tree.fileName}:${at.line + 1}:${at.character + 1}`;
};
const combine = (left, right) => {
  left = uniqueVariants(left); right = uniqueVariants(right);
  if (left.length * right.length > MAX_ALTERNATIVES) throw new Error(`more than ${MAX_ALTERNATIVES} static program alternatives`);
  return uniqueVariants(left.flatMap((a) => right.map((b) => [...a, ...b])));
};
const uniqueVariants = (variants) => [...new Map(variants.map((parts) => [JSON.stringify([textOf(parts),
  parts.filter((part) => part.text.trim() !== "" && !["null", "molis_dynamic_value"].includes(part.text))]), parts])).values()];
const textOf = (parts) => parts.map((item) => item.text).join("");
const literal = (node) => ts.isStringLiteralLike(node) || ts.isNumericLiteral(node);
const dataCall = (node) => /^(?:JSON\.stringify|(?:\w+\.)?(?:L|translate|escapeHtml|escape|icon|renderIcon|htmlAttribute|encodeURIComponent))$/.test(node.expression.getText());
const DATA_SLOT = Symbol("browser data interpolation");
const insideString = (prefix) => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, prefix);
  let token;
  while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if ([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral].includes(token) && scanner.isUnterminated()) return true;
  }
  return false;
};
const indentationOnly = (node) => ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
  && node.expression.name.text === "replace" && node.arguments.length === 2
  && node.arguments[0].getText() === "/\\n[ \\t]+/g" && ts.isStringLiteralLike(node.arguments[1]) && node.arguments[1].text === "\n";
const FORMATTING_PATTERNS = new Map([
  ["/\\n[ \\t]+/g", /\n[ \t]+/g], ["/^[ \\t]*\\/\\/.*\\n/gm", /^[ \t]*\/\/.*\n/gm],
  ["/^[ \\t]+/gm", /^[ \t]+/gm], ["/^  /gm", /^  /gm],
  [String.raw`/^[ \t]*(?:\/\/[^\n]*|\/\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*)\n/gm`, /^[ \t]*(?:\/\/[^\n]*|\/\*(?:(?!\*\/)[\s\S])*\*\/[ \t]*)\n/gm],
]);
// Recognize only the pure line compactor used by current program producers; do not execute repository functions.
const lineCompactor = (target, body) => {
  if (target.parameters.length !== 1 || !ts.isIdentifier(target.parameters[0].name)) return false;
  const argument = target.parameters[0].name.text;
  if (!body) return false;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, body.getText());
  let text = "", token;
  while ((token = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) text += scanner.getTokenText();
  return text === `${argument}.split("\\n").map(line=>line.trimStart()).filter(line=>line&&!line.startsWith("//")).join("\\n")`;
};
const compactLines = (parts) => {
  const text = textOf(parts), kept = []; let offset = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trimStart(), padding = line.length - trimmed.length;
    if (trimmed && !trimmed.startsWith("//")) {
      if (kept.length) kept.push(...sliceParts(parts, offset - 1, offset));
      kept.push(...sliceParts(parts, offset + padding, offset + line.length));
    }
    offset += line.length + 1;
  }
  return kept;
};
const sliceParts = (parts, begin, end) => {
  let offset = 0; const result = [];
  for (const part of parts) {
    const from = Math.max(0, begin - offset), to = Math.min(part.text.length, end - offset);
    if (to > from) result.push({ ...part, start: part.start + from, text: part.text.slice(from, to) });
    offset += part.text.length;
  }
  return result;
};
const replaceParts = (parts, node, pattern, replacement, all) => {
  const text = textOf(parts), matches = [];
  if (pattern instanceof RegExp) matches.push(...text.matchAll(pattern));
  else for (let start = 0; start <= text.length;) {
    const index = text.indexOf(pattern, start); if (index < 0) break;
    matches.push({ index, 0: pattern }); if (!all) break; start = index + Math.max(1, pattern.length);
  }
  let cursor = 0; const result = [];
  for (const match of matches) {
    result.push(...sliceParts(parts, cursor, match.index));
    if (replacement !== "") result.push(piece(node.arguments[1], replacement));
    cursor = match.index + match[0].length;
  }
  result.push(...sliceParts(parts, cursor, text.length)); return result;
};

// A program the package bundles from TypeScript (as Forms does, plugins/native/form/src/browser/): the source reads the bundle
// with `readFileSync(new URL("./<name>.js", import.meta.url), "utf8")`, and the package's build script makes `dist/<name>.js`
// with `esbuild <entry> … --outfile=dist/<name>.js`. The program is then the entry and what it imports, read as typed source.
const BUNDLE_STEP = /(?:^|[\s&;/])esbuild\s+(\S+\.ts)\b[^&;]*?--outfile=(\S+\.js)/g;
const bundleEntry = (graph, node) => {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "readFileSync" || node.arguments.length !== 2) return null;
  const [url, encoding] = node.arguments.map(unwrap);
  if (!ts.isStringLiteralLike(encoding) || encoding.text !== "utf8" || !ts.isNewExpression(url) || url.expression.getText() !== "URL"
    || url.arguments?.length !== 2 || !ts.isStringLiteralLike(url.arguments[0]) || url.arguments[1].getText() !== "import.meta.url") return null;
  const file = node.getSourceFile().fileName;
  for (const { dir, json } of graph.packages.values()) {
    if (!file.startsWith(dir + "/src/")) continue;
    const bundle = path.posix.normalize(path.posix.join(path.posix.dirname(dir + "/dist/" + file.slice(dir.length + 5)), url.arguments[0].text));
    for (const [, entry, outfile] of String(json.scripts?.build ?? "").matchAll(BUNDLE_STEP)) {
      if (path.posix.join(dir, outfile) === bundle && graph.entries.has(path.posix.join(dir, entry))) return path.posix.join(dir, entry);
    }
  }
  return null;
};

export function browserPrograms(snapshot, isSource) {
  const graph = createBrowserGraph(snapshot, isSource), candidates = [], problems = [], bundled = new Set();
  let dependencies = new Set();
  const evaluating = new Set(), propertyStack = new Set();
  const fail = (node, reason) => { throw new Error(`${where(node)}: cannot statically expand browser program (${reason})`); };
  const evaluateFunction = (binding, args, env) => {
    const target = unwrap(binding.value); if (!target || !graph.isFunction(target)) return null;
    const next = new Map(env);
    target.parameters.forEach((parameter, index) => { if (args[index]) next.set(parameter, { node: args[index], env }); });
    if (!target.body) return fail(target, "function has no implementation");
    if (!ts.isBlock(target.body)) return evaluate(target.body, next);
    const returns = [];
    const collect = (node) => {
      if (ts.isReturnStatement(node) && node.expression) returns.push(node);
      if (node !== target.body && graph.isFunction(node)) return;
      ts.forEachChild(node, collect);
    };
    collect(target.body);
    if (!returns.length) return null;
    return returns.flatMap((item) => evaluate(item.expression, next));
  };
  const staticValue = (expression, env, immutableOnly = false) => {
    let value = unwrap(expression); const seen = new Set();
    while (value && ts.isIdentifier(value)) {
      const binding = graph.lookup(value); if (!binding || seen.has(binding.node)) break;
      seen.add(binding.node);
      if (immutableOnly && reassigned(binding.node)) return undefined;
      const argument = env.get(binding.node);
      if (argument) { value = unwrap(argument.node); env = argument.env; }
      else if (binding.value && (!immutableOnly || graph.isFunction(binding.value)
        || ts.isVariableDeclaration(binding.node) && ts.isVariableDeclarationList(binding.node.parent)
          && (binding.node.parent.flags & ts.NodeFlags.Const) !== 0)) value = unwrap(binding.value);
      else break;
    }
    return value;
  };
  const reassigned = (declaration) => {
    let changed = false;
    const assigned = (target) => {
      target = unwrap(target); if (!target) return;
      if (ts.isIdentifier(target) && graph.lookup(target)?.node === declaration) changed = true;
      else if (ts.isArrayLiteralExpression(target) || ts.isObjectLiteralExpression(target)) ts.forEachChild(target, assigned);
      else if (ts.isPropertyAssignment(target) || ts.isShorthandPropertyAssignment(target)) assigned(ts.isPropertyAssignment(target) ? target.initializer : target.name);
      else if (ts.isSpreadElement(target) || ts.isSpreadAssignment(target)) assigned(target.expression);
    };
    const visit = (at) => {
      if (ts.isBinaryExpression(at) && at.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && at.operatorToken.kind <= ts.SyntaxKind.LastAssignment) assigned(at.left);
      if ((ts.isPrefixUnaryExpression(at) || ts.isPostfixUnaryExpression(at))
        && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(at.operator)) assigned(at.operand);
      if (ts.isForInStatement(at) || ts.isForOfStatement(at)) assigned(at.initializer);
      ts.forEachChild(at, visit);
    };
    visit(declaration.getSourceFile()); return changed;
  };
  const evaluate = (expression, env = new Map()) => {
    const node = unwrap(expression); if (!node) return [[]];
    if (literal(node)) return [[piece(node, node.text)]];
    if ([ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return [[piece(node, node.getText())]];
    if (ts.isIdentifier(node)) {
      const binding = graph.lookup(node);
      if (!binding) return graph.properties.has(node.text) ? evaluateProperty(node.text, node, env) : fail(node, `unresolved ${node.text}`);
      if (env.has(binding.node)) { const supplied = env.get(binding.node); return evaluate(supplied.node, supplied.env); }
      if (evaluating.has(binding.node)) return fail(node, `cycle at ${node.text}`);
      dependencies.add(binding.node); evaluating.add(binding.node);
      try {
        if (binding.value) return evaluate(binding.value, env);
        if (binding.property) return evaluateProperty(binding.property, node, env);
        return fail(node, `dynamic ${node.text}`);
      } finally { evaluating.delete(binding.node); }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const binding = graph.lookup(node);
      if (binding?.value) return evaluate(binding.value, env);
      return evaluateProperty(node.name.text, node, env);
    }
    if (graph.isFunction(node)) return stringifyFunction(node);
    if (ts.isConditionalExpression(node)) {
      const condition = unwrap(node.condition);
      if (ts.isBinaryExpression(condition) && condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
        && ts.isTypeOfExpression(condition.left) && ts.isStringLiteral(condition.right) && condition.right.text === "string") {
        const value = staticValue(condition.left.expression, env, true);
        if (value && (ts.isStringLiteralLike(value) || ts.isTemplateExpression(value))) return evaluate(node.whenTrue, env);
        if (value && (graph.isFunction(value) || ts.isNumericLiteral(value)
          || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(value.kind))) return evaluate(node.whenFalse, env);
      }
      return [...evaluate(node.whenTrue, env), ...evaluate(node.whenFalse, env)];
    }
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) return combine(evaluate(node.left, env), evaluate(node.right, env));
      if ([ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) return [...evaluate(node.left, env), ...evaluate(node.right, env)];
      const a = Number(textOf(evaluate(node.left, env)[0])), b = Number(textOf(evaluate(node.right, env)[0]));
      const operations = { [ts.SyntaxKind.AsteriskToken]: () => a * b, [ts.SyntaxKind.SlashToken]: () => a / b,
        [ts.SyntaxKind.MinusToken]: () => a - b, [ts.SyntaxKind.LessThanLessThanToken]: () => a << b };
      if (operations[node.operatorToken.kind] && Number.isFinite(a) && Number.isFinite(b)) return [[piece(node, String(operations[node.operatorToken.kind]()))]];
    }
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText() === "String.raw") return evaluateTemplate(node.template, env, true);
    if (ts.isTemplateExpression(node)) return evaluateTemplate(node, env, false);
    if (ts.isCallExpression(node)) {
      const bundle = bundleEntry(graph, node);
      // The bundle's text is not read here; `null` holds its place as an expression.
      if (bundle) { bundled.add(bundle); return [[piece(node, "null")]]; }
      if (node.expression.getText() === "String") return node.arguments.length === 1 ? evaluate(node.arguments[0], env) : fail(node, "String needs one static argument");
      if (dataCall(node)) {
        if (node.expression.getText() === "JSON.stringify") {
          const argument = unwrap(node.arguments[0]), declared = argument && graph.lookup(argument)?.value, value = unwrap(declared ?? argument);
          return [[piece(node, value && literal(value) ? JSON.stringify(ts.isNumericLiteral(value) ? Number(value.text) : value.text) : "null")]];
        }
        if (env.get(DATA_SLOT)) return [[piece(node, "molis_dynamic_value")]];
        return fail(node, "a data formatter cannot be treated as executable program text");
      }
      if (ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text, receiver = unwrap(node.expression.expression);
        // Surrounding whitespace is not program syntax.
        if (method === "trim" && !node.arguments.length) return evaluate(receiver, env);
        if (method === "toString") {
          const target = staticValue(receiver, env);
          if (!target || !graph.isFunction(target)) return fail(node, "toString receiver is not a declared function");
          dependencies.add(graph.lookup(receiver)?.node ?? target);
          return stringifyFunction(target);
        }
        if (method === "join") {
          const value = ts.isArrayLiteralExpression(receiver) ? receiver : unwrap(graph.lookup(receiver)?.value);
          if (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)
            && ["map", "flatMap"].includes(receiver.expression.name.text)) return evaluateArrayCallback(receiver, env, node);
          if (!value || !ts.isArrayLiteralExpression(value)) return fail(node, "join receiver is not a static array");
          const separators = node.arguments.length ? evaluate(node.arguments[0], env) : [[piece(node, ",")]];
          let result = [[]];
          for (const [index, item] of value.elements.entries()) {
            if (index) result = combine(result, separators);
            result = combine(result, evaluate(item, env));
          }
          return result;
        }
        if (["replace", "replaceAll"].includes(method)) {
          if (node.arguments.length !== 2 || !ts.isStringLiteralLike(node.arguments[1])) return fail(node, "unsupported program replacement");
          const search = ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : FORMATTING_PATTERNS.get(node.arguments[0].getText());
          const replacement = node.arguments[1].text;
          if (search === undefined || replacement.includes("$")) return fail(node, "unsupported program replacement");
          return evaluate(receiver, env).map((parts) => replaceParts(parts, node, search, replacement, method === "replaceAll"));
        }
      }
      const binding = graph.lookup(node.expression);
      if (binding && graph.isFunction(unwrap(binding.value))) {
        const target = unwrap(binding.value);
        // Compiler indentation compaction preserves the program's statements. Keep the unformatted syntax.
        const body = target.body && ts.isBlock(target.body) && target.body.statements.length === 1 && ts.isReturnStatement(target.body.statements[0])
          ? target.body.statements[0].expression : target.body;
        if (body && lineCompactor(target, body) && node.arguments[0]) return evaluate(node.arguments[0], env).map(compactLines);
        if (body && indentationOnly(body) && target.parameters.length === 1 && ts.isIdentifier(body.expression.expression)
          && body.expression.expression.text === browserName(target.parameters[0].name)) return evaluate(node.arguments[0], env);
        const result = evaluateFunction(binding, node.arguments, env); if (result) return result;
      }
      const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : browserName(node.expression);
      if (name && graph.properties.has(name)) {
        const result = [];
        for (const value of graph.properties.get(name)) {
          const owner = graph.lookup(value), target = owner?.value ?? value;
          if (graph.isFunction(unwrap(target))) result.push(...(evaluateFunction({ value: target }, node.arguments, env) ?? []));
        }
        if (result.length) return uniqueVariants(result);
      }
      return fail(node, `unsupported call ${node.expression.getText()}`);
    }
    return fail(node, ts.SyntaxKind[node.kind]);
  };
  const evaluateProperty = (name, node, env) => {
    if (propertyStack.has(name)) return fail(node, `cycle at property ${name}`);
    const values = graph.properties.get(name); if (!values?.length) return fail(node, `unresolved property ${name}`);
    propertyStack.add(name); const result = [];
    try {
      for (const value of values) {
        try { result.push(...evaluate(value, env)); }
        catch (error) { if (!error.message.includes("cycle at")) throw error; }
      }
    } finally { propertyStack.delete(name); }
    return result.length ? uniqueVariants(result) : fail(node, `cycle at property ${name}`);
  };
  const evaluateArrayCallback = (node, env, joined) => {
    const callback = node.arguments[0]; if (!callback || !graph.isFunction(callback)) return fail(node, "array callback is not declared syntax");
    const receiver = staticValue(node.expression.expression, env), parameter = callback.parameters[0];
    if (receiver && ts.isArrayLiteralExpression(receiver) && !ts.isBlock(callback.body)) {
      const separators = joined.arguments.length ? evaluate(joined.arguments[0], env) : [[piece(joined, ",")]];
      let result = [[]];
      for (const [index, item] of receiver.elements.entries()) {
        if (index) result = combine(result, separators);
        const next = new Map(env); if (parameter) next.set(parameter, { node: item, env });
        result = combine(result, evaluate(callback.body, next));
      }
      return result;
    }
    const values = [];
    const visit = (at) => {
      if (ts.isCallExpression(at) && ts.isPropertyAccessExpression(at.expression) && at.expression.name.text === "push") values.push(...at.arguments);
      ts.forEachChild(at, visit);
    };
    visit(callback.body);
    if (!values.length && !ts.isBlock(callback.body)) values.push(callback.body);
    if (!values.length) return fail(node, "array callback does not return static program pieces");
    return values.flatMap((value) => evaluate(value, env));
  };
  const stringifyFunction = (target) => {
    const source = target.getText().replace(/^(?:export\s+|default\s+)*/, "");
    const result = ts.transpileModule(`const __browserFunction = (${source});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: false } });
    return [[piece(target, result.outputText.replace(/^const __browserFunction = /, "").replace(/;\s*$/, ""))]];
  };
  const templatePart = (node, raw) => raw ? node.rawText ?? node.text : node.text;
  const evaluateTemplate = (node, env, raw, html = false) => {
    if (ts.isNoSubstitutionTemplateLiteral(node)) return [[piece(node, templatePart(node, raw))]];
    let result = [[piece(node.head, templatePart(node.head, raw))]];
    for (const span of node.templateSpans) {
      const prefix = textOf(result[0]), opening = prefix.lastIndexOf("<script"), closing = prefix.lastIndexOf("</script");
      const inScript = opening > closing && prefix.indexOf(">", opening) >= 0;
      const tag = inScript ? prefix.slice(opening, prefix.indexOf(">", opening) + 1) : "";
      const dataScript = /\btype\s*=\s*["'](?:application\/json|text\/plain)/i.test(tag);
      const dataEnv = new Map(env); dataEnv.set(DATA_SLOT, insideString(html ? prefix.slice(prefix.indexOf(">", opening) + 1) : prefix));
      const value = html && (!inScript || dataScript) ? [[piece(span.expression, "molis_dynamic_value")]] : evaluate(span.expression, dataEnv);
      result = combine(combine(result, value), [[piece(span.literal, templatePart(span.literal, raw))]]);
    }
    return result;
  };
  for (const entry of graph.entries.values()) {
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && node.initializer && SCRIPT_NAME.test(browserName(node.name) ?? "") && !/STYLES|STYLE|PATH|URL/.test(browserName(node.name))) {
        candidates.push({ node, value: node.initializer, html: false });
      } else if ((ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) && /<script\b/i.test(node.getText())) {
        candidates.push({ node, value: node, html: true });
      }
      ts.forEachChild(node, visit);
    };
    visit(entry.tree);
  }
  const expanded = [];
  for (const candidate of candidates) {
    dependencies = new Set();
    try {
      const value = candidate.value;
      const variants = candidate.html && ts.isTemplateExpression(value) ? evaluateTemplate(value, new Map(), false, true) : evaluate(value);
      expanded.push({ ...candidate, variants, dependencies });
    }
    catch (error) { problems.push(`${where(candidate.node)}: ${error.message}`); }
  }
  // A joined program owns the syntax; its fragments need not parse on their own. Each source piece keeps its own owner.
  const roots = expanded.filter((candidate) => candidate.html || !expanded.some((other) => other !== candidate && other.dependencies.has(candidate.node)));
  const programs = [];
  for (const root of roots) for (const parts of root.variants) {
    const text = textOf(parts);
    if (!root.html) { programs.push({ text, parts, where: where(root.node) }); continue; }
    const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    for (const match of text.matchAll(pattern)) {
      if (/\bsrc\s*=|\btype\s*=\s*["'](?:application\/json|text\/plain)/i.test(match[1])) continue;
      const begin = match.index + match[0].indexOf(">") + 1, end = begin + match[2].length;
      let offset = 0; const body = [];
      for (const item of parts) {
        const from = Math.max(0, begin - offset), to = Math.min(item.text.length, end - offset);
        if (to > from) body.push({ ...item, start: item.start + from, text: item.text.slice(from, to) });
        offset += item.text.length;
      }
      programs.push({ text: match[2], parts: body, where: where(root.node) });
    }
  }
  const typed = new Set(), visitTyped = (file) => {
    if (typed.has(file)) return; const entry = graph.entries.get(file); if (!entry) return;
    typed.add(file); for (const dependency of entry.imports) visitTyped(dependency);
  };
  for (const entry of graph.entries.values()) if (/^apps\/workbench\/src\/.*(?:terminal-client|browser-client)\.ts$/.test(entry.file)) visitTyped(entry.file);
  for (const file of bundled) visitTyped(file);
  return { programs, typed: [...typed].map((file) => graph.entries.get(file)), problems };
}
