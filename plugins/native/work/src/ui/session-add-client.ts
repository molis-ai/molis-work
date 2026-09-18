/** Browser initializer: only the named ports cross this behavior boundary. */
export const WORK_SESSION_ADD_CLIENT = `
({ route, parseActionResponse, showDialogStatus, L }) => {
  const sessionAddDialog = document.querySelector("[data-session-add-dialog]");
  const sessionAddForm = sessionAddDialog?.querySelector("[data-session-add-form]");
  const sessionAddAction = sessionAddForm?.querySelector("[data-session-add-action]");
  const sessionAddRuntime = sessionAddForm?.querySelector("[data-session-add-runtime]");
  const sessionAddNative = sessionAddForm?.querySelector("[data-session-add-native]");
  const sessionAddNativeInput = sessionAddForm?.querySelector("[data-session-native-id]");
  const sessionAddConfirm = sessionAddForm?.querySelector("[data-session-add-confirm]");
  const sessionAddSubmit = sessionAddForm?.querySelector("[data-session-add-submit]");
  const sessionAddStatus = sessionAddForm?.querySelector("[data-session-add-status]");
  const sessionAddWorkspaceId = sessionAddForm?.querySelector("[data-session-add-workspace-id]");
  const sessionAddWorkspace = sessionAddForm?.querySelector("[data-session-add-workspace]");
  const sessionAddWorkspaceName = sessionAddForm?.querySelector("[data-session-workspace-name]");
  const sessionAddWorkspacePath = sessionAddForm?.querySelector("[data-session-workspace-path]");
  const sessionAddWorkspaceMenu = sessionAddForm?.querySelector("[data-session-workspace-menu]");
  const sessionAddWorkspaceCustomPanel = sessionAddForm?.querySelector("[data-session-workspace-custom-panel]");
  const sessionAddWorkspaceCustomInput = sessionAddForm?.querySelector("[data-session-workspace-custom-input]");
  const sessionAddGoal = sessionAddForm?.querySelector("[data-session-add-goal]");
  let savingSession = false;
  const syncChoicePicker = (select) => {
    const menu = select?.closest(".mw-field")?.querySelector("[data-session-choice-menu]");
    if (!select || !menu) return;
    const label = menu.querySelector("[data-session-choice-label]");
    const option = select.selectedOptions?.[0];
    if (label) label.textContent = option?.textContent?.trim() || "";
    menu.querySelectorAll("[data-session-choice-option]").forEach((button) => {
      const selected = (button.dataset.value || "") === select.value;
      button.classList.toggle("is-current", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
  };
  const bindChoicePicker = (select) => {
    const menu = select?.closest(".mw-field")?.querySelector("[data-session-choice-menu]");
    if (!select || !menu) return;
    menu.querySelectorAll("[data-session-choice-option]").forEach((button) => button.addEventListener("click", () => {
      select.value = button.dataset.value || "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      menu.open = false;
    }));
    menu.addEventListener("toggle", () => {
      menu.querySelector("summary")?.setAttribute("aria-expanded", menu.open ? "true" : "false");
    });
    menu.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const summary = menu.querySelector("summary");
      const buttons = [...menu.querySelectorAll("[data-session-choice-option]")];
      if (document.activeElement === summary && event.key === "ArrowDown") {
        event.preventDefault();
        menu.open = true;
        buttons[0]?.focus();
        return;
      }
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      const target = buttons[Math.max(0, Math.min(buttons.length - 1, next < 0 ? 0 : next))];
      if (target) { event.preventDefault(); target.focus(); }
    });
    select.addEventListener("change", () => syncChoicePicker(select));
    syncChoicePicker(select);
  };
  sessionAddForm?.querySelectorAll("details").forEach((menu) => menu.addEventListener("toggle", () => {
    if (!menu.open) return;
    sessionAddForm.querySelectorAll("details").forEach((other) => { if (other !== menu) other.open = false; });
  }));
  bindChoicePicker(sessionAddRuntime);
  bindChoicePicker(sessionAddGoal);
  sessionAddDialog?.addEventListener("cancel", (event) => { if (savingSession) event.preventDefault(); });
  const initialSessionWorkspace = {
    id: sessionAddWorkspaceId?.defaultValue || "",
    path: sessionAddWorkspace?.defaultValue || "",
    name: sessionAddWorkspaceName?.textContent || L("不关联工作目录"),
  };
  const setSessionWorkspace = ({ id = "", path = "", name = L("不关联工作目录"), custom = false }) => {
    if (sessionAddWorkspaceId) sessionAddWorkspaceId.value = id;
    if (sessionAddWorkspace) sessionAddWorkspace.value = path;
    if (sessionAddWorkspaceName) sessionAddWorkspaceName.textContent = name;
    if (sessionAddWorkspacePath) sessionAddWorkspacePath.textContent = path || (custom ? L("请输入这台电脑上的绝对路径") : L("运行时不绑定本地路径"));
    if (sessionAddWorkspaceCustomPanel) sessionAddWorkspaceCustomPanel.hidden = !custom;
    if (sessionAddWorkspaceMenu) sessionAddWorkspaceMenu.open = false;
    if (custom) queueMicrotask(() => sessionAddWorkspaceCustomInput?.focus());
  };
  const updateSessionAddForm = () => {
    if (savingSession) return;
    const action = sessionAddAction?.value || "create";
    const option = sessionAddRuntime?.selectedOptions?.[0];
    const createMode = option?.dataset.createMode || "registry";
    const discoverMode = option?.dataset.discoverMode || "unsupported";
    if (sessionAddNative) sessionAddNative.hidden = action !== "link";
    if (sessionAddNativeInput) sessionAddNativeInput.required = action === "link";
    const dialogTitle = sessionAddForm?.querySelector("[data-session-add-dialog-title]");
    const dialogCopy = sessionAddForm?.querySelector("[data-session-add-dialog-copy]");
    const mode = sessionAddForm?.querySelector("[data-session-add-mode]");
    const toggle = sessionAddForm?.querySelector("[data-session-add-toggle]");
    const confirmCopy = sessionAddForm?.querySelector("[data-session-add-confirm-copy]");
    if (dialogTitle) dialogTitle.textContent = action === "create" ? L("新建 Session") : L("关联已有 Session");
    if (dialogCopy) dialogCopy.textContent = action === "create" ? L("从当前项目启动一条新的 Runtime Session。") : L("把一条已存在的 Runtime Session 收入当前项目。");
    if (mode) mode.textContent = action === "create" ? L("创建新的 Runtime Session") : L("关联已有 Runtime Session");
    if (toggle) toggle.textContent = action === "create" ? L("关联已有 Session") : L("改为启动新 Session");
    if (confirmCopy) confirmCopy.textContent = action === "create"
      ? L("确认使用以上 Goal、Runtime 和工作目录启动新 Session。")
      : L("确认只为已有 Session 写入当前 Project、Goal 和工作目录关系。");
    const capability = sessionAddForm?.querySelector("[data-session-add-capability]");
    if (capability) capability.textContent = action === "create"
      ? createMode === "native"
        ? L("会请求所选 Runtime 创建一条新的原生 Session；不会自动发送消息。")
        : L("这个 Runtime 没有原生创建接口，将建立 Molis Work 托管记录，不伪装成已启动 Runtime。")
      : discoverMode === "native"
        ? L("可以先同步 Runtime 元数据；只有提交后才会关联当前 Project。")
        : L("这个 Runtime 不支持发现列表，请粘贴原生 Session ID；Molis Work 不读取正文。");
    if (sessionAddSubmit) {
      sessionAddSubmit.textContent = action === "create" ? L("启动 Session") : L("关联 Session");
      sessionAddSubmit.disabled = !sessionAddConfirm?.checked || (action === "link" && !sessionAddNativeInput?.value.trim());
    }
  };
  document.querySelectorAll("[data-open-session-add]").forEach((button) => button.addEventListener("click", () => {
    sessionAddForm?.reset();
    if (sessionAddAction) sessionAddAction.value = "create";
    setSessionWorkspace(initialSessionWorkspace);
    if (sessionAddStatus) sessionAddStatus.hidden = true;
    syncChoicePicker(sessionAddRuntime);
    syncChoicePicker(sessionAddGoal);
    updateSessionAddForm();
    sessionAddDialog?.showModal();
  }));
  sessionAddForm?.querySelector("[data-session-add-toggle]")?.addEventListener("click", () => {
    if (sessionAddAction) sessionAddAction.value = sessionAddAction.value === "create" ? "link" : "create";
    if (sessionAddConfirm) sessionAddConfirm.checked = false;
    updateSessionAddForm();
  });
  sessionAddForm?.querySelectorAll("[data-session-workspace-option]").forEach((button) => button.addEventListener("click", () => {
    setSessionWorkspace({ id: button.dataset.workspaceId || "", path: button.dataset.workspacePath || "", name: button.dataset.workspaceName || L("工作目录") });
  }));
  sessionAddForm?.querySelector("[data-session-workspace-none]")?.addEventListener("click", () => setSessionWorkspace({}));
  sessionAddForm?.querySelector("[data-session-workspace-custom]")?.addEventListener("click", () => setSessionWorkspace({
    path: sessionAddWorkspaceCustomInput?.value.trim() || "",
    name: L("其他目录"),
    custom: true,
  }));
  sessionAddWorkspaceCustomInput?.addEventListener("input", () => {
    const path = sessionAddWorkspaceCustomInput.value.trim();
    if (sessionAddWorkspace) sessionAddWorkspace.value = path;
    if (sessionAddWorkspacePath) sessionAddWorkspacePath.textContent = path || L("请输入这台电脑上的绝对路径");
  });
  sessionAddRuntime?.addEventListener("change", updateSessionAddForm);
  sessionAddNativeInput?.addEventListener("input", updateSessionAddForm);
  sessionAddConfirm?.addEventListener("change", updateSessionAddForm);
  sessionAddForm?.querySelector("[data-session-discover]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const option = sessionAddRuntime?.selectedOptions?.[0];
    if (option?.dataset.discoverMode !== "native") {
      showDialogStatus(sessionAddStatus, L("这个 Runtime 不支持 Session 列表发现，请直接输入原生 Session ID。"), true);
      return;
    }
    button.disabled = true;
    showDialogStatus(sessionAddStatus, L("正在同步 Session 元数据；不会读取正文。"), false);
    try {
      const payload = await parseActionResponse(await fetch(route("/api/sessions/discover"), {
        method: "POST",
        headers: window.molisWorkControlHeaders?.() || {},
        body: JSON.stringify({ runtime_id: sessionAddRuntime.value }),
      }));
      const options = sessionAddForm.querySelector("[data-session-discovery-options]");
      options.replaceChildren();
      (payload.records || []).forEach((record) => {
        if (!record.native_runtime_session_id) return;
        const item = document.createElement("option");
        item.value = record.native_runtime_session_id;
        item.label = (record.title || L("未命名 Session")) + (record.runtime_workspace_hint ? " · " + record.runtime_workspace_hint : "");
        options.append(item);
      });
      showDialogStatus(sessionAddStatus, payload.records?.length
        ? L("已同步 {count} 条元数据。选择或输入 Session ID 后再确认加入。", { count: payload.records.length })
        : L("Runtime 当前没有返回可发现的 Session。"), false);
    } catch (error) {
      showDialogStatus(sessionAddStatus, error instanceof Error ? error.message : String(error), true);
    } finally {
      button.disabled = false;
    }
  });
  sessionAddForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (savingSession || !sessionAddConfirm?.checked || !sessionAddForm.reportValidity()) return;
    savingSession = true;
    sessionAddForm.setAttribute("aria-busy", "true");
    const enabledControls = [...sessionAddForm.querySelectorAll("input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)")];
    enabledControls.forEach((control) => { control.disabled = true; });
    const submitLabel = sessionAddSubmit.textContent;
    sessionAddSubmit.textContent = L("正在保存…");
    showDialogStatus(sessionAddStatus, sessionAddAction.value === "create" ? L("正在创建并登记 Session...") : L("正在关联这条 Session..."), false);
    try {
      await parseActionResponse(await fetch(route("/api/sessions"), {
        method: "POST",
        headers: window.molisWorkControlHeaders?.() || {},
        body: JSON.stringify({
          action: sessionAddAction.value,
          runtime_id: sessionAddRuntime.value,
          native_runtime_session_id: sessionAddNativeInput?.value.trim() || null,
          title: sessionAddForm.querySelector("[data-session-add-title]")?.value.trim() || null,
          current_goal_id: sessionAddGoal?.value || null,
          workspace_id: sessionAddWorkspaceId?.value || null,
          workspace_path: sessionAddForm.querySelector("[data-session-add-workspace]")?.value.trim() || null,
          user_confirmed: true,
        }),
      }));
      sessionAddDialog.close();
      location.reload();
    } catch (error) {
      showDialogStatus(sessionAddStatus, error instanceof TypeError
        ? L("无法连接本地服务，输入已保留，请重试。")
        : error instanceof Error ? error.message : String(error), true);
    } finally {
      savingSession = false;
      sessionAddForm.removeAttribute("aria-busy");
      enabledControls.forEach((control) => { control.disabled = false; });
      sessionAddSubmit.textContent = submitLabel;
      if (sessionAddDialog.open) sessionAddSubmit.focus();
    }
  });

  
}
`;
