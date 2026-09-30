/**
 * The side panel's browser (specs/side-panel §3.2). One Chrome-family browser per Home, started by the local Host
 * with its own profile (never the person's own browser and sign-ins); one page per project. The panel shows the
 * page's screencast and sends input back over one socket at `BROWSER_SOCKET_PATH`, authenticated like the terminal.
 *
 * Binary socket messages are screencast frames (JPEG) of the page the socket is attached to; everything else is JSON.
 */
export const BROWSER_SOCKET_PATH = "/browser";

export type BrowserPageStatus = "starting" | "loading" | "ready" | "crashed" | "stopped" | "unavailable";

/** Who drives the page right now. `person` also covers "nobody": the assistant only acts when it holds control. */
export type BrowserControlMode = "person" | "assistant" | "taken-over";

export interface BrowserAssistantActivity {
  /** What the assistant is doing, in words the person reads ("在 example.com 点击「提交」"). */
  readonly summary: string;
  /** Where on the page (CSS pixels of the viewport), for the pointer marker. */
  readonly point: { readonly x: number; readonly y: number } | null;
  readonly at: string;
}

export interface BrowserDialog {
  readonly id: string;
  readonly type: "alert" | "confirm" | "prompt" | "beforeunload";
  readonly message: string;
  readonly default_prompt: string;
}

export interface BrowserDownload {
  readonly id: string;
  readonly filename: string;
  readonly state: "in-progress" | "completed" | "canceled";
  readonly received_bytes: number;
  readonly total_bytes: number;
}

export interface BrowserPageState {
  readonly project_id: string;
  readonly status: BrowserPageStatus;
  /** The page address as the person should see it; empty on a new page. */
  readonly url: string;
  /** scheme://host[:port], the identity the person and the site rules go by; empty when none. */
  readonly origin: string;
  readonly title: string;
  readonly secure: boolean;
  readonly loading: boolean;
  readonly can_go_back: boolean;
  readonly can_go_forward: boolean;
  readonly viewport: { readonly width: number; readonly height: number };
  /** Pages opened by this one (sign-in windows and the like) stack over it; closing one returns to the page below. */
  readonly popup_depth: number;
  readonly dialog: BrowserDialog | null;
  /** The page asked for a file; the person picks one in the panel (the assistant uses its own upload action). */
  readonly file_chooser: { readonly id: string; readonly multiple: boolean } | null;
  readonly downloads: readonly BrowserDownload[];
  readonly control: { readonly mode: BrowserControlMode; readonly work_id: string | null; readonly activity: BrowserAssistantActivity | null };
  /** Why the page cannot be shown, in the person's words, with what to do about it. */
  readonly problem: { readonly code: BrowserProblemCode; readonly message: string } | null;
  /** The browser in use, e.g. "Google Chrome"; null when none was found. */
  readonly engine: string | null;
}

export type BrowserProblemCode =
  | "browser.not_found"
  | "browser.start_failed"
  | "browser.profile_in_use"
  | "browser.crashed"
  | "page.crashed"
  | "page.load_failed"
  | "page.blocked_scheme";

export type BrowserModifiers = number; // CDP bit mask: Alt=1, Ctrl=2, Meta=4, Shift=8

export type BrowserClientMessage =
  | { readonly type: "auth"; readonly token: string }
  /** Hear this project's page state without starting the browser (the panel opens itself when the Assistant acts). */
  | { readonly type: "watch"; readonly project_id: string }
  | { readonly type: "attach"; readonly project_id: string; readonly viewport: BrowserViewport }
  | { readonly type: "visible"; readonly visible: boolean }
  | { readonly type: "resize"; readonly viewport: BrowserViewport }
  | { readonly type: "navigate"; readonly input: string }
  | { readonly type: "history"; readonly delta: -1 | 1 }
  | { readonly type: "reload" }
  | { readonly type: "stop" }
  | { readonly type: "restart" }
  | { readonly type: "mouse"; readonly event: "down" | "up" | "move" | "wheel"; readonly x: number; readonly y: number;
      readonly button: "none" | "left" | "middle" | "right"; readonly buttons: number; readonly click_count: number;
      readonly modifiers: BrowserModifiers; readonly delta_x?: number; readonly delta_y?: number }
  | { readonly type: "key"; readonly event: "down" | "up"; readonly key: string; readonly code: string; readonly key_code: number;
      readonly text?: string; readonly modifiers: BrowserModifiers }
  /** Text the person typed or pasted, and what an input method commits. */
  | { readonly type: "text"; readonly text: string }
  /** An input method's composition in progress (shown underlined in the page); empty ends it. */
  | { readonly type: "compose"; readonly text: string }
  | { readonly type: "copy" }
  | { readonly type: "dialog"; readonly id: string; readonly accept: boolean; readonly prompt_text?: string }
  | { readonly type: "file-chooser-cancel"; readonly id: string }
  | { readonly type: "popup-close" }
  /** The person takes the page over from the Assistant, or hands it back. */
  | { readonly type: "takeover" }
  | { readonly type: "handback" };

export interface BrowserViewport { readonly width: number; readonly height: number; readonly dpr: number }

export type BrowserServerMessage =
  | { readonly type: "ready" }
  | { readonly type: "state"; readonly state: BrowserPageState }
  /** The page's selected text after the person asked to copy; the panel puts it on the person's clipboard. */
  | { readonly type: "copied"; readonly text: string }
  | { readonly type: "error"; readonly message: string };

/** What "交给助理" takes from the page (spec AC11): the person's selection, or the page's readable text. */
export interface BrowserPageCapture {
  readonly url: string;
  readonly origin: string;
  readonly title: string;
  readonly captured_at: string;
  readonly selection: boolean;
  readonly text: string;
  readonly truncated: boolean;
}
