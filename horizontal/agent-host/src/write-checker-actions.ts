import { posix } from "node:path";
import { agentErrors } from "./errors.js";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { agentWriteCheckerActions, type AgentWriteChecker, type AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";

type Call = { invocation: HostCapabilityInvocation };
/** The registration helper, for actions only: each of these is in the action directory, never a typed-only capability. */
type Register<C extends Call> = <Input, Output>(definition: ActionDefinition<Input, Output>, handler: (call: C, input: Input) => Output | Promise<Output>) => () => void;

/** The project's workspaces as the Host reads them at this call, and where their checkers are kept. */
export interface WriteCheckerPorts<C extends Call> {
  pluginFor(call: C): HostPluginCaller | undefined;
  projectId(call: C): string;
  writeCheckers(call: C): Promise<{ workspaces: readonly ProjectWorkspaceRef[]; store: AgentWriteCheckerStore }>;
}

const FILE = "{file}";
/**
 * The SDK's protected metadata directories (`PROTECTED_SEGMENTS` in its workspace paths, not exported): it refuses a command
 * whose working directory is in one, so a checker that would run there is refused when it is saved, not each time it runs.
 */
const PROTECTED = [".git", "node_modules", ".prologue"];
const invalid = (checker: AgentWriteChecker, why: string) => agentErrors.write_checker_invalid(`检查器「${checker.display_name}」${why}`);

/** What the actions' schema cannot say about one checker, and the defaults the stored list carries (§6.0p.2, §6.0p.3). */
function checkedChecker(checker: AgentWriteChecker): Required<AgentWriteChecker> {
  // A bare name found on the Host's PATH (S-38): the Host runs no paths, so one with a path would be kept and never run.
  if (/[\\/]/.test(checker.executable) || !checker.executable.trim() || [".", ".."].includes(checker.executable)) {
    throw invalid(checker, "的可执行文件要写成程序名（在 PATH 上找），不能带路径");
  }
  // One file per check (§6.0p.9): a command without the file would check the whole project and call that a diagnosis.
  if (checker.args.filter(arg => arg === FILE).length !== 1) throw invalid(checker, "的参数里要有一个、也只能有一个 {file}");
  if (checker.args.some(arg => arg !== FILE && arg.includes(FILE))) throw invalid(checker, "的 {file} 要单独作为一个参数，不能嵌在别的文字里");
  const cwd = posix.normalize(checker.cwd ?? ".");
  if (posix.isAbsolute(cwd) || cwd === ".." || cwd.startsWith("../") || cwd.includes("\\")) throw invalid(checker, "的工作目录要写成工作区根下的相对路径");
  if (cwd.split("/").some(segment => PROTECTED.includes(segment))) throw invalid(checker, "的工作目录不能在 .git、node_modules 或 .prologue 里");
  return { ...checker, args: [...checker.args], applies_to: [...checker.applies_to], cwd, timeout_ms: checker.timeout_ms ?? 30_000 };
}

/**
 * The person's after-write checkers (specs/prologue-adoption §6.0p.2): read and saved only by the person, in settings, and
 * only for a workspace the project has authorized, with its real path verified, at this call. The action service already
 * turns away every audience but `user`; a plugin's call is refused here too, since a plugin's own route reaches the Host as
 * a plugin. Saving is not where checks are made safe: the executor checks the authorization again when it runs one.
 */
export function registerWriteCheckerActions<C extends Call>(register: Register<C>, ports: WriteCheckerPorts<C>): Array<() => void> {
  const person = (call: C) => { if (ports.pluginFor(call)) throw new ActionError("actions.forbidden", "写后检查器只由人在设置里改"); };
  return [
    register(agentWriteCheckerActions.list, async (call) => {
      person(call);
      const { workspaces, store } = await ports.writeCheckers(call);
      const projectId = ports.projectId(call);
      return { lists: await Promise.all(workspaces.filter(workspace => workspace.realpath_verified).map(workspace => store.read(projectId, workspace.workspace_id))) };
    }),
    register(agentWriteCheckerActions.save, async (call, input) => {
      person(call);
      const ids = input.checkers.map(checker => checker.checker_id);
      if (new Set(ids).size !== ids.length) throw agentErrors.write_checker_invalid("同一份清单里检查器的 id 不能重复");
      const checkers = input.checkers.map(checkedChecker);
      const { workspaces, store } = await ports.writeCheckers(call);
      if (!workspaces.some(workspace => workspace.workspace_id === input.workspace_id && workspace.realpath_verified)) {
        throw agentErrors.directory_unauthorized("写后检查器只能存给这个项目此刻已授权的工作区");
      }
      // A call cancelled or revoked by now saves nothing.
      await call.invocation.beforeEffect(); call.invocation.assertAuthorityCurrent();
      return store.save(ports.projectId(call), input.workspace_id, input.expected_version, checkers);
    }),
  ];
}
