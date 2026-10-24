import type { UiRequestInit } from "@molis-ai/molis-work-contracts/platform/ui";
import type { createTerminalScreens } from "./screens.js";

export type PanelRecord = {
  panel_id: string;
  goal_id: string;
  runtime_kind: string;
  launch_command: string;
  launch_args: string[];
  cwd: string | null;
  work_context_id: string;
  title: string;
  status: "open" | "exited";
  spawn?: {
    command: string;
    args: string[];
    cwd: string | null;
    env: Record<string, string>;
    sessionId?: string | null;
  };
};

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
