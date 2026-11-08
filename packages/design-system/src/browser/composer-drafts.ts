import { formatMessage } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ENTER_HINT_KEY, composerDraft, composerDraftKey } from "../composer-rules.js";
import { storage, type Composer } from "./composer-state.js";

/**
 * Drafts (specs/unified-input-voice/implementation-plan.md §3.4): the platform's on this machine, keyed by project, installation,
 * entry and conversation and written at most every 500ms, or the owner's own through its adapter. A draft is put back only into an
 * empty box, with a line saying when it was written; storage that refuses is said in the status line and the text stays.
 */

export interface ComposerDrafts { load(): void; save(): void; clear(): void; stop(): void }

export function composerDrafts(c: Composer): ComposerDrafts {
  const { options, signal, field } = c;
  const key = "conversation" in options.draft ? composerDraftKey({ project: document.body.dataset.projectId || "home",
    install: c.root.closest<HTMLElement>("[data-plugin-owner]")?.dataset.pluginOwner || document.body.dataset.pluginId || "workbench",
    entry: options.entry, conversation: options.draft.conversation }) : "";
  const local = key ? composerDraft(storage, key) : null;
  const adapter = "adapter" in options.draft ? options.draft.adapter : null;
  let timer = 0;
  const restore = (text: string, at?: string) => {
    if (signal.aborted || !text.trim() || field.value.trim()) return;
    field.value = text;
    window.molisFit?.(field);
    c.restored = at ? formatMessage("{time}", [{ name: "time", kind: "date", at, style: "relative" }], c.lang) : "";
    c.paint();
  };
  const refused = (now: boolean) => { if (!signal.aborted && c.unsaved !== now) { c.unsaved = now; c.paint(); } };
  return {
    load() {
      if (local) { const draft = local.read(); if (draft === false) c.unsaved = true; else if (draft) restore(draft.text, draft.at); }
      else adapter?.read(signal).then((text) => restore(text), () => refused(true));
    },
    save() {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (signal.aborted) return;
        if (local) refused(!local.write(field.value));
        else adapter?.write(field.value).then(() => refused(false), () => refused(true));
      }, 500);
    },
    /** The text was sent or thrown away: the draft goes too. */
    clear() {
      clearTimeout(timer); c.restored = "";
      if (local) c.unsaved = !local.write("");
      else void adapter?.write("").catch(() => undefined);
    },
    stop: () => clearTimeout(timer),
  };
}

/** The one-time Enter hint's memory: shown once on this machine, never again. */
export const enterHint = {
  shown: () => { try { return storage().getItem(ENTER_HINT_KEY) === "done"; } catch { return true; } },
  done: () => { try { storage().setItem(ENTER_HINT_KEY, "done"); } catch { /* the hint is a convenience: not shown again this page either way */ } },
};
