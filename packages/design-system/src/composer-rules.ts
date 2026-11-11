import type { AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { ComposerDelivery } from "@molis-ai/molis-work-plugin-sdk/page-globals";

/**
 * The unified input's rules (specs/unified-input-voice/implementation-plan.md §3.1–3.5, slice K2), kept apart from the page
 * program (`browser/composer.ts`) so each is one function a test can call: the keys and the input-method guard, the one-time
 * Enter hint, the draft keys and their sweep, the delivery choice and the generation that
 * drops a late result. Nothing here touches the page.
 */

/** The one input-method guard (UIC-05): a key pressed while a composition is open (Chinese, Japanese…) belongs to the IME. WebKit
 * reports the Enter that ends a composition with `isComposing` already false but keyCode 229, so both are read, here only. */
export function composing(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

/**
 * What a key does in the text area (§1 item 2, user 10-27): Enter breaks the line (the browser's own), ⌘/Ctrl+Enter sends (a
 * supplement while a turn runs), ⌘/Ctrl+Shift+Enter is for the next turn; nothing else is the composer's (Esc closes its own menu,
 * Tab moves focus). Interrupting has no key. `submitKeys: false` (a decision's reason) leaves every key to writing.
 */
export function composerKey(event: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; isComposing?: boolean; keyCode?: number }, submitKeys = true): "send" | "after-run" | null {
  if (!submitKeys || composing(event) || event.key !== "Enter" || event.altKey || !(event.metaKey || event.ctrlKey)) return null;
  return event.shiftKey ? "after-run" : "send";
}

/** Where the one-time hint remembers it was shown (UIC-06): per browser profile (per plugin inside a frame, whose storage is its own). */
export const ENTER_HINT_KEY = "mw.composer.enter-hint";

/** Whether a plain Enter now is someone sending the old way: one written line, the caret at its end, nothing composing. */
export function wantsEnterHint(event: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; isComposing?: boolean; keyCode?: number }, value: string, caret: number): boolean {
  return event.key === "Enter" && !composing(event) && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && value.trim() !== "" && !value.includes("\n") && caret === value.length;
}

/** The platform draft's key prefix (§3.4); the key has no version: a changed shape goes through CONTRACT-CHANGES, never an old key read. */
export const COMPOSER_DRAFT_PREFIX = "mw.composer.draft:";

export interface ComposerDraftPlace {
  /** The project, or `home` outside one (a Home plugin, the Assistant's main conversation). */
  readonly project: string;
  /** The installation: the page context gives it, never the plugin. */
  readonly install: string;
  readonly entry: string;
  readonly conversation: string;
}

/** `mw.composer.draft:<project|home>:<install>:<entry>:<conversation>`, each part encoded so a `:` inside one cannot shift the rest. */
export function composerDraftKey(place: ComposerDraftPlace): string {
  return COMPOSER_DRAFT_PREFIX + [place.project || "home", place.install, place.entry, place.conversation].map(encodeURIComponent).join(":");
}

export function parseComposerDraftKey(key: string): ComposerDraftPlace | null {
  if (!key.startsWith(COMPOSER_DRAFT_PREFIX)) return null;
  const parts = key.slice(COMPOSER_DRAFT_PREFIX.length).split(":");
  if (parts.length !== 4) return null;
  try {
    const [project, install, entry, conversation] = parts.map(decodeURIComponent) as [string, string, string, string];
    return { project, install, entry, conversation };
  } catch { return null; }
}

/**
 * The draft keys a deleted project or an uninstalled plugin leaves (UIC-10): every key of `gone.project`, or only its
 * installation's when `gone.install` is named. A key the composer did not write is never touched.
 */
export function staleComposerDrafts(keys: Iterable<string>, gone: { project: string; install?: string }): string[] {
  return [...keys].filter((key) => {
    const place = parseComposerDraftKey(composerDraftInner(key) ?? "");
    return place !== null && place.project === (gone.project || "home") && (gone.install === undefined || place.install === gone.install);
  });
}

/**
 * The platform draft a stored key holds: the key itself, or, in a framed plugin's storage (the parent prefixes it per installation:
 * `molis-plugin-page:<home>:<install>:<project>:`), the part after that prefix. Any other key is not a draft.
 */
export function composerDraftInner(key: string): string | null {
  if (key.startsWith(COMPOSER_DRAFT_PREFIX)) return key;
  const at = key.indexOf(COMPOSER_DRAFT_PREFIX);
  return key.startsWith("molis-plugin-page:") && at > 0 ? key.slice(at) : null;
}

/** Storage as the page has it; any call may throw (full, disabled, a private window). */
export interface ComposerStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/**
 * A platform draft on this machine (UIC-11): the text and when it was written. A failed read or write says so (`false`) and never
 * throws, so the text in the box is never lost to storage; an empty draft is removed, not kept as "". A value that is not one of
 * this shape reads as no draft (it is not the composer's).
 */
export function composerDraft(storage: () => ComposerStorage, key: string) {
  return {
    read(): { text: string; at: string } | null | false {
      let raw: string | null;
      try { raw = storage().getItem(key); } catch { return false; }
      try {
        const value: unknown = raw === null ? null : JSON.parse(raw);
        const draft = value as { text?: unknown; at?: unknown } | null;
        return draft && typeof draft.text === "string" && typeof draft.at === "string" && draft.text.trim() ? { text: draft.text, at: draft.at } : null;
      } catch { return null; }
    },
    write(text: string, at = new Date().toISOString()): boolean {
      try { if (text.trim()) storage().setItem(key, JSON.stringify({ text, at })); else storage().removeItem(key); return true; } catch { return false; }
    },
  };
}

export type ComposerChoice = { available: true } | { available: false; reason: string };

/**
 * Which deliveries are offered now (UIC-08, RC-03; 2026-11-09 audit fix, user decision: idle queue). Outside a running turn a send
 * starts the turn and takes no supplement or interrupt; the target's own word (`delivery()`) may still take 下一轮再做 for a work
 * that has run before — a queue the next turn the person begins carries, without starting one. While a turn runs, the target's
 * own word decides every mode; without one only the default supplement is offered. Interrupting is never offered while nothing
 * runs, whatever the target says.
 */
export function composerDeliveries(running: boolean, offered: ComposerDelivery | undefined, unsupported: string): Readonly<Record<AgentSteerMode, ComposerChoice>> {
  const no: ComposerChoice = { available: false, reason: unsupported };
  if (!running) return { "next-boundary": { available: true }, interrupt: no, "after-run": offered?.["after-run"] ?? no };
  if (!offered) return { "next-boundary": { available: true }, interrupt: no, "after-run": no };
  return { "next-boundary": offered["next-boundary"], interrupt: offered.interrupt, "after-run": offered["after-run"] };
}

/** The delivery a send asks for, or why it cannot go: a mode the target does not take is refused with its reason, never sent as another. */
export function pickComposerDelivery(mode: AgentSteerMode, choices: Readonly<Record<AgentSteerMode, ComposerChoice>>): { mode: AgentSteerMode } | { refused: string } {
  const choice = choices[mode];
  return choice.available ? { mode } : { refused: choice.reason };
}

/**
 * One instance's generations (UIC-07): `next()` starts a generation and aborts the previous one; work begun in a generation that
 * is no longer the latest, or was let go, is dropped when it comes back (`apply` is not called). Mounting again, `refresh` and a
 * new query each start one.
 */
export function composerGenerations() {
  let current: AbortController | null = null;
  return {
    next(): AbortSignal { current?.abort(); current = new AbortController(); return current.signal; },
    end(): void { current?.abort(); current = null; },
    /** Runs `work` in a new generation and hands its result to `apply` only while that generation is still the latest. */
    async latest<T>(work: (signal: AbortSignal) => Promise<T>, apply: (value: T) => void, failed?: (error: unknown) => void): Promise<void> {
      const signal = this.next();
      try { const value = await work(signal); if (!signal.aborted) apply(value); }
      catch (error) { if (!signal.aborted) failed?.(error); }
    },
  };
}
