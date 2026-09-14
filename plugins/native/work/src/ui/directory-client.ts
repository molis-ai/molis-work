/** Browser initializer: only the named ports cross this behavior boundary. */
export const WORK_DIRECTORY_CLIENT = `
({ loadSessionContent }) => {
  const directoryFor = (kind) => document.querySelector('[data-operation-directory="' + kind + '"]');
  const surfaceFor = (kind) => document.querySelector('[data-work-surface="' + kind + '"]');
  const visibleRows = (kind) => [...(directoryFor(kind)?.querySelectorAll("[data-operation-row]") || [])].filter((row) => !row.hidden);
  const selectRecord = (kind, id, moveToDetail = false) => {
    const directory = directoryFor(kind);
    const surface = surfaceFor(kind);
    const row = directory?.querySelector('[data-record-id="' + CSS.escape(id) + '"]');
    if (!directory || !surface || !row || row.hidden) return;
    directory.querySelectorAll("[data-operation-row]").forEach((candidate) => {
      const active = candidate === row;
      candidate.classList.toggle("is-selected", active);
      candidate.setAttribute("aria-selected", String(active));
      candidate.querySelector(".tree-entry")?.classList.toggle("is-selected", active);
      const button = candidate.querySelector(".tree-node") || (candidate.matches("[data-operation-select]") ? candidate : candidate.querySelector("[data-operation-select]"));
      if (button) {
        button.classList.toggle("is-selected", active);
        button.tabIndex = active ? 0 : -1;
      }
    });
    surface.querySelectorAll("[data-operation-detail]").forEach((detail) => { detail.hidden = detail.dataset.detailId !== id; });
    if (kind === "sessions") void loadSessionContent(surface.querySelector('[data-operation-detail]:not([hidden])'));
    if (moveToDetail && matchMedia("(max-width: 760px)").matches) document.querySelector('[data-mobile-target="document"]')?.click();
  };
  const filterRecords = (kind) => {
    const directory = directoryFor(kind);
    const surface = surfaceFor(kind);
    if (!directory || !surface) return;
    const query = String(directory.querySelector("[data-operation-search]")?.value || "").trim().toLocaleLowerCase();
    const filter = String(directory.querySelector("[data-operation-filter]")?.value || "all");
    const runtime = String(directory.querySelector("[data-session-runtime-filter]")?.value || "all");
    const status = String(directory.querySelector("[data-session-status-filter]")?.value || "all");
    const sort = String(directory.querySelector("[data-session-sort]")?.value || "updated-desc");
    const rows = [...directory.querySelectorAll("[data-operation-row]")];
    const visible = rows.filter((row) => {
      const contentMatches = row.dataset.recordContent === filter;
      const shown = (!query || String(row.dataset.recordSearch || "").includes(query))
        && (filter === "all" || contentMatches)
        && (runtime === "all" || row.dataset.recordRuntime === runtime)
        && (status === "all" || row.dataset.recordStatus === status);
      row.hidden = !shown;
      return shown;
    });
    rows.sort((left, right) => sort === "title-asc"
      ? String(left.dataset.recordTitle || left.dataset.recordSearch || "").localeCompare(String(right.dataset.recordTitle || right.dataset.recordSearch || ""))
      : sort === "updated-asc"
        ? Number(left.dataset.recordUpdated || 0) - Number(right.dataset.recordUpdated || 0)
        : Number(right.dataset.recordUpdated || 0) - Number(left.dataset.recordUpdated || 0));
    const list = directory.querySelector("[data-operation-list]");
    rows.forEach((row) => list?.append(row));
    const empty = directory.querySelector("[data-operation-empty]");
    if (empty) {
      empty.hidden = visible.length > 0;
      empty.querySelector("button")?.toggleAttribute("hidden", visible.length > 0);
    }
    if (!visible.length) surface.querySelectorAll("[data-operation-detail]").forEach((detail) => { detail.hidden = true; });
    else if (!visible.some((row) => row.classList.contains("is-selected"))) selectRecord(kind, visible[0].dataset.recordId);
  };
  document.querySelectorAll("[data-operation-directory]").forEach((directory) => {
    const kind = directory.dataset.operationDirectory;
    directory.addEventListener("click", (event) => {
      const select = event.target.closest("[data-operation-select]");
      if (select) selectRecord(kind, select.dataset.operationSelect, true);
    });
    directory.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const rows = visibleRows(kind);
      const current = rows.findIndex((row) => row.classList.contains("is-selected"));
      const next = event.key === "Home" ? rows[0] : event.key === "End" ? rows.at(-1) : rows[event.key === "ArrowDown" ? Math.min(rows.length - 1, current + 1) : Math.max(0, current - 1)];
      if (!next) return;
      event.preventDefault();
      selectRecord(kind, next.dataset.recordId);
      (next.querySelector(".tree-node") || (next.matches("[data-operation-select]") ? next : next.querySelector("[data-operation-select]")))?.focus();
    });
    directory.querySelector("[data-operation-search]")?.addEventListener("input", () => filterRecords(kind));
    directory.querySelector("[data-operation-filter]")?.addEventListener("change", () => filterRecords(kind));
    directory.querySelector("[data-session-runtime-filter]")?.addEventListener("change", () => filterRecords(kind));
    directory.querySelector("[data-session-status-filter]")?.addEventListener("change", () => filterRecords(kind));
    directory.querySelector("[data-session-sort]")?.addEventListener("change", () => filterRecords(kind));
    directory.querySelector("[data-operation-clear]")?.addEventListener("click", () => {
      const search = directory.querySelector("[data-operation-search]");
      const filter = directory.querySelector("[data-operation-filter]");
      if (search) search.value = "";
      if (filter) filter.value = "all";
      const runtime = directory.querySelector("[data-session-runtime-filter]");
      const status = directory.querySelector("[data-session-status-filter]");
      if (runtime) runtime.value = "all";
      if (status) status.value = "all";
      filterRecords(kind);
      search?.focus();
    });
  });
  const sessionDirectory = directoryFor("sessions");
  const sessionRuntimeFilter = sessionDirectory?.querySelector("[data-session-runtime-filter]");
  if (sessionRuntimeFilter) {
    [...new Map([...sessionDirectory.querySelectorAll('[data-operation-row="session"]')].map((row) => [row.dataset.recordRuntime, row.dataset.recordRuntimeLabel || row.dataset.recordRuntime])).entries()]
      .filter(([value]) => value)
      .sort((left, right) => String(left[1]).localeCompare(String(right[1])))
      .forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        sessionRuntimeFilter.append(option);
      });
  }
  document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
    const activeDirectory = document.querySelector('[data-operation-directory]:not([hidden])');
    const search = activeDirectory?.querySelector("[data-operation-search]");
    if (!search) return;
    event.preventDefault();
    search.focus();
  });
  
}
`;
