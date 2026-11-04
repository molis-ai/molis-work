/// <reference lib="dom" />
// The board's composed patterns (`primitives/catalog-patterns.ts`) made to feel real: picking and sorting the data table, adding
// and removing tags, and the drop zone's two faces. Presentation only; nothing here is a product control.
const all = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => [...scope.querySelectorAll<T>(selector)];

/** Called once by the board script, after the board is on the page. */
export function wireCatalogPatterns(): void {
  document.querySelectorAll<HTMLElement>(".mw-catalog [data-dt]").forEach((table) => {
    const picks = () => all<HTMLInputElement>("[data-dt-pick]", table);
    const every = table.querySelector<HTMLInputElement>("[data-dt-all]");
    const sync = () => {
      const chosen = picks().filter((box) => box.checked).length;
      picks().forEach((box) => box.closest("tr")?.setAttribute("aria-selected", String(box.checked)));
      table.toggleAttribute("data-picked", chosen > 0);
      const count = table.querySelector("[data-dt-count]");
      if (count) count.textContent = String(chosen);
      if (every) { every.checked = chosen === picks().length; every.indeterminate = chosen > 0 && chosen < picks().length; }
    };
    table.addEventListener("change", (event) => {
      if ((event.target as Element).matches("[data-dt-all]")) picks().forEach((box) => { box.checked = every?.checked ?? false; });
      sync();
    });
    table.addEventListener("click", (event) => {
      const origin = event.target as Element;
      if (origin.closest("[data-dt-clear]")) { picks().forEach((box) => { box.checked = false; }); sync(); every?.focus(); return; }
      const sorter = origin.closest<HTMLElement>("[data-dt-sort]");
      const head = sorter?.closest("th");
      const body = table.querySelector("tbody");
      if (!sorter || !head || !body) return;
      const order = head.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
      all("th[aria-sort]", table).forEach((cell) => cell.setAttribute("aria-sort", cell === head ? order : "none"));
      const key = sorter.dataset.dtSort ?? "";
      const value = (row: HTMLElement) => row.dataset[key] ?? "";
      const rows = all<HTMLTableRowElement>("tr", body).sort((a, b) => {
        const left = value(a), right = value(b);
        const compared = Number.isNaN(Number(left)) ? left.localeCompare(right, "zh") : Number(left) - Number(right);
        return order === "ascending" ? compared : -compared;
      });
      body.append(...rows);
    });
  });

  document.querySelectorAll<HTMLElement>(".mw-catalog [data-tags]").forEach((field) => {
    const input = field.querySelector<HTMLInputElement>("[data-tags-input]");
    const suggestions = field.nextElementSibling;
    if (!input) return;
    const names = () => all(".mw-tag", field).map((tag) => tag.firstChild?.textContent ?? "");
    const add = (name: string) => {
      const label = name.trim();
      if (!label || names().includes(label)) return;
      const tag = document.createElement("span");
      tag.className = "mw-tag";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.tagRemove = "";
      remove.setAttribute("aria-label", `移除 ${label}`);
      const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      glyph.setAttribute("aria-hidden", "true");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#icon-x");
      glyph.append(use);
      remove.append(glyph);
      tag.append(document.createTextNode(label), remove);
      input.before(tag);
      suggestions?.querySelector<HTMLElement>(`[data-tag-add="${CSS.escape(label)}"]`)?.remove();
    };
    input.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === ",") && !event.isComposing) { event.preventDefault(); add(input.value); input.value = ""; }
      if (event.key === "Backspace" && !input.value) input.previousElementSibling?.closest(".mw-tag")?.remove();
    });
    field.addEventListener("click", (event) => {
      const remove = (event.target as Element).closest(".mw-tag [data-tag-remove]");
      remove?.closest(".mw-tag")?.remove();
      if (remove || event.target === field) input.focus();
    });
    suggestions?.addEventListener("click", (event) => {
      const chosen = (event.target as Element).closest<HTMLElement>("[data-tag-add]");
      if (chosen) { add(chosen.dataset.tagAdd ?? ""); input.focus(); }
    });
  });

  // The live zone counts enters and leaves, so crossing its own children does not flicker; a drop lists the files' names.
  document.querySelectorAll<HTMLElement>(".mw-catalog [data-drop-live]").forEach((zone) => {
    let depth = 0;
    const list = zone.closest(".mw-catalog__section")?.querySelector("[data-drop-list]");
    const mark = (on: boolean) => zone.toggleAttribute("data-dropping", on);
    zone.addEventListener("dragenter", (event) => { event.preventDefault(); depth += 1; mark(true); });
    zone.addEventListener("dragover", (event) => event.preventDefault());
    zone.addEventListener("dragleave", () => { depth = Math.max(0, depth - 1); if (!depth) mark(false); });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      depth = 0;
      mark(false);
      const sample = list?.querySelector("[data-drop-sample]");
      for (const file of event.dataTransfer?.files ?? []) {
        const row = sample?.cloneNode(true) as HTMLElement | undefined;
        const text = row?.querySelector(":scope > span:nth-child(2)");
        if (!row || !text || !list) return;
        row.removeAttribute("data-drop-sample");
        row.querySelector("use")?.setAttribute("href", "#icon-file");
        text.replaceChildren(file.name, Object.assign(document.createElement("small"), { textContent: `${Math.max(1, Math.round(file.size / 1024))} KB` }));
        list.prepend(row);
      }
    });
  });
}
