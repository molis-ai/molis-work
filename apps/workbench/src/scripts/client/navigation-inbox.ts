/** AP3 Workbench client segment: navigation-inbox. */
export const CLIENT_NAVIGATION_INBOX_SCRIPT = `
    const inboxDirectory = document.querySelector("[data-inbox-directory]");
    const inboxList = document.querySelector("[data-inbox-list]");
    const inboxWorkbench = document.querySelector("[data-inbox-workbench]");

    const inboxRowVisible = (row) => {
      const status = row.dataset.inboxStatus;
      const active = status === "open" || status === "in_progress";
      const filter = inboxDirectory?.dataset.inboxCurrentFilter || "active";
      return filter === "history" ? !active : active;
    };

    const selectInboxEntry = (entryId, persist = true) => {
      const rows = [...(inboxList?.querySelectorAll("[data-inbox-row]") || [])];
      rows.forEach((row) => {
        const selected = Boolean(entryId) && row.dataset.inboxEntryId === entryId && inboxRowVisible(row);
        row.classList.toggle("is-selected", selected);
        row.setAttribute("aria-selected", String(selected));
        row.tabIndex = selected ? 0 : -1;
      });
      inboxWorkbench?.querySelectorAll("[data-inbox-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.inboxDetail !== entryId;
      });
      const empty = inboxWorkbench?.querySelector("[data-inbox-detail-empty]");
      if (empty) empty.hidden = Boolean(entryId);
      if (persist) queueSave();
    };

    const setInboxFilter = (filter, persist = true) => {
      if (!inboxDirectory) return;
      const next = filter === "history" ? "history" : "active";
      inboxDirectory.dataset.inboxCurrentFilter = next;
      inboxDirectory.querySelectorAll("[data-inbox-filter]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.inboxFilter === next);
      });
      const rows = [...(inboxList?.querySelectorAll("[data-inbox-row]") || [])];
      rows.forEach((row) => { row.hidden = !inboxRowVisible(row); });
      const visible = rows.find((row) => !row.hidden);
      const empty = inboxList?.querySelector("[data-inbox-empty]");
      const emptyTitle = empty?.querySelector("[data-inbox-empty-title]");
      if (empty) empty.hidden = Boolean(visible);
      if (emptyTitle) emptyTitle.textContent = next === "history" ? L("没有已完成或已忽略的事项") : L("现在没有需要你介入的事项");
      selectInboxEntry(visible?.dataset.inboxEntryId || "", persist);
    };
`;
