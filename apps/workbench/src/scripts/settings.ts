import { MODEL_SETTINGS_CLIENT_SCRIPT } from "./settings-models.js";
import { PROJECT_SETTINGS_CLIENT_SCRIPT } from "./project-settings.js";
import { WEB_SERVICE_SETTINGS_SCRIPT } from "./settings-web-service.js";
import { SHELF_SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-shelf";

export const RUNTIME_PLAN_CLIENT_SCRIPT = `
  (() => {
    const dialog = document.querySelector("[data-runtime-plan-dialog]");
    if (!dialog) return;
    const title = dialog.querySelector("[data-runtime-plan-title]");
    const message = dialog.querySelector("[data-runtime-plan-message]");
    const changes = dialog.querySelector("[data-runtime-change-list]");
    const backup = dialog.querySelector("[data-runtime-plan-backup]");
    const restart = dialog.querySelector("[data-runtime-plan-restart]");
    const confirmRow = dialog.querySelector("[data-runtime-confirm-row]");
    const confirmInput = dialog.querySelector("[data-runtime-confirm]");
    const confirmLabel = dialog.querySelector("[data-runtime-confirm-label]");
    const applyButton = dialog.querySelector("[data-runtime-plan-apply]");
    const errorBox = dialog.querySelector("[data-runtime-plan-error]");
    const toast = document.querySelector("[data-settings-toast], [data-toast]");
    let activePlan = null;
    let reloadOnClose = false;
    const showToast = (text) => {
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add("is-visible");
      setTimeout(() => toast.classList.remove("is-visible"), 2600);
    };
    const closeDialog = () => {
      dialog.close();
      if (reloadOnClose) location.reload();
    };
    dialog.querySelectorAll("[data-runtime-plan-close]").forEach((button) => button.addEventListener("click", closeDialog));
    confirmInput?.addEventListener("change", () => {
      applyButton.disabled = !confirmInput.checked || !activePlan || activePlan.status !== "ready";
    });
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-runtime-plan]");
      if (!button) return;
      const runtimeId = button.dataset.runtimePlan;
      const action = button.dataset.runtimeAction;
      activePlan = null;
      reloadOnClose = false;
      title.textContent = L("正在准备接入预览");
      message.textContent = L("Molis Work 正在只读检查当前 Runtime 配置。");
      changes.innerHTML = "";
      backup.textContent = L("检查中");
      restart.textContent = L("检查中");
      confirmRow.hidden = true;
      confirmInput.checked = false;
      applyButton.disabled = true;
      applyButton.hidden = false;
      applyButton.textContent = L("确认应用");
      errorBox.hidden = true;
      dialog.showModal();
      try {
        const response = await fetch("/api/settings/runtimes/" + encodeURIComponent(runtimeId) + "/plan", {
          method: "POST",
          headers: molisWorkControlHeaders(),
          body: JSON.stringify({ action }),
        });
        const plan = await response.json();
        if (!response.ok) throw new Error(plan.error || L("无法生成 Runtime 接入预览"));
        activePlan = plan;
        title.textContent = plan.display_name + (plan.action === "remove" ? L(" · 移除预览") : L(" · 接入预览"));
        message.textContent = plan.message;
        changes.innerHTML = (plan.changes || []).map((change) => "<li><strong>" + escapeText(change.operation === "remove" ? L("移除") : change.operation === "replace" ? L("替换") : L("新增")) + "</strong><div><p>" + escapeText(change.target_path) + "</p><small>" + escapeText(change.before) + " → " + escapeText(change.after) + "</small></div></li>").join("") || L("<li><strong>无变更</strong><div><p>当前状态无需写入。</p></div></li>");
        backup.textContent = plan.backup_path || L("当前变更无须备份");
        restart.textContent = (plan.restart_instructions || []).join(" ") || L("无须重启");
        confirmRow.hidden = plan.status !== "ready";
        confirmLabel.textContent = plan.confirmation;
        applyButton.hidden = plan.status !== "ready";
      } catch (error) {
        errorBox.textContent = error.message || L("无法生成 Runtime 接入预览");
        errorBox.hidden = false;
        message.textContent = L("没有修改任何配置。");
      }
    });
    applyButton?.addEventListener("click", async () => {
      if (!activePlan || !confirmInput.checked) return;
      applyButton.disabled = true;
      applyButton.textContent = L("正在验证…");
      errorBox.hidden = true;
      try {
        const response = await fetch("/api/settings/runtimes/" + encodeURIComponent(activePlan.runtime_id) + "/confirm", {
          method: "POST",
          headers: molisWorkControlHeaders(),
          body: JSON.stringify({ plan_id: activePlan.plan_id, decision: "confirmed" }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || result.error || L("Runtime 接入未完成"));
        message.textContent = result.message;
        changes.innerHTML = L("<li><strong>完成</strong><div><p>") + escapeText(result.message) + "</p></div></li>";
        confirmRow.hidden = true;
        applyButton.hidden = true;
        reloadOnClose = true;
        showToast(result.message);
      } catch (error) {
        errorBox.textContent = error.message || L("Runtime 接入未完成");
        errorBox.hidden = false;
        applyButton.disabled = false;
        applyButton.textContent = L("重新确认");
      }
    });
    function escapeText(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => {
        if (character === "&") return "&amp;";
        if (character === "<") return "&lt;";
        if (character === ">") return "&gt;";
        if (character === '"') return "&quot;";
        return "&#039;";
      });
    }
  })();
`;

export const SETTINGS_CLIENT_SCRIPT = MODEL_SETTINGS_CLIENT_SCRIPT + WEB_SERVICE_SETTINGS_SCRIPT + PROJECT_SETTINGS_CLIENT_SCRIPT + RUNTIME_PLAN_CLIENT_SCRIPT + `
  (() => {
    const projectManager = document.querySelector("[data-project-manager]");
    if (projectManager) {
      const radios = [...projectManager.querySelectorAll('input[name="project-focus"]')];
      const panes = projectManager.querySelectorAll("[data-project-pane]");
      const showPane = (value) => {
        panes.forEach((pane) => {
          const hide = pane.dataset.projectPane !== value;
          if (hide && !pane.hidden) globalThis.molisWorkResetProjectSettingsEmbeds?.(pane);
          pane.hidden = hide;
        });
      };
      const applyHash = () => {
        const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
        const match = raw && radios.find((radio) => radio.value === raw);
        if (!match) return;
        match.checked = true;
        showPane(match.value);
      };
      radios.forEach((radio) => {
        radio.addEventListener("change", () => {
          if (!radio.checked) return;
          showPane(radio.value);
          const next = "#" + encodeURIComponent(radio.value);
          if (location.hash !== next) history.replaceState(null, "", next);
        });
      });
      window.addEventListener("hashchange", applyHash);
      applyHash();
    }
    const createForm = document.querySelector("[data-project-create]");
    createForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(createForm);
      const error = createForm.querySelector(".settings-form-error");
      if (values.get("user_confirmed") !== "on") {
        error.textContent = L("请先确认创建这个项目。");
        error.hidden = false;
        return;
      }
      const submit = createForm.querySelector("button[type=submit]");
      submit.disabled = true;
      error.hidden = true;
      try {
        const response = await fetch("/api/settings/projects", { method: "POST", headers: molisWorkControlHeaders(), body: JSON.stringify({ display_name: String(values.get("display_name") || "").trim(), user_confirmed: true }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目创建失败"));
        location.assign(globalThis.molisWorkNavigationUrl(result.project_path));
      } catch (caught) {
        error.textContent = caught.message || L("项目创建失败");
        error.hidden = false;
        submit.disabled = false;
      }
    });
    globalThis.molisWorkBindProjectIdentity?.(document);
  })();
` + SHELF_SETTINGS_CLIENT_SCRIPT;


export const PROJECT_GUIDANCE_CLIENT_SCRIPT = `
  (() => {
    const bind = (root = document) => {
    const scope = root && root.querySelector ? root : document;
    const editor = scope.querySelector("[data-guidance-editor]");
    const form = scope.querySelector("[data-guidance-form]");
    const dataNode = scope.querySelector("[data-project-guidance-json], #project-guidance-data");
    if (!editor || !form || !dataNode || editor.dataset.bound === "1") return;
    editor.dataset.bound = "1";
    const routePrefix = (scope.closest && scope.closest("[data-route-prefix]"))?.dataset.routePrefix
      || scope.dataset?.routePrefix
      || document.body.dataset.routePrefix || "";
    const state = JSON.parse(dataNode.textContent || "{}");
    const entries = [...(state.entries || []), ...(state.inactive_entries || [])];
    const fields = form.querySelector("[data-guidance-editor-fields]");
    const preview = form.querySelector("[data-guidance-editor-preview]");
    const title = editor.querySelector("[data-guidance-editor-title]");
    const description = editor.querySelector("[data-guidance-editor-description]");
    const errorBox = form.querySelector("[data-guidance-editor-error]");
    const submit = form.querySelector('button[type="submit"]');
    const modeInput = form.elements.action;
    const idInput = form.elements.guidance_id;
    const kindInput = form.elements.kind;
    const contentInput = form.elements.content;
    const reasonInput = form.elements.reason;
    let returnFocus = null;
    let saving = false;
    let focusTimer;
    const labels = {
      add: { title: L("新增项目说明"), description: L("保存后会立即成为所有 Goal 共享的长期上下文。"), submit: L("保存说明") },
      edit: { title: L("修改项目说明"), description: L("原版本会保留在下方的版本记录中。"), submit: L("保存新版本") },
      deactivate: { title: L("停用项目说明"), description: L("停用后 Runtime 不再收到这条说明，历史版本仍会保留。"), submit: L("确认停用") },
      restore: { title: L("恢复项目说明"), description: L("恢复后这条说明会重新进入 Runtime Prompt。"), submit: L("确认恢复") },
    };
    const openEditor = (mode, guidanceId = "", trigger = null) => {
      if (saving) return;
      clearTimeout(focusTimer);
      const entry = entries.find((item) => item.guidance_id === guidanceId);
      const copy = labels[mode] || labels.add;
      returnFocus = trigger instanceof HTMLElement
        ? trigger
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      form.reset();
      modeInput.value = mode;
      idInput.value = guidanceId;
      title.textContent = copy.title;
      description.textContent = copy.description;
      submit.textContent = copy.submit;
      errorBox.hidden = true;
      const editsContent = mode === "add" || mode === "edit";
      fields.hidden = !editsContent;
      kindInput.disabled = !editsContent;
      contentInput.disabled = !editsContent;
      preview.hidden = editsContent;
      if (entry) {
        kindInput.value = entry.kind;
        contentInput.value = entry.content;
        preview.textContent = entry.content;
      } else {
        kindInput.value = trigger?.dataset.guidanceKind || "context";
        contentInput.value = "";
        preview.textContent = "";
      }
      reasonInput.value = "";
      editor.hidden = false;
      const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      editor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      focusTimer = setTimeout(() => { if (!editor.hidden) (editsContent ? contentInput : reasonInput).focus(); }, reduceMotion ? 0 : 220);
    };
    const closeEditor = () => {
      if (saving) return;
      clearTimeout(focusTimer);
      const focusTarget = returnFocus;
      editor.hidden = true;
      form.reset();
      errorBox.hidden = true;
      returnFocus = null;
      focusTarget?.focus();
    };
    const bindEditorTrigger = (button, mode, guidanceId = "") => {
      const open = () => openEditor(mode, guidanceId, button);
      button.addEventListener("click", open);
      button.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        open();
      });
    };
    scope.querySelectorAll("[data-guidance-new]").forEach((button) => {
      bindEditorTrigger(button, "add");
    });
    scope.querySelectorAll("[data-guidance-edit]").forEach((button) => {
      bindEditorTrigger(button, "edit", button.dataset.guidanceEdit);
    });
    scope.querySelectorAll("[data-guidance-action]").forEach((button) => {
      bindEditorTrigger(button, button.dataset.guidanceAction, button.dataset.guidanceId);
    });
    editor.querySelectorAll("[data-guidance-editor-close]").forEach((button) => {
      button.addEventListener("click", closeEditor);
    });
    editor.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeEditor();
    });
    form.addEventListener("input", () => { errorBox.hidden = true; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (saving) return;
      const mode = modeInput.value;
      const guidanceId = idInput.value;
      const content = String(contentInput.value || "").trim();
      const reason = String(reasonInput.value || "").trim();
      if ((mode === "add" || mode === "edit") && !content) {
        errorBox.textContent = L("请填写项目说明原文。");
        errorBox.hidden = false;
        contentInput.focus();
        return;
      }
      if (!reason) {
        errorBox.textContent = L("请说明为什么要做这次变更。");
        errorBox.hidden = false;
        reasonInput.focus();
        return;
      }
      const submitLabel = submit.textContent;
      saving = true;
      errorBox.hidden = true;
      form.setAttribute("aria-busy", "true");
      const enabledControls = [...editor.querySelectorAll("button, input, select, textarea")].filter(control => !control.disabled);
      enabledControls.forEach(control => { control.disabled = true; });
      submit.disabled = true;
      submit.textContent = L("正在保存…");
      try {
        const isAdd = mode === "add";
        const response = await fetch(
          isAdd ? routePrefix + "/api/project-guidance" : routePrefix + "/api/project-guidance/" + encodeURIComponent(guidanceId),
          {
            method: isAdd ? "POST" : "PATCH",
            headers: molisWorkControlHeaders(),
            body: JSON.stringify({
              action: isAdd ? undefined : mode,
              kind: isAdd || mode === "edit" ? kindInput.value : undefined,
              content: isAdd || mode === "edit" ? content : undefined,
              reason,
              user_confirmed: true,
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || L("项目说明保存失败"));
        sessionStorage.setItem("molis-work-guidance-receipt:" + routePrefix, copyReceipt(mode));
        location.reload();
      } catch (error) {
        errorBox.textContent = error instanceof TypeError ? L("无法连接本地服务，输入已保留，请重试。") : error.message || L("项目说明保存失败，请检查输入后重试");
        errorBox.hidden = false;
        saving = false;
        form.removeAttribute("aria-busy");
        enabledControls.forEach(control => { control.disabled = false; });
        submit.textContent = submitLabel;
        submit.focus();
      }
    });
    const receipt = scope.querySelector("[data-guidance-receipt]");
    try {
      const saved = sessionStorage.getItem("molis-work-guidance-receipt:" + routePrefix);
      sessionStorage.removeItem("molis-work-guidance-receipt:" + routePrefix);
      if (receipt && saved) {
        receipt.textContent = saved;
        receipt.hidden = false;
      }
    } catch {}
    function copyReceipt(mode) {
      if (mode === "edit") return L("项目说明的新版本已生效。");
      if (mode === "deactivate") return L("项目说明已停用，Runtime 将不再收到它。");
      if (mode === "restore") return L("项目说明已恢复，并重新进入 Runtime Prompt。");
      return L("项目说明已新增，并会用于后续 Goal。");
    }
    };
    globalThis.molisWorkBindProjectGuidance = bind;
    bind(document);
  })();
`;
