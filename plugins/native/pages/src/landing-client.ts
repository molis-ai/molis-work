/**
 * Pages' part in 「放进左边」 and in the bar's choices (a fragment of the client factory in client.ts, sharing its closure).
 * The landing — where something in hand would go in the open document, and the preview there — is the editor's
 * `mountPagesLanding` (landing-editor.ts); this joins it to the open document, its saving and its list.
 */
export const PAGES_LANDING_CLIENT_SCRIPT = String.raw`const landing = Editor.mountPagesLanding({ bench, translate: L, view: () => (editor ? editor.view : null),
    // Only the saved text has a landing: its positions belong to the version it is reported with.
    open: () => (sel && !unshowable && !saveTimer && !dirty ? { id: sel.id, version: sel.version, title: titleInput.value || sel.title } : null),
    refresh: () => loadList() });
  // The person chose one of this document's actions in the bar: run it on the range they had in hand when it was
  // ranked, through the writing popup, so the result is a candidate they accept before anything is written. A
  // whole-document action (also one of the Assistant's starting points, with nothing in hand) runs on this document
  // when it is the one open here.
  window.addEventListener?.("molis:assistant-context-action-chosen", (event) => {
    const chosen = event.detail;
    if (!chosen || chosen.plugin_id !== "io.molis.work.pages") return;
    const whole = chosen.scope === "object" && Boolean(chosen.object && sel && !unshowable && chosen.object.id === sel.id);
    if (!whole && (!focusShown || !focusNow || chosen.context_id !== focusShown.context_id || focusShown.granularity === "objects")) return;
    if (!editor || !editor.runCommand || !["result", "replace", "insert_after"].includes(chosen.apply) || typeof chosen.prepare !== "function") return;
    event.preventDefault();
    const documentId = sel.id;
    void editor.runCommand("", undefined, { ...(whole ? { scope: "object" } : { localId: focusNow.local_id }), title: chosen.title,
      mode: chosen.apply === "replace" ? "replace" : "insert_after", okLabel: chosen.apply === "replace" ? L("替换") : L("插到后面"),
      prepare: async () => {
        const prepared = await chosen.prepare();
        const input = prepared && prepared.input ? prepared.input : {};
        if (input.id !== documentId || typeof input.command !== "string") throw new Error(L("这个动作暂时准备不了，请重新选择"));
        return { command: input.command, style: typeof input.style === "string" ? input.style : undefined, text: typeof input.text === "string" ? input.text : undefined };
      } });
  });`;
