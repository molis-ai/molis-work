import { messageOf } from "./dom.js";
import { flushEdit } from "./edit.js";
import { post, read } from "./request.js";
import { applySnapshot } from "./snapshot.js";
import type { ShelfPage, SnapshotAnswer } from "./types.js";

interface ProjectResult { title: string; reference: { artifact_id: string; version: number }; connected?: boolean }
interface ResultText { text: string; fingerprint: string; source: { reference: unknown } }

/** Explicit receipt of fixed project results; connected outputs only nominate candidates. */
export function installResult(page: ShelfPage): void {
  const { bench, lifetime, L } = page;
  const q = <T extends HTMLElement>(selector: string) => bench.querySelector<T>(selector);
  const dialog = q<HTMLDialogElement>("[data-shelf-result-dialog]");
  const openButton = q<HTMLButtonElement>("[data-shelf-receive-open]");
  const select = q<HTMLSelectElement>("[data-shelf-result-choice]");
  const body = q("[data-shelf-result-body]");
  const status = q("[data-shelf-result-status]");
  const receive = q<HTMLButtonElement>("[data-shelf-result-receive]");
  if (!dialog || !openButton || !select || !body || !status || !receive) return;
  openButton.hidden = !page.projectPrefix;
  let ticket = 0;
  let choices: ProjectResult[] = [];
  let current: ResultText | null = null;
  const failed = (token: number, error: unknown) => { if (lifetime.alive && token === ticket) status.textContent = messageOf(error); };
  const preview = async () => {
    const candidate = choices[Number(select.value)];
    const token = ++ticket;
    current = null;
    receive.disabled = true;
    body.textContent = "";
    if (!candidate) { status.textContent = L("shelf.result.no-saved-reports-or-changes"); return; }
    status.textContent = L("shelf.material.reading-the-full-text");
    try {
      const value = await read<ResultText>(page, "/project-result?artifact_id=" + encodeURIComponent(candidate.reference.artifact_id) + "&version=" + candidate.reference.version, L("shelf.result.could-not-read-result"));
      if (token !== ticket) return;
      current = value;
      body.textContent = value.text;
      receive.disabled = false;
      status.textContent = L("shelf.result.receive-a-personal-shelf-copy");
    } catch (error) { failed(token, error); }
  };
  const loadChoices = async () => {
    const token = ++ticket;
    current = null;
    receive.disabled = true;
    select.disabled = true;
    body.textContent = "";
    status.textContent = L("shelf.result.reading-project-results");
    try {
      await flushEdit(page);
      const value = await read<{ results: ProjectResult[] }>(page, "/project-results", L("shelf.result.could-not-read-result"));
      if (token !== ticket) return;
      choices = value.results;
      select.replaceChildren(...choices.map((item, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = item.title + " · v" + item.reference.version + (item.connected ? " · " + L("shelf.result.current-output") : "");
        return option;
      }));
      select.disabled = !choices.length;
      await preview();
    } catch (error) { failed(token, error); }
  };
  lifetime.listen(openButton, "click", () => { dialog.showModal(); void loadChoices(); });
  lifetime.listen(q("[data-shelf-result-close]"), "click", () => dialog.close());
  lifetime.listen(q("[data-shelf-result-refresh]"), "click", () => { void loadChoices(); });
  lifetime.listen(dialog, "close", () => { ticket++; current = null; });
  lifetime.listen(select, "change", () => { void preview(); });
  lifetime.listen(q("[data-shelf-result-form]"), "submit", async (event) => {
    event.preventDefault();
    if (!current || receive.disabled) return;
    const value = current;
    const token = ticket;
    receive.disabled = true;
    status.textContent = L("shelf.result.receiving-result");
    try {
      const result = await post<SnapshotAnswer>(page, "/project-result", { reference: value.source.reference, expected_fingerprint: value.fingerprint });
      const active = token === ticket;
      if (active) dialog.close();
      applySnapshot(page, result.snapshot, active ? result.item?.item_id : undefined);
    } catch (error) {
      if (lifetime.alive && token === ticket) { status.textContent = messageOf(error); receive.disabled = false; }
    }
  });
}
