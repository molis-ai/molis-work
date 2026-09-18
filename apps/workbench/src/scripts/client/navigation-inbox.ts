/** AP3 Workbench client segment: navigation-inbox. */
export const CLIENT_NAVIGATION_INBOX_SCRIPT = `
    const inboxDirectory = document.querySelector("[data-inbox-directory]");
    const inboxList = document.querySelector("[data-inbox-list]");
    const inboxWorkbench = document.querySelector("[data-inbox-workbench]");

    const expandInboxStage = (expanded) => {
      const shell = document.querySelector("[data-inbox-stage-shell]");
      const workspace = document.querySelector("[data-inbox-stage-workspace]");
      if (!shell) return;
      shell.dataset.expanded = expanded ? "true" : "false";
      if (workspace) workspace.hidden = !expanded;
    };

    const collapseInboxStage = () => {
      expandInboxStage(false);
      inboxList?.querySelectorAll("[data-inbox-row]").forEach((row) => {
        row.classList.remove("is-selected");
        row.setAttribute("aria-selected", "false");
        row.tabIndex = -1;
      });
      inboxWorkbench?.querySelectorAll("[data-inbox-detail]").forEach((detail) => { detail.hidden = true; });
      const empty = inboxWorkbench?.querySelector("[data-inbox-detail-empty]");
      if (empty) empty.hidden = true;
    };

    const inboxRowVisible = (row) => !row.hidden && !row.closest("[data-inbox-item-wrap]")?.hidden;

    const selectInboxEntry = (entryId, persist = true) => {
      if (!entryId) {
        collapseInboxStage();
        if (persist) queueSave();
        return;
      }
      const rows = [...(inboxList?.querySelectorAll("[data-inbox-row]") || [])];
      rows.forEach((row) => {
        const selected = row.dataset.inboxEntryId === entryId && inboxRowVisible(row);
        row.classList.toggle("is-selected", selected);
        row.setAttribute("aria-selected", String(selected));
        row.tabIndex = selected ? 0 : -1;
      });
      inboxWorkbench?.querySelectorAll("[data-inbox-detail]").forEach((detail) => {
        detail.hidden = detail.dataset.inboxDetail !== entryId;
      });
      const empty = inboxWorkbench?.querySelector("[data-inbox-detail-empty]");
      if (empty) empty.hidden = true;
      expandInboxStage(true);
      if (persist) queueSave();
    };

    const setInboxFilter = (filter, persist = true) => {
      if (!inboxDirectory) return;
      const next = filter === "history" ? "history" : "active";
      inboxDirectory.dataset.inboxCurrentFilter = next;
      const fold = inboxList?.querySelector('[data-inbox-stage-group="' + next + '"]');
      if (fold) fold.open = true;
      if (persist) queueSave();
    };
`;