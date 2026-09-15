/** Browser initializer: only the named ports cross this behavior boundary. */
export const WORK_HANDOFF_CLIENT = `
({ route, parseActionResponse, showDialogStatus, showToast, L }) => {
  const handoffDialog = document.querySelector("[data-session-handoff-dialog]");
  const handoffForm = handoffDialog?.querySelector("[data-session-handoff-form]");
  const handoffRuntime = handoffForm?.querySelector("[data-handoff-runtime]");
  const handoffWorkspace = handoffForm?.querySelector("[data-handoff-workspace]");
  const handoffContent = handoffForm?.querySelector("[data-handoff-content]");
  const handoffConfirm = handoffForm?.querySelector("[data-handoff-confirm]");
  const handoffSave = handoffForm?.querySelector("[data-handoff-save]");
  const handoffSend = handoffForm?.querySelector("[data-handoff-send]");
  const handoffCancel = handoffForm?.querySelector("[data-handoff-cancel]");
  const handoffStatus = handoffForm?.querySelector("[data-handoff-status]");
  const handoffState = handoffForm?.querySelector("[data-handoff-state]");
  let handoffDetail = null;
  let handoffPackageId = null;
  let handoffTargetLocked = false;
  let handoffRetryable = true;
  let handoffCancellable = true;
  const handoffStateLabel = (state) => ({ draft: L("草稿"), sending: L("发送中"), failed: L("等待重试"), sent: L("已发送"), cancelled: L("已取消") })[state] || L("草稿");
  const updateHandoffForm = () => {
    const busy = handoffDialog?.dataset.handoffBusy === "true";
    const option = handoffRuntime?.selectedOptions?.[0];
    const native = option?.dataset.handoffMode === "native";
    const capability = handoffForm?.querySelector("[data-handoff-capability]");
    if (capability) capability.textContent = handoffTargetLocked
      ? L("目标 Session 已经创建。可以修改交接正文并重试，但目标 Runtime 和工作目录不会再改变。")
      : native
        ? L("会创建一条新的原生 Session，并把右侧内容作为第一条消息发送；不会加载来源 Runtime 的原生身份。")
        : L("这个 Runtime 没有原生 Handoff Adapter。Molis Work 会创建托管 Session 并保存交接内容，不伪装成原生送达。");
    if (handoffRuntime) handoffRuntime.disabled = busy || handoffTargetLocked || !handoffRetryable;
    if (handoffWorkspace) handoffWorkspace.disabled = busy || handoffTargetLocked || !handoffRetryable;
    if (handoffContent) handoffContent.disabled = busy || !handoffRetryable;
    const editable = Boolean(handoffPackageId && handoffContent?.value.trim() && !busy && handoffRetryable);
    if (handoffSave) handoffSave.disabled = !editable;
    if (handoffCancel) handoffCancel.disabled = !handoffPackageId || busy || !handoffCancellable;
    if (handoffSend) handoffSend.disabled = !editable || !handoffConfirm?.checked;
  };
  const applyHandoffPayload = (payload) => {
    const handoff = payload?.handoff;
    if (!handoff) return;
    handoffPackageId = handoff.package_id;
    if (handoffRuntime && handoff.target_runtime_id) handoffRuntime.value = handoff.target_runtime_id;
    if (handoffWorkspace) handoffWorkspace.value = handoff.target_workspace_path || "";
    if (handoffContent && typeof handoff.content === "string") handoffContent.value = handoff.content;
    handoffTargetLocked = Boolean(handoff.destination_session_id);
    handoffRetryable = handoff.state === "draft" || (handoff.state === "failed" && handoff.retryable !== false);
    handoffCancellable = handoff.state === "draft" || handoff.state === "failed";
    if (handoffState) handoffState.textContent = handoffStateLabel(handoff.state);
    if (handoffSend) handoffSend.textContent = handoff.state === "sending"
      ? L("发送中")
      : handoff.state === "failed"
      ? handoffRetryable ? L("重试发送") : L("不能重试")
      : L("创建并发送");
    updateHandoffForm();
  };
  const handoffBody = (confirmed = false) => ({
    target_runtime_id: handoffRuntime?.value || "",
    target_workspace_path: handoffWorkspace?.value.trim() || null,
    content: handoffContent?.value || "",
    user_confirmed: confirmed,
  });
  document.querySelectorAll("[data-open-session-handoff]").forEach((button) => button.addEventListener("click", async () => {
    handoffDetail = button.closest("[data-operation-detail]");
    if (!handoffDetail?.dataset.detailId || !handoffDetail.dataset.sessionCurrentGoalId) return;
    handoffForm?.reset();
    handoffPackageId = null;
    handoffTargetLocked = false;
    handoffRetryable = true;
    handoffCancellable = true;
    if (handoffWorkspace) handoffWorkspace.value = handoffDetail.dataset.sessionWorkspacePath || "";
    const source = handoffForm?.querySelector("[data-handoff-source-session]");
    const goal = handoffForm?.querySelector("[data-handoff-goal]");
    if (source) source.textContent = handoffDetail.dataset.detailId;
    if (goal) goal.textContent = handoffDetail.querySelector("[data-current-goal-value]")?.textContent || handoffDetail.dataset.sessionCurrentGoalId;
    if (handoffContent) handoffContent.value = "";
    if (handoffStatus) handoffStatus.hidden = true;
    if (handoffState) handoffState.textContent = L("正在生成");
    if (handoffDialog) handoffDialog.dataset.handoffBusy = "true";
    updateHandoffForm();
    handoffDialog?.showModal();
    showDialogStatus(handoffStatus, L("正在读取当前 Goal Contract 和最小 Session 上下文..."), false);
    try {
      const payload = await parseActionResponse(await fetch(route("/api/sessions/" + encodeURIComponent(handoffDetail.dataset.detailId) + "/handoffs"), {
        method: "POST",
        headers: window.molisWorkControlHeaders?.() || {},
        body: JSON.stringify({
          target_runtime_id: handoffRuntime?.value || "codex",
          target_workspace_path: handoffWorkspace?.value.trim() || null,
        }),
      }));
      applyHandoffPayload(payload);
      showDialogStatus(handoffStatus, payload.handoff?.state === "sending"
        ? L("另一条发送请求仍在执行。Molis Work 已锁定这份 package，完成或租约过期后再刷新。")
        : payload.handoff?.state === "failed" && payload.handoff?.retryable === false
          ? L("上次失败不能安全重试。请取消这次 Handoff 后重新创建。")
          : payload.reused
            ? L("已恢复上次未发送的 package。修改后可保存或继续发送。")
            : L("package 已生成但尚未发送。请审阅目标组合和正文。"), false);
      handoffContent?.focus();
    } catch (error) {
      showDialogStatus(handoffStatus, error instanceof Error ? error.message : String(error), true);
      if (handoffState) handoffState.textContent = L("生成失败");
    } finally {
      if (handoffDialog) handoffDialog.dataset.handoffBusy = "false";
      updateHandoffForm();
    }
  }));
  handoffRuntime?.addEventListener("change", updateHandoffForm);
  handoffWorkspace?.addEventListener("input", updateHandoffForm);
  handoffContent?.addEventListener("input", updateHandoffForm);
  handoffConfirm?.addEventListener("change", updateHandoffForm);
  handoffSave?.addEventListener("click", async () => {
    if (!handoffPackageId) return;
    if (handoffDialog) handoffDialog.dataset.handoffBusy = "true";
    updateHandoffForm();
    showDialogStatus(handoffStatus, L("正在保存草稿..."), false);
    try {
      const payload = await parseActionResponse(await fetch(route("/api/session-handoffs/" + encodeURIComponent(handoffPackageId)), {
        method: "PATCH",
        headers: window.molisWorkControlHeaders?.() || {},
        body: JSON.stringify(handoffBody(false)),
      }));
      applyHandoffPayload(payload);
      showDialogStatus(handoffStatus, L("草稿已保存在本机；尚未创建或联系目标 Runtime。"), false);
    } catch (error) {
      showDialogStatus(handoffStatus, error instanceof Error ? error.message : String(error), true);
    } finally {
      if (handoffDialog) handoffDialog.dataset.handoffBusy = "false";
      updateHandoffForm();
    }
  });
  handoffCancel?.addEventListener("click", async () => {
    if (!handoffPackageId) return;
    if (handoffDialog) handoffDialog.dataset.handoffBusy = "true";
    updateHandoffForm();
    try {
      await parseActionResponse(await fetch(route("/api/session-handoffs/" + encodeURIComponent(handoffPackageId) + "/cancel"), {
        method: "POST",
        headers: window.molisWorkControlHeaders?.() || {},
        body: "{}",
      }));
      handoffDialog?.close();
      showToast(L("这次 Handoff 已取消，没有创建目标 Session。"));
    } catch (error) {
      showDialogStatus(handoffStatus, error instanceof Error ? error.message : String(error), true);
    } finally {
      if (handoffDialog) handoffDialog.dataset.handoffBusy = "false";
      updateHandoffForm();
    }
  });
  handoffForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!handoffPackageId || !handoffConfirm?.checked) return;
    if (handoffDialog) handoffDialog.dataset.handoffBusy = "true";
    updateHandoffForm();
    showDialogStatus(handoffStatus, handoffTargetLocked
      ? L("正在把修改后的 package 补发到已经创建的目标 Session...")
      : L("正在创建新的目标 Session 并发送 package..."), false);
    try {
      const response = await fetch(route("/api/session-handoffs/" + encodeURIComponent(handoffPackageId) + "/send"), {
        method: "POST",
        headers: window.molisWorkControlHeaders?.() || {},
        body: JSON.stringify(handoffBody(true)),
      });
      const payload = await response.json().catch(() => ({}));
      applyHandoffPayload(payload);
      if (!response.ok) throw new Error(payload.error || L("目标 Runtime 没有完成 Handoff，package 已保留。"));
      showDialogStatus(handoffStatus, payload.handoff?.delivery_mode === "native"
        ? L("新原生 Session 已创建，Handoff 已作为第一条消息发送。")
        : L("新的 Molis Work 托管 Session 已创建；package 已保存为可读取内容。"), false);
      handoffDialog?.close();
      location.reload();
    } catch (error) {
      showDialogStatus(handoffStatus, error instanceof Error ? error.message : String(error), true);
      if (handoffState) handoffState.textContent = L("等待重试");
      if (handoffSend) handoffSend.textContent = L("重试发送");
    } finally {
      if (handoffDialog) handoffDialog.dataset.handoffBusy = "false";
      updateHandoffForm();
    }
  });

  
}
`;
