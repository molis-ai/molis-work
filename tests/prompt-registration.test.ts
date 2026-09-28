import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { builtinRegistrations } from "../apps/local-host/src/agent-definitions/builtin-agents.js";

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
const registered = () => new Set(builtinRegistrations().flatMap(owner => owner.prompts.map(prompt => `${owner.owner_id}/${prompt.prompt_id}`)));

/**
 * Model calls that still send text the person cannot see in “Prompt 与 Character”, each with why. The list only
 * shrinks: a new entry needs the same kind of reason, and a file that no longer needs one fails below.
 */
const TRANSITIONAL: Readonly<Record<string, string>> = {
  // The transport itself: it sends what its callers already resolved.
  "apps/local-host/src/host-complete-text.ts": "Host 文字模型的传输层，发送调用方已解析好的文字",
  // Alchemist's studio composes its own system prompt per job inside the Plugin; moving it is its own slice.
  "apps/local-host/src/alchemist-prologue.ts": "Alchemist 的 systemPrompt 由插件内的工作室按任务拼出，迁移单列",
};

/** Modules that only build a Host text model and hand it to a caller that resolves its instructions. */
const FACTORIES = new Set(["apps/local-host/src/jelly-model.ts"]);

test("every instruction a built-in model call defines is registered where the person can see and edit it", () => {
  const known = registered();
  const defined: string[] = [];
  for (const path of [...HOST, ...PLUGINS]) {
    const text = read(path);
    for (const match of text.matchAll(/defineInstructionPrompt\(\{[\s\S]*?prompt_id:\s*"([^"]+)"/g)) {
      const owner = /owner_id:\s*([A-Z_]+|"[^"]+")/.exec(text.slice(match.index))?.[1] ?? "";
      const ownerId = owner.startsWith("\"") ? owner.slice(1, -1) : new RegExp(`const ${owner}\\s*=\\s*"([^"]+)"`).exec(text)?.[1];
      assert.ok(ownerId, `${path}: ${match[1]} 的 owner_id 需是字面量或同文件常量`);
      defined.push(`${ownerId}/${match[1]}`);
    }
  }
  assert.ok(defined.length >= 12, `只找到 ${defined.length} 段指令，检查是否漏扫`);
  assert.deepEqual(defined.filter(key => !known.has(key)), [], "这些指令未登记到 BUILTIN_INSTRUCTIONS");
});

test("a Plugin's model port takes registered instructions, not a raw prompt string", () => {
  const raw = PLUGINS.filter(path => /completeText\??\s*[:(]\s*\(?\s*prompt\s*:\s*string/.test(read(path)));
  assert.deepEqual(raw, [], "插件的 completeText 端口应接收 InstructedPrompt / ModelPromptInput");
});

test("Host modules reach a model only through the register, apart from the transitional list", () => {
  const direct = /hostCompleteText\(|\.completeText(Result)?\(\{/;
  const offenders = HOST.filter(path => {
    const text = read(path);
    if (!direct.test(text)) return false;
    return !/resolveModelPrompt|withRegisteredPrompts/.test(text) && !TRANSITIONAL[path] && !FACTORIES.has(path);
  });
  assert.deepEqual(offenders, [], "这些 Host 模块直接调用模型而没有经过登记的指令");
  for (const path of Object.keys(TRANSITIONAL)) assert.ok(direct.test(read(path)), `${path} 已不再直接调用模型，从过渡清单里去掉它`);
});

test("Plugin Builder's designer and code Agents are registered as the prompts they run, not its unused manifest set", () => {
  const known = registered();
  for (const name of ["designer", "implement", "revise", "repair", "acceptance"]) assert.ok(known.has(`io.molis.work.plugin-builder/builder-${name}`), name);
  const designer = builtinRegistrations().find(owner => owner.owner_id === "io.molis.work.plugin-builder")!.prompts.find(prompt => prompt.prompt_id === "builder-designer")!;
  assert.equal(designer.version, 30200, "登记版本随 designer/3.2.0 变化，默认更新时才会提示用户");
  const roles = builtinRegistrations().find(owner => owner.owner_id === "io.molis.work.plugin-builder")!.roles;
  assert.deepEqual(roles.map(role => [role.role_id, role.prompt_ids.length]), [["designer", 1], ["coder", 4]], "两个 Agent 作为 Character 列出");
  for (const legacy of ["builder-base", "builder-design", "builder-behavior"]) assert.ok(!known.has(`io.molis.work.plugin-builder/${legacy}`), legacy);
  const workflow = read("plugins/native/plugin-builder/src/agent-workflow.ts");
  assert.doesNotMatch(workflow, /BUILDER_PROMPTS\.(designer|implement|revise|repair|acceptance)/, "工作流要经 this.prompt() 取得登记后的文字");
});
