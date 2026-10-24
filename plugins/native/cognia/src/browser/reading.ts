import { button, esc } from "./dom.js";
import { OWN_SOURCES, ROLE_KEY } from "./labels.js";
import { renderMarkdown, renderReferences } from "./markdown.js";
import { q, tx, type CogniaPage } from "./page.js";
import { libraryUrl } from "./request.js";
import type { Detail, Link } from "./types.js";

/** Tells the resident Assistant what the page shows: this page, and the material open in the reader if there is one. */
export function publishContext(page: CogniaPage): void {
  const { cur } = page;
  const context: Record<string, unknown> = { plugin_id: page.host.pluginId, surface_title: "Cognia" };
  if (cur) context.object = { kind: "cognia_material", id: cur.id, version: cur.revision || cur.updated_at || "", title: cur.title };
  page.root.setAttribute("data-assistant-context", JSON.stringify(context));
}

/** Closes the reader and gives the list back its place; focus goes to the row the person came from. */
export function fold(page: CogniaPage): void {
  const id = page.cur?.id;
  page.opened++;
  page.cur = null;
  publishContext(page);
  page.root.dataset.expanded = "false";
  q(page, "[data-cognia-workspace]").hidden = true;
  const directory = q(page, "[data-cognia=directory]");
  directory.scrollTop = page.listScroll;
  if (page.listFocus?.isConnected && directory.contains(page.listFocus)) page.listFocus.focus();
  else page.root.querySelector<HTMLElement>(`[data-cognia-id="${id}"]`)?.focus();
}

const linkNote = (page: CogniaPage, link: Link): string =>
  tx(page, link.status === "ambiguous" ? "cognia.link.ambiguous" : link.status === "unsafe" ? "cognia.link.unsafe" : "cognia.link.missing");

function outgoingLinks(page: CogniaPage, outgoing: readonly Link[]): string {
  return outgoing.map((link) => {
    if (link.status === "resolved") return button(link.label, "link", `data-id="${esc(link.material_id)}"`);
    if (link.status === "external") return `<p>${esc(link.label)} · <a href="${esc(link.target)}" target="_blank" rel="noopener noreferrer">${esc(link.target)}</a></p>`;
    return `<p>${esc(link.label)} · ${linkNote(page, link)}</p>`;
  }).join("");
}

function readingHtml(page: CogniaPage, data: Detail): string {
  const { material } = data;
  const source = page.state.sources.find((s) => s.id === material.source_id)?.name || "";
  const body = material.role === "attachment" ? `<p>${tx(page, "cognia.reading.attachment-note")}</p>` : renderMarkdown(material.body.replace(material.frontmatter, ""), page.L, data.outgoing, data.references);
  const none = `<p>${tx(page, "cognia.reading.no-links")}</p>`;
  const incoming = data.incoming.map((m) => button(m.title, "link", `data-id="${esc(m.id)}"`)).join("");
  return `<div class="cognia-provenance"><p>${esc(source)} / ${esc(material.path)}</p><p>${tx(page, ROLE_KEY[material.role])} · v${material.revision} · ${esc(material.tags.map((tag) => "#" + tag).join(" "))}</p></div>`
    + `<article class="cognia-body">${body}</article><details><summary>${tx(page, "cognia.reading.view-raw")}</summary><pre class="cognia-raw">${esc(material.body)}</pre></details>`
    + renderReferences(data.references, page.L)
    + `<section class="cognia-relations"><h3>${tx(page, "cognia.reading.outgoing")}</h3>${outgoingLinks(page, data.outgoing) || none}<h3>${tx(page, "cognia.reading.backlinks")}</h3>${incoming || none}</section>`;
}

/** Opens a material (one fixed version when `revision` is given). Only the one opened last takes the reader: an earlier one, or folding, answered late does not. */
export async function openMaterial(page: CogniaPage, id: string, revision?: string | number): Promise<void> {
  const ticket = ++page.opened;
  const data = await page.api<Detail>("/materials/" + encodeURIComponent(id) + (revision ? "?revision=" + revision : ""));
  if (ticket !== page.opened) return;
  const material = data.material;
  page.cur = material;
  publishContext(page);
  const directory = q(page, "[data-cognia=directory]");
  if (page.root.dataset.expanded !== "true") {
    page.listFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    page.listScroll = directory.scrollTop;
  }
  page.root.dataset.expanded = "true";
  q(page, "[data-cognia-workspace]").hidden = false;
  const heading = q(page, "[data-cognia-heading]");
  heading.textContent = material.title;
  q<HTMLAnchorElement>(page, "[data-cognia-download]").href = libraryUrl(page.host, `/materials/${encodeURIComponent(id)}/download?revision=${material.revision}`);
  q(page, '[data-cognia-action="edit-material"]').hidden = !!revision || !OWN_SOURCES.includes(material.source_id);
  q(page, '[data-cognia-action="delete-material"]').hidden = !!revision || !page.state.materials.some((m) => m.id === id);
  const reading = q(page, "[data-cognia-reading]");
  reading.innerHTML = readingHtml(page, data);
  reading.scrollTop = 0;
  heading.setAttribute("tabindex", "-1");
  heading.focus();
}
