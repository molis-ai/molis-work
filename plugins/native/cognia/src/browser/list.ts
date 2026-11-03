import { button, esc, messageOf } from "./dom.js";
import { OWN_SOURCES, ROLE_KEY } from "./labels.js";
import { filterValue, maybe, notice, q, tx, type CogniaPage } from "./page.js";
import type { Domain, Source, Workspace } from "./types.js";

/** `<option>`s for a select: the first choice (a key) and then each value by name. */
export function options(page: CogniaPage, values: readonly (Domain | Source)[], first: string): string {
  return `<option value="">${tx(page, first)}</option>` + values.map((value) => `<option value="${esc(value.id)}">${esc(value.name)}</option>`).join("");
}

export const field = (page: CogniaPage, label: string, inner: string): string => `<label class="cognia-field">${tx(page, label)}${inner}</label>`;
export const domainSelect = (page: CogniaPage): string => `<select class="mw-select" name="domain_id">${options(page, page.state.domains, "cognia.domain.unfiled")}</select>`;

const filtering = (page: CogniaPage): boolean => Boolean(filterValue(page, "search") || filterValue(page, "domain") || filterValue(page, "source"));

function materialRow(page: CogniaPage, m: Workspace["materials"][number]): string {
  const domain = page.state.domains.find((d) => d.id === m.domain_id)?.name || page.L("cognia.domain.unfiled");
  return `<article class="cognia-row"><input type="checkbox" class="mw-check" data-cognia-select="${esc(m.id)}" aria-label="${tx(page, "cognia.list.select-material")} ${esc(m.title)}" ${page.selected.has(m.id) ? "checked" : ""} ${m.role === "attachment" ? "disabled" : ""}>`
    + `<button type="button" class="cognia-entry" data-cognia-id="${esc(m.id)}"><div><strong>${esc(m.title)}</strong><small>${esc(m.path)}</small>${m.excerpt ? `<small>${esc(m.excerpt)}</small>` : ""}</div>`
    + `<span>${tx(page, ROLE_KEY[m.role])}</span><span>${esc(domain)}</span><span>${esc(new Date(m.updated_at).toLocaleDateString())}</span></button></article>`;
}

function emptyList(page: CogniaPage): string {
  if (filtering(page)) {
    return `<div class="cognia-empty"><strong>${tx(page, "cognia.list.no-match")}</strong><p>${tx(page, "cognia.list.no-match-hint")}</p>${button(page.L("cognia.list.clear-filters"), "clear-filters")}</div>`;
  }
  return `<div class="cognia-empty"><span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-book"></use></svg></span><strong>${tx(page, "cognia.list.empty-title")}</strong><p>${tx(page, "cognia.list.empty-hint")}</p>`
    + `${button(page.L("cognia.action.import"), "import")}${button(page.L("cognia.action.add"), "add")}</div>`;
}

export function countSelected(page: CogniaPage): void {
  q(page, "[data-cognia-selected]").textContent = page.L("cognia.selection.count", { count: page.selected.size });
}

export function renderRows(page: CogniaPage): void {
  q(page, "[data-cognia-rows]").innerHTML = page.state.materials.length ? page.state.materials.map((m) => materialRow(page, m)).join("") : emptyList(page);
  countSelected(page);
  const bare = !page.state.materials.length && !filtering(page);
  // Search stays (an empty library still answers a search honestly); the domain / source filters and the selection tools wait.
  for (const selector of ["[data-cognia-domain]", "[data-cognia-source]", ".cognia-selection"]) {
    const node = maybe(page, selector);
    if (node) (node.closest<HTMLElement>(".mw-select-picker") || node).hidden = bare;
  }
}

/** A source that can be renamed or deleted: the ones a person imported. */
export const importedSource = (source: Source): boolean => !OWN_SOURCES.includes(source.id);

function paintFilters(page: CogniaPage): void {
  for (const key of ["domain", "source"] as const) {
    const select = q<HTMLSelectElement>(page, `[data-cognia-${key}]`), value = select.value;
    select.innerHTML = key === "domain"
      ? options(page, page.state.domains, "cognia.filter.all-domains") + `<option value="unclassified">${tx(page, "cognia.domain.unfiled")}</option>`
      : options(page, page.state.sources, "cognia.filter.all-sources");
    select.value = value;
  }
}

function paintModel(page: CogniaPage): void {
  const { state } = page;
  const model = q(page, "[data-cognia-model]");
  model.hidden = false;
  model.textContent = state.ai_unavailable_reason ? page.L(state.ai_unavailable_reason) : state.ai_runtime || page.L("cognia.model.none");
  q(page, "[data-cognia-action=model-settings]").hidden = Boolean(state.ai_available);
  for (const action of ["synthesize", "query", "synthesize-current"]) {
    const control = q<HTMLButtonElement>(page, `[data-cognia-action="${action}"]`);
    control.disabled = !state.ai_available;
    control.title = state.ai_available ? "" : page.L(state.ai_unavailable_reason || "cognia.model.none");
  }
}

function paintManage(page: CogniaPage): void {
  const { state } = page;
  const domain = state.domains.some((d) => d.id === filterValue(page, "domain"));
  const source = state.sources.some((s) => s.id === filterValue(page, "source") && importedSource(s));
  q(page, ".cognia-manage").hidden = !domain && !source;
  for (const action of ["rename-domain", "delete-domain"]) maybe(page, `[data-cognia-action="${action}"]`)?.toggleAttribute("hidden", !domain);
  for (const action of ["rename-source", "delete-source"]) maybe(page, `[data-cognia-action="${action}"]`)?.toggleAttribute("hidden", !source);
}

/** Reads the library with the filters as they are now; a read that is not the latest is dropped. */
export async function load(page: CogniaPage): Promise<void> {
  const id = ++page.seq;
  const query = new URLSearchParams({ q: filterValue(page, "search"), domain_id: filterValue(page, "domain"), source_id: filterValue(page, "source") });
  const next = await page.api<Workspace>("?" + query);
  if (id !== page.seq) return;
  page.state = next;
  paintFilters(page);
  paintModel(page);
  renderRows(page);
  notice(page, "");
  paintManage(page);
}

/** A load that tells the person when it fails, in the notice. */
export const reload = (page: CogniaPage): Promise<void> => load(page).catch((error: unknown) => notice(page, messageOf(error)));
