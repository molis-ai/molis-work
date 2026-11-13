import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import { textCell } from "./dom.js";
import type { Dataset, DatasetPage } from "./types.js";

const uiText = globalThis.t;

const firstLine = (value: unknown, fallback = "") => String(value || "").trim().split("\n")[0].trim() || fallback;

const whenOf = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return uiText.text("common.generated.formatted", { value: dateArg(date.toISOString(), sameYear ? "month-day" : "date") });
};

/** The directory of tables: its rows, which one is open, and loading and failing to load it. */
export function installList(page: DatasetPage): void {
  const { el, s } = page;

  // A row's only label is its state: a fixed version exists, or one is still being saved. Nothing repeats the plugin's name.
  const fixedCell = (record: Dataset) => {
    const node = document.createElement("span");
    node.className = "mw-status mw-status--plain feed-entry-status";
    if (record.publication_pending) { node.dataset.mwState = "unsaved"; node.classList.add("mw-status--attention"); node.textContent = uiText.text("dataset.fixed.unfinished"); }
    else if (record.artifact_version > 0) { node.dataset.mwState = "saved"; node.classList.add("mw-status--done"); node.textContent = uiText.text("dataset.fixed.label") + " v" + record.artifact_version; }
    else node.setAttribute("aria-hidden", "true");
    return node;
  };

  const artifactLabel = (record: Dataset | null) => record?.publication_pending ? uiText.text("dataset.fixed.resume") : record && record.artifact_version > 0 ? uiText.text("dataset.fixed.again") : uiText.text("dataset.fixed.save");

  const listRow = (record: Dataset) => {
    const item = document.createElement("article");
    item.className = "feed-stage-item creative-artifact-row";
    const row = document.createElement("button");
    row.type = "button";
    row.className = "feed-stage-entry directory-list-row" + (s.selected?.id === record.id ? " is-selected" : "");
    row.dataset.datasetId = record.id;
    row.setAttribute("aria-selected", String(s.selected?.id === record.id));
    const leading = document.createElement("span");
    leading.className = "feed-stage-leading";
    const title = document.createElement("strong");
    title.title = record.title;
    title.textContent = record.title;
    leading.append(title);
    const columns = (record.columns || []).length, rows = (record.rows || []).length;
    row.append(
      leading,
      textCell("plugin-stage-fact", columns ? uiText.text("dataset.list.size", { columns, rows }) : uiText.text("dataset.list.empty-table")),
      textCell("plugin-stage-meta", firstLine(record.description, whenOf(record.updated_at))),
      fixedCell(record),
    );
    item.append(row);
    return item;
  };

  const paintList = () => {
    el.empty.hidden = s.records.length > 0;
    el.rowsEl.replaceChildren(...s.records.map(listRow));
    if (el.artifactBar) el.artifactBar.textContent = artifactLabel(s.selected);
  };

  page.renderList = () => {
    const top = el.list.scrollTop || 0;
    paintList();
    el.list.scrollTop = top;
  };

  page.markSelected = (id) => {
    el.list.querySelectorAll<HTMLElement>("[data-dataset-id]").forEach((row) => {
      const on = row.dataset.datasetId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };

  page.remember = (record, redraw) => {
    page.scope.assertCurrent();
    s.selected = record;
    const index = s.records.findIndex((item) => item.id === record.id);
    if (index >= 0) s.records[index] = record;
    else s.records.unshift(record);
    page.renderList();
    el.titleEl.textContent = record.title;
    page.paintStatus(record);
    page.markSelected(record.id);
    if (redraw) {
      if (document.activeElement !== el.titleInput) el.titleInput.value = record.title;
      if (document.activeElement !== el.descInput) el.descInput.value = record.description || "";
      page.renderTable(record);
    }
  };

  const paintAiAvailability = () => {
    el.generateAi.disabled = !s.aiAvailable;
    const reason = el.aiReason;
    reason.hidden = s.aiAvailable;
    reason.replaceChildren(document.createTextNode(s.aiUnavailableReason || uiText.text("dataset.ai.no-model")));
    if (!s.aiAvailable) {
      const link = document.createElement("a");
      link.href = "/settings/models";
      link.textContent = uiText.text("dataset.ai.open-settings");
      reason.append(document.createTextNode(" "), link);
    }
  };

  // A directory refresh must not advance the editor's acknowledged version.
  page.loadList = async () => {
    const seq = ++s.listSeq;
    const payload = await page.request<{ datasets?: Dataset[]; ai_available?: boolean; ai_unavailable_reason?: string }>("GET", page.api);
    page.scope.assertCurrent();
    if (seq !== s.listSeq) return;
    s.records = payload.datasets || [];
    page.renderList();
    s.aiAvailable = payload.ai_available === true;
    s.aiUnavailableReason = payload.ai_unavailable_reason || "";
    paintAiAvailability();
  };

  // Report unreadable lists in place, with retry; the normal note lives in the editor.
  page.listFailed = (error) => {
    if (!page.scope.alive) return;
    el.empty.hidden = true;
    const box = document.createElement("div");
    box.className = "mw-empty mw-empty--error";
    box.setAttribute("role", "alert");
    box.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
    const hint = box.querySelector("p")!, retry = box.querySelector("button")!;
    box.querySelector("strong")!.textContent = uiText.text("dataset.list.failed-title");
    hint.textContent = (error as Error | null)?.message || uiText.text("dataset.list.failed-hint");
    retry.textContent = uiText.text("dataset.list.retry");
    retry.addEventListener("click", () => {
      retry.disabled = true;
      void page.loadList().then(() => { if (page.scope.alive) box.remove(); }, (next: unknown) => {
        if (!page.scope.alive) return;
        retry.disabled = false;
        hint.textContent = (next as Error | null)?.message || uiText.text("dataset.list.failed-hint");
      });
    }, { signal: page.scope.signal });
    el.rowsEl.replaceChildren(box);
  };
}
