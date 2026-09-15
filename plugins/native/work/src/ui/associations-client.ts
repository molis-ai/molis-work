/** Browser initializer: only the named ports cross this behavior boundary. */
export const WORK_ASSOCIATIONS_CLIENT = `
({ route, parseActionResponse, showDialogStatus, L }) => {
  const relationsDialog = document.querySelector("[data-session-relations-dialog]");
  const relationsForm = relationsDialog?.querySelector("[data-session-relations-form]");
  const relationsProject = relationsForm?.querySelector("[data-session-relations-project]");
  const relationsGoal = relationsForm?.querySelector("[data-session-relations-goal]");
  const relationsWorkspace = relationsForm?.querySelector("[data-session-relations-workspace]");
  const relationsConfirm = relationsForm?.querySelector("[data-session-relations-confirm]");
  const relationsSubmit = relationsForm?.querySelector("[data-session-relations-submit]");
  const relationsStatus = relationsForm?.querySelector("[data-session-relations-status]");
  let relationsDetail = null;
  const updateRelationsForm = () => {
    const sameProject = relationsProject?.value === relationsDialog?.dataset.currentProjectId;
    if (relationsGoal) {
      relationsGoal.disabled = !sameProject;
      if (!sameProject) relationsGoal.value = "";
    }
    const note = relationsForm?.querySelector("[data-session-relations-note]");
    if (note) note.textContent = sameProject
      ? L("切换或清空当前 Goal 会把旧 Goal 保留为历史。")
      : relationsProject?.value
        ? L("转移到另一个 Project 时会清空当前 Goal，并保留原 Goal 历史。")
        : L("移出当前 Project 后，这条 Session 会从本目录消失；原 Runtime 内容不会删除。");
    if (relationsSubmit) relationsSubmit.disabled = !relationsConfirm?.checked;
  };
  document.querySelectorAll("[data-open-session-relations]").forEach((button) => button.addEventListener("click", () => {
    relationsDetail = button.closest("[data-operation-detail]");
    relationsForm?.reset();
    if (relationsProject) relationsProject.value = relationsDialog?.dataset.currentProjectId || "";
    if (relationsGoal) relationsGoal.value = relationsDetail?.dataset.sessionCurrentGoalId || "";
    if (relationsWorkspace) relationsWorkspace.value = relationsDetail?.dataset.sessionWorkspacePath || "";
    const name = relationsForm?.querySelector("[data-session-relations-name]");
    if (name) name.textContent = relationsDetail?.querySelector("h1")?.textContent || relationsDetail?.dataset.detailId || "";
    if (relationsStatus) relationsStatus.hidden = true;
    updateRelationsForm();
    relationsDialog?.showModal();
  }));
  relationsProject?.addEventListener("change", updateRelationsForm);
  relationsConfirm?.addEventListener("change", updateRelationsForm);
  relationsForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!relationsDetail?.dataset.detailId || !relationsConfirm?.checked) return;
    relationsSubmit.disabled = true;
    showDialogStatus(relationsStatus, L("正在保存这条 Session 的关系..."), false);
    try {
      await parseActionResponse(await fetch(route("/api/sessions/" + encodeURIComponent(relationsDetail.dataset.detailId) + "/associations"), {
        method: "PATCH",
        headers: window.molisWorkControlHeaders?.() || {},
        body: JSON.stringify({
          project_id: relationsProject.value || null,
          current_goal_id: relationsGoal?.disabled ? null : relationsGoal?.value || null,
          workspace_path: relationsWorkspace?.value.trim() || null,
          user_confirmed: true,
        }),
      }));
      relationsDialog.close();
      location.reload();
    } catch (error) {
      showDialogStatus(relationsStatus, error instanceof Error ? error.message : String(error), true);
      relationsSubmit.disabled = false;
    }
  });

  const archiveDialog = document.querySelector("[data-session-archive-dialog]");
  const archiveForm = archiveDialog?.querySelector("[data-session-archive-form]");
  const archiveConfirm = archiveForm?.querySelector("[data-session-archive-confirm]");
  const archiveSubmit = archiveForm?.querySelector("[data-session-archive-submit]");
  const archiveStatus = archiveForm?.querySelector("[data-session-archive-status]");
  let archiveDetail = null;
  let archiveNext = true;
  document.querySelectorAll("[data-session-archive]").forEach((button) => button.addEventListener("click", () => {
    archiveDetail = button.closest("[data-operation-detail]");
    archiveNext = button.dataset.sessionArchive === "true";
    archiveForm?.reset();
    const title = archiveForm?.querySelector("[data-session-archive-title]");
    const name = archiveForm?.querySelector("[data-session-archive-name]");
    const impact = archiveForm?.querySelector("[data-session-archive-impact]");
    const copy = archiveForm?.querySelector("[data-session-archive-confirm-copy]");
    if (title) title.textContent = archiveNext ? L("归档 Session 记录") : L("恢复 Session 记录");
    if (name) name.textContent = archiveDetail?.querySelector("h1")?.textContent || archiveDetail?.dataset.detailId || "";
    if (impact) impact.textContent = archiveNext ? L("从默认活跃记录中整理为已归档；仍可筛选和恢复。") : L("恢复为可查看记录；所有关系和历史保持不变。");
    if (copy) copy.textContent = archiveNext ? L("确认只归档 Molis Work 记录，不删除 Runtime 内容。") : L("确认恢复这条 Molis Work Session 记录。");
    if (archiveStatus) archiveStatus.hidden = true;
    if (archiveSubmit) archiveSubmit.disabled = true;
    archiveDialog?.showModal();
  }));
  archiveConfirm?.addEventListener("change", () => { if (archiveSubmit) archiveSubmit.disabled = !archiveConfirm.checked; });
  archiveForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!archiveDetail?.dataset.detailId || !archiveConfirm?.checked) return;
    archiveSubmit.disabled = true;
    showDialogStatus(archiveStatus, archiveNext ? L("正在归档记录...") : L("正在恢复记录..."), false);
    try {
      await parseActionResponse(await fetch(route("/api/sessions/" + encodeURIComponent(archiveDetail.dataset.detailId) + "/archive"), {
        method: "POST",
        headers: window.molisWorkControlHeaders?.() || {},
        body: JSON.stringify({ archived: archiveNext, user_confirmed: true }),
      }));
      archiveDialog.close();
      location.reload();
    } catch (error) {
      showDialogStatus(archiveStatus, error instanceof Error ? error.message : String(error), true);
      archiveSubmit.disabled = false;
    }
  });
  
}
`;
