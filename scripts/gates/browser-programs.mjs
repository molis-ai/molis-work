// Expand browser program syntax and keep each piece's source owner. No repository function is executed.
import ts from "typescript";
import { createBrowserGraph, unwrapBrowserNode as unwrap, browserName } from "./browser-graph.mjs";

const SCRIPT_NAME = /(?:^|_)(?:SCRIPT|CLIENT)(?:$|_FACTORY$)|^CLIENT$/;
const piece = (node, text) => ({ file: node.getSourceFile().fileName, start: node.getStart(), text });
const where = (node) => {
  const tree = node.getSourceFile(), at = tree.getLineAndCharacterOfPosition(node.getStart());
  return `${tree.fileName}:${at.line + 1}:${at.character + 1}`;
};
const combine = (left, right) => {
  left = uniqueVariants(left); right = uniqueVariants(right);
  if (left.length * right.length > 64) throw new Error("more than 64 static program alternatives");
  return uniqueVariants(left.flatMap((a) => right.map((b) => [...a, ...b])));
};
const uniqueVariants = (variants) => [...new Map(variants.map((parts) => [JSON.stringify(parts.filter((part) => part.text !== "")), parts])).values()];
const textOf = (parts) => parts.map((item) => item.text).join("");
const literal = (node) => ts.isStringLiteralLike(node) || ts.isNumericLiteral(node);
const dataCall = (node) => /^(?:JSON\.stringify|(?:\w+\.)?(?:L|translate|escapeHtml|escape|icon|renderIcon|htmlAttribute|String|encodeURIComponent))$/.test(node.expression.getText());

export function browserPrograms(snapshot, isSource) {
  const graph = createBrowserGraph(snapshot, isSource), candidates = [], problems = [];
  let dependencies = new Set();
  const evaluating = new Set(), propertyStack = new Set();
  const fail = (node, reason) => { throw new Error(`${where(node)}: cannot statically expand browser program (${reason})`); };
  const evaluateFunction = (binding, args, env) => {
    const target = unwrap(binding.value); if (!target || !graph.isFunction(target)) return null;
    const next = new Map(env);
    target.parameters.forEach((parameter, index) => { if (args[index]) next.set(parameter, { node: args[index], env }); });
    if (!target.body) return fail(target, "function has no implementation");
    if (!ts.isBlock(target.body)) return evaluate(target.body, next);
    const returns = target.body.statements.filter(ts.isReturnStatement).filter((item) => item.expression);
    if (!returns.length) return null;
    return returns.flatMap((item) => evaluate(item.expression, next));
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
    if (ts.isConditionalExpression(node)) return [...evaluate(node.whenTrue, env), ...evaluate(node.whenFalse, env)];
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
      if (dataCall(node)) return [[piece(node, node.expression.getText() === "JSON.stringify" ? "null" : "molis_dynamic_value")]];
      if (ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text, receiver = unwrap(node.expression.expression);
        if (method === "toString") {
          const binding = graph.lookup(receiver), target = unwrap(binding?.value ?? receiver);
          if (!target || !graph.isFunction(target)) return fail(node, "toString receiver is not a declared function");
          dependencies.add(binding?.node ?? target);
          return stringifyFunction(target);
        }
        if (method === "join") {
          const value = ts.isArrayLiteralExpression(receiver) ? receiver : unwrap(graph.lookup(receiver)?.value);
          if (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)
            && ["map", "flatMap"].includes(receiver.expression.name.text)) return evaluateArrayCallback(receiver, env);
          if (!value || !ts.isArrayLiteralExpression(value)) return fail(node, "join receiver is not a static array");
          const separator = node.arguments.length ? textOf(evaluate(node.arguments[0], env)[0]) : ",";
          let result = [[]];
          for (const [index, item] of value.elements.entries()) {
            if (index) result = combine(result, [[piece(node, separator)]]);
            result = combine(result, evaluate(item, env));
          }
          return result;
        }
        if (["replace", "replaceAll"].includes(method)) return evaluate(receiver, env); // Keep original statements while ignoring formatting.
      }
      const binding = graph.lookup(node.expression);
      if (binding && graph.isFunction(unwrap(binding.value))) {
        const target = unwrap(binding.value);
        // Compiler indentation compaction preserves the program's statements. Keep the unformatted syntax.
        if (target.body?.getText().includes(".replace(") && target.parameters.length === 1) return evaluate(node.arguments[0], env);
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
  const evaluateArrayCallback = (node, env) => {
    const callback = node.arguments[0]; if (!callback || !graph.isFunction(callback)) return fail(node, "array callback is not declared syntax");
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
      const value = html && (!inScript || dataScript) ? [[piece(span.expression, "molis_dynamic_value")]] : evaluate(span.expression, env);
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
  return { programs, typed: [...typed].map((file) => graph.entries.get(file)), problems };
}
