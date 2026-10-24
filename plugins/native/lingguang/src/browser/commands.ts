import { messageOf } from "./dom.js";
import type { LingguangPage, Spark } from "./types.js";

type Detail = { from?: { kind?: string; id?: string }; to?: { kind?: string }; mode?: string };

/** What a click on the workbench means, in the order the buttons are tried; the first match answers. */
export function installCommands(page: LingguangPage): void {
  const { L, el, s, request, api } = page;
  const discardIds = async (ids: string[]) => {
    if (!ids.length) return;
    if (!await page.ask(ids.length > 1 ? L("lingguang.discard.many") : L("lingguang.discard.one"), L("lingguang.action.discard"))) return;
    await request("POST", `${api}/discard`, { ids });
    await page.loadList();
  };
  const current = () => (s.picks.size ? [...s.picks] : (s.selected ? [s.selected.id] : []));
  const askToggle = () => el.workbench.querySelector<HTMLElement>("[data-lingguang-ask-toggle]");
  const capture = async () => {
    await page.save();
    const payload = await request<{ spark: Spark }>("POST", api, {});
    s.fresh.set(payload.spark.id, payload.spark.title);
    s.picks = new Set([payload.spark.id]);
    await page.loadList();
    page.fillEditor(payload.spark);
    el.titleInput.focus();
    el.titleInput.select();
    page.placed({ verb: "created", title: payload.spark.title, object: { kind: "lingguang_spark", id: payload.spark.id } });
  };
  const convert = async (target: Element) => {
    const open = s.selected;
    if (!open) return;
    await page.save();
    const goal = Boolean(target.closest("[data-lingguang-to-goal]")), jelly = Boolean(target.closest("[data-lingguang-to-jelly]"));
    s.fates.delete(open.id);
    window.dispatchEvent(new CustomEvent("molis:placement-convert", { detail: { source: { kind: "lingguang_spark", id: open.id },
      ...(goal ? { goal: true } : { station: jelly ? "jelly" : "pages" }),
      note: goal ? L("lingguang.convert.goal-note") : jelly ? L("lingguang.convert.jelly-note") : L("lingguang.convert.doc-note") } }));
  };
  const readLink = async () => {
    await page.save();
    const url = await page.askLink();
    if (!url) return;
    const reading = await page.readMaterial(`${api}/source`, { url });
    if (reading) await page.keepReading(reading, url, L("lingguang.reading.origin-link", { url }));
  };
  const toggleAsk = () => {
    const open = el.askForm.hidden;
    el.askForm.hidden = !open;
    askToggle()?.setAttribute("aria-expanded", String(open));
    if (open) el.askInput.focus();
  };
  const back = async () => {
    await page.save();
    const left = s.selected?.id;
    page.closeWorkspace();
    await page.dropBlank(left);
    await page.loadList();
  };
  const pick = async (row: HTMLElement, event: MouseEvent) => {
    const id = row.dataset.lingguangId || "";
    if (event.metaKey || event.ctrlKey) {
      if (s.picks.has(id)) s.picks.delete(id);
      else s.picks.add(id);
      row.classList.toggle("is-selected", s.picks.has(id));
      row.setAttribute("aria-selected", String(s.picks.has(id)));
      page.syncSelectionBar();
      return;
    }
    if (s.selected && s.selected.id !== id) await page.save();
    const record = s.records.find((item) => item.id === id);
    if (!record) return;
    s.picks = new Set([id]);
    page.fillEditor(record);
    page.renderList();
  };

  el.workbench.addEventListener("click", async (event) => {
    const target = event.target as Element;
    try {
      if (target.closest("[data-lingguang-save-retry]")) { await page.save(); return; }
      if (target.closest("[data-lingguang-capture]")) { await capture(); return; }
      if (target.closest("[data-lingguang-to-doc], [data-lingguang-to-goal], [data-lingguang-to-jelly]") && s.selected) { await convert(target); return; }
      if (target.closest("[data-lingguang-import-file]")) { await page.save(); el.fileInput.click(); return; }
      if (target.closest("[data-lingguang-read-link]")) { await readLink(); return; }
      if (target.closest("[data-lingguang-clear-selection]")) {
        s.picks = s.selected ? new Set([s.selected.id]) : new Set();
        page.renderList();
        return;
      }
      if (target.closest("[data-lingguang-discard-current]")) {
        if (s.selected) await discardIds([s.selected.id]);
        return;
      }
      if (target.closest("[data-lingguang-discard]")) { await discardIds(current()); return; }
      if (target.closest("[data-lingguang-ask-toggle]")) { toggleAsk(); return; }
      if (target.closest("[data-lingguang-ask-bring]")) {
        await page.save();
        page.handOver("suggest", "");
        return;
      }
      if (target.closest("[data-lingguang-brainstorm], [data-lingguang-brainstorm-current]")) { await page.openBrainstorm(); return; }
      const dispatch = target.closest("[data-lingguang-dispatch], [data-lingguang-dispatch-current]");
      if (dispatch) {
        await page.save();
        await page.copyDispatch(dispatch);
        return;
      }
      if (target.closest("[data-lingguang-back]")) { await back(); return; }
      const row = target.closest<HTMLElement>("[data-lingguang-id]");
      if (row && el.list.contains(row)) await pick(row, event as MouseEvent);
    } catch (error) {
      page.showNote(messageOf(error) || L("lingguang.error.request"), true);
    }
  });
  el.workspace.addEventListener("input", (event) => {
    if ((event.target as Element).closest("[data-lingguang-title], [data-lingguang-body]")) {
      page.syncTodo();
      page.queueSave();
    }
  });

  // Moved or copied from the placement bar: this list changed; a spark moved away is no longer here to edit.
  window.addEventListener("molis:placement-changed", (event) => {
    const detail = ((event as CustomEvent<Detail | null>).detail || {}) as Detail;
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("lingguang_spark")) return;
    if (detail.mode === "move" && detail.from && s.selected && s.selected.id === detail.from.id) page.closeWorkspace();
    s.fates.clear();
    void page.loadList().catch((error: unknown) => page.showNote(messageOf(error), true));
  });

  // A tab or a workflow step can ask for one spark; it opens as soon as the list knows it.
  const params = new URLSearchParams(location.search);
  s.wantedId = params.get("panePlugin") === "lingguang" ? params.get("paneItem") : null;
  el.workbench.addEventListener("molis-work:select-item", (event) => {
    // The plugin shown without an item (the workbench also says so while a page loads): nothing new to open, and a
    // spark asked for by link that is still loading is not cancelled by it.
    const detail = (event as CustomEvent<{ itemId?: string | null; quiet?: boolean } | null>).detail;
    const itemId = detail?.itemId || null;
    if (!itemId) { page.leaveOnFold(); return; }
    s.wantedId = itemId;
    s.wantedByLink = detail?.quiet ? "quiet" : true;
    if (s.records.some((item) => item.id === itemId)) void page.openWanted().catch((error: unknown) => page.showNote(messageOf(error), true));
    // The workbench may name the same spark several times while the page settles: one load for it is enough.
    else if (s.loadingFor !== itemId) {
      void page.loadList().catch((error: unknown) => { page.listFailed(error); throw error; }).then(page.openWanted).catch((error: unknown) => {
        if ((error as { status?: number }).status === 403) el.workbench.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId } }));
        page.showNote(messageOf(error), true);
      });
    }
  });
}
