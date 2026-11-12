import { SKILL_SETTINGS_CLIENT_SCRIPT } from "../settings-skills.js";
import { KIT_SETTINGS_LOADER_SCRIPT } from "../settings-kit.js";
import { pluginSettingsClients } from "../plugin-workbench.js";
import { PROMPT_SETTINGS_CLIENT_SCRIPT } from "../settings-prompts.js";
import { SYNC_SETTINGS_CLIENT_SCRIPT } from '../settings-sync.js';
import { ASSISTANT_SETTINGS_CLIENT_SCRIPT } from "../settings-assistant.js";
import { LOCAL_DIRECTORY_SETTINGS_CLIENT_SCRIPT } from "../settings-local-directories.js";
import { MEMORY_SETTINGS_CLIENT_SCRIPT } from "../settings-memory.js";
import { AGENT_DIAGNOSTICS_CLIENT_SCRIPT } from "../settings-agent-diagnostics.js";
import { SETTINGS_RUNNING_CLIENT_SCRIPT } from "./settings-running.js";
import { MCP_ACCESS_CLIENT_SCRIPT } from "./mcp-access.js";
import { MODEL_SETTINGS_CLIENT_SCRIPT } from "./settings-models.js";
import { PROJECT_SETTINGS_CLIENT_SCRIPT } from "./project-settings.js";
import { WEB_SERVICE_SETTINGS_SCRIPT } from "./settings-web-service.js";
import { FUNCTIONS_SETTINGS_CLIENT_SCRIPT } from "../judgment-rules/settings-client.js";
import { CONNECTORS_SETTINGS_CLIENT_SCRIPT } from "./connectors-settings.js";
import { SETTINGS_VIEW_HEIGHT_CLIENT_SCRIPT } from "./settings-view-height.js";

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
      toast.textContent = text; toast.dataset.mwState = "done"; toast.classList.remove("is-error");
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
      title.textContent = globalThis.t.text("workbench.settings.preparing-connection-preview");
      message.textContent = globalThis.t.text("workbench.settings.molis-work-checking-current-runtime-config-read-only");
      changes.innerHTML = "";
      backup.textContent = globalThis.t.text("workbench.settings.checking");
      restart.textContent = globalThis.t.text("workbench.settings.checking");
      confirmRow.hidden = true;
      confirmInput.checked = false;
      applyButton.disabled = true;
      applyButton.hidden = false;
      applyButton.textContent = globalThis.t.text("workbench.settings.apply");
      errorBox.hidden = true;
      dialog.showModal();
      try {
        const plan = await molisWorkRequest("/api/settings/runtimes/" + encodeURIComponent(runtimeId) + "/plan", { body: { action }, fallback: globalThis.t.text("workbench.settings.could-not-build-runtime-connection-preview") });
        activePlan = plan;
        title.textContent = plan.display_name + (plan.action === "remove" ? globalThis.t.text("workbench.settings.removal-preview") : globalThis.t.text("workbench.settings.connection-preview"));
        message.textContent = plan.message;
        changes.innerHTML = (plan.changes || []).map((change) => "<li><strong>" + escapeText(change.operation === "remove" ? globalThis.t.text("workbench.settings.remove") : change.operation === "replace" ? globalThis.t.text("workbench.settings.replace") : globalThis.t.text("workbench.settings.add")) + "</strong><div><p>" + escapeText(change.target_path) + "</p><small>" + escapeText(change.before) + " → " + escapeText(change.after) + "</small></div></li>").join("") || globalThis.t.text("workbench.settings.li-strong-no-change-strong-div-p-nothing");
        backup.textContent = plan.backup_path || globalThis.t.text("workbench.settings.change-needs-no-backup");
        restart.textContent = (plan.restart_instructions || []).join(" ") || globalThis.t.text("workbench.settings.no-restart-needed");
        confirmRow.hidden = plan.status !== "ready";
        confirmLabel.textContent = plan.confirmation;
        applyButton.hidden = plan.status !== "ready";
      } catch (error) {
        molisWorkRequest.show(errorBox, error);
        errorBox.hidden = false;
        message.textContent = globalThis.t.text("workbench.settings.no-configuration-was-changed");
      }
    });
    applyButton?.addEventListener("click", async () => {
      if (!activePlan || !confirmInput.checked) return;
      applyButton.disabled = true;
      applyButton.textContent = globalThis.t.text("workbench.settings.verifying");
      errorBox.hidden = true;
      try {
        const result = await molisWorkRequest("/api/settings/runtimes/" + encodeURIComponent(activePlan.runtime_id) + "/confirm", { body: { plan_id: activePlan.plan_id, decision: "confirmed" }, fallback: globalThis.t.text("workbench.settings.runtime-connection-did-not-finish") });
        message.textContent = result.message;
        changes.innerHTML = globalThis.t.text("workbench.settings.li-strong-done-strong-div-p") + escapeText(result.message) + "</p></div></li>";
        confirmRow.hidden = true;
        applyButton.hidden = true;
        reloadOnClose = true;
        showToast(result.message);
      } catch (error) {
        if (error.body?.message) errorBox.textContent = error.body.message; else molisWorkRequest.show(errorBox, error);
        errorBox.hidden = false;
        applyButton.disabled = false;
        applyButton.textContent = globalThis.t.text("workbench.settings.confirm-again");
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

export const SETTINGS_CLIENT_SCRIPT = SKILL_SETTINGS_CLIENT_SCRIPT + KIT_SETTINGS_LOADER_SCRIPT + MODEL_SETTINGS_CLIENT_SCRIPT + WEB_SERVICE_SETTINGS_SCRIPT + PROJECT_SETTINGS_CLIENT_SCRIPT + RUNTIME_PLAN_CLIENT_SCRIPT + CONNECTORS_SETTINGS_CLIENT_SCRIPT + PROMPT_SETTINGS_CLIENT_SCRIPT + ASSISTANT_SETTINGS_CLIENT_SCRIPT + LOCAL_DIRECTORY_SETTINGS_CLIENT_SCRIPT + MEMORY_SETTINGS_CLIENT_SCRIPT + AGENT_DIAGNOSTICS_CLIENT_SCRIPT + SETTINGS_RUNNING_CLIENT_SCRIPT + `
` + pluginSettingsClients() + FUNCTIONS_SETTINGS_CLIENT_SCRIPT + MCP_ACCESS_CLIENT_SCRIPT + SYNC_SETTINGS_CLIENT_SCRIPT + SETTINGS_VIEW_HEIGHT_CLIENT_SCRIPT;


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
    const goalsPluginApi = "/api/plugins/io.molis.work.goals";
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
      add: { title: globalThis.t.text("workbench.settings.add-project-guidance"), description: globalThis.t.text("workbench.settings.after-saving-immediately-becomes-long-term-context-shared"), submit: globalThis.t.text("workbench.settings.save-guidance") },
      edit: { title: globalThis.t.text("workbench.settings.edit-project-guidance"), description: globalThis.t.text("workbench.settings.previous-revision-remains-history-below"), submit: globalThis.t.text("workbench.settings.save-new-revision") },
      deactivate: { title: globalThis.t.text("workbench.settings.deactivate-project-guidance"), description: globalThis.t.text("workbench.settings.runtime-will-stop-receiving-entry-while-its-revision"), submit: globalThis.t.text("workbench.settings.confirm-deactivation") },
      restore: { title: globalThis.t.text("workbench.settings.restore-project-guidance"), description: globalThis.t.text("workbench.settings.entry-will-return-runtime-prompt-after-restoration"), submit: globalThis.t.text("workbench.settings.confirm-restoration") },
    };
    const openEditor = (mode, guidanceId = "", trigger = null) => {
      if (saving) return;
      clearTimeout(focusTimer);
      const entry = entries.find((item) => item.guidance_id === guidanceId);
      const copy = labels[mode] || labels.add;
      returnFocus = trigger?.nodeType === 1
        ? trigger
        : document.activeElement?.nodeType === 1
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
      editor.hidden = false; editor.closest(".guidance-document")?.setAttribute("data-editing", "");
      const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      editor.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      focusTimer = setTimeout(() => { if (!editor.hidden) (editsContent ? contentInput : reasonInput).focus(); }, reduceMotion ? 0 : 220);
    };
    const closeEditor = () => {
      if (saving) return;
      clearTimeout(focusTimer);
      const focusTarget = returnFocus;
      editor.hidden = true; editor.closest(".guidance-document")?.removeAttribute("data-editing");
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
        errorBox.textContent = globalThis.t.text("workbench.settings.enter-project-guidance-text");
        errorBox.hidden = false;
        contentInput.focus();
        return;
      }
      if (!reason) {
        errorBox.textContent = globalThis.t.text("workbench.settings.explain-why-change-needed");
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
      submit.textContent = globalThis.t.text("workbench.settings.saving");
      try {
        const isAdd = mode === "add";
        await molisWorkRequest(routePrefix + goalsPluginApi + "/project-guidance" + (isAdd ? "" : "/" + encodeURIComponent(guidanceId)), {
          method: isAdd ? "POST" : "PATCH",
          body: {
            action: isAdd ? undefined : mode,
            kind: isAdd || mode === "edit" ? kindInput.value : undefined,
            content: isAdd || mode === "edit" ? content : undefined,
            reason,
            user_confirmed: true,
          },
          fallback: globalThis.t.text("workbench.settings.could-not-save-project-guidance-check-input-try"),
        });
        sessionStorage.setItem("molis-work-guidance-receipt:" + routePrefix, copyReceipt(mode));
        location.reload();
      } catch (error) {
        molisWorkRequest.show(errorBox, error);
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
    // D0225: only an opaque, actor/project/purpose-bound one-time reference crosses the URL.
    const reference = new URLSearchParams(location.search).get("draft_ref");
    if (reference) {
      history.replaceState(null, "", location.pathname);
      void molisWorkRequest(routePrefix + "/api/contextual/draft-reference/take", { body: { purpose: "project-guidance", reference } }).then(async draft => {
        const [id, version] = JSON.parse(draft.text);
        const data = await molisWorkRequest(routePrefix + "/api/memory/overview?scope=project");
        if (!editor.isConnected) return;
        const memory = data.items.find(item => item.memory_id === id && item.scope === "project" && item.version === version);
        if (!memory) throw new Error(globalThis.t.text("workbench.settings.this-memory-has-changed-or-is-unavailable-return"));
        openEditor("add"); kindInput.value = "convention";
        contentInput.value = memory.text.trim().slice(0, 4000);
        reasonInput.value = globalThis.t.text("workbench.settings.promoted-project-memory");
      }).catch(failure => { if (receipt?.isConnected) { receipt.hidden = false; receipt.setAttribute("role", "alert"); molisWorkRequest.show(receipt, failure); } });
    }
    function copyReceipt(mode) {
      if (mode === "edit") return globalThis.t.text("workbench.settings.new-project-guidance-revision-active");
      if (mode === "deactivate") return globalThis.t.text("workbench.settings.project-guidance-was-deactivated-will-no-longer-be");
      if (mode === "restore") return globalThis.t.text("workbench.settings.project-guidance-was-restored-back-runtime-prompt");
      return globalThis.t.text("workbench.settings.project-guidance-was-added-will-be-used-all");
    }
    };
    globalThis.molisWorkBindProjectGuidance = bind;
    bind(document);
  })();
`;
