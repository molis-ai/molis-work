/** Schedule workbench client: create a conversation task, select it, pause or resume. */
export const SCHEDULE_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L, route } = host;
  const workbench = document.querySelector("[data-schedule-workbench]");
  const list = document.querySelector("[data-schedule-list]");
  if (!workbench || !list) return;
  const dialog = workbench.querySelector("[data-schedule-create-dialog]");
  const form = workbench.querySelector("[data-schedule-create-form]");
  const errorEl = workbench.querySelector("[data-schedule-create-error]");
  let editingTaskId = "";
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
  const refreshStage = async (openId, kind = "task", preserveConfirmation = false) => {
    try {
      const scrollTop = list.scrollTop;
      const response = await fetch(route("/api/schedule/workbench"), { cache: "no-store" });
      if (!response.ok) throw new Error(L("无法更新定时任务列表"));
      const template = document.createElement("template");
      template.innerHTML = (await response.text()).trim();
      const nextList = template.content.querySelector("[data-schedule-list]");
      const nextWorkspace = template.content.querySelector("[data-schedule-stage-workspace]");
      const workspace = workbench.querySelector("[data-schedule-stage-workspace]");
      if (!nextList || !nextWorkspace || !workspace) throw new Error(L("无法更新定时任务列表"));
      const chrome = list.querySelector(".plugin-stage-chrome");
      nextList.querySelector(".plugin-stage-chrome")?.remove();
      const incoming = [...nextList.childNodes];
      list.replaceChildren(...(chrome ? [chrome, ...incoming] : incoming));
      const empty = workspace.querySelector("[data-schedule-detail-empty]");
      workspace.querySelectorAll("[data-schedule-detail]").forEach((detail) => detail.remove());
      [...nextWorkspace.querySelectorAll("[data-schedule-detail]")].forEach((detail) => {
        if (empty) workspace.insertBefore(detail, empty);
        else workspace.append(detail);
      });
      list.scrollTop = scrollTop;
      if (openId) select(openId, kind);
      else collapse();
      return true;
    } catch (error) {
      if (preserveConfirmation) throw error;
      location.reload();
      return false;
    }
  };
  const showError = (message) => {
    if (!errorEl) return;
    errorEl.hidden = !message;
    errorEl.textContent = message || "";
  };
  const recoveryDialog = workbench.querySelector("[data-schedule-recovery-dialog]");
  const recoveryForm = workbench.querySelector("[data-schedule-recovery-form]");
  const recoveryError = workbench.querySelector("[data-schedule-recovery-error]");
  let recovery = null, recovering = false;
  const recoveryMessage = message => { recoveryError.textContent = message || ""; recoveryError.hidden = !message; };
  const setRecovering = busy => {
    recovering = busy;
    recoveryForm.setAttribute("aria-busy", String(busy));
    recoveryForm.querySelectorAll("button").forEach(button => { button.disabled = busy; });
    recoveryForm.querySelector("[type=submit]").disabled = busy || !recovery?.input;
  };
  const readRecovery = (jobId) => {
    const detail = [...workbench.querySelectorAll("[data-schedule-detail]")].find(item => item.dataset.scheduleDetail === jobId);
    const button = detail?.querySelector("[data-schedule-reminder-recover]");
    recovery = { jobId, input: button ? { expected_installation_id: button.dataset.installationId, expected_generation: button.dataset.generation } : null };
    recoveryForm.querySelector("[data-schedule-recovery-text]").textContent = detail?.querySelector("[data-schedule-reminder-text]")?.textContent || "";
    recoveryForm.querySelector("[data-schedule-recovery-target]").textContent = detail?.querySelector("[data-schedule-reminder-target]")?.textContent || L("这条提醒已恢复或已不存在，请返回列表查看。");
    setRecovering(false);
  };
  recoveryForm?.querySelectorAll("[data-schedule-recovery-close]").forEach(button => button.addEventListener("click", () => {
    if (!recovering) recoveryDialog.close();
  }));
  recoveryDialog?.addEventListener("cancel", event => { if (recovering) event.preventDefault(); });
  recoveryForm?.querySelector("[data-schedule-recovery-refresh]")?.addEventListener("click", async () => {
    if (recovering || !recovery) return;
    const jobId = recovery.jobId;
    setRecovering(true); recoveryMessage("");
    try { await refreshStage(jobId, "job", true); readRecovery(jobId); }
    catch (error) { recoveryMessage(error.message || L("无法更新定时任务列表")); }
    finally { setRecovering(false); }
  });
  recoveryForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (recovering || !recovery?.input) return;
    const { jobId, input } = recovery;
    setRecovering(true); recoveryMessage("");
    try {
      const response = await fetch(route("/api/schedule/jobs/" + encodeURIComponent(jobId) + "/recover-reminder"), {
        method: "POST", headers: headers(), body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || L("无法恢复提醒"));
      // If refreshing fails, keep the review visible but never submit the old confirmation again.
      recovery.input = null;
      await refreshStage(jobId, "job", true);
      recoveryDialog.close();
    } catch (error) { recoveryMessage(error.message || L("无法恢复提醒")); }
    finally { setRecovering(false); }
  });
  const operationDialog = workbench.querySelector("[data-schedule-operation-dialog]");
  const operationForm = workbench.querySelector("[data-schedule-operation-form]");
  let operationReview = null, operationBusy = false;
  const operationMessage = message => {
    const error = operationForm.querySelector("[data-operation-review-error]");
    error.textContent = message || ""; error.hidden = !message;
  };
  const operationLock = busy => {
    operationBusy = busy; operationForm.setAttribute("aria-busy", String(busy));
    operationForm.querySelectorAll("button").forEach(button => { button.disabled = busy; });
    operationForm.querySelector("[type=submit]").disabled = busy || !operationReview?.input;
  };
  const readOperation = (id, decision) => {
    const detail = [...workbench.querySelectorAll("[data-schedule-detail]")].find(item => item.dataset.scheduleDetail === "operation:" + id);
    const button = [...(detail?.querySelectorAll("[data-schedule-operation-decision]") || [])].find(item => item.dataset.scheduleOperationDecision === decision);
    operationReview = { id, decision, input: button ? { ...JSON.parse(button.dataset.confirmation), decision } : null };
    operationForm.querySelector("[data-operation-review-title]").textContent = detail?.querySelector("h1")?.textContent || "";
    operationForm.querySelector("[data-operation-review-target]").textContent = detail?.querySelector("[data-schedule-operation-target]")?.textContent || "";
    operationForm.querySelector("[data-operation-review-input]").textContent = detail?.querySelector("[data-schedule-operation-input]")?.textContent || "";
    operationForm.querySelector("[data-operation-review-warning]").textContent = !button ? L("任务状态已改变，请返回列表重新选择。") : L(decision === "retry"
      ? "上次可能已经产生费用或外部修改。确认重试会再次运行同一输入，可能重复这些结果；请先核对外部记录。"
      : decision === "skip" ? "跳过最早的一次未知结果，不再运行这次调用。其他未知结果仍需核对；处理完后按原间隔继续，一次性任务到此结束。"
      : "将原功能和输入交给当前安装。未派出的记录会等待新的唤醒，之后保留原固定间隔。此确认会允许插件代码运行。");
    operationLock(false);
  };
  operationForm?.querySelectorAll("[data-schedule-operation-close]").forEach(button => button.addEventListener("click", () => { if (!operationBusy) operationDialog.close(); }));
  operationDialog?.addEventListener("cancel", event => { if (operationBusy) event.preventDefault(); });
  operationForm?.querySelector("[data-operation-review-refresh]")?.addEventListener("click", async () => {
    if (operationBusy || !operationReview) return;
    const { id, decision } = operationReview; operationLock(true); operationMessage("");
    try { await refreshStage("operation:" + id, "job", true); readOperation(id, decision); }
    catch (error) { operationMessage(error.message); }
    finally { operationLock(false); }
  });
  operationForm?.addEventListener("submit", async event => {
    event.preventDefault(); if (operationBusy || !operationReview?.input) return;
    const { id, input } = operationReview; operationLock(true); operationMessage("");
    try {
      const response = await fetch(route("/api/schedule/operations/" + encodeURIComponent(id) + "/recover"), { method: "POST", headers: headers(), body: JSON.stringify(input) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || L("无法恢复定时操作"));
      operationReview.input = null;
      await refreshStage("operation:" + id, "job", true); operationDialog.close();
    } catch (error) { operationMessage(error.message || L("无法恢复定时操作")); }
    finally { operationLock(false); }
  });
  let creating = false;
  const setCreating = (busy) => {
    creating = busy;
    form?.setAttribute("aria-busy", String(busy));
    const fields = form?.querySelector(".mw-form__body");
    if (fields) fields.inert = busy;
    workbench.querySelectorAll("[data-schedule-new], [data-schedule-create-close]").forEach(button => { button.disabled = busy; });
    const submit = form?.querySelector("[type=submit]");
    if (submit) { submit.disabled = busy; submit.textContent = L(busy ? "正在保存…" : editingTaskId ? "保存" : "创建"); }
  };
  workbench.querySelector("[data-schedule-new]")?.addEventListener("click", () => {
    if (creating) return;
    editingTaskId = "";
    form?.reset();
    const heading = workbench.querySelector("[data-schedule-form-title]");
    if (heading) heading.textContent = L("新建定时任务");
    setCreating(false);
    showError("");
    dialog?.showModal();
    form?.querySelector("[name=title]")?.focus();
  });
  workbench.querySelectorAll("[data-schedule-create-close]").forEach((button) => {
    button.addEventListener("click", () => { if (!creating) dialog?.close(); });
  });
  dialog?.addEventListener("cancel", event => { if (creating) event.preventDefault(); });
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (creating || !form.reportValidity()) return;
    const data = new FormData(form);
    setCreating(true);
    showError("");
    try {
      const response = await fetch(route(editingTaskId ? "/api/schedule/tasks/" + encodeURIComponent(editingTaskId) + "/update" : "/api/schedule/tasks"), {
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
      if (!response.ok) throw new Error(result.error || L("无法保存定时任务"));
      dialog?.close();
      form?.reset();
      await refreshStage(result.task.task_id, "task");
    } catch (error) {
      showError(error.message || L("无法创建定时任务"));
    } finally {
      setCreating(false);
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
    const operationDecision = event.target.closest("[data-schedule-operation-decision]");
    if (operationDecision) {
      if (operationBusy) return;
      readOperation(operationDecision.dataset.operationId, operationDecision.dataset.scheduleOperationDecision);
      operationMessage(""); operationDialog.showModal(); return;
    }
    const operationRefresh = event.target.closest("[data-schedule-operation-refresh]");
    if (operationRefresh) {
      operationRefresh.disabled = true;
      try { await refreshStage("operation:" + operationRefresh.dataset.scheduleOperationRefresh, "job", true); }
      catch (error) { const status = operationRefresh.closest("[data-schedule-detail]")?.querySelector("[data-schedule-action-status]"); if (status) { status.hidden = false; status.textContent = error.message; } }
      finally { operationRefresh.disabled = false; }
      return;
    }
    const recover = event.target.closest("[data-schedule-reminder-recover]");
    if (recover) {
      if (recovering) return;
      readRecovery(recover.dataset.scheduleJobId); recoveryMessage(""); recoveryDialog.showModal();
      return;
    }
    const refreshReminder = event.target.closest("[data-schedule-reminder-refresh]");
    if (refreshReminder) {
      const status = refreshReminder.closest("[data-schedule-detail]")?.querySelector("[data-schedule-action-status]");
      refreshReminder.disabled = true;
      try { await refreshStage(refreshReminder.dataset.scheduleReminderRefresh, "job", true); }
      catch (error) { if (status) { status.hidden = false; status.textContent = error.message; } }
      finally { refreshReminder.disabled = false; }
      return;
    }
    if (event.target.closest("[data-schedule-collapse]")) {
      collapse();
      return;
    }
    const edit = event.target.closest("[data-schedule-task-edit]");
    if (edit) {
      const detail = edit.closest("[data-schedule-detail]");
      editingTaskId = edit.dataset.scheduleTaskEdit;
      form.querySelector("[name=title]").value = detail.querySelector("h1").textContent;
      form.querySelector("[name=instructions]").value = detail.querySelector("[data-schedule-task-instructions]").value;
      form.querySelector("[name=time]").value = detail.querySelector("[data-schedule-task-time]").value;
      form.querySelector("[name=notify_important]").checked = detail.querySelector("[data-schedule-task-notify]").value === "true";
      const heading = workbench.querySelector("[data-schedule-form-title]");
      if (heading) heading.textContent = L("编辑定时任务");
      setCreating(false);
      showError("");
      dialog.showModal();
      return;
    }
    const archive = event.target.closest("[data-schedule-task-archive]");
    if (archive) {
      if (!confirm(L("归档这条定时任务？归档后不会再自动运行。"))) return;
      archive.disabled = true;
      try {
        const response = await fetch(route("/api/schedule/tasks/" + encodeURIComponent(archive.dataset.scheduleTaskArchive) + "/archive"), {
          method: "POST", headers: headers(), body: JSON.stringify({}),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("无法归档定时任务"));
        await refreshStage();
      } catch (error) {
        const status = archive.closest("[data-schedule-detail]")?.querySelector("[data-schedule-action-status]");
        if (status) { status.hidden = false; status.textContent = error.message || L("无法归档定时任务"); }
        archive.disabled = false;
      }
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
        await refreshStage(taskId, "task");
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
      await refreshStage(action.dataset.scheduleDetailId || jobId, "job");
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
