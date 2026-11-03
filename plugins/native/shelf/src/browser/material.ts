import { messageOf } from "./dom.js";
import { flushEdit } from "./edit.js";
import { post, read } from "./request.js";
import type { ShelfPage } from "./types.js";

interface MaterialAnswer { fingerprint: string; project_title: string; payload: { title: string; text: string } }
interface SavedMaterial { reference: { version: number } }

/** Saving a copy's text into the project's knowledge: reads it back in full, shows where it goes, and saves what was shown. */
export function installMaterial(page: ShelfPage): void {
  const { bench, lifetime, L } = page;
  const dialog = bench.querySelector<HTMLDialogElement>("[data-shelf-material-dialog]");
  const status = bench.querySelector<HTMLElement>("[data-shelf-material-status]");
  const save = bench.querySelector<HTMLButtonElement>("[data-shelf-material-save]");
  const body = bench.querySelector<HTMLElement>("[data-shelf-material-body]");
  const destination = bench.querySelector<HTMLElement>("[data-shelf-material-destination]");
  if (!dialog || !status || !save || !body || !destination) return;
  lifetime.listen(dialog, "close", () => { page.materialTicket++; page.materialPreview = null; });
  lifetime.listen(bench.querySelector("[data-shelf-material-close]"), "click", () => dialog.close());
  const open = async () => {
    if (!page.selected || !page.projectPrefix) return;
    const id = page.selected.item_id;
    const ticket = ++page.materialTicket;
    page.materialPreview = null;
    save.disabled = true;
    status.textContent = L("shelf.material.reading-the-full-text");
    body.textContent = "";
    destination.textContent = "";
    if (!dialog.open) dialog.showModal();
    try {
      await flushEdit(page);
      await page.editWrites;
      const data = await read<MaterialAnswer>(page, "/items/" + encodeURIComponent(id) + "/project-material", L("shelf.material.could-not-read-the-material"));
      if (ticket !== page.materialTicket) return;
      page.materialPreview = { id, fingerprint: data.fingerprint };
      destination.textContent = data.project_title + " / " + data.payload.title;
      body.textContent = data.payload.text;
      status.textContent = L("shelf.material.review-the-text-before-saving");
      save.disabled = false;
    } catch (error) {
      if (page.lifetime.alive && ticket === page.materialTicket) status.textContent = messageOf(error);
    }
  };
  lifetime.listen(bench.querySelector("[data-shelf-project-material]"), "click", open);
  lifetime.listen(bench.querySelector("[data-shelf-material-refresh]"), "click", open);
  lifetime.listen(bench.querySelector("[data-shelf-use-in-project]"), "click", () => {
    if (!page.selected) return;
    window.dispatchEvent(new CustomEvent("molis:placement-request", { detail: { action: "use-in-project", object: { kind: "shelf_item", id: page.selected.item_id, project_id: null } } }));
  });
  lifetime.listen(bench.querySelector("[data-shelf-material-form]"), "submit", async (event) => {
    event.preventDefault();
    const current = page.materialPreview;
    if (!current || save.disabled) return;
    const ticket = page.materialTicket;
    save.disabled = true;
    status.textContent = L("shelf.material.saving");
    try {
      const result = await post<SavedMaterial>(page, "/items/" + encodeURIComponent(current.id) + "/project-material", { expected_fingerprint: current.fingerprint });
      if (ticket === page.materialTicket) status.textContent = L("shelf.material.saved-to-project-knowledge") + " · v" + result.reference.version + L("shelf.material.agents-in-the-project-can");
    } catch (error) {
      if (!page.lifetime.alive || ticket !== page.materialTicket) return;
      status.textContent = messageOf(error);
      save.disabled = false;
    }
  });
}
