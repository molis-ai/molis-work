/** Project operations initialize independently of the Runtime settings dialog. */
export const PROJECT_SETTINGS_CLIENT_SCRIPT = `
  (() => {
    const L = globalThis.L || ((text) => text);
    document.querySelectorAll("[data-project-rename]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector("button[type=submit]");
        if (submit.disabled) return;
        const error = form.querySelector(".settings-form-error");
        submit.disabled = true;
        error.hidden = true;
        try {
          const response = await fetch("/api/settings/projects/" + encodeURIComponent(form.dataset.projectRename) + "/rename", {
            method: "POST", headers: molisWorkControlHeaders(),
            body: JSON.stringify({ display_name: String(new FormData(form).get("display_name") || "").trim() }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || L("项目改名失败"));
          location.reload();
        } catch (caught) {
          error.textContent = caught.message || L("项目改名失败");
          error.hidden = false;
          submit.disabled = false;
        }
      });
    });
    const dialog = document.querySelector("[data-project-delete-dialog]");
    if (!dialog) return;
    const form = dialog.querySelector("form");
    const confirmation = form.elements.delete_confirmed;
    const submit = form.querySelector("button[type=submit]");
    const error = dialog.querySelector("[data-project-delete-error]");
    const cancel = dialog.querySelector("[data-project-delete-cancel]");
    let busy = false;
    let cleanupPending = false;
    let deletionKey = null;
    document.querySelector("[data-project-delete-open]")?.addEventListener("click", () => {
      if (!deletionKey) {
        confirmation.checked = false;
        submit.disabled = true;
        error.hidden = true;
      }
      dialog.showModal();
    });
    cancel.addEventListener("click", () => { if (!busy) dialog.close(); });
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    confirmation.addEventListener("change", () => { submit.disabled = busy || !confirmation.checked; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || !confirmation.checked) return;
      const headers = molisWorkControlHeaders();
      deletionKey ||= headers["x-molis-work-idempotency-key"];
      busy = true;
      submit.disabled = cancel.disabled = confirmation.disabled = true;
      error.hidden = true;
      submit.textContent = L("正在删除…");
      try {
        const response = await fetch("/api/settings/projects/" + encodeURIComponent(form.dataset.projectDelete) + "/delete", {
          method: "POST", headers,
          body: JSON.stringify({ delete_confirmed: true, idempotency_key: deletionKey }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目删除失败"));
        cleanupPending = result.deletion.cleanup_state !== "complete";
        if (cleanupPending) throw new Error(L("项目已从目录移除，但本机数据清理未完成。请重试清理。"));
        location.assign(globalThis.molisWorkNavigationUrl(form.dataset.projectDirectoryHref));
      } catch (caught) {
        error.textContent = caught.message || L("项目删除失败");
        error.hidden = false;
        busy = false;
        cancel.disabled = confirmation.disabled = false;
        submit.disabled = !confirmation.checked;
        submit.textContent = cleanupPending ? L("重试清理") : L("确认删除项目");
      }
    });
  })();
`;
