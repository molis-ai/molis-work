import assert from "node:assert/strict";
import test from "node:test";
import { contentVersionKey } from "../scripts/gates/initial-versions.mjs";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import ts from "typescript";
import { SHELF_INSTRUCTIONS } from "@molis-ai/molis-work-module-shelf/surface";
import { BUILTIN_DEFINITIONS } from "./fixtures/builtin-definitions.js";
import { builtinRegistrations } from "../apps/local-host/src/agent-definitions/builtin-agents.js";
import { BUILTIN_INSTRUCTIONS } from "../apps/local-host/src/agent-definitions/builtin-instructions.js";

const ROOT = new URL("..", import.meta.url).pathname;

function sources(directory: string): string[] {
  return readdirSync(join(ROOT, directory)).flatMap(name => {
    const path = join(directory, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(join(ROOT, path)).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.endsWith(".d.ts") ? [path] : [];
  });
}

function subPackageSources(directory: string): string[] {
  return readdirSync(join(ROOT, directory)).flatMap(name => {
    try {
      return sources(`${directory}/${name}/src`);
    } catch {
      return [];
    }
  });
}

const HOST = sources("apps/local-host/src");
const PLUGINS = subPackageSources("plugins/native");
const MODULES = subPackageSources("modules");
const HORIZONTALS = subPackageSources("horizontal");
const RUNTIME_SOURCES = [...HOST, ...MODULES, ...HORIZONTALS];
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
/** The built-in plugins' definitions, each carrying its own instructions and Agent prompts, which the Host registers while it runs (PG-051). */
const DEFINITIONS = BUILTIN_DEFINITIONS;
/** Every prompt that reaches the register: the Host's own at start, and what each definition carries while it runs. */
const registeredPrompts = () => new Map([
  ...builtinRegistrations().flatMap(owner => owner.prompts.map(prompt => [`${owner.owner_id}/${prompt.prompt_id}`, prompt] as const)),
  ...DEFINITIONS.flatMap(definition => [...definition.instructions ?? [], ...definition.agent_prompts ?? []]
    .map(prompt => [`${definition.manifest.plugin_id}/${prompt.prompt_id}`, prompt] as const)),
]);
const registered = () => new Set(registeredPrompts().keys());

/**
 * Low-level transports, runtime adapters, factories, and connectivity probes that invoke SDK/inference primitives
 * directly on behalf of higher-level callers whose prompts are already resolved by `AgentDefinitions` or the
 * connectivity health check. Every entry must actually contain a monitored model call site and carry an explicit
 * justification; product callers must never be added here.
 */
const LOW_LEVEL_MODEL_CALL_ALLOWLIST: Readonly<Record<string, string>> = {
  "apps/local-host/src/host-complete-text.ts": "Host 文字模型的传输层，发送调用方已解析好的文字",
  "apps/local-host/src/agent-host-composition.ts": "Prologue 运行时与推理的宿主装配层，转发已由 AgentHost 或调用方解析的提示词",
  "apps/local-host/src/typesafe-prologue.ts": "TypeSafe 判断服务提供方工厂，调用方题面由 TYPESAFE_CALLERS 单独审计",
  "apps/local-host/src/plugin-image-generation-service.ts": "Host 生图模型传输端口，转发用户或插件的生图请求",
  "apps/local-host/src/model-provider-test.ts": "模型连通性探针（role.model-check@1，prompts: []），仅发送无业务指令的最小连通测试",
  "apps/local-host/src/model-provider-setup.ts": "模型向导连通性检测入口，仅调用 testConfiguredModel 验证配置",
  "apps/local-host/src/web-model-settings.ts": "模型设置页连通性检测入口，仅调用 testConfiguredModel 验证配置",
  "horizontal/agent-host/src/adapters/prologue-inference.ts": "Prologue 单次推理底层协议适配器，执行 Host 已解析的请求",
  "horizontal/agent-host/src/adapters/prologue-node.ts": "Prologue Node 运行时底层适配器，执行经 AgentHost.start 与 AgentDefinitions.effective 冻结的角色提示词",
  "horizontal/agent-host/src/adapters/prologue-run.ts": "Prologue Agent 运行循环底层适配器，消费已冻结的角色与提示词",
  "horizontal/agent-host/src/adapters/prologue-run-start.ts": "Prologue Agent 启动桥接底层适配器，消费已冻结的角色与提示词",
  "horizontal/agent-host/src/adapters/prologue-effects.ts": "Prologue 副作用钩子底层包装器，仅转发底层 startRun 调用",
  "horizontal/agent-host/src/adapters/prologue-compaction.ts": "Prologue 上下文整理底层适配器，执行经 AgentHost 登记解析的整理提示词",
  "horizontal/agent-host/src/adapters/ending-review.ts": "Prologue 收尾核对底层适配器，执行经 AgentHost 登记解析的收尾核对提示词",
  "horizontal/agent-host/src/adapters/plugin-builder.ts": "插件创作台底层运行时适配器，执行经 agent-surface.ts 调用 AgentDefinitions.effective 解析的角色提示词",
};

/** Modules that only build a TypeSafe provider factory and hand it to callers audited in `TYPESAFE_CALLERS`. */
const TYPESAFE_FACTORIES = new Set([
  "apps/local-host/src/typesafe-prologue.ts",
]);

/**
 * Runtime files that ask the judgment service (TypeSafe) through `createPrologueTypeSafeProvider`, which the direct-call pattern below
 * cannot see, each with where its questions come from. A new file that does is listed with its reason or the test fails.
 */
const TYPESAFE_CALLERS: Readonly<Record<string, string>> = {
  "apps/local-host/src/judgment-rules-host.ts": "判断规则的题面是用户自己写的规则正文（数据），不是固定文字",
  "apps/local-host/src/plugin-builder-surface.ts": "创作台挑零件的两句说明（选能力、选组件）登记在创作台名下，由工作流经 instruction 端口取用户改过的文字后交给它，这里只转发",
};

/** Resolve an owner from its declaration, including a plugin's single Manifest constant. */
function ownerConstant(file: string, name: string, seen = new Set<string>()): string | undefined {
  const key = `${file}/${name}`;
  if (seen.has(key)) return undefined;
  seen.add(key);
  const source = read(file);
  const local = new RegExp(`const ${name}\\s*=\\s*["']([^"']+)["']`).exec(source)?.[1];
  if (local) return local;
  for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g)) {
    for (const binding of match[1]!.split(",")) {
      const [imported, alias = imported] = binding.trim().split(/\s+as\s+/);
      if (alias === name) return ownerConstant(join(dirname(file), match[2]!.replace(/\.js$/, ".ts")), imported!, seen);
    }
  }
  return undefined;
}

test("N31-ALL-PROMPTS-01 every registered instruction, Agent prompt and built-in method declares the version its entry in tooling/versions.json gives", () => {
  const versions = (JSON.parse(read("tooling/versions.json")) as { versions: Record<string, number> }).versions;
  for (const [id, prompt] of registeredPrompts()) {
    const entry = contentVersionKey("prompt", prompt.prompt_id, id.slice(0, id.lastIndexOf("/")), versions);
    assert.ok(entry, `${id} has no entry`);
    assert.equal(prompt.version, versions[entry], id);
  }
  for (const definition of DEFINITIONS) for (const method of definition.manifest.methods ?? []) {
    assert.ok(Object.hasOwn(versions, `method.${method.skill_id}`), `${definition.manifest.plugin_id}/${method.skill_id} has no entry`);
    assert.equal(method.version, versions[`method.${method.skill_id}`], `${definition.manifest.plugin_id}/${method.skill_id}`);
  }
});

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function literalString(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined;
  const expr = unwrapExpression(node);
  return ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) ? expr.text : undefined;
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name) {
      return property.initializer;
    }
  }
  return undefined;
}

function extractInstructionDefinitions(filePath: string): string[] {
  const text = read(filePath);
  if (!text.includes("defineInstructionPrompt")) return [];
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.ES2022, true);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      const isDefine = (ts.isIdentifier(callee) && callee.text === "defineInstructionPrompt")
        || (ts.isPropertyAccessExpression(callee) && callee.name.text === "defineInstructionPrompt");
      if (isDefine && node.arguments.length > 0) {
        const argument = unwrapExpression(node.arguments[0]!);
        if (ts.isObjectLiteralExpression(argument)) {
          const promptId = literalString(objectProperty(argument, "prompt_id"));
          if (promptId) {
            const ownerExpr = objectProperty(argument, "owner_id");
            const unwrappedOwner = ownerExpr ? unwrapExpression(ownerExpr) : undefined;
            const ownerId = literalString(ownerExpr)
              ?? (unwrappedOwner && ts.isIdentifier(unwrappedOwner) ? ownerConstant(filePath, unwrappedOwner.text) : undefined);
            assert.ok(ownerId, `${filePath}: ${promptId} 的 owner_id 需能解析到字面量、同文件常量或相对模块导出的常量`);
            found.push(`${ownerId}/${promptId}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

test("every instruction a built-in model call defines is registered where the person can see and edit it", () => {
  const known = registered();
  const defined: string[] = [];
  for (const path of [...HOST, ...PLUGINS, ...MODULES, ...HORIZONTALS]) {
    defined.push(...extractInstructionDefinitions(path));
  }
  // Shelf creates its option prompts from the recipe catalog; inspect every actual declaration too.
  defined.push(...SHELF_INSTRUCTIONS.map(prompt => `${prompt.owner_id}/${prompt.prompt_id}`));
  assert.ok(defined.length >= 12, `只找到 ${defined.length} 段指令，检查是否漏扫`);
  assert.deepEqual(defined.filter(key => !known.has(key)), [], "这些指令既不在 BUILTIN_INSTRUCTIONS，也不在任何插件定义的 instructions 里");
});

test("RAC-194 a Plugin's instructions reach the register through its own definition, each once, and only the platform's own sit in the Host list", () => {
  const key = (prompt: { owner_id: string; prompt_id: string }) => `${prompt.owner_id}/${prompt.prompt_id}`;
  const keys = BUILTIN_INSTRUCTIONS.map(key);
  assert.deepEqual(keys.filter((row, index) => keys.indexOf(row) !== index), [], "an instruction is registered once");
  const declared = new Set<string>();
  for (const definition of DEFINITIONS) for (const prompt of definition.instructions ?? []) {
    assert.equal(prompt.owner_id, definition.manifest.plugin_id, `${key(prompt)} is carried by the definition of another plugin`);
    declared.add(key(prompt));
  }
  // The Host lists its own modules' and Plugin Builder's (the platform's, PG-051 Q2).
  const HOST_OWNERS = new Set(["io.molis.work.plugin-builder"]);
  assert.deepEqual(BUILTIN_INSTRUCTIONS.filter(prompt => !prompt.owner_id.startsWith("system:") && !HOST_OWNERS.has(prompt.owner_id)).map(key), [],
    "a plugin's instructions are carried by its definition (`PluginDefinition.instructions`), not named in the Host list");
  assert.deepEqual(BUILTIN_INSTRUCTIONS.filter(prompt => declared.has(key(prompt))).map(key), [], "not in both");
  assert.ok(declared.size >= 12, `only ${declared.size} definition instructions found, check the scan`);
  for (const id of ["choose.capability", "choose.component"]) assert.ok(keys.includes(`io.molis.work.plugin-builder/${id}`), `${id} is the platform's, in the Host list`);
});

test("a Plugin, Module or Horizontal model port takes registered instructions, not a raw prompt string", () => {
  const raw = [...PLUGINS, ...MODULES, ...HORIZONTALS].filter(path => /completeText\??\s*[:(]\s*\(?\s*prompt\s*:\s*string/.test(read(path)));
  assert.deepEqual(raw, [], "插件与平台模块的 completeText 端口应接收 InstructedPrompt / ModelPromptInput");
});

const DIRECT_MODEL_CALLS = new Set([
  "hostCompleteText",
  "hostTextGeneration",
  "hostTextForCommit",
  "resolvePrologueInference",
  "createPrologueNodeAdapter",
  "generateImages",
  "testConfiguredModel",
]);
const METHOD_MODEL_CALLS = new Set([
  "completeText",
  "completeTextResult",
  "evaluateTypeSafe",
  "generateImages",
  "startRun",
  "startAgentRun",
]);
const INSTRUCTIONS_RESOLVERS = new Set([
  "resolveModelPrompt",
  "resolveInstructionPrompt",
  "prepareInstructionPrompt",
  "registeredInstructionBody",
  "declaredInstructionBody",
]);
const PLUGIN_PROMPT_RESOLVERS = new Set(["resolvePluginPrompt"]);
const INSTRUCTIONS_OWNER_MODULE = join(ROOT, "apps/local-host/src/agent-definitions/instructions.js");
const PLUGIN_PROMPTS_OWNER_MODULE = join(ROOT, "apps/local-host/src/installed-plugin-prompts.js");
const MODEL_PROMPTS_CONTRACT = "@molis-ai/molis-work-contracts/platform/model-prompts";

interface ModelCallSite {
  kind: string;
  line: number;
  isTypedCompleteText: boolean;
}

interface CallableUnit {
  id: string;
  exported: boolean;
  modelCalls: ModelCallSite[];
  callsRegistryResolver: boolean;
  callsInstructedWrapper: boolean;
  calledLocalUnits: Set<string>;
}

function isExportedStatement(statement: ts.Statement): boolean {
  if (!ts.canHaveModifiers(statement)) return false;
  return Boolean(ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function collectLocalBindingNames(node: ts.Node, out: Set<string>): void {
  if (ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) {
    if (node.name && ts.isIdentifier(node.name)) {
      out.add(node.name.text);
    }
  }
  ts.forEachChild(node, child => collectLocalBindingNames(child, out));
}

/**
 * Inspect one TypeScript module with the TS AST and return all monitored model call sites together with those whose
 * enclosing callable unit (or every in-file caller of a non-exported private helper) is NOT bound to an imported
 * prompt-registry resolver. Comments, string literals, unimported fake helpers, and a second unregistered function
 * sharing a file with a registered caller can never bypass this check.
 */
function inspectModelCallSites(filePath: string, sourceText: string): { calls: string[]; unregistered: string[] } {
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ES2022, true);
  const absFile = join(ROOT, filePath);
  const registryResolvers = new Set<string>();
  const instructedWrappers = new Set<string>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.importClause?.isTypeOnly) continue;
    const named = statement.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    const spec = statement.moduleSpecifier.text;
    const resolved = spec.startsWith(".") ? join(dirname(absFile), spec) : spec;
    for (const element of named.elements) {
      if (element.isTypeOnly) continue;
      const importedName = (element.propertyName ?? element.name).text;
      const localName = element.name.text;
      if (resolved === INSTRUCTIONS_OWNER_MODULE && INSTRUCTIONS_RESOLVERS.has(importedName)) {
        registryResolvers.add(localName);
      } else if (resolved === PLUGIN_PROMPTS_OWNER_MODULE && PLUGIN_PROMPT_RESOLVERS.has(importedName)) {
        registryResolvers.add(localName);
      } else if (resolved === MODEL_PROMPTS_CONTRACT && importedName === "instructed") {
        instructedWrappers.add(localName);
      }
    }
  }

  const classMemberName = (member: ts.ClassElement): string | null => {
    if (ts.isConstructorDeclaration(member)) return "constructor";
    if (ts.isClassStaticBlockDeclaration(member)) return "<static>";
    if (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member) || ts.isPropertyDeclaration(member)) {
      const { name } = member;
      if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
      return "<computed>";
    }
    return null;
  };
  const isPrivateMember = (member: ts.ClassElement): boolean => {
    if (ts.canHaveModifiers(member) && ts.getModifiers(member)?.some(mod => mod.kind === ts.SyntaxKind.PrivateKeyword)) return true;
    return (ts.isMethodDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member) || ts.isPropertyDeclaration(member))
      && ts.isPrivateIdentifier(member.name);
  };

  const unitNodes: Array<{ id: string; exported: boolean; node: ts.Node; className?: string }> = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      unitNodes.push({ id: statement.name.text, exported: isExportedStatement(statement), node: statement });
    } else if (ts.isClassDeclaration(statement)) {
      const className = statement.name?.text ?? "<anonymous-class>";
      const classExported = isExportedStatement(statement);
      for (const member of statement.members) {
        const memberName = classMemberName(member);
        if (!memberName) continue;
        unitNodes.push({ id: `${className}.${memberName}`, exported: classExported && !isPrivateMember(member), node: member, className });
      }
    } else if (ts.isVariableStatement(statement)) {
      const exported = isExportedStatement(statement);
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          unitNodes.push({ id: declaration.name.text, exported, node: declaration.initializer });
        }
      }
    } else if (!ts.isImportDeclaration(statement) && !ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) {
      unitNodes.push({ id: "<module>", exported: true, node: statement });
    }
  }

  const knownUnitIds = new Set(unitNodes.map(unit => unit.id).filter(id => id !== "<module>"));
  const units = new Map<string, CallableUnit>();
  const getUnit = (id: string, exported: boolean): CallableUnit => {
    let existing = units.get(id);
    if (!existing) {
      existing = { id, exported, modelCalls: [], callsRegistryResolver: false, callsInstructedWrapper: false, calledLocalUnits: new Set() };
      units.set(id, existing);
    } else if (exported) {
      existing.exported = true;
    }
    return existing;
  };

  for (const entry of unitNodes) {
    const unit = getUnit(entry.id, entry.exported);
    const shadowed = new Set<string>();
    if (ts.isFunctionDeclaration(entry.node) || ts.isMethodDeclaration(entry.node) || ts.isGetAccessorDeclaration(entry.node)
      || ts.isSetAccessorDeclaration(entry.node) || ts.isPropertyDeclaration(entry.node)) {
      const unitName = entry.node.name;
      ts.forEachChild(entry.node, child => {
        if (child !== unitName) collectLocalBindingNames(child, shadowed);
      });
    } else {
      collectLocalBindingNames(entry.node, shadowed);
    }

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = unwrapExpression(node.expression);
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        if (ts.isIdentifier(callee)) {
          const name = callee.text;
          if (!shadowed.has(name) && registryResolvers.has(name)) {
            unit.callsRegistryResolver = true;
          }
          if (!shadowed.has(name) && instructedWrappers.has(name)) {
            unit.callsInstructedWrapper = true;
          }
          if (DIRECT_MODEL_CALLS.has(name)) {
            unit.modelCalls.push({ kind: name, line, isTypedCompleteText: false });
          }
          if (knownUnitIds.has(name) && name !== unit.id) {
            unit.calledLocalUnits.add(name);
          }
        } else if (ts.isPropertyAccessExpression(callee)) {
          const method = callee.name.text;
          if (METHOD_MODEL_CALLS.has(method) && (method !== "completeText" || node.arguments.length > 0)) {
            unit.modelCalls.push({ kind: `.${method}`, line, isTypedCompleteText: method === "completeText" });
          }
          if (entry.className) {
            const receiver = unwrapExpression(callee.expression);
            if (receiver.kind === ts.SyntaxKind.ThisKeyword || (ts.isIdentifier(receiver) && receiver.text === entry.className)) {
              const targetId = `${entry.className}.${method}`;
              if (knownUnitIds.has(targetId) && targetId !== unit.id) {
                unit.calledLocalUnits.add(targetId);
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(entry.node);
  }

  const reaches = (unitId: string, predicate: (unit: CallableUnit) => boolean, seen = new Set<string>()): boolean => {
    if (seen.has(unitId)) return false;
    seen.add(unitId);
    const unit = units.get(unitId);
    if (!unit) return false;
    if (predicate(unit)) return true;
    for (const childId of unit.calledLocalUnits) {
      if (reaches(childId, predicate, seen)) return true;
    }
    return false;
  };

  const callersOf = new Map<string, Set<string>>();
  for (const unit of units.values()) {
    for (const target of unit.calledLocalUnits) {
      let callers = callersOf.get(target);
      if (!callers) {
        callers = new Set<string>();
        callersOf.set(target, callers);
      }
      callers.add(unit.id);
    }
  }

  const unitBoundFor = (unitId: string, isTypedCompleteText: boolean, seen = new Set<string>()): boolean => {
    if (seen.has(unitId)) return false;
    seen.add(unitId);
    const unit = units.get(unitId);
    if (!unit) return false;
    if (reaches(unitId, item => item.callsRegistryResolver)) return true;
    if (isTypedCompleteText && reaches(unitId, item => item.callsInstructedWrapper)) return true;
    if (unit.exported) return false;
    const callers = callersOf.get(unitId);
    if (!callers || callers.size === 0) return false;
    for (const callerId of callers) {
      if (!unitBoundFor(callerId, isTypedCompleteText, new Set(seen))) return false;
    }
    return true;
  };

  const calls: string[] = [];
  const unregistered: string[] = [];
  for (const unit of units.values()) {
    for (const call of unit.modelCalls) {
      const label = `${filePath}:${call.line} (${unit.id} -> ${call.kind})`;
      calls.push(label);
      if (!unitBoundFor(unit.id, call.isTypedCompleteText)) {
        unregistered.push(label);
      }
    }
  }
  return { calls, unregistered };
}

test("Host, Module and Horizontal call sites reach a model only through verified prompt-registry resolvers, apart from the low-level allowlist", () => {
  const offenders: string[] = [];
  const allowlistHits = new Set<string>();
  for (const path of RUNTIME_SOURCES) {
    const inspected = inspectModelCallSites(path, read(path));
    if (inspected.calls.length === 0) continue;
    if (LOW_LEVEL_MODEL_CALL_ALLOWLIST[path]) {
      allowlistHits.add(path);
      continue;
    }
    offenders.push(...inspected.unregistered);
  }
  assert.deepEqual(offenders, [], "这些模型调用点未在所属函数内绑定到已登记的指令解析器");
  for (const [path, reason] of Object.entries(LOW_LEVEL_MODEL_CALL_ALLOWLIST)) {
    assert.ok(allowlistHits.has(path), `${path} 已不再包含底层模型调用点，请从 LOW_LEVEL_MODEL_CALL_ALLOWLIST 中移除`);
    assert.ok(reason.replace(/\s+/g, "").length >= 12, `${path}: 请写明底层豁免原因`);
  }
});

test("per-call-site AST gate rejects sibling rogue calls, comment-only mentions, and unimported fake resolvers", () => {
  const siblingRogue = `
    import { resolveModelPrompt } from "./agent-definitions/instructions.js";
    import { hostTextGeneration, hostTextForCommit } from "./host-complete-text.js";
    export function legitimate(home: string, prompt: any) {
      const generate = hostTextGeneration({ homeDirectory: home });
      return generate?.(resolveModelPrompt(home, prompt, "ok"));
    }
    export function sneaky(home: string) {
      // resolveModelPrompt mentioned in comment must never bypass the gate
      return hostTextForCommit(home);
    }
  `;
  const siblingResult = inspectModelCallSites("apps/local-host/src/synthetic-rogue.ts", siblingRogue);
  assert.equal(siblingResult.unregistered.length, 1, JSON.stringify(siblingResult));
  assert.match(siblingResult.unregistered[0]!, /sneaky -> hostTextForCommit/);

  const fakeResolver = `
    import { resolvePrologueInference } from "./prologue-inference-host.js";
    function resolveModelPrompt(raw: string) { return raw; }
    export async function bypass(home: string) {
      const inf = await resolvePrologueInference(home);
      return inf.completeText({ prompt: resolveModelPrompt("unregistered") });
    }
  `;
  const fakeResult = inspectModelCallSites("apps/local-host/src/synthetic-fake.ts", fakeResolver);
  assert.equal(fakeResult.unregistered.length, 2, JSON.stringify(fakeResult));

  const moduleStartRun = `
    export async function rogueModuleCall(session: any, runtime: any) {
      await session.startRun({ prompt: "raw" });
      await runtime.startAgentRun({ task: "raw" });
    }
  `;
  const moduleResult = inspectModelCallSites("modules/example/src/rogue.ts", moduleStartRun);
  assert.equal(moduleResult.unregistered.length, 2, JSON.stringify(moduleResult));

  const classSiblingRogue = `
    import { resolveModelPrompt } from "./agent-definitions/instructions.js";
    import { hostTextGeneration, hostTextForCommit } from "./host-complete-text.js";
    export class MixedService {
      legitimate(home: string, prompt: any) {
        const generate = hostTextGeneration({ homeDirectory: home });
        return generate?.(resolveModelPrompt(home, prompt, "ok"));
      }
      rogue(home: string) {
        return hostTextForCommit(home);
      }
      private internalHelper(home: string) {
        return hostTextGeneration({ homeDirectory: home });
      }
      validCaller(home: string, prompt: any) {
        const generate = this.internalHelper(home);
        return generate?.(resolveModelPrompt(home, prompt, "ok"));
      }
    }
  `;
  const classResult = inspectModelCallSites("apps/local-host/src/synthetic-class.ts", classSiblingRogue);
  assert.equal(classResult.unregistered.length, 1, JSON.stringify(classResult));
  assert.match(classResult.unregistered[0]!, /MixedService\.rogue -> hostTextForCommit/);
});

test("Plugin Builder's designer and code Agents are registered as the prompts they run, not its unused manifest set", () => {
  const known = registered();
  for (const name of ["designer", "experience", "ui", "review", "implement", "revise", "repair", "acceptance"]) assert.ok(known.has(`io.molis.work.plugin-builder/builder-${name}`), name);
  const designer = builtinRegistrations().find(owner => owner.owner_id === "io.molis.work.plugin-builder")!.prompts.find(prompt => prompt.prompt_id === "builder-designer")!;
  assert.ok(designer.version >= 4, "FSS-74: the translated designer ships as one current version");
  assert.match(designer.body_by_locale?.en ?? "", /design/iu);
  const roles = builtinRegistrations().find(owner => owner.owner_id === "io.molis.work.plugin-builder")!.roles;
  assert.deepEqual(roles.map(role => [role.role_id, role.prompt_ids.length]), [["designer", 4], ["coder", 4]], "两个 Agent 作为 Character 列出");
  assert.deepEqual(roles.find(role => role.role_id === "designer")!.prompt_ids, ["builder-designer", "builder-experience", "builder-ui", "builder-review"]);
  for (const legacy of ["builder-base", "builder-design", "builder-behavior"]) assert.ok(!known.has(`io.molis.work.plugin-builder/${legacy}`), legacy);
  const workflow = read("horizontal/plugin-studio/src/agent-workflow.ts");
  assert.doesNotMatch(workflow, /BUILDER_PROMPTS\.(designer|experience|ui|review|implement|revise|repair|acceptance)/, "工作流要经 this.prompt() 取得登记后的文字");
});

test("a runtime file that asks the judgment service through the TypeSafe provider factory says where its questions come from", () => {
  const callers = RUNTIME_SOURCES.filter(path => /createPrologueTypeSafeProvider\(/.test(read(path)) && !TYPESAFE_FACTORIES.has(path)).sort();
  assert.deepEqual(callers, Object.keys(TYPESAFE_CALLERS).sort(), "a file that builds a TypeSafe provider is listed in TYPESAFE_CALLERS with its reason, and a file that no longer does is taken off it");
  for (const [path, reason] of Object.entries(TYPESAFE_CALLERS)) assert.ok(reason.replace(/\s+/g, "").length >= 12, `${path}: say where its questions come from`);
});

/**
 * Each judgment wording the person can edit (设置 › 提示词), with every shipped version as [version, first 16 hex of the sha-256 of the shipped
 * body or the full language set]. The registered version and the fingerprint of the registered text must equal the last row: changing the default text without
 * raising the version, or raising the version without changing the text, fails, so "the default was updated" reaches the people who edited it.
 * A change adds a row; no row is edited or removed.
 */
const WORDING_HISTORY: Readonly<Record<string, ReadonlyArray<readonly [number, string]>>> = {
  "system:contextual/contextual.next": [[1, "96f7580dc4cc2f98"], [2, "dec965681829cd19"], [3, "867279908f6bcf58"]],
  "system:contextual/contextual.surface": [[1, "7df658138dab2107"], [2, "30758305968dc65c"]],
  "system:contextual/contextual.draft": [[1, "4b887167a46f0e24"], [2, "52a31e1969853577"], [3, "a07c38c223004a8f"]],
  "io.molis.work.plugin-builder/choose.capability": [[1, "9d814fb0b2f16a3b"], [2, "a838a63b669ae189"]],
  "io.molis.work.plugin-builder/choose.component": [[1, "30528fb1319325ba"], [2, "6ddc67034cf55f92"]],
  // N31: the current wording starts at 1. Earlier evaluations remain in specs/prologue-adoption §6.0e.
  "io.molis.work.coding/coding-background": [[1, "1c6292f9e8eeaba8"], [2, "feacb285e133e257"]],
};
const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

test("a registered judgment wording's version moves with its default text", () => {
  const bodies = registeredPrompts();
  for (const [key, history] of Object.entries(WORDING_HISTORY)) {
    const prompt = bodies.get(key);
    assert.ok(prompt, `${key} is not registered`);
    const last = history.at(-1)!;
    assert.equal(prompt.version, last[0], `${key}: the registered version is not the last row of its history (a changed text needs a new version and a new row)`);
    assert.equal(fingerprint(prompt.body_by_locale ? JSON.stringify([prompt.body, prompt.body_by_locale.en]) : prompt.body), last[1], `${key}: the default text changed without a new row in the history`);
    history.forEach((row, index) => { if (index) assert.ok(row[0] > history[index - 1]![0], `${key}: versions rise from row to row`); });
    assert.equal(new Set(history.map(row => row[1])).size, history.length, `${key}: a version that does not change the text`);
  }
  const everyWording = [...bodies.keys()].filter(key => key.startsWith("system:contextual/") || key.startsWith("io.molis.work.plugin-builder/choose.") || key.startsWith("io.molis.work.coding/coding-background"));
  assert.deepEqual(everyWording.sort(), Object.keys(WORDING_HISTORY).sort(), "a new judgment wording starts its own history");
});

test("Plugin Builder's two questions to the judgment service are registered where the person can edit them, and the workflow asks for them instead of carrying the words", () => {
  const known = registered();
  for (const id of ["choose.capability", "choose.component"]) assert.ok(known.has(`io.molis.work.plugin-builder/${id}`), id);
  const workflow = read("horizontal/plugin-studio/src/agent-workflow.ts");
  assert.doesNotMatch(workflow, /只从合法候选中选最适合这项功能的一个能力|结合整页布局与相邻部件，从合法候选中选择组件/, "工作流要经 instruction 端口取得登记后的文字，不再写死这两句");
  assert.match(workflow, /instructionText\(this\.ports, BUILDER_CHOOSE_CAPABILITY\)/);
  assert.match(workflow, /instructionText\(this\.ports, BUILDER_CHOOSE_COMPONENT\)/);
});
