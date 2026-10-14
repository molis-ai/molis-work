/**
 * The Assistant's use of the person's Mac (specs/computer-use), as the side panel's 「电脑」 tab sees it. One computer per
 * Home: one work at a time may use it, and the person can pause, stop, take over and hand back at any time. The tab
 * hears state and the target app's pictures over one socket at `COMPUTER_SOCKET_PATH`, authenticated like the browser's.
 *
 * Binary socket messages are pictures (PNG) of the app the Assistant is looking at — only that app's window, password
 * fields covered; everything else is JSON.
 */
export const COMPUTER_SOCKET_PATH = "/computer";

export type ComputerPermission = "accessibility" | "screen_recording" | "input_monitoring";

/** unsupported: not macOS 14+; missing: this install has no helper; stopped: not started yet (it starts on first use). */
export type ComputerHelperState = "unsupported" | "missing" | "stopped" | "ready" | "crashed";

/**
 * idle: nobody's work holds the computer. assistant: a round holds it. paused: the person paused it or touched the mouse
 * and keyboard. taken-over: the person took it over. In the last two every look and action is refused until hand-back.
 */
export type ComputerControlMode = "idle" | "assistant" | "paused" | "taken-over";

export type ComputerAppTier = "forbidden" | "look-and-click" | "ask";

export interface ComputerActivity {
  /** What the Assistant is doing, in the person's words (「在「备忘录」点击「新建」」). */
  readonly summary: string;
  /** Where in the target app's window, in points from its top-left corner, for the pointer marker. */
  readonly point: { readonly x: number; readonly y: number } | null;
  readonly at: string;
  readonly app: string | null;
}

export interface ComputerAppView {
  readonly bundle_id: string;
  readonly name: string;
  readonly tier: ComputerAppTier;
  readonly reason: string;
}

export interface ComputerState {
  /** The person's master switch: off until they turn it on in settings. */
  readonly enabled: boolean;
  readonly helper: {
    readonly state: ComputerHelperState;
    readonly problem: { readonly code: string; readonly message: string } | null;
    readonly version: string | null;
  };
  /** The helper's system permissions; null before it ever started. */
  readonly permissions: Readonly<Record<ComputerPermission, boolean>> | null;
  readonly presence: { readonly locked: boolean; readonly away: boolean; readonly reason: string | null };
  readonly control: {
    readonly mode: ComputerControlMode;
    /** The work (session) using the computer; null when none. */
    readonly work_id: string | null;
    readonly paused_reason: "person-input" | "person" | null;
    readonly activity: ComputerActivity | null;
  };
  /** The app the Assistant is looking at; null before it chose one. */
  readonly target: ComputerAppView | null;
  /** Apps the person allowed for the rest of this round (spec D06). */
  readonly allowed_this_round: readonly string[];
  /** The record of the round using the computer. */
  readonly record_id: string | null;
}

export type ComputerClientMessage =
  | { readonly type: "auth"; readonly token: string }
  | { readonly type: "watch" }
  | { readonly type: "visible"; readonly visible: boolean }
  | { readonly type: "pause" }
  | { readonly type: "takeover" }
  | { readonly type: "handback" }
  /** Ends the round using the computer. */
  | { readonly type: "stop" };

export type ComputerServerMessage =
  | { readonly type: "ready" }
  | { readonly type: "state"; readonly state: ComputerState }
  | { readonly type: "error"; readonly message: string };
