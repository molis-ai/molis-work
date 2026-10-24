import { messageOf } from "./dom.js";
import type { LingguangPage, Spark } from "./types.js";

/** Loading the list: the read, the failure card with its retry, and the spark a link asked for. */
export function installLoad(page: LingguangPage): void {
  const { L, el, s, request, api } = page;
  // A list that cannot be read says so where the list is, with a way to try again (the note lives in the editor).
  page.listFailed = (error) => {
    el.empty.hidden = true;
    const box = document.createElement("div");
    box.className = "mw-empty mw-empty--error";
    box.setAttribute("role", "alert");
    box.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
    const heading = box.querySelector("strong"), text = box.querySelector("p"), retry = box.querySelector("button");
    if (!heading || !text || !retry) return;
    heading.textContent = L("lingguang.list.failed-title");
    text.textContent = messageOf(error) || L("lingguang.list.failed-hint");
    retry.textContent = L("lingguang.list.retry");
    retry.addEventListener("click", () => {
      retry.disabled = true;
      void page.loadList().then(() => box.remove(), (next: unknown) => { retry.disabled = false; text.textContent = messageOf(next) || L("lingguang.list.failed-hint"); });
    });
    el.rowsEl.replaceChildren(box);
  };

  page.openWanted = async () => {
    const record = s.wantedId ? s.records.find((item) => item.id === s.wantedId) : undefined;
    if (!record) return;
    s.wantedId = null;
    s.wantedByLink = false;
    if (s.selected?.id === record.id) return;
    if (s.selected) await page.save();
    s.picks = new Set([record.id]);
    page.fillEditor(record);
    page.renderList();
  };

  page.loadList = async () => {
    const seq = ++s.listSeq;
    s.loadingFor = s.wantedId;
    const payload = await request<{ sparks?: Spark[] }>("GET", api).finally(() => { if (seq === s.listSeq) s.loadingFor = null; });
    if (seq !== s.listSeq) return;
    s.records = payload.sparks || [];
    s.picks = new Set([...s.picks].filter((id) => s.records.some((item) => item.id === id)));
    if (s.selected && !s.records.some((item) => item.id === s.selected?.id)) page.closeWorkspace();
    page.renderList();
    if (s.selected) {
      const open = s.selected, next = s.records.find((item) => item.id === open.id);
      if (next) page.markSelected(next.id);
    }
    // Whichever load fills the list settles a spark asked for by link (an overtaken load leaves it to the newer one).
    const wanted = s.wantedId;
    if (wanted && s.records.some((item) => item.id === wanted)) void page.openWanted().catch((error: unknown) => page.showNote(messageOf(error), true));
    else if (wanted && s.wantedByLink) {
      // A link from elsewhere (a todo's source, an old tab) can name one that was discarded: say so instead of opening nothing,
      // and tell the workbench so it does not carry it as what the person is looking at. A quiet reopen says nothing.
      const quiet = s.wantedByLink === "quiet";
      s.wantedId = null;
      s.wantedByLink = false;
      el.workbench.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: wanted } }));
      if (!quiet) page.showNote(L("lingguang.error.gone"), true);
    }
  };
}
