/** Schedule workbench client: select a job, pause or resume it. */
export const SCHEDULE_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L, route } = host;
  const workbench = document.querySelector("[data-schedule-workbench]");
  const list = document.querySelector("[data-schedule-list]");
  if (!workbench || !list) return;
  const expand = (expanded) => {
    const shell = document.querySelector("[data-schedule-stage-shell]");
    const workspace = document.querySelector("[data-schedule-stage-workspace]");
    if (!shell) return;
    shell.dataset.expanded = expanded ? "true" : "false";
    if (workspace) workspace.hidden = !expanded;
  };
  const collapse = () => {
    expand(false);
    list.querySelectorAll("[data-schedule-row]").forEach((row) => {
      row.classList.remove("is-selected");
      row.setAttribute("aria-selected", "false");
      row.tabIndex = -1;
    });
    workbench.querySelectorAll("[data-schedule-detail]").forEach((detail) => { detail.hidden = true; });
    const empty = workbench.querySelector("[data-schedule-detail-empty]");
    if (empty) empty.hidden = true;
  };
  const select = (jobId) => {
    if (!jobId) {
      collapse();
      return;
    }
    list.querySelectorAll("[data-schedule-row]").forEach((row) => {
      const selected = row.dataset.scheduleJobId === jobId;
      row.classList.toggle("is-selected", selected);
      row.setAttribute("aria-selected", String(selected));
      row.tabIndex = selected ? 0 : -1;
    });
    workbench.querySelectorAll("[data-schedule-detail]").forEach((detail) => {
      detail.hidden = detail.dataset.scheduleDetail !== jobId;
    });
    const empty = workbench.querySelector("[data-schedule-detail-empty]");
    if (empty) empty.hidden = true;
    expand(true);
  };
  list.addEventListener("click", (event) => {
    const row = event.target.closest("[data-schedule-row]");
    if (!row) return;
    select(row.dataset.scheduleJobId);
  });
  workbench.addEventListener("click", async (event) => {
    if (event.target.closest("[data-schedule-collapse]")) {
      collapse();
      return;
    }
    const action = event.target.closest("[data-schedule-enabled-action]");
    if (!action) return;
    const jobId = action.dataset.scheduleJobId;
    const enabled = action.dataset.scheduleEnabledAction === "true";
    const status = action.closest("[data-schedule-detail]")?.querySelector("[data-schedule-action-status]");
    action.disabled = true;
    try {
      const response = await fetch(route("/api/schedule/jobs/" + encodeURIComponent(jobId) + "/enabled"), {
        method: "POST",
        headers: globalThis.molisWorkControlHeaders?.() || { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("无法更新定时任务"));
      const job = result.job;
      const row = list.querySelector('[data-schedule-row][data-schedule-job-id="' + CSS.escape(jobId) + '"]');
      if (row) {
        row.dataset.scheduleEnabled = job.enabled ? "true" : "false";
        const mark = row.querySelector("[data-schedule-row-status]");
        if (mark) {
          mark.textContent = job.enabled ? L("已启用") : L("已暂停");
          mark.className = "mw-status mw-status--" + (job.enabled ? "progress" : "quiet") + " mw-status--plain feed-entry-status";
        }
      }
      location.reload();
    } catch (error) {
      if (status) {
        status.hidden = false;
        status.textContent = error.message || L("无法更新定时任务");
      }
      action.disabled = false;
    }
  });
}
`;
