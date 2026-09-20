/** Schedule workbench client: create a conversation task, select it, pause or resume. */
export const SCHEDULE_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L, route } = host;
  const workbench = document.querySelector("[data-schedule-workbench]");
  const list = document.querySelector("[data-schedule-list]");
  if (!workbench || !list) return;
  const dialog = workbench.querySelector("[data-schedule-create-dialog]");
  const form = workbench.querySelector("[data-schedule-create-form]");
  const errorEl = workbench.querySelector("[data-schedule-create-error]");
  const OPEN_KEY = "mw-schedule-open";
  const headers = () => globalThis.molisWorkControlHeaders?.() || { "content-type": "application/json" };
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
  const select = (id, kind) => {
    if (!id) {
      collapse();
      return;
    }
    list.querySelectorAll("[data-schedule-row]").forEach((row) => {
      const selected = kind === "task"
        ? row.dataset.scheduleTaskId === id
        : row.dataset.scheduleJobId === id;
      row.classList.toggle("is-selected", selected);
      row.setAttribute("aria-selected", String(selected));
      row.tabIndex = selected ? 0 : -1;
    });
    workbench.querySelectorAll("[data-schedule-detail]").forEach((detail) => {
      detail.hidden = detail.dataset.scheduleDetail !== id;
    });
    const empty = workbench.querySelector("[data-schedule-detail-empty]");
    if (empty) empty.hidden = true;
    expand(true);
    if (kind === "task") {
      void fetch(route("/api/schedule/tasks/" + encodeURIComponent(id) + "/open"), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({}),
      }).catch(() => undefined);
    }
  };
  const showError = (message) => {
    if (!errorEl) return;
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  };
  workbench.querySelector("[data-schedule-new]")?.addEventListener("click", () => {
    showError("");
    dialog?.showModal();
    form?.querySelector("[name=title]")?.focus();
  });
  workbench.querySelectorAll("[data-schedule-create-close]").forEach((button) => {
    button.addEventListener("click", () => dialog?.close());
  });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const submit = form.querySelector("[type=submit]");
    if (submit) submit.disabled = true;
    showError("");
    try {
      const response = await fetch(route("/api/schedule/tasks"), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          title: String(data.get("title") || ""),
          instructions: String(data.get("instructions") || ""),
          time: String(data.get("time") || ""),
          notify_important: data.get("notify_important") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("无法创建定时任务"));
      sessionStorage.setItem(OPEN_KEY, result.task.task_id);
      location.reload();
    } catch (error) {
      showError(error.message || L("无法创建定时任务"));
      if (submit) submit.disabled = false;
    }
  });
  list.addEventListener("click", (event) => {
    if (event.target.closest("[data-schedule-new]")) return;
    const row = event.target.closest("[data-schedule-row]");
    if (!row) return;
    const kind = row.dataset.scheduleKind === "task" ? "task" : "job";
    select(kind === "task" ? row.dataset.scheduleTaskId : row.dataset.scheduleJobId, kind);
  });
  workbench.addEventListener("click", async (event) => {
    if (event.target.closest("[data-schedule-collapse]")) {
      collapse();
      return;
    }
    const taskAction = event.target.closest("[data-schedule-task-enabled-action]");
    if (taskAction) {
      const taskId = taskAction.dataset.scheduleTaskId;
      const enabled = taskAction.dataset.scheduleTaskEnabledAction === "true";
      const status = taskAction.closest("[data-schedule-detail]")?.querySelector("[data-schedule-action-status]");
      taskAction.disabled = true;
      try {
        const response = await fetch(route("/api/schedule/tasks/" + encodeURIComponent(taskId) + "/enabled"), {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ enabled }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("无法更新定时任务"));
        sessionStorage.setItem(OPEN_KEY, taskId);
        location.reload();
      } catch (error) {
        if (status) {
          status.hidden = false;
          status.textContent = error.message || L("无法更新定时任务");
        }
        taskAction.disabled = false;
      }
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
        headers: headers(),
        body: JSON.stringify({ enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("无法更新定时任务"));
      location.reload();
    } catch (error) {
      if (status) {
        status.hidden = false;
        status.textContent = error.message || L("无法更新定时任务");
      }
      action.disabled = false;
    }
  });
  const pending = sessionStorage.getItem(OPEN_KEY);
  if (pending) {
    sessionStorage.removeItem(OPEN_KEY);
    // tab restore 会在同一轮初始化里把 plugin-stage 收起来；放到微任务里，创建/暂停后才能停在对话详情。
    queueMicrotask(() => select(pending, "task"));
  }
}
`;
