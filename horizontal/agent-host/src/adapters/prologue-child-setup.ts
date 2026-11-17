import path from "node:path";
import { randomUUID } from "node:crypto";
import { AGENT_TOOLS } from "../tool-catalog.js";
import { agentErrors } from "../errors.js";
import { assertChildRoleTools } from "../child-role-tools.js";
import { businessChildTools } from "./prologue-action-gateway.js";
import { exactCharacterKey, type PrologueSubagentRoot } from "./prologue-subagents.js";
import { prologueToolName, stageInstructions } from "./prologue-node-kit.js";
import type { RunDeps } from "./prologue-run.js";
import type { PrologueStartInput } from "./prologue.js";
type ChildRole = NonNullable<PrologueStartInput["subagents"]>[number];

/** What a parent that hands its children their own directories may hold: reading, dispatching, asking the person, the board,
 * the project's sessions and saying how it handles a supplement (receipts 3e-0b); no tool that writes or runs anything.
 * The names are read from the Agent Host's one tool set (`AGENT_TOOLS`), so this can never name a tool the set no longer has. */
const WORKSPACE_PARENT_TOOL_NAMES: readonly string[] = ["read-file", "list", "search", "find-symbol", "context-remaining", "dispatch-subagent", "await-subagents", "steer-subagent", "ask-user", "acknowledge-inputs", "board-read", "board-report", "session-send"];
const WORKSPACE_PARENT_TOOLS: readonly string[] = WORKSPACE_PARENT_TOOL_NAMES.map(name => {
  const entry = AGENT_TOOLS.find(tool => tool.name === name);
  if (!entry) throw new Error(`workspace parent tool ${name} is not in AGENT_TOOLS`);
  return entry.name;
});

/** The round's child directories and fixed child roles, each a published Character, and what the round is told of them. */
export async function childSetup(deps: RunDeps, input: PrologueStartInput, actionNames: readonly string[]) {
  const { runtime } = deps;
  const childRoots: PrologueSubagentRoot[] = [];
  if (input.subagent_workspaces?.length && input.character.tools.some(tool => !WORKSPACE_PARENT_TOOLS.includes(tool))) throw agentErrors.role_execution_exceeded("独立目录协调者只能读取和分派，不能持有其他执行工具");
  for (const grant of input.subagent_workspaces ?? []) {
    const overlaps = (a: string, b: string) => { const relative = path.relative(a, b); return !relative || !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative); };
    if ([input.root_path!, ...childRoots.map(root => root.path)].some(other => overlaps(other, grant.directory.canonical_path) || overlaps(grant.directory.canonical_path, other))) throw new Error("子任务目录必须与主目录及其他子目录互不包含");
    const authorized = await runtime.workspace.authorize({ path: grant.directory.canonical_path });
    childRoots.push({ id: grant.worktree_id, rootRef: authorized.ref, path: grant.directory.canonical_path });
  }
  const childRoles = new Map<string, ChildRole>();
  for (const role of input.subagents ?? []) {
    assertChildRoleTools(role.execution, role.host_tools, childRoots.length > 0, input.character.tools, input.workspace === "business");
    const tools = [...role.host_tools.map(prologueToolName), ...(input.workspace === "business" ? businessChildTools(actionNames, role.execution) : [])];
    const ref = await stageInstructions(runtime, role.prompts.map(prompt => prompt.body).join("\n\n"));
    const draft = runtime.characters.create({ id: `molis-child-${randomUUID()}`, version: role.version, name: role.name, role: role.role_id,
      ...(ref ? { instructionsRef: ref } : {}), tools });
    const published = runtime.characters.publish(draft.ref);
    childRoles.set(exactCharacterKey(published.ref), role);
  }
  const childScope = input.workspace === "business" ? "子任务没有目录，只能使用自己获准的业务能力。不能读取文件、运行命令、调用 MCP 或再次派发。业务改动仍经原确认入口。"
    : childRoots.length
    ? "每个子任务必须选择一个不同的 workspace 标识：" + JSON.stringify(childRoots.map(root => ({ id: root.id, path: root.path }))) + "。主任务只读，不能直接修改主工作区。子任务只在自己的目录里执行，修改仍经过宿主审查。"
      + "核对子任务成果时，可以给 read、list、search 加 workspace 参数（上面的标识）只读查看对应目录；不加就是主工作区。你的查看不代替子任务自己的先读后改，也不能在这些目录里写入或运行命令。"
    : "本轮没有分配独立子目录，不得填写 workspace 参数；所有子任务沿用当前授权目录，都不能修改文件；开放了运行命令的子角色可以运行检查命令，每条都经用户审查。";
  // Facts only: a named role brings the tools it declares, whatever `tools` says; runTools below always holds them all.
  const childInstructions = childRoles.size ? childScope + "可分派的固定子角色（character 用这里的引用，别的会被拒绝）：\n" + [...childRoles].map(([ref, role]) => `${ref}: ${role.name}; tools=${JSON.stringify(role.host_tools.map(prologueToolName))}`).join("\n") + "\nidempotencyKey 必须以字母或数字开头，只含字母、数字、点、下划线、冒号或连字符（最长 128 字符）。给子任务写清任务、必要上下文、依据路径与完成条件；不继承父聊天或材料。子任务不能再次分派。需要用户信息且子角色获准 ask-user 时使用原问卷；没有该能力时将缺少的信息作为阻塞回报父任务。普通消息不代替问题答案或审批。" : "";
  return { childRoots, childRoles, childInstructions };
}

