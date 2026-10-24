import { messageOf } from "./dom.js";
import { closeDialog, showAdd, showAi, showDomain, showDraft, showDrafts, showEdit, showImport } from "./dialog.js";
import { OWN_SOURCES } from "./labels.js";
import { countSelected, load } from "./list.js";
import { fail, notice, q, type CogniaPage } from "./page.js";
import { fold, openMaterial } from "./reading.js";
import type { Draft } from "./types.js";

const MAX_SELECTED = 5;

type Handler = (page: CogniaPage, element: HTMLElement) => Promise<void>;
const idOf = (element: HTMLElement): string => element.dataset.id ?? "";
const filter = (page: CogniaPage, name: "domain" | "source") => q<HTMLSelectElement>(page, `[data-cognia-${name}]`);

async function removeMaterial(page: CogniaPage): Promise<void> {
  const material = page.cur;
  if (!material || !await page.host.confirm(page.L("cognia.confirm.remove-material"))) return;
  await page.api(`/materials/${encodeURIComponent(material.id)}/delete`, {});
  page.selected.delete(material.id);
  if (page.cur?.id === material.id) fold(page);
  await load(page);
}

async function removeDraft(page: CogniaPage, element: HTMLElement): Promise<void> {
  if (!await page.host.confirm(page.L("cognia.confirm.remove-draft"))) return;
  await page.api(`/drafts/${encodeURIComponent(idOf(element))}/delete`, {});
  page.draft = null;
  page.dialog.close();
  await load(page);
}

async function changeDomain(page: CogniaPage, rename: boolean): Promise<void> {
  const id = filter(page, "domain").value, item = page.state.domains.find((d) => d.id === id);
  if (!item) throw new Error(page.L("cognia.error.choose-domain"));
  if (rename) {
    const name = await page.host.prompt(page.L("cognia.domain.name"), item.name);
    if (name === null) return;
    await page.api(`/domains/${encodeURIComponent(id)}/update`, { name });
  } else {
    if (!await page.host.confirm(page.L("cognia.confirm.delete-domain"))) return;
    await page.api(`/domains/${encodeURIComponent(id)}/delete`, {});
    filter(page, "domain").value = "";
  }
  await load(page);
}

async function changeSource(page: CogniaPage, rename: boolean): Promise<void> {
  const id = filter(page, "source").value, item = page.state.sources.find((s) => s.id === id);
  if (!item || OWN_SOURCES.includes(id)) throw new Error(page.L("cognia.error.choose-source"));
  if (rename) {
    const name = await page.host.prompt(page.L("cognia.source.name"), item.name);
    if (name === null) return;
    await page.api(`/sources/${encodeURIComponent(id)}/update`, { name });
  } else {
    if (!await page.host.confirm(page.L("cognia.confirm.delete-source"))) return;
    await page.api(`/sources/${encodeURIComponent(id)}/delete`, {});
    filter(page, "source").value = "";
    page.selected.clear();
    if (page.cur?.source_id === id) fold(page);
  }
  await load(page);
}

/** Asks the model about the chosen materials' fixed versions, or (query) about the current domain. */
function askModel(page: CogniaPage, action: "synthesize" | "synthesize-current" | "query"): void {
  const current = action === "synthesize-current" ? page.cur : null;
  const ids = current ? [current.id] : [...page.selected];
  if (action !== "query" && (!ids.length || ids.length > MAX_SELECTED)) throw new Error(page.L("cognia.ai.select-between"));
  const refs = ids.map((id) => ({ id, revision: (current?.id === id ? current : page.state.materials.find((m) => m.id === id))?.revision }));
  showAi(page, action, refs);
}

const HANDLERS: Record<string, Handler> = {
  "clear-filters": async (page) => {
    for (const name of ["search", "domain", "source"] as const) q<HTMLInputElement>(page, `[data-cognia-${name}]`).value = "";
    await load(page);
  },
  import: async (page) => showImport(page),
  add: async (page) => showAdd(page),
  domain: async (page) => showDomain(page),
  "edit-material": async (page) => showEdit(page),
  "delete-material": (page) => removeMaterial(page),
  "delete-draft": removeDraft,
  "rename-domain": (page) => changeDomain(page, true),
  "delete-domain": (page) => changeDomain(page, false),
  "rename-source": (page) => changeSource(page, true),
  "delete-source": (page) => changeSource(page, false),
  close: (page) => closeDialog(page),
  back: async (page) => fold(page),
  reload: (page) => load(page),
  link: async (page, element) => { if (page.dialog.open) page.dialog.close(); await openMaterial(page, idOf(element), element.dataset.revision); },
  reference: async (page, element) => { if (page.dialog.open) page.dialog.close(); await openMaterial(page, idOf(element), element.dataset.revision); },
  draft: async (page, element) => showDraft(page, (await page.api<{ draft: Draft }>(`/drafts/${idOf(element)}`)).draft),
  drafts: async (page) => showDrafts(page),
  synthesize: async (page) => askModel(page, "synthesize"),
  "synthesize-current": async (page) => askModel(page, "synthesize-current"),
  query: async (page) => askModel(page, "query"),
};

async function click(page: CogniaPage, event: MouseEvent): Promise<void> {
  const target = event.target instanceof Element ? event.target : null;
  const actionElement = target?.closest<HTMLElement>("[data-cognia-action]") ?? null;
  const entry = target?.closest<HTMLElement>("[data-cognia-id]") ?? null;
  try {
    if (entry?.dataset.cogniaId) { page.returnFocus = entry; await openMaterial(page, entry.dataset.cogniaId); return; }
    if (page.busy && page.dialog.open) return;
    const action = actionElement?.dataset.cogniaAction;
    const handler = action && Object.hasOwn(HANDLERS, action) ? HANDLERS[action] : undefined;
    if (handler && actionElement) await handler(page, actionElement);
  } catch (error) {
    if (page.dialog.open) fail(page, messageOf(error)); else notice(page, messageOf(error));
  }
}

function select(page: CogniaPage, box: HTMLInputElement): void {
  const id = box.dataset.cogniaSelect ?? "";
  if (box.checked && page.selected.size >= MAX_SELECTED) { box.checked = false; notice(page, page.L("cognia.ai.max")); return; }
  if (box.checked) page.selected.add(id); else page.selected.delete(id);
  countSelected(page);
}

export function installActions(page: CogniaPage): void {
  page.root.addEventListener("click", (event) => { void click(page, event); });
  page.root.addEventListener("change", (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target instanceof HTMLInputElement && target.matches("[data-cognia-select]")) select(page, target);
    if (target?.matches("[data-cognia-domain],[data-cognia-source]")) void load(page).catch((error: unknown) => notice(page, messageOf(error)));
  });
}
