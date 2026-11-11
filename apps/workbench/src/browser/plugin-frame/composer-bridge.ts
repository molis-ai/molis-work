import type { ComposerMaterial } from "@molis-ai/molis-work-contracts/platform/composer";
import type { ComposerDelivery, ComposerMention, ComposerSubmission } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * One input (specs/unified-input-voice/spec.md §10.3, O2): a framed page's AI composer is not drawn in the page. The page's
 * `window.molisComposer(root, { kind: "ai", … })` registers it as a receiver of the bar's one input instead; while that page is in
 * front, the bar mounts the platform's composer on it. What crosses the frame is plain data:
 *
 * - Up, the page's state as it stands (`ComposerSnapshot`): its words, who the next send goes to, deliveries, pause, the controls
 *   and commands without their functions, what is missing, running and held. The page's own text box stays in its document,
 *   hidden, as a copy of the bar's text, so a page that writes into it (a prefill, a receipt clearing it) keeps working.
 * - Down, only what the person did in the bar: a control changed, a command or button chosen, stop or pause, a send, a `@` query,
 *   a file to read, and the draft's read and writes through the page's own adapter. The page never reads another receiver's text
 *   or strip, and a pick reaches it only as the `MaterialRef` the person put on its strip.
 */

export type BridgedControl =
  | { kind: "select"; id: string; label: string; options: { value: string; label: string; disabled?: boolean }[]; value: string; disabled?: boolean }
  | { kind: "toggle"; id: string; label: string; on: boolean; disabled?: boolean }
  | { kind: "button"; id: string; label: string; title?: string; disabled?: boolean };
export interface BridgedCommand { slash: string; label: string; hint?: string; keywords?: string[]; icon?: string; add?: false }

export interface ComposerSnapshot {
  entry: string;
  /** The page's words for its composer; the bar fills any it left out with its own, and the composer escapes every one it draws. */
  labels: Partial<import("@molis-ai/molis-work-plugin-sdk/ui").MwComposerAiLabels>;
  placeholder: string;
  /** Who the next send goes to, what it is, and the page's other receivers 「发给」 lists (ids are the page's own). */
  receiver: { label: string; icon?: string; detail?: string; others?: { id: string; label: string; detail?: string }[] } | null;
  delivery: ComposerDelivery | null;
  pause: { label: string; title: string; busy?: boolean } | null;
  stop: boolean;
  controls: BridgedControl[];
  commands: BridgedCommand[];
  mentions: boolean;
  attachments: { accept?: string } | null;
  sources: boolean;
  /** The page's own object; its owner is always the frame's plugin, whatever the page says. */
  near: ActionSubject | null;
  voice?: string;
  required: string | null;
  submitKeys: boolean;
  draft: boolean;
  /** Where the page's conversation stands across its frame (the box around the root it gave), so the bar lines up with it. */
  column: { left: number; width: number } | null;
  running: boolean;
  hold: string | null;
}

/** An outcome as it crosses: `unknown` names the page's check by a number the parent asks with. */
export type BridgedOutcome =
  | { state: "sent"; receipt?: unknown }
  | { state: "failed"; message: string; unreadable?: { index: number; reason: string }[] }
  | { state: "unknown"; check: number };

export type ComposerCalls = {
  "draft-read": [undefined, string];
  "draft-write": [string, undefined];
  "draft-sent": [undefined, undefined];
  submit: [ComposerSubmission, BridgedOutcome];
  check: [number, "sent" | "not-sent" | "unknown"];
  stop: [undefined, undefined];
  pause: [undefined, undefined];
  mentions: [string, ComposerMention[]];
  upload: [File, { state: "attached"; ref: string; title: string } | { state: "failed"; reason: string }];
};
export type ComposerOp = keyof ComposerCalls;

export type ComposerUp =
  | { type: "composer-state"; id: number; snapshot: ComposerSnapshot }
  | { type: "composer-text"; id: number; text: string }
  | { type: "composer-focus"; id: number }
  | { type: "composer-insert"; id: number; text: string }
  | { type: "composer-attach"; id: number; files: File[] }
  /** The page pressed its own send (a way back from settings finishing the send the person began): the bar's send, if it is front. */
  | { type: "composer-send"; id: number }
  | { type: "composer-destroy"; id: number }
  | { type: "composer-answer"; id: number; call: number; value?: unknown; error?: string };
export type ComposerDown =
  | { type: "composer-call"; id: number; call: number; op: ComposerOp; arg?: unknown }
  | { type: "composer-abort"; id: number; call: number }
  /** A control changed, a command chosen, or (`receiver`) another of the page's receivers picked in 「发给」, by the id the page gave. */
  | { type: "composer-act"; id: number; act: "control" | "command" | "receiver"; key: string; value?: string }
  | { type: "composer-text"; id: number; text: string }
  | { type: "composer-materials"; id: number; materials: ComposerMaterial[] }
  /** How wide the bar's input stands over the page, so its conversation column can stand as wide (`--mw-bar-column` on the page). */
  | { type: "composer-column"; id: number; width: number };

/** A receiver the bar can take: the framed page in front, as the bar's registry (`molisBarReceivers`) lists it. */
export interface BarReceiver {
  /** Changes when the page mounts again or its shape changes (stop, `@`, files appear): the bar mounts anew. */
  readonly key: string;
  readonly root: HTMLElement;
  readonly placeholder: string;
  visible(): boolean;
  /** The page's conversation column across the window, when it has one to show. */
  column(): { left: number; width: number } | null;
  readonly options: import("@molis-ai/molis-work-plugin-sdk/page-globals").ComposerOptions;
  /** The bar mounted the composer on it (with the text box it uses), or let it go (null). */
  bind(handle: import("@molis-ai/molis-work-plugin-sdk/page-globals").ComposerHandle | null, field?: HTMLTextAreaElement): void;
}
