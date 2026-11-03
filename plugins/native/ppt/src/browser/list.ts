import { firstLine, messageOf, textCell, whenOf } from "./dom.js";
import type { Ppt, PptPage } from "./types.js";

/** A row's only label is its state: a fixed version exists, or one is still being saved. Nothing repeats the title or the count. */
function fixedCell(page: PptPage, record: Ppt): HTMLSpanElement {
  const { L } = page;
  const node = document.createElement("span");
  node.className = "mw-status mw-status--plain feed-entry-status";
  if (record.publication_pending) {
    node.dataset.mwState = "unsaved";
    node.classList.add("mw-status--attention");
    node.textContent = L("ppt.fixed.unfinished");
  } else if (record.artifact_version > 0) {
    node.dataset.mwState = "saved";
    node.classList.add("mw-status--done");
    node.textContent = L("ppt.fixed.label") + " v" + record.artifact_version;
  } else node.setAttribute("aria-hidden", "true");
  return node;
}

/** The deck list on the left: drawing it, marking the open row, and reading it from the Host. */
export function installList(page: PptPage): void {
  const { L, el, s } = page;

  const artifactLabel = (record: Ppt | null) =>
    record?.publication_pending ? L("ppt.fixed.resume") : record && record.artifact_version > 0 ? L("ppt.fixed.again") : L("ppt.fixed.save");

  const paintList = () => {
    el.empty.hidden = s.records.length > 0;
    el.rowsEl.replaceChildren();
    s.records.forEach((record) => {
      const item = document.createElement("article");
      item.className = "feed-stage-item creative-artifact-row";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "feed-stage-entry directory-list-row" + (s.selected?.id === record.id ? " is-selected" : "");
      row.dataset.pptId = record.id;
      row.setAttribute("aria-selected", String(s.selected?.id === record.id));
      const leading = document.createElement("span");
      leading.className = "feed-stage-leading";
      const title = document.createElement("strong");
      title.title = record.title;
      title.textContent = record.title;
      leading.append(title);
      row.append(
        leading,
        textCell("plugin-stage-fact", L("ppt.slides.count", { count: (record.slides || []).length })),
        textCell("plugin-stage-meta", firstLine(record.description, whenOf(record.updated_at))),
        fixedCell(page, record),
      );
      item.append(row);
      el.rowsEl.append(item);
    });
    if (el.artifactBar) el.artifactBar.textContent = artifactLabel(s.selected);
  };

  page.renderList = () => {
    const top = el.list.scrollTop || 0;
    paintList();
    el.list.scrollTop = top;
  };

  page.markSelected = (id) => {
    el.list.querySelectorAll<HTMLElement>("[data-ppt-id]").forEach((row) => {
      const on = row.dataset.pptId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };

  page.remember = (record, redraw) => {
    s.selected = record;
    if (!record.slides.some((slide) => slide.id === s.slideKey)) s.slideKey = record.slides[0]?.id || "";
    const index = s.records.findIndex((item) => item.id === record.id);
    if (index >= 0) s.records[index] = record;
    else s.records.unshift(record);
    page.renderList();
    el.titleEl.textContent = record.title;
    page.paintStatus(record);
    page.markSelected(record.id);
    if (redraw) page.fillEditor(record);
    else page.paintView(page.liveRecord());
    page.publishContext();
  };

  page.loadList = async () => {
    const seq = ++s.listSeq;
    const payload = await page.request<{ presentations?: Ppt[]; ai_available?: boolean; ai_unavailable_reason?: string | null }>("GET", page.api);
    if (seq !== s.listSeq) return;
    s.records = payload.presentations || [];
    s.aiAvailable = payload.ai_available === true;
    s.aiUnavailableReason = payload.ai_unavailable_reason || "";
    page.paintOutlineModes();
    page.renderList();
  };

  // A list that cannot be read says so where the list is, with a way to try again (the note lives in the editor).
  page.listFailed = (error) => {
    el.empty.hidden = true;
    const box = document.createElement("div");
    box.className = "mw-empty mw-empty--error";
    box.setAttribute("role", "alert");
    box.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
    const hint = box.querySelector("p")!;
    box.querySelector("strong")!.textContent = L("ppt.list.failed-title");
    hint.textContent = messageOf(error) || L("ppt.list.failed-hint");
    const retry = box.querySelector("button")!;
    retry.textContent = L("ppt.list.retry");
    retry.addEventListener("click", () => {
      retry.disabled = true;
      void page.loadList().then(() => box.remove(), (next: unknown) => { retry.disabled = false; hint.textContent = messageOf(next) || L("ppt.list.failed-hint"); });
    });
    el.rowsEl.replaceChildren(box);
  };
}
