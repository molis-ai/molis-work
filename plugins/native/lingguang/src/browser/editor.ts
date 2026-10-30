import type { LingguangPage, SaveState, Spark } from "./types.js";

/**
 * The editor: the open spark, its autosave and the blank-spark discard.
 *
 * Leaving a blank spark (W2-18 decision 6): `fresh` holds the sparks 「记下」 made blank, with the title the Host gave them. When
 * the person leaves one (back to the list, another spark, another new one) it is read once more from the Host, and if that copy
 * still has no body and the given title or none, it is thrown away with lingguang.discard, without asking. The discard names the
 * updated_at of the copy that decided (expected_updated_at, the guard lingguang.update has), and the Host refuses a spark that
 * has changed since: words that arrived from elsewhere between the read and the discard keep it. A spark that went into a
 * brainstorm is in use and stays. A failed read, a refused or a failed discard changes nothing.
 *
 * Leaving also means the surface going away. When the workbench hides this page (another plugin, Home, Settings) the open blank
 * spark is saved, the editor closed and the spark taken back the same way, so what comes back is the list. When the page itself
 * is going away (reload, window closed) there is no time to read the Host's copy: the copy this page last saw decides (its
 * updated_at is the one the discard names, so the Host refuses if the spark changed after that). The page registers its own
 * conditional cleanup while alive (`closingBlank`); the Host folds the editor and runs it before revoking the page. The workbench
 * keeps the open record of a plugin's page to reopen after a reload and forgets it when the page reports it is back at its list
 * (data-expanded false), and a record it still held would be asked for by id 1.5 s after the reload and answered 「这条灵光已丢掉
 * 或不存在」. A spark that stays (words on the screen or in the saved copy) keeps its editor and its record. A tab or window that
 * is only hidden is not leaving. Input and pending saves cancel the closing registration.
 *
 * The workbench's own ways back to the list (its Back button, ⌘[, the mouse back button, the plugin's name on the tab strip) say
 * "no item" with a select-item event and then fold the page without asking it to close the editor (`leaveOnFold`): once the fold
 * is done, the blank spark is left like any other. An event with no item that is not followed by a fold leaves it open.
 */
export function installEditor(page: LingguangPage): void {
  const { host, L, el, s, request, api } = page;
  const saveText = (state: SaveState) => state === "saved" ? L("lingguang.save.saved") : state === "unsaved" ? L("lingguang.save.unsaved")
    : state === "saving" ? L("lingguang.save.saving") : L("lingguang.save.failed");

  // "转为待办" puts the spark into the creation entry named todo from what the button carries, so it always carries what is on screen.
  page.syncTodo = () => {
    if (!s.selected) return;
    const button = el.todoButton, title = el.titleInput.value.trim(), body = el.bodyInput.value;
    button.dataset.contextId = s.selected.id;
    button.dataset.contextTitle = title || [...body.trim().split(/\r?\n/)[0]].slice(0, 80).join("");
    // The workbench takes up to 4000 UTF-16 units of this text, so the bound stays 3000 units; a cut between the two units of a character leaves that half out.
    button.dataset.contextText = (el.titleInput.value + "\n" + body).trim().slice(0, 3000).replace(/[\ud800-\udbff]$/, "");
  };

  /** The spark on screen, for the placement bar and the Assistant. */
  page.publishContext = (unsaved) => {
    const context: { plugin_id: string; surface_title: string; object?: { kind: string; id: string; version: string; title: string }; unsaved?: boolean } = {
      plugin_id: host.pluginId, surface_title: L("lingguang.page.title"),
    };
    if (s.selected) {
      context.object = { kind: "lingguang_spark", id: s.selected.id, version: s.selected.updated_at + ":" + (s.selected.status || "inbox"), title: el.titleInput.value || s.selected.title };
      if (unsaved) context.unsaved = true;
    }
    el.workbench.setAttribute("data-assistant-context", JSON.stringify(context));
    page.closingBlank();
  };

  page.showSave = (state) => {
    const failed = state === "failed";
    el.saveStatus.textContent = saveText(state);
    el.saveStatus.dataset.failed = String(failed);
    el.saveStatus.dataset.mwState = state;
    el.saveRetry.hidden = !failed;
    page.publishContext(failed || state !== "saved");
  };

  // Registered with the Host while the open spark is a blank one this page made and nothing has changed: the Host runs it when
  // the page goes away (reload, window closed), so the list is what comes back.
  page.closingBlank = () => {
    const open = s.selected;
    const record = open ? s.records.find((item) => item.id === open.id) : undefined;
    const given = record ? s.fresh.get(record.id) : undefined;
    const blank = record !== undefined && given !== undefined && !el.bodyInput.value.trim() && (!el.titleInput.value.trim() || el.titleInput.value === given)
      && !(record.body || "").trim() && (!record.title.trim() || record.title === given) && el.saveStatus.dataset.mwState === "saved";
    host.view.onClosing(blank ? { reference: { capability_id: "lingguang.revert", version: 1 }, input: { id: record.id, expected_updated_at: record.updated_at } } : null);
  };

  page.dropBlank = async (id) => {
    const given = id ? s.fresh.get(id) : undefined;
    if (!id || given === undefined) return;
    s.fresh.delete(id);
    try {
      const { spark } = await request<{ spark: Spark }>("GET", `${api}/${encodeURIComponent(id)}`);
      if ((spark.body || "").trim() || (spark.title.trim() && spark.title !== given)) return;
      await request("POST", `${api}/discard`, { ids: [id], expected_updated_at: { [id]: spark.updated_at } });
      s.records = s.records.filter((item) => item.id !== id);
      page.renderList();
    } catch { /* stays as it was */ }
  };

  page.leaveBlank = async () => {
    const id = s.selected?.id, given = id ? s.fresh.get(id) : undefined;
    if (!id || given === undefined || el.bodyInput.value.trim() || (el.titleInput.value.trim() && el.titleInput.value !== given)) return;
    await page.save();
    if (s.selected?.id !== id) return;
    page.closeWorkspace();
    await page.dropBlank(id);
  };

  page.leaveOnFold = () => queueMicrotask(() => {
    if (el.workbench.getAttribute("data-expanded") === "false") void page.leaveBlank().catch(() => {});
  });

  page.fillEditor = (record) => {
    const left = s.selected && s.selected.id !== record.id ? s.selected.id : undefined;
    s.selected = record;
    s.editorBase = { record };
    s.conversation = null;
    el.workbench.setAttribute("data-expanded", "true");
    el.workspace.hidden = false;
    page.showChat(false);
    el.titleEl.textContent = record.title;
    page.showSave("saved");
    el.titleInput.value = record.title;
    el.bodyInput.value = record.body || "";
    page.syncTodo();
    page.markSelected(record.id);
    void page.dropBlank(left);
  };

  page.closeWorkspace = () => {
    clearTimeout(s.saveTimer);
    s.selected = null;
    s.editorBase = null;
    s.conversation = null;
    s.picks = new Set();
    el.workbench.setAttribute("data-expanded", "false");
    el.workspace.hidden = true;
    page.showChat(false);
    page.markSelected("");
    page.syncSelectionBar();
    page.publishContext(false);
  };

  page.save = async () => {
    clearTimeout(s.saveTimer);
    const record = s.selected, base = s.editorBase;
    if (!record || !base || s.conversation) return null;
    const title = el.titleInput.value, body = el.bodyInput.value;
    const pending = s.saveQueue.then(async () => {
      const current = base.record;
      if (current.title === title && current.body === body) return current;
      if (s.editorBase === base) page.showSave("saving");
      const payload = await request<{ spark: Spark }>("POST", `${api}/${encodeURIComponent(record.id)}`, { title, body, expected_updated_at: current.updated_at });
      base.record = payload.spark;
      page.remember(payload.spark, base);
      if (s.editorBase === base) {
        if (el.titleInput.value === title && document.activeElement !== el.titleInput) el.titleInput.value = payload.spark.title;
        if (el.bodyInput.value === body && document.activeElement !== el.bodyInput) el.bodyInput.value = payload.spark.body || "";
      }
      if (s.editorBase === base && el.titleInput.value === title && el.bodyInput.value === body) {
        page.showSave("saved");
        page.showNote("", false);
      }
      return payload.spark;
    }).catch((error: unknown) => {
      if (s.editorBase === base) page.showSave("failed");
      throw error;
    });
    s.saveQueue = pending.catch(() => {});
    return pending;
  };

  page.queueSave = () => {
    page.showSave("unsaved");
    clearTimeout(s.saveTimer);
    s.saveTimer = setTimeout(() => {
      void page.save().catch((error: unknown) => page.showNote((error as Error).message || L("lingguang.save.failed"), true));
    }, 400);
  };
}
