import type { UiRequestInit } from "@molis-ai/molis-work-contracts/platform/ui";
import type { createTerminalScreens } from "./screens.js";

/** What a Goal's terminal is to the program it runs: a recipe of the platform, or a command with its arguments. */
export type PanelProgram = { runtime: string } | { command: string; args: string[] };

/**
 * A terminal as Goals lists it (`goals.terminal.list`), with the Goal it was listed for; `status` is this page's own view of the process
 * (from `running` when listed, then from the channel's `spawned` and `exit`).
 */
export type PanelRecord = {
  key: string;
  panel_id: string;
  goal_id: string;
  title: string;
  runtime: string;
  program: PanelProgram;
  status: "open" | "exited";
};

/** Why the page attaches: the Host just started it (`start`, `reopen`), it was already there (`attach`), or the channel came back (`reconnect`). */
export type SpawnMode = "start" | "attach" | "reopen" | "reconnect";

export type TerminalScreens = ReturnType<typeof createTerminalScreens>;

export type TerminalStatusSetter = (text: string, state?: "busy" | "live" | "error") => void;

/** The page's request helper as the terminal uses it (`molisWorkRequest`): a refused answer is an `Error` with the Host's message. */
export type TerminalRequest = <T = unknown>(url: string, init?: UiRequestInit) => Promise<T>;

/** What the panel controller and its spawn queue share on one page. */
export interface TerminalPanelState {
  panels: PanelRecord[];
  activeId: string | null;
  readonly alive: Set<string>;
  loadSequence: number;
}
