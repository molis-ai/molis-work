import { format, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { el, errorMessage } from "../dom.js";
import type { Page } from "./page.js";
import { api } from "./request.js";
import type { ArtifactRow } from "./shapes.js";

const stamp = (value: string) => {
  const at = new Date(value), now = new Date();
  if (Number.isNaN(at.getTime())) return "";
  return format.date(value, at.toDateString() === now.toDateString() ? "time" : "month-day");
};

/** One saved result: what it is by its icon, the title, when it was saved, and its version. */
function artifactRow(page: Page, item: ArtifactRow): HTMLElement {
  const { s } = page;
  const row = el("button", "", "mw-dir-row mw-dir-row--meta coding-artifact-row");
  row.type = "button";
  row.title = item.title;
  row.dataset.codingArtifact = item.reference.artifact_id;
  const open = (s.reportItem || s.changeItem) === item.reference.artifact_id;
  row.setAttribute("aria-current", String(open));
  row.classList.toggle("is-selected", open);
  const icon = el("span", "", "mw-dir-row__icon");
  icon.innerHTML = '<svg aria-hidden="true"><use href="#icon-' + (item.kind === "changeset" ? "git-compare" : "file") + '"></use></svg>';
  const copy = el("span", "", "mw-dir-row__copy"), headline = el("span", "", "mw-dir-row__headline"), when = el("span", stamp(item.saved_at), "mw-dir-row__count");
  when.title = format.date(item.saved_at, "datetime-with-seconds");
  const kind = item.kind === "changeset" ? uiText.text("coding.artifacts.changeset", { count: item.file_count ?? 0 }) : uiText.text("coding.report.label");
  headline.append(el("strong", item.title), when);
  copy.append(headline, el("small", kind + " · v" + item.reference.version + (item.archived ? " · " + uiText.text("coding.artifacts.archived") : "")));
  row.append(icon, copy);
  return row;
}

/** Saved results read like the session rows. */
export function renderArtifacts(page: Page) {
  const { directory } = page, { s } = page;
  const list = directory.querySelector("[data-coding-artifact-list]"), search = directory.querySelector<HTMLInputElement>("[data-coding-artifact-search]");
  if (!list || !search) return;
  const needle = search.value.trim().toLocaleLowerCase();
  list.replaceChildren(...s.artifactRows.filter(item => item.title.toLocaleLowerCase().includes(needle)).map(item => artifactRow(page, item)));
  if (!list.children.length) {
    const empty = el("div", "", "mw-empty");
    empty.append(el("p", s.artifactRows.length ? uiText.text("coding.artifacts.no-match") : uiText.text("coding.artifacts.none-yet")));
    list.append(empty);
  }
}

export async function loadArtifacts(page: Page) {
  const { directory, lifetime } = page, { s } = page;
  const ticket = ++s.artifactTicket, notice = directory.querySelector("[data-coding-artifact-status]");
  if (notice) notice.textContent = uiText.text("coding.artifacts.loading");
  try {
    const value = await api<{ artifacts: ArtifactRow[] }>(page, "/artifacts");
    if (ticket !== s.artifactTicket) return;
    s.artifactRows = value.artifacts;
    renderArtifacts(page);
    if (notice) notice.textContent = uiText.text("coding.artifacts.note");
  } catch (error) {
    if (!lifetime.alive) return;
    if (ticket === s.artifactTicket && notice) notice.textContent = uiText.text("coding.artifacts.failed", { reason: errorMessage(error) });
  }
}
