// Static esbuild bundle-step resolution for browser programs (W4-04, 102-1 P2-4).
// Reads only package.json build commands and tooling/build-*.mjs ASTs; never executes repository code.
import path from "node:path";
import ts from "typescript";
import { browserName, unwrapBrowserNode as unwrap } from "./browser-graph.mjs";

const BUNDLE_STEP = /(?:^|[\s&;|/])esbuild\s+(\S+\.ts)\b[^&;|]*?--outfile=(\S+\.js)(?=[\s&;|]|$)/g;
const ANY_ESBUILD_CLI = /(?:^|[\s&;|/])esbuild(?=\s|$)/g;
const DANGEROUS_ESBUILD_CLI = /--(?:outdir|inject|alias|abs-working-dir|tsconfig)(?:[:=\s]|$)/;
const BUILD_SCRIPT_PATH = /(?:^|[\s&;|"'])(?:\.\/)?((?:[^\s"'&;|]*\/)?tooling\/build-[^"'\s&;|]+\.mjs)(?=[\s"'&;|]|$)/g;
const ESBUILD_BUILD_FNS = new Set(["build", "buildSync", "context"]);
const ESBUILD_SAFE_FNS = new Set(["transform", "transformSync", "formatMessages", "formatMessagesSync", "analyzeMetafile", "analyzeMetafileSync"]);
const ESBUILD_BENIGN_NAMED = new Set([...ESBUILD_SAFE_FNS, "version", "stop", "initialize"]);
const OPAQUE_ESBUILD_OPTIONS = new Set(["__proto__", "plugins", "inject", "alias", "absWorkingDir", "tsconfig", "tsconfigRaw", "nodePaths", "stdin"]);
const OPAQUE_BUILTIN_PROPS = new Set(["getBuiltinModule", "binding", "_linkedBinding"]);
const MAX_BUILD_EXPANSIONS = 1024;
const INVALID = Symbol("invalid-static-option");

const isEsbuildSpec = (spec) => typeof spec === "string" && (
  spec === "esbuild"
  || spec.startsWith("esbuild/")
  || /(?:^|\/)node_modules\/esbuild(?:\/|$)/.test(spec)
  || /(?:^|\/)esbuild\/lib\/main\.[cm]?js$/.test(spec)
);

const isOpaqueModuleSpec = (spec) => typeof spec === "string" && (
  spec === "module" || spec === "node:module" || /^data:/i.test(spec) || isEsbuildSpec(spec)
);

const isFn = (node) => Boolean(node) && (
  ts.isFunctionDeclaration(node)
  || ts.isFunctionExpression(node)
  || ts.isArrowFunction(node)
  || ts.isMethodDeclaration(node)
  || ts.isConstructorDeclaration(node)
  || ts.isGetAccessorDeclaration(node)
  || ts.isSetAccessorDeclaration(node)
);

const isWrapper = (node) => Boolean(node) && (
  ts.isParenthesizedExpression(node)
  || ts.isAsExpression(node)
  || ts.isSatisfiesExpression(node)
  || ts.isNonNullExpression(node)
  || ts.isTypeAssertionExpression(node)
);

const outerExpr = (node) => {
  let current = node;
  while (current.parent && isWrapper(current.parent)) current = current.parent;
  return current;
};

const isPrimitiveLiteral = (node) => Boolean(node) && (
  ts.isStringLiteralLike(node)
  || ts.isNumericLiteral(node)
  || node.kind === ts.SyntaxKind.TrueKeyword
  || node.kind === ts.SyntaxKind.FalseKeyword
);

const scopeOf = (node) => {
  for (let at = node.parent; at; at = at.parent) {
    if (
      ts.isSourceFile(at)
      || ts.isBlock(at)
      || ts.isCaseBlock(at)
      || ts.isCatchClause(at)
      || ts.isClassStaticBlockDeclaration(at)
      || isFn(at)
      || ts.isForOfStatement(at)
      || ts.isForInStatement(at)
      || ts.isForStatement(at)
    ) {
      return at;
    }
  }
  return node.getSourceFile();
};

const varScopeOf = (node) => {
  for (let at = node.parent; at; at = at.parent) {
    if (ts.isSourceFile(at) || ts.isClassStaticBlockDeclaration(at)) return at;
    if (isFn(at)) return at.body && ts.isBlock(at.body) ? at.body : at;
  }
  return node.getSourceFile();
};

const staticPropName = (name) => {
  const plain = browserName(name);
  if (plain !== null) return plain;
  if (ts.isComputedPropertyName(name)) {
    const inner = unwrap(name.expression);
    if (inner && ts.isStringLiteralLike(inner)) return inner.text;
  }
  return null;
};

const hasAccessorInSubtree = (root) => {
  let found = false;
  const walk = (node) => {
    if (found) return;
    if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(root);
  return found;
};

const isDeclarationIdentifier = (node) => {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isImportClause(parent) || ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent)) return true;
  if ((
    ts.isVariableDeclaration(parent)
    || ts.isParameter(parent)
    || ts.isBindingElement(parent)
    || ts.isFunctionDeclaration(parent)
    || ts.isFunctionExpression(parent)
    || ts.isClassDeclaration(parent)
    || ts.isClassExpression(parent)
  ) && parent.name === node) return true;
  if ((
    ts.isPropertyAssignment(parent)
    || ts.isPropertyDeclaration(parent)
    || ts.isMethodDeclaration(parent)
    || ts.isGetAccessorDeclaration(parent)
    || ts.isSetAccessorDeclaration(parent)
  ) && parent.name === node) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if ((ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node) return true;
  return false;
};

function collectScriptBindings(tree) {
  const scopes = new WeakMap();
  const constDecls = new Set();
  let opaque = false;

  const put = (scope, name, binding) => {
    if (!name) return;
    let map = scopes.get(scope);
    if (!map) {
      map = new Map();
      scopes.set(scope, map);
    }
    if (map.has(name)) {
      opaque = true;
      return;
    }
    map.set(name, binding);
  };

  const lookup = (node) => {
    const id = unwrap(node);
    if (!id || !ts.isIdentifier(id)) return null;
    for (let at = id; at; at = at.parent) {
      const found = scopes.get(at)?.get(id.text);
      if (found) return found;
    }
    return null;
  };

  const bindPattern = (pattern, scope) => {
    if (ts.isIdentifier(pattern)) {
      put(scope, pattern.text, { kind: "other", node: pattern });
      return;
    }
    if (ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern)) {
      for (const el of pattern.elements) {
        if (ts.isBindingElement(el)) bindPattern(el.name, scope);
      }
    }
  };

  const walk = (node) => {
    if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier) {
      opaque = true;
      return;
    }
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
      const specText = ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
      if (!specText || specText === "module" || specText === "node:module" || /^data:/i.test(specText)) opaque = true;
      const fromEsbuild = isEsbuildSpec(specText);
      if (fromEsbuild && specText !== "esbuild") opaque = true;
      const clause = node.importClause;
      if (clause?.name) {
        put(tree, clause.name.text, fromEsbuild ? { kind: "esbuild-ns", node: clause } : { kind: "other", node: clause });
      }
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) {
        put(tree, named.name.text, fromEsbuild ? { kind: "esbuild-ns", node: named } : { kind: "other", node: named });
      } else if (named && ts.isNamedImports(named)) {
        for (const spec of named.elements) {
          if (spec.isTypeOnly) continue;
          const imported = (spec.propertyName ?? spec.name).text;
          if (fromEsbuild) {
            if (imported === "default" || imported === "module.exports") {
              put(tree, spec.name.text, { kind: "esbuild-ns", node: spec });
            } else if (ESBUILD_BUILD_FNS.has(imported)) {
              put(tree, spec.name.text, { kind: "esbuild-fn", fnName: imported, node: spec });
            } else if (ESBUILD_BENIGN_NAMED.has(imported)) {
              put(tree, spec.name.text, { kind: "other", node: spec });
            } else {
              opaque = true;
              put(tree, spec.name.text, { kind: "other", node: spec });
            }
          } else {
            put(tree, spec.name.text, { kind: "other", node: spec });
          }
        }
      }
      return;
    }
    if (ts.isVariableDeclaration(node)) {
      const isDeclList = ts.isVariableDeclarationList(node.parent);
      const isConst = isDeclList && (node.parent.flags & ts.NodeFlags.Const) !== 0;
      const isVar = isDeclList && (node.parent.flags & ts.NodeFlags.BlockScoped) === 0;
      const isTopConst = isConst
        && ts.isVariableStatement(node.parent.parent)
        && node.parent.parent.parent === tree
        && ts.isIdentifier(node.name)
        && Boolean(node.initializer);
      if (isTopConst) {
        constDecls.add(node);
        put(tree, node.name.text, { kind: "const", node, value: node.initializer });
      } else {
        bindPattern(node.name, isVar ? varScopeOf(node) : scopeOf(node));
      }
    } else if (ts.isParameter(node)) {
      bindPattern(node.name, scopeOf(node));
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      put(scopeOf(node), node.name.text, { kind: "other", node });
    } else if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) {
      put(node, node.name.text, { kind: "other", node });
    }
    ts.forEachChild(node, walk);
  };
  walk(tree);

  return { lookup, constDecls, opaque };
}

function esbuildCalleeInfo(expr, lookup) {
  const node = unwrap(expr);
  if (!node) return null;
  if (ts.isIdentifier(node)) {
    const binding = lookup(node);
    if (binding?.kind === "esbuild-fn") return { fnName: binding.fnName, nodes: [node] };
    return null;
  }
  if (ts.isPropertyAccessExpression(node)) {
    const owner = unwrap(node.expression);
    if (owner && ts.isIdentifier(owner) && lookup(owner)?.kind === "esbuild-ns" && ESBUILD_BUILD_FNS.has(node.name.text)) {
      return { fnName: node.name.text, nodes: [owner] };
    }
  }
  return null;
}

function subtreeHasEsbuildCall(root, lookup) {
  let found = false;
  const walk = (node) => {
    if (found) return;
    if (ts.isCallExpression(node) && esbuildCalleeInfo(node.expression, lookup)) {
      found = true;
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(root);
  return found;
}

function enclosingConstOrEsbuild(expr, constDecls, lookup) {
  let child = expr;
  for (let at = expr.parent; at; child = at, at = at.parent) {
    if (isWrapper(at) || ts.isArrayLiteralExpression(at) || ts.isObjectLiteralExpression(at)) continue;
    if ((ts.isSpreadAssignment(at) || ts.isSpreadElement(at)) && at.expression === child) continue;
    if (ts.isPropertyAssignment(at) && at.initializer === child) continue;
    if (ts.isShorthandPropertyAssignment(at) && at.name === child) continue;
    if (ts.isVariableDeclaration(at) && constDecls.has(at) && at.initializer === child) {
      return { kind: "const", node: at };
    }
    if (ts.isCallExpression(at) && at.arguments.length === 1 && at.arguments[0] === child && Boolean(esbuildCalleeInfo(at.expression, lookup))) {
      return { kind: "esbuild" };
    }
    return null;
  }
  return null;
}

function hasUnsafeParamUse(root, paramNode, constDecls, lookup) {
  let unsafe = false;
  const walk = (node) => {
    if (unsafe) return;
    if (ts.isIdentifier(node) && !isDeclarationIdentifier(node)) {
      if (node.text === "arguments") {
        unsafe = true;
        return;
      }
      if (lookup(node)?.node === paramNode) {
        const expr = outerExpr(node);
        const parent = expr.parent;
        const directArg = Boolean(
          parent && ts.isCallExpression(parent) && parent.arguments.length === 1
          && parent.arguments[0] === expr && esbuildCalleeInfo(parent.expression, lookup),
        );
        const directBuildSpread = Boolean(
          parent && ts.isSpreadAssignment(parent) && parent.expression === expr
          && enclosingConstOrEsbuild(expr, constDecls, lookup)?.kind === "esbuild",
        );
        if (!directArg && !directBuildSpread) {
          unsafe = true;
          return;
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(root);
  return unsafe;
}

function validatedEsbuildIteration(node, constDecls, lookup) {
  if (ts.isCallExpression(node)) {
    const callee = unwrap(node.expression);
    if (!callee || !ts.isPropertyAccessExpression(callee)) return null;
    if ((callee.name.text !== "map" && callee.name.text !== "forEach") || node.arguments.length !== 1) return null;
    const callback = unwrap(node.arguments[0]);
    const directCb = esbuildCalleeInfo(callback, lookup);
    if (directCb) {
      return directCb.fnName === "context"
        ? { kind: "invalid-esbuild-iter" }
        : { kind: "direct-cb", recv: callee.expression, calleeInfo: directCb };
    }
    if (callback && isFn(callback) && subtreeHasEsbuildCall(callback.body, lookup)) {
      const param = callback.parameters[0];
      const simpleArrow = ts.isArrowFunction(callback)
        && callback.parameters.length === 1
        && param
        && ts.isIdentifier(param.name)
        && !param.dotDotDotToken
        && !param.initializer;
      if (!simpleArrow || hasUnsafeParamUse(callback.body, param.name, constDecls, lookup)) {
        return { kind: "invalid-esbuild-iter" };
      }
      return { kind: "arrow-cb", recv: callee.expression, paramNode: param.name, body: callback.body };
    }
    return null;
  }
  if (ts.isForOfStatement(node) && subtreeHasEsbuildCall(node.statement, lookup)) {
    const init = node.initializer;
    const isConstInit = ts.isVariableDeclarationList(init) && (init.flags & ts.NodeFlags.Const) !== 0 && init.declarations.length === 1;
    const decl = isConstInit ? init.declarations[0] : null;
    const simpleDecl = Boolean(!node.awaitModifier && decl && ts.isIdentifier(decl.name));
    if (!simpleDecl || hasUnsafeParamUse(node.statement, decl.name, constDecls, lookup)) {
      return { kind: "invalid-esbuild-iter" };
    }
    return { kind: "for-of", recv: node.expression, paramNode: decl.name, body: node.statement };
  }
  return null;
}

function auditConstImmutabilityAndDynamicLoads(tree, lookup, constDecls) {
  const mutated = new Set();
  const constDeps = new Map();
  let opaque = false;

  const addDep = (owner, dep) => {
    let set = constDeps.get(owner);
    if (!set) {
      set = new Set();
      constDeps.set(owner, set);
    }
    set.add(dep);
  };

  const walk = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const firstArg = node.arguments[0] ? unwrap(node.arguments[0]) : null;
      if (callee?.kind === ts.SyntaxKind.ImportKeyword) {
        if (!firstArg || !ts.isStringLiteralLike(firstArg) || isOpaqueModuleSpec(firstArg.text)) {
          opaque = true;
        }
      } else if (callee && ts.isIdentifier(callee) && callee.text === "require" && !lookup(callee)) {
        opaque = true;
      }
    } else if (ts.isPropertyAccessExpression(node) && OPAQUE_BUILTIN_PROPS.has(node.name.text)) {
      opaque = true;
    } else if (ts.isElementAccessExpression(node)) {
      const arg = unwrap(node.argumentExpression);
      if (arg && ts.isStringLiteralLike(arg) && OPAQUE_BUILTIN_PROPS.has(arg.text)) opaque = true;
    } else if (ts.isBindingElement(node) && OPAQUE_BUILTIN_PROPS.has(staticPropName(node.propertyName ?? node.name))) {
      opaque = true;
    } else if (ts.isIdentifier(node) && !isDeclarationIdentifier(node)) {
      if (OPAQUE_BUILTIN_PROPS.has(node.text)) opaque = true;
      const binding = lookup(node);
      if (binding?.kind === "const" && !isPrimitiveLiteral(unwrap(binding.value))) {
        const expr = outerExpr(node);
        const parent = expr.parent;
        const isDirectBuildArg = Boolean(
          parent && ts.isCallExpression(parent) && parent.arguments.length === 1
          && parent.arguments[0] === expr && esbuildCalleeInfo(parent.expression, lookup),
        );
        const arrayIter = parent && ts.isPropertyAccessExpression(parent) && parent.expression === expr
          && parent.parent && ts.isCallExpression(parent.parent) && parent.parent.expression === parent
          ? validatedEsbuildIteration(parent.parent, constDecls, lookup)
          : null;
        const isSafeArrayIter = Boolean(arrayIter && arrayIter.kind !== "invalid-esbuild-iter");
        const forOfIter = parent && ts.isForOfStatement(parent) && parent.expression === expr
          ? validatedEsbuildIteration(parent, constDecls, lookup)
          : null;
        const isSafeForOf = Boolean(forOfIter && forOfIter.kind !== "invalid-esbuild-iter");
        const isLiteralPart = Boolean(
          parent && (
            (ts.isSpreadAssignment(parent) && parent.expression === expr)
            || (ts.isSpreadElement(parent) && parent.expression === expr)
            || ts.isArrayLiteralExpression(parent)
            || (ts.isPropertyAssignment(parent) && parent.initializer === expr)
            || (ts.isShorthandPropertyAssignment(parent) && parent.name === expr)
          ),
        );
        if (isLiteralPart) {
          const owner = enclosingConstOrEsbuild(expr, constDecls, lookup);
          if (owner?.kind === "const") addDep(owner.node, binding.node);
          else if (owner?.kind !== "esbuild") mutated.add(binding.node);
        } else if (!isDirectBuildArg && !isSafeArrayIter && !isSafeForOf) {
          mutated.add(binding.node);
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(tree);

  const queue = [...mutated];
  while (queue.length > 0) {
    const owner = queue.pop();
    const deps = constDeps.get(owner);
    if (!deps) continue;
    for (const dep of deps) {
      if (!mutated.has(dep)) {
        mutated.add(dep);
        queue.push(dep);
      }
    }
  }

  return { mutated, opaque };
}

/**
 * Extract only static esbuild bundle steps actually passed to an imported esbuild build/buildSync call.
 * Returns `{ steps: Map<normalizedOutfile, entry | null>, opaque: boolean }`.
 * Unreferenced bait object literals are ignored; mutated/aliased configs, dynamic/conflicting outfiles,
 * dangerous esbuild options, or escaped esbuild references fail closed.
 */
export function scriptBundleSteps(file, text) {
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (tree.parseDiagnostics.length > 0) return { steps: new Map(), opaque: true };
  const { lookup, constDecls, opaque: importOpaque } = collectScriptBindings(tree);
  const { mutated, opaque: loadOpaque } = auditConstImmutabilityAndDynamicLoads(tree, lookup, constDecls);
  const steps = new Map();
  const consumedEsbuild = new Set();
  let opaque = importOpaque || loadOpaque;

  const resolveStaticNode = (expr, env, seen = new Set()) => {
    let current = unwrap(expr);
    while (current && ts.isIdentifier(current)) {
      const binding = lookup(current);
      if (!binding || seen.has(binding.node)) return null;
      seen.add(binding.node);
      if (env.has(binding.node)) {
        current = unwrap(env.get(binding.node));
        continue;
      }
      if (binding.kind === "const" && !mutated.has(binding.node)) {
        current = unwrap(binding.value);
        continue;
      }
      return null;
    }
    return current ?? null;
  };

  const resolveStaticArray = (expr, env, seen = new Set()) => {
    const node = resolveStaticNode(expr, env, new Set(seen));
    if (!node || !ts.isArrayLiteralExpression(node)) return null;
    const items = [];
    for (const element of node.elements) {
      if (ts.isOmittedExpression(element)) return null;
      if (ts.isSpreadElement(element)) {
        const nested = resolveStaticArray(element.expression, env, new Set([...seen, node]));
        if (!nested) return null;
        items.push(...nested);
      } else {
        items.push(element);
      }
    }
    return items;
  };

  const resolveStaticString = (expr, env) => {
    const node = resolveStaticNode(expr, env);
    return node && ts.isStringLiteralLike(node) ? node.text : null;
  };

  const applyObjectProperties = (obj, env, state, seen) => {
    for (const prop of obj.properties) {
      if (ts.isSpreadAssignment(prop)) {
        const spreadNode = resolveStaticNode(prop.expression, env, new Set(seen));
        if (!spreadNode || !ts.isObjectLiteralExpression(spreadNode) || seen.has(spreadNode)) {
          state.opaqueSpread = true;
          continue;
        }
        applyObjectProperties(spreadNode, env, state, new Set([...seen, spreadNode]));
        continue;
      }
      if (!ts.isPropertyAssignment(prop) && !ts.isShorthandPropertyAssignment(prop)) {
        state.opaqueSpread = true;
        continue;
      }
      const name = ts.isPropertyAssignment(prop) ? staticPropName(prop.name) : prop.name.text;
      if (name === null || OPAQUE_ESBUILD_OPTIONS.has(name)) {
        state.opaqueSpread = true;
        continue;
      }
      const valueExpr = ts.isPropertyAssignment(prop) ? prop.initializer : prop.name;
      if (hasAccessorInSubtree(valueExpr)) {
        state.opaqueSpread = true;
        continue;
      }
      if (name === "outfile") {
        const out = resolveStaticString(valueExpr, env);
        state.outfile = out && out.endsWith(".js") ? out : INVALID;
      } else if (name === "outdir") {
        state.outdir = true;
      } else if (name === "write") {
        const val = resolveStaticNode(valueExpr, env);
        state.writeFalse = val?.kind === ts.SyntaxKind.FalseKeyword ? true : val?.kind === ts.SyntaxKind.TrueKeyword ? false : INVALID;
      } else if (name === "entryPoints") {
        const arr = resolveStaticArray(valueExpr, env);
        if (arr && arr.length === 1) {
          const entry = resolveStaticString(arr[0], env);
          state.entry = entry && entry.endsWith(".ts") ? entry : INVALID;
        } else {
          state.entry = INVALID;
        }
      }
    }
  };

  const extractBuildOption = (expr, env) => {
    const obj = resolveStaticNode(expr, env);
    if (!obj || !ts.isObjectLiteralExpression(obj)) return { kind: "opaque" };
    const state = { entry: undefined, outfile: undefined, outdir: false, writeFalse: undefined, opaqueSpread: false };
    applyObjectProperties(obj, env, state, new Set([obj]));
    if (state.opaqueSpread || state.outfile === INVALID || state.outdir) return { kind: "opaque" };
    if (typeof state.outfile === "string") {
      return typeof state.entry === "string"
        ? { kind: "static", entry: state.entry, outfile: path.posix.normalize(state.outfile) }
        : { kind: "ambiguous-outfile", outfile: path.posix.normalize(state.outfile) };
    }
    return state.writeFalse === true ? { kind: "in-memory" } : { kind: "opaque" };
  };

  const recordOutcome = (outcome) => {
    if (outcome.kind === "opaque") {
      opaque = true;
      return;
    }
    if (outcome.kind === "in-memory") return;
    if (outcome.kind === "ambiguous-outfile") {
      steps.set(outcome.outfile, null);
      return;
    }
    const existing = steps.get(outcome.outfile);
    if (existing === undefined) {
      steps.set(outcome.outfile, outcome.entry);
    } else if (existing !== outcome.entry) {
      steps.set(outcome.outfile, null);
    }
  };

  const expandEnvs = (envs, paramNode, items) => {
    const next = [];
    for (const env of envs) {
      for (const item of items) {
        if (next.length >= MAX_BUILD_EXPANSIONS) {
          opaque = true;
          return null;
        }
        const copy = new Map(env);
        copy.set(paramNode, item);
        next.push(copy);
      }
    }
    return next;
  };

  const visitCalls = (node, envs) => {
    if (ts.isCallExpression(node)) {
      const direct = esbuildCalleeInfo(node.expression, lookup);
      if (direct) {
        for (const id of direct.nodes) consumedEsbuild.add(id);
        if (direct.fnName === "context" || node.arguments.length !== 1) {
          opaque = true;
          return;
        }
        for (const env of envs) recordOutcome(extractBuildOption(node.arguments[0], env));
        return;
      }
    }
    const iter = validatedEsbuildIteration(node, constDecls, lookup);
    if (iter) {
      if (iter.kind === "invalid-esbuild-iter") {
        opaque = true;
        return;
      }
      if (iter.kind === "direct-cb") {
        for (const id of iter.calleeInfo.nodes) consumedEsbuild.add(id);
        for (const env of envs) {
          const items = resolveStaticArray(iter.recv, env);
          if (!items || items.length === 0) {
            opaque = true;
            return;
          }
          for (const item of items) recordOutcome(extractBuildOption(item, env));
        }
        return;
      }
      const expanded = [];
      for (const env of envs) {
        const items = resolveStaticArray(iter.recv, env);
        if (!items || items.length === 0) {
          opaque = true;
          return;
        }
        const batch = expandEnvs([env], iter.paramNode, items);
        if (!batch) return;
        expanded.push(...batch);
      }
      visitCalls(iter.body, expanded);
      return;
    }
    ts.forEachChild(node, (child) => visitCalls(child, envs));
  };
  visitCalls(tree, [new Map()]);

  const auditEscapes = (node) => {
    if (opaque) return;
    if (ts.isIdentifier(node) && !isDeclarationIdentifier(node) && !consumedEsbuild.has(node)) {
      const binding = lookup(node);
      if (binding?.kind === "esbuild-fn") {
        opaque = true;
        return;
      }
      if (binding?.kind === "esbuild-ns") {
        const isSafeMember = ts.isPropertyAccessExpression(node.parent)
          && node.parent.expression === node
          && ESBUILD_BENIGN_NAMED.has(node.parent.name.text);
        if (!isSafeMember) {
          opaque = true;
          return;
        }
      }
    }
    ts.forEachChild(node, auditEscapes);
  };
  auditEscapes(tree);

  return { steps, opaque };
}

/**
 * Resolve a `readFileSync(new URL("./<name>.js", import.meta.url), "utf8")` call to its unique
 * TypeScript bundle entry from the owning package's build command or tooling/build-*.mjs script.
 * Fails closed (`null`) if any build script is opaque, missing, or has conflicting entries for the outfile.
 */
export function bundleEntry(graph, node, scriptCache = new Map()) {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "readFileSync" || node.arguments.length !== 2) return null;
  const [url, encoding] = node.arguments.map(unwrap);
  if (!ts.isStringLiteralLike(encoding) || encoding.text !== "utf8" || !ts.isNewExpression(url) || url.expression.getText() !== "URL"
    || url.arguments?.length !== 2 || !ts.isStringLiteralLike(url.arguments[0]) || url.arguments[1].getText() !== "import.meta.url") return null;
  const file = node.getSourceFile().fileName;
  for (const { dir, json } of graph.packages.values()) {
    if (!file.startsWith(dir + "/src/")) continue;
    const bundle = path.posix.normalize(path.posix.join(path.posix.dirname(dir + "/dist/" + file.slice(dir.length + 5)), url.arguments[0].text));
    const buildCommand = String(json.scripts?.build ?? "");
    const matches = new Set();
    let ambiguous = false;
    let hasOpaqueScript = false;

    const cliSteps = [...buildCommand.matchAll(BUNDLE_STEP)];
    const allCliCount = [...buildCommand.matchAll(ANY_ESBUILD_CLI)].length;
    if (allCliCount !== cliSteps.length || DANGEROUS_ESBUILD_CLI.test(buildCommand)) ambiguous = true;
    for (const [, entry, outfile] of cliSteps) {
      if (path.posix.normalize(path.posix.join(dir, outfile)) !== bundle) continue;
      const resolved = path.posix.normalize(path.posix.join(dir, entry));
      if (graph.entries.has(resolved)) matches.add(resolved);
      else ambiguous = true;
    }

    const seenScripts = new Set();
    for (const [, scriptRel] of buildCommand.matchAll(BUILD_SCRIPT_PATH)) {
      const scriptPath = path.posix.normalize(path.posix.join(dir, scriptRel));
      if (seenScripts.has(scriptPath)) continue;
      seenScripts.add(scriptPath);
      const scriptText = graph.buildScripts?.get(scriptPath);
      if (!scriptText) {
        hasOpaqueScript = true;
        continue;
      }
      let parsed = scriptCache.get(scriptPath);
      if (!parsed) {
        parsed = scriptBundleSteps(scriptPath, scriptText);
        scriptCache.set(scriptPath, parsed);
      }
      if (parsed.opaque) hasOpaqueScript = true;
      for (const [outfile, entry] of parsed.steps) {
        if (path.posix.normalize(path.posix.join(dir, outfile)) !== bundle) continue;
        if (entry === null) {
          ambiguous = true;
          continue;
        }
        const resolved = path.posix.normalize(path.posix.join(dir, entry));
        if (graph.entries.has(resolved)) matches.add(resolved);
        else ambiguous = true;
      }
    }

    if (hasOpaqueScript || ambiguous || matches.size !== 1) return null;
    return [...matches][0];
  }
  return null;
}
