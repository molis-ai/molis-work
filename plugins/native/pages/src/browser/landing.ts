import type { ContextActionChosen } from "@molis-ai/molis-work-contracts/services/contextual";
import { loadList } from "./document.js";
import type { PagesPage } from "./page.js";

/**
 * Pages' part in 「放进左边」 and in the bar's choices. The landing — where something in hand would go in the open document, and the
 * preview there — is the editor's `mountPagesLanding` (landing-editor.ts); this joins it to the open document, its saving and its list.
 */
export function bindLanding(page: PagesPage) {
  const { Editor, bench, L, host } = page;
  page.landing = Editor.mountPagesLanding({ bench, translate: L, view: () => (page.editor ? page.editor.view : null),
    // Only the saved text has a landing: its positions belong to the version it is reported with.
    open: () => (page.sel && !page.unshowable && !page.saveTimer && !page.dirty ? { id: page.sel.id, version: page.sel.version, title: page.titleInput.value || page.sel.title } : null),
    refresh: () => loadList(page) });
  // The person chose one of this document's actions in the bar: run it on the range they had in hand when it was
  // ranked, through the writing popup, so the result is a candidate they accept before anything is written. A
  // whole-document action (also one of the Assistant's starting points, with nothing in hand) runs on this document
  // when it is the one open here.
  window.addEventListener?.("molis:assistant-context-action-chosen", (event) => {
    const chosen = (event as CustomEvent<ContextActionChosen>).detail;
    if (!chosen || chosen.plugin_id !== host.pluginId) return;
    const { sel, editor, focusShown, focusNow } = page;
    const whole = chosen.scope === "object" && Boolean(chosen.object && sel && !page.unshowable && chosen.object.id === sel.id);
    if (!whole && (!focusShown || !focusNow || chosen.context_id !== focusShown.context_id || focusShown.granularity === "objects")) return;
    if (!editor || !editor.runCommand || !["result", "replace", "insert_after"].includes(chosen.apply) || typeof chosen.prepare !== "function") return;
    event.preventDefault();
    if (!sel) return;
    const documentId = sel.id;
    void editor.runCommand("", undefined, { ...(whole ? { scope: "object" as const } : { localId: focusNow!.local_id }), title: chosen.title,
      mode: chosen.apply === "replace" ? "replace" : "insert_after", okLabel: chosen.apply === "replace" ? L("pages.landing.replace") : L("pages.landing.insert-after"),
      prepare: async () => {
        const prepared = await chosen.prepare();
        const input = (prepared && prepared.input ? prepared.input : {}) as { id?: unknown; command?: unknown; style?: unknown; text?: unknown };
        if (input.id !== documentId || typeof input.command !== "string") throw new Error(L("pages.landing.cannot-prepare"));
        return { command: input.command, style: typeof input.style === "string" ? input.style : undefined, text: typeof input.text === "string" ? input.text : undefined };
      } });
  });
}
