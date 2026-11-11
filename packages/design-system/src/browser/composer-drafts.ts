import { composerLocalDraft } from "./composer-storage.js";
import type { ComposerRetained } from "./composer-retained.js";
import { formatMessage } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ENTER_HINT_KEY } from "../composer-rules.js";
import { storage, type Composer } from "./composer-state.js";

/**
 * Drafts (specs/unified-input-voice/implementation-plan.md §3.4): the platform's on this machine, keyed by project, installation,
 * entry and conversation and written at most every 500ms, or the owner's own through its adapter. A draft is put back only into an
 * empty box, with a line saying when it was written; storage that refuses is said in the status line and the text stays.
 */

export interface ComposerDrafts { load(): void; save(): void; clear(): void; stop(): void; sent(revision: number): boolean }

export function composerDrafts(c: Composer, retained: ComposerRetained): ComposerDrafts {
  const { options, signal, field } = c;
  const local = composerLocalDraft(c.root, options);
  const adapter = options.draft && "adapter" in options.draft ? options.draft.adapter : null;
  let timer = 0, edited = false, pending: string | undefined;
  const loadedAt = retained.revision();
  const restore = (text: string, at?: string) => {
    if (signal.aborted || edited || retained.revision() !== loadedAt || !text.trim() || field.value.trim()) return;
    field.value = text;
    window.molisFit?.(field);
    c.restored = at ? formatMessage("{time}", [{ name: "time", kind: "date", at, style: "relative" }], c.lang) : "";
    c.paint();
  };
  const refused = (now: boolean) => { if (!signal.aborted && c.unsaved !== now) { c.unsaved = now; c.paint(); } };
  // Capture the edit before the owner changes the field for another conversation. Leaving the page or mount flushes it too.
  const flush = () => {
    clearTimeout(timer);
    if (pending === undefined) return;
    const text = pending; pending = undefined;
    if (local) refused(!local.write(text));
    else adapter?.write(text).then(() => refused(false), () => refused(true));
  };
  window.addEventListener("pagehide", flush, { signal });
  const clear = (sent = false) => {
    clearTimeout(timer); pending = undefined; edited = true; c.restored = ""; retained.edit();
    if (local) refused(!local.write(""));
    else void (sent && adapter?.sent ? adapter.sent() : adapter?.write(""))?.catch(() => refused(true));
  };
  return {
    load() {
      if (local) { const draft = local.read(); if (draft === false) c.unsaved = true; else if (draft) restore(draft.text, draft.at); }
      else adapter?.read(signal).then((text) => restore(text), () => refused(true));
    },
    save() {
      retained.edit(); edited = true; pending = field.value;
      clearTimeout(timer);
      timer = window.setTimeout(flush, 500);
    },
    /** The text was sent or thrown away: the draft goes too. */
    clear: () => clear(),
    sent(revision) {
      if (retained.revision() !== revision) return false;
      clear(true); return true;
    },
    stop: flush,
  };
}

/** The one-time Enter hint's memory: shown once on this machine, never again. */
export const enterHint = {
  shown: () => { try { return storage().getItem(ENTER_HINT_KEY) === "done"; } catch { return true; } },
  done: () => { try { storage().setItem(ENTER_HINT_KEY, "done"); } catch { /* the hint is a convenience: not shown again this page either way */ } },
};
