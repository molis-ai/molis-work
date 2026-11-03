import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { SHELF_INSTRUCTIONS } from "@molis-ai/molis-work-plugin-shelf";
import { BUILTIN_DEFINITIONS } from "./fixtures/builtin-definitions.js";
import { builtinRegistrations } from "../apps/local-host/src/agent-definitions/builtin-agents.js";
import { BUILTIN_INSTRUCTIONS, UNREGISTERED_MODEL_CALLS } from "../apps/local-host/src/agent-definitions/builtin-instructions.js";

const ROOT = new URL("..", import.meta.url).pathname;

function sources(directory: string): string[] {
  return readdirSync(join(ROOT, directory)).flatMap(name => {
    const path = join(directory, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(join(ROOT, path)).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.endsWith(".d.ts") ? [path] : [];
  });
}

const HOST = sources("apps/local-host/src");
const PLUGINS = readdirSync(join(ROOT, "plugins/native")).flatMap(name => {
  try { return sources(`plugins/native/${name}/src`); } catch { return []; }
});
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
 * Model calls that still send text the person cannot see in “Prompt 与 Character”, each with why. The list only
 * shrinks: a new entry needs the same kind of reason, and a file that no longer needs one fails below.
 */
const TRANSITIONAL: Readonly<Record<string, string>> = {
  // The transport itself: it sends what its callers already resolved.
  "apps/local-host/src/host-complete-text.ts": "Host 文字模型的传输层，发送调用方已解析好的文字",
  // Prologue inference as the Host composes it: it forwards the questions its caller gives, whatever they are.
  "apps/local-host/src/agent-host-composition.ts": "Prologue 推理的宿主装配，原样转发调用方给出的判断题目，属于传输层",
};

/** Modules that only build a Host text model and hand it to a caller that resolves its instructions. */
const FACTORIES = new Set([
  // The former Jelly factory now serves trusted consumer declarations; it only probes environment availability.
  "apps/local-host/src/model-configuration.ts",
  // Builds the TypeSafe provider a caller hands its own questions to; the questions are the caller's (see TYPESAFE_CALLERS).
  "apps/local-host/src/typesafe-prologue.ts",
]);

/**
 * Host files that ask the judgment service (TypeSafe) through `createPrologueTypeSafeProvider`, which the direct-call pattern below
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

test("every instruction a built-in model call defines is registered where the person can see and edit it", () => {
  const known = registered();
  const defined: string[] = [];
  for (const path of [...HOST, ...PLUGINS]) {
    const text = read(path);
    for (const match of text.matchAll(/defineInstructionPrompt\(\{[\s\S]*?prompt_id:\s*"([^"]+)"/g)) {
      const owner = /owner_id:\s*([A-Z_]+|"[^"]+")/.exec(text.slice(match.index))?.[1] ?? "";
      const ownerId = owner.startsWith("\"") ? owner.slice(1, -1) : ownerConstant(path, owner);
      assert.ok(ownerId, `${path}: ${match[1]} 的 owner_id 需能解析到字面量、同文件常量或相对模块导出的常量`);
      defined.push(`${ownerId}/${match[1]}`);
    }
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
  // The Host lists its own modules', Plugin Builder's (the platform's, PG-051 Q2) and Alchemist's (served by the Host, not run as a definition).
  const HOST_OWNERS = new Set(["io.molis.work.plugin-builder", "io.molis.work.alchemist"]);
  assert.deepEqual(BUILTIN_INSTRUCTIONS.filter(prompt => !prompt.owner_id.startsWith("system:") && !HOST_OWNERS.has(prompt.owner_id)).map(key), [],
    "a plugin's instructions are carried by its definition (`PluginDefinition.instructions`), not named in the Host list");
  assert.deepEqual(BUILTIN_INSTRUCTIONS.filter(prompt => declared.has(key(prompt))).map(key), [], "not in both");
  assert.ok(declared.size >= 12, `only ${declared.size} definition instructions found, check the scan`);
  for (const id of ["choose.capability", "choose.component"]) assert.ok(keys.includes(`io.molis.work.plugin-builder/${id}`), `${id} is the platform's, in the Host list`);
});

test("a Plugin's model port takes registered instructions, not a raw prompt string", () => {
  const raw = PLUGINS.filter(path => /completeText\??\s*[:(]\s*\(?\s*prompt\s*:\s*string/.test(read(path)));
  assert.deepEqual(raw, [], "插件的 completeText 端口应接收 InstructedPrompt / ModelPromptInput");
});

test("Host modules reach a model only through the register, apart from the transitional list", () => {
  const direct = /host(?:CompleteText|TextGeneration)\(|\.completeText(Result)?\(\{|\.evaluateTypeSafe\(/;
  const offenders = HOST.filter(path => {
    const text = read(path);
    if (!direct.test(text)) return false;
    return !/resolveModelPrompt|resolveInstructionPrompt|withRegisteredPrompts|resolvePluginPrompt|registeredInstructionBody/.test(text) && !TRANSITIONAL[path] && !FACTORIES.has(path);
  });
  assert.deepEqual(offenders, [], "这些 Host 模块直接调用模型而没有经过登记的指令");
  for (const path of Object.keys(TRANSITIONAL)) assert.ok(direct.test(read(path)), `${path} 已不再直接调用模型，从过渡清单里去掉它`);
  // Every exception that is not the transport itself is shown to developers too, with the same reason.
  assert.deepEqual(UNREGISTERED_MODEL_CALLS, [], "已迁移的消费者不再保留未登记指令例外");
});

test("Plugin Builder's designer and code Agents are registered as the prompts they run, not its unused manifest set", () => {
  const known = registered();
  for (const name of ["designer", "experience", "ui", "review", "implement", "revise", "repair", "acceptance"]) assert.ok(known.has(`io.molis.work.plugin-builder/builder-${name}`), name);
  const designer = builtinRegistrations().find(owner => owner.owner_id === "io.molis.work.plugin-builder")!.prompts.find(prompt => prompt.prompt_id === "builder-designer")!;
  assert.equal(designer.version, 30800, "登记版本随 designer/3.8.0 变化，默认更新时才会提示用户");
  const roles = builtinRegistrations().find(owner => owner.owner_id === "io.molis.work.plugin-builder")!.roles;
  assert.deepEqual(roles.map(role => [role.role_id, role.prompt_ids.length]), [["designer", 4], ["coder", 4]], "两个 Agent 作为 Character 列出");
  assert.deepEqual(roles.find(role => role.role_id === "designer")!.prompt_ids, ["builder-designer", "builder-experience", "builder-ui", "builder-review"]);
  for (const legacy of ["builder-base", "builder-design", "builder-behavior"]) assert.ok(!known.has(`io.molis.work.plugin-builder/${legacy}`), legacy);
  const workflow = read("plugins/native/plugin-builder/src/agent-workflow.ts");
  assert.doesNotMatch(workflow, /BUILDER_PROMPTS\.(designer|experience|ui|review|implement|revise|repair|acceptance)/, "工作流要经 this.prompt() 取得登记后的文字");
});

test("a Host file that asks the judgment service through the TypeSafe provider factory says where its questions come from", () => {
  const callers = HOST.filter(path => /createPrologueTypeSafeProvider\(/.test(read(path)) && !FACTORIES.has(path)).sort();
  assert.deepEqual(callers, Object.keys(TYPESAFE_CALLERS).sort(), "a file that builds a TypeSafe provider is listed in TYPESAFE_CALLERS with its reason, and a file that no longer does is taken off it");
  for (const [path, reason] of Object.entries(TYPESAFE_CALLERS)) assert.ok(reason.replace(/\s+/g, "").length >= 12, `${path}: say where its questions come from`);
});

/**
 * Each judgment wording the person can edit (设置 › 提示词), with every shipped version as [version, first 16 hex of the sha-256 of the default
 * text]. The registered version and the fingerprint of the registered text must equal the last row: changing the default text without
 * raising the version, or raising the version without changing the text, fails, so "the default was updated" reaches the people who edited it.
 * A change adds a row; no row is edited or removed.
 */
const WORDING_HISTORY: Readonly<Record<string, ReadonlyArray<readonly [number, string]>>> = {
  "system:contextual/contextual.next": [[1, "96f7580dc4cc2f98"]],
  "system:contextual/contextual.surface": [[1, "7df658138dab2107"]],
  "system:contextual/contextual.draft": [[1, "4b887167a46f0e24"]],
  "io.molis.work.plugin-builder/choose.capability": [[1, "9d814fb0b2f16a3b"]],
  "io.molis.work.plugin-builder/choose.component": [[1, "30528fb1319325ba"]],
  // Coding's executing role learns to wait on something outside (P3c, specs/prologue-adoption §4.6.8). v2 on MiniMax-M3 with
  // tests/coding-external-wait-live.test.ts, 4 tasks x 3 runs: T1 2/3, T2 0/3, T3 0/3, T4 3/3; each failure and whether it is the
  // design, the model or unsure: specs/prologue-adoption §6.0e.
  "io.molis.work.coding/coding-background": [[1, "ffceea0d45170e35"], [2, "1c6292f9e8eeaba8"]],
};
const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

test("a registered judgment wording's version moves with its default text", () => {
  const bodies = registeredPrompts();
  for (const [key, history] of Object.entries(WORDING_HISTORY)) {
    const prompt = bodies.get(key);
    assert.ok(prompt, `${key} is not registered`);
    const last = history.at(-1)!;
    assert.equal(prompt.version, last[0], `${key}: the registered version is not the last row of its history (a changed text needs a new version and a new row)`);
    assert.equal(fingerprint(prompt.body), last[1], `${key}: the default text changed without a new row in the history`);
    history.forEach((row, index) => { if (index) assert.ok(row[0] > history[index - 1]![0], `${key}: versions rise from row to row`); });
    assert.equal(new Set(history.map(row => row[1])).size, history.length, `${key}: a version that does not change the text`);
  }
  const everyWording = [...bodies.keys()].filter(key => key.startsWith("system:contextual/") || key.startsWith("io.molis.work.plugin-builder/choose.") || key.startsWith("io.molis.work.coding/coding-background"));
  assert.deepEqual(everyWording.sort(), Object.keys(WORDING_HISTORY).sort(), "a new judgment wording starts its own history");
});

test("Plugin Builder's two questions to the judgment service are registered where the person can edit them, and the workflow asks for them instead of carrying the words", () => {
  const known = registered();
  for (const id of ["choose.capability", "choose.component"]) assert.ok(known.has(`io.molis.work.plugin-builder/${id}`), id);
  const workflow = read("plugins/native/plugin-builder/src/agent-workflow.ts");
  assert.doesNotMatch(workflow, /只从合法候选中选最适合这项功能的一个能力|结合整页布局与相邻部件，从合法候选中选择组件/, "工作流要经 instruction 端口取得登记后的文字，不再写死这两句");
  assert.match(workflow, /instructionText\(this\.ports, BUILDER_CHOOSE_CAPABILITY\)/);
  assert.match(workflow, /instructionText\(this\.ports, BUILDER_CHOOSE_COMPONENT\)/);
});
