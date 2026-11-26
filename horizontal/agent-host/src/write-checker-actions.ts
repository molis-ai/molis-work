import { posix } from "node:path";
import { agentErrors } from "./errors.js";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { agentWriteCheckerActions, type AgentWriteChecker, type AgentWriteCheckerStore } from "@molis-ai/molis-work-contracts/services/agent-host";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

type Call = { invocation: HostCapabilityInvocation };
/** The registration helper, for actions only: each of these is in the action directory, never a typed-only capability. */
type Register<C extends Call> = <Input, Output>(definition: ActionDefinition<Input, Output>, handler: (call: C, input: Input) => Output | Promise<Output>) => () => void;

/** The project's workspaces as the Host reads them at this call, and where their checkers are kept. */
interface WriteCheckerPorts<C extends Call> {
  pluginFor(call: C): HostPluginCaller | undefined;
  projectId(call: C): string;
  writeCheckers(call: C): Promise<{ workspaces: readonly ProjectWorkspaceRef[]; store: AgentWriteCheckerStore }>;
}

const FILE = "{file}";
/*
 * Whether the SDK runs a check comes down to rules it does not export yet (BL-220 asks Prologue for one function that says).
 * They are copied here, so a checker that could never run is refused when it is saved, not after each review:
 * - `prepareCommand` (`workspace/core/mutate-command`): no whitespace or shell character in the executable;
 * - the Host's `runCommand` (`host/plugin/node-processes`): a bare name, never a path, and never one of its `NEVER_RUN`;
 * - `normalizeRelativePath` (`host/core/workspace-path`): the directory trimmed, inside the root, not in `PROTECTED_SEGMENTS`,
 *   and written the way it gives it back: no trailing `/`, and `./` is `.`. It is kept in that form, since the executor
 *   compares it with the written path as it is kept, and a `src/` would never match a file.
 */
const NOT_A_NAME = /[\s;&|><$`\\/]/;
const NEVER_RUN = ["rm", "rmdir", "mkfs", "dd", "shutdown", "reboot", "sudo", "su", "chown", "chmod"];
const PROTECTED = [".git", "node_modules", ".prologue"];

/** What the actions' schema cannot say about one checker, and the defaults the stored list carries (§6.0p.2, §6.0p.3). */
function checkedChecker(checker: AgentWriteChecker): Required<AgentWriteChecker> {
  const name = checker.display_name;
  const invalid = (why: string) => agentErrors.write_checker_invalid(why);
  // A bare name found on the Host's PATH (S-38), run without a shell: anything else would be kept and never run.
  if (NOT_A_NAME.test(checker.executable) || [".", ".."].includes(checker.executable)) {
    throw invalid(uiText.text("workbench.write-checkers-refusal.program-name", { name }));
  }
  if (NEVER_RUN.includes(checker.executable)) throw invalid(uiText.text("workbench.write-checkers-refusal.never-run", { name, program: checker.executable }));
  // One file per check (§6.0p.9): a command without the file would check the whole project and call that a diagnosis.
  if (checker.args.filter(arg => arg === FILE).length !== 1) throw invalid(uiText.text("workbench.write-checkers-refusal.one-file", { name, file: FILE }));
  if (checker.args.some(arg => arg !== FILE && arg.includes(FILE))) throw invalid(uiText.text("workbench.write-checkers-refusal.file-alone", { name, file: FILE }));
  // The SDK trims the directory, then refuses one that starts with a drive and a separator (`C:/`, `C:\`), exactly that:
  // kept with spaces around it, it would run somewhere other than it says; on a drive, not at all. Both are checked on the
  // normalized value, the one that is kept, since normalizing can bring either to an end (`./ /etc`, `./C:/x`).
  // The trailing separator is dropped as the SDK does (`src/` is `src`, `./` is `.`): after the drive is looked at, since `C:/`
  // is one and `C:` is not, and before the rest, so `src /` is caught as spaces at an end and a bare `/` stays absolute.
  const normalized = posix.normalize(checker.cwd ?? ".");
  const cwd = normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  if (cwd !== cwd.trim() || /^[A-Za-z]:[\\/]/.test(normalized)) throw invalid(uiText.text("workbench.write-checkers-refusal.relative-folder", { name }));
  if (posix.isAbsolute(cwd) || cwd === ".." || cwd.startsWith("../") || cwd.includes("\\")) throw invalid(uiText.text("workbench.write-checkers-refusal.relative-folder", { name }));
  if (cwd.split("/").some(segment => PROTECTED.includes(segment))) throw invalid(uiText.text("workbench.write-checkers-refusal.protected-folder", { name }));
  return { ...checker, args: [...checker.args], applies_to: [...checker.applies_to], cwd, timeout_ms: checker.timeout_ms ?? 30_000 };
}

/**
 * The person's after-write checkers (specs/prologue-adoption §6.0p.2): read and saved only by the person, in settings, and
 * only for a workspace the project has authorized, with its real path verified, at this call. The action service already
 * turns away every audience but `user`; a plugin's call is refused here too, since a plugin's own route reaches the Host as
 * a plugin. Saving is not where checks are made safe: the executor checks the authorization again when it runs one.
 */
export function registerWriteCheckerActions<C extends Call>(register: Register<C>, ports: WriteCheckerPorts<C>): Array<() => void> {
  const person = (call: C) => { if (ports.pluginFor(call)) throw new ActionError("actions.forbidden", uiText.text("workbench.write-checkers-refusal.person-only")); };
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
      if (new Set(ids).size !== ids.length) throw agentErrors.write_checker_invalid(uiText.text("workbench.write-checkers-refusal.duplicate-id"));
      const checkers = input.checkers.map(checkedChecker);
      const { workspaces, store } = await ports.writeCheckers(call);
      if (!workspaces.some(workspace => workspace.workspace_id === input.workspace_id && workspace.realpath_verified)) {
        throw agentErrors.directory_unauthorized(uiText.text("workbench.write-checkers-refusal.folder-not-authorized"));
      }
      // A call cancelled or revoked by now saves nothing.
      await call.invocation.beforeEffect(); call.invocation.assertAuthorityCurrent();
      return store.save(ports.projectId(call), input.workspace_id, input.expected_version, checkers);
    }),
  ];
}
