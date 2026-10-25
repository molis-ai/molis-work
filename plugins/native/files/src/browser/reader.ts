import type {} from "@molis-ai/molis-work-design-system";
import { FILES_PLUGIN_ID } from "../plugin-id.js";
import { messageOf, said } from "./dom.js";
import { active, request, requestPlugin } from "./page.js";
import type { FilesPage } from "./page.js";
import { readErrors } from "./tree.js";
import type { CaptureAnswer, HtmlAnswer, OpenAnswer } from "./types.js";

/** What is open here, for the Assistant and for "open in plugin" from elsewhere (the side panel's file tab). */
export function publishContext(page: FilesPage, path?: readonly string[]): void {
  page.surface?.setAttribute("data-assistant-context", JSON.stringify({
    plugin_id: FILES_PLUGIN_ID, surface_title: "Files",
    ...(path ? { object: { kind: "workspace_file", id: page.workspace + ":" + path.join("/"), title: path[path.length - 1] || page.L("files.reader.file") } } : {}),
  }));
}

/** The copy and capture buttons follow what is selected and whether a file is open. */
export function controls(page: FilesPage): void {
  const { L, text, current, captureBusy } = page, length = text.selectionEnd - text.selectionStart;
  page.q("[data-files-selection-hint]").textContent = length && current ? L("files.snapshot.selected", { count: length }) : L("files.snapshot.select-hint");
  page.q<HTMLButtonElement>("[data-files-copy]").disabled = !current || captureBusy;
  page.q<HTMLButtonElement>('[data-files-capture="before"]').disabled = !current || captureBusy;
  page.q<HTMLButtonElement>('[data-files-capture="after"]').disabled = !current || captureBusy;
  page.q<HTMLButtonElement>('[data-files-capture="selection"]').disabled = !current || captureBusy || text.selectionEnd <= text.selectionStart;
}

/** Nothing is open: the reader asks for a file. */
export function clearReader(page: FilesPage): void {
  const { L, text } = page;
  page.current = null; page.selectedPath = null; page.reload.disabled = true; page.readTicket++;
  text.value = ""; text.hidden = true;
  page.q("[data-files-title]").textContent = L("files.reader.choose");
  page.q("[data-files-notice]").textContent = L("files.reader.pick");
  controls(page);
}

/** The text stats and diff of the pinned snapshots, drawn by their plugins. */
export async function companions(page: FilesPage, ticket: number): Promise<void> {
  const [stats, diff] = await Promise.all([requestPlugin<HtmlAnswer>(page, "text-stats", "/state"), requestPlugin<HtmlAnswer>(page, "diff", "/state")]);
  if (!active(page, ticket)) return;
  page.q("[data-files-stats]").innerHTML = stats.html ?? "";
  page.q("[data-files-diff]").innerHTML = diff.html ?? "";
}

/** Reads one file into the reader. */
export async function openFile(page: FilesPage, path: string[]): Promise<void> {
  const { L, result, text } = page, ticket = ++page.readTicket, epoch = page.generation, id = page.workspace;
  page.current = null; page.selectedPath = path; publishContext(page, path); page.reload.disabled = true;
  result.setAttribute("aria-busy", "true"); controls(page); text.hidden = true;
  page.q("[data-files-title]").textContent = path.join("/");
  const notice = page.q("[data-files-notice]");
  notice.textContent = L("files.reader.reading");
  try {
    const value = await request<OpenAnswer>(page, "/open", "POST", { workspace_id: id, path });
    if (ticket !== page.readTicket || !active(page, epoch)) return;
    const read = value.result;
    if (read.outcome === "text") {
      page.current = { workspace_id: id, path, fingerprint: read.fingerprint };
      text.value = read.text; text.hidden = false; text.scrollTop = 0; text.scrollLeft = 0;
      notice.textContent = text.value.length ? L("files.reader.as-read") : L("files.reader.empty");
    } else if (read.outcome === "too-large") notice.textContent = L("files.reader.too-large", { limit: read.limit });
    else notice.textContent = readErrors(page)[read.outcome] || L("files.reader.failed");
    page.tree.querySelectorAll<HTMLElement>("[data-file-path]").forEach(button => {
      const here = button.dataset.filePath === JSON.stringify(path);
      button.setAttribute("aria-current", String(here)); button.classList.toggle("is-selected", here);
    });
    controls(page);
  } catch (error) {
    if (ticket === page.readTicket && active(page, epoch)) { notice.textContent = L("files.reader.retry", { message: said(L, messageOf(error)) }); controls(page); }
  } finally {
    if (ticket === page.readTicket && active(page, epoch)) { result.setAttribute("aria-busy", "false"); page.reload.disabled = false; }
  }
}

/** Pins the text as read (or the selection of it) as a snapshot another plugin can bind to. */
export async function capture(page: FilesPage, button: HTMLButtonElement): Promise<void> {
  const { L, text, lifetime } = page;
  if (!page.current || page.captureBusy) return;
  const saved = { ...page.current }, epoch = page.generation, ticket = page.readTicket, port = button.dataset.filesCapture ?? "";
  const range = { start: text.selectionStart, end: text.selectionEnd };
  page.captureBusy = true; button.toggleAttribute("data-loading", true);
  const spinner = document.createElement("span"); spinner.className = "mw-spinner"; spinner.setAttribute("aria-hidden", "true"); button.prepend(spinner);
  controls(page);
  const status = page.q("[data-files-capture-status]");
  try {
    const value = await request<CaptureAnswer>(page, "/capture", "POST", { ...saved, port, ...range });
    if (!active(page, epoch) || ticket !== page.readTicket) return;
    const told = { version: value.saved.artifact.version, path: saved.path.join("/") };
    status.textContent = port === "before" ? L("files.snapshot.pinned-before", told) : port === "after" ? L("files.snapshot.pinned-after", told) : L("files.snapshot.pinned-selection", told);
    await companions(page, epoch);
  } catch (error) {
    if (active(page, epoch) && ticket === page.readTicket) status.textContent = said(L, messageOf(error));
  } finally {
    page.captureBusy = false;
    if (lifetime.alive) { button.removeAttribute("data-loading"); spinner.remove(); controls(page); }
  }
}

/** Copies the whole text and says how it went. */
export async function copyAll(page: FilesPage): Promise<void> {
  const { L } = page, epoch = page.generation, button = page.q("[data-files-copy]");
  const copied = await window.molisCopy?.(button, page.text.value, { done: L("files.reader.copied"), failed: L("files.reader.copy-failed") });
  if (active(page, epoch)) page.q("[data-files-capture-status]").textContent = copied ? L("files.reader.text-copied") : L("files.reader.copy-by-hand");
}
