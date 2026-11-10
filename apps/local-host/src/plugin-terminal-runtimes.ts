import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { EXTERNAL_SESSION_NATIVE_ID_PATTERN, externalTool, externalToolIdsWith } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { buildPtyEnvironment, isPtyCommandAvailable, resolvePtyCommand } from "@molis-ai/molis-work-service-runtime-host";

/** The coding runtimes a terminal can run by name (S-103 ⑤): the register's rows with a `terminal`, also read by onboarding and the Desktop launch. */
export const TERMINAL_RUNTIMES = externalToolIdsWith("terminal");
export type TerminalRuntime = (typeof TERMINAL_RUNTIMES)[number];

interface TerminalRuntimeRecipe {
  /** The command name, looked up on the platform's PATH. */
  command: string;
  /** The arguments that resume the runtime's own session. */
  resumeArgs: (sessionId: string) => string[];
}

/** A runtime session a terminal resumes: it becomes one argument of a recipe's resume arguments, so it passes the register's one rule for a native id. */
export function isTerminalSessionId(value: unknown): value is string {
  return typeof value === "string" && EXTERNAL_SESSION_NATIVE_ID_PATTERN.test(value);
}

export function isTerminalRuntime(value: string): value is TerminalRuntime {
  return (TERMINAL_RUNTIMES as readonly string[]).includes(value);
}

/** The recipe of a runtime: its command name, its display name, and how it resumes a session. */
export function terminalRuntimeRecipe(runtime: TerminalRuntime): TerminalRuntimeRecipe & { title: string } {
  const tool = externalTool(runtime), argv: readonly string[] = tool.sessions.resume.argv;
  return { command: tool.terminal.command, resumeArgs: sessionId => argv.map(part => part === "{session_id}" ? sessionId : part), title: tool.display_name };
}

/** A bare command name the platform may look up on its PATH: no separator, no shell syntax. */
const COMMAND_NAME = /^[A-Za-z0-9._+-]{1,128}$/u;

/** How a terminal's program is written: an absolute path, or a bare name the platform looks up on its PATH. */
export function isTerminalCommand(command: string): boolean {
  return command.startsWith("/") || (COMMAND_NAME.test(command) && command !== "." && command !== "..");
}

/** The PATH terminals start with (the login shell's, read once per process): read before a catalog transaction, never inside one. */
export function terminalSearchPath(): string {
  return buildPtyEnvironment().PATH ?? "";
}

/**
 * The absolute program for a command: an absolute path as given, or a bare name found on the platform's PATH. Anything else (a relative
 * path, a name with shell syntax) is refused; a name that is not on the PATH is unavailable.
 */
export function terminalCommandPath(command: string, searchPath: string): string {
  if (!isTerminalCommand(command)) throw new ActionError("actions.input_invalid", "终端启动参数无效");
  if (command.startsWith("/")) return command;
  const found = isPtyCommandAvailable(command, searchPath) ? resolvePtyCommand(command, searchPath) : "";
  if (!found.startsWith("/")) throw new ActionError("actions.unavailable", `找不到命令：${command}，请先安装，或确认它在 PATH 中。`);
  return found;
}
