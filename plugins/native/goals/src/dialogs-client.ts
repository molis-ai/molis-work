/** Existing create/trash/restore interactions; host injects controls, navigation and shared refresh. */
import { GOALS_PLUGIN_API } from "./plugin-api.js";
const GOALS_TRASH_DIALOG_SCRIPT = `    const openGoalTrashDialog = (trigger, trashed) => {
      if (!trashDialog || !trashForm || trashPending) return;
      const goalId = String(trigger.dataset.goalId || "").trim();
      const goalTitle = String(trigger.dataset.goalTitle || goalId).trim();
      if (!goalId) return;
      trashIntent = { goalId, goalTitle, trashed };
      trashError.hidden = true;
      trashError.textContent = "";
      trashForm.elements.reason.value = "";
      trashDialog.querySelector("[data-goal-trash-title]").textContent = trashed ? L("移入回收站") : L("恢复 Goal");
      trashDialog.querySelector("[data-goal-trash-description]").textContent = trashed
        ? L("请确认这条 Goal 和本次操作原因。")
        : L("请确认把这条 Goal 恢复到日常 Goal Tree。");
      trashDialog.querySelector("[data-goal-trash-target-title]").textContent = goalTitle;
      trashDialog.querySelector("[data-goal-trash-target-id]").textContent = goalId;
      trashDialog.querySelector("[data-goal-trash-note]").textContent = trashed
        ? L("该操作可恢复：Goal 历史会保留，当前仍生效的关联关系会暂时停止。若这条 Goal 仍有未结束的历史活动记录，系统不会改动它，而会指出还挡着的记录。")
        : L("恢复不会创建新 Goal，也不会自动启动 Runtime。系统只会恢复两端都不在回收站的关联关系；其余关系会保留为待处理事实。");
      trashDialog.querySelector("[data-goal-trash-reason-label]").textContent = trashed ? L("移入原因") : L("恢复原因");
      trashForm.elements.reason.placeholder = trashed
        ? L("说明为什么暂时不再保留这条 Goal")
        : L("说明为什么现在要恢复这条 Goal");
      trashSubmit.classList.toggle("mw-btn--danger", trashed);
      trashSubmit.classList.toggle("mw-btn--primary", !trashed);
      trashSubmit.textContent = trashed ? L("移入回收站") : L("恢复到 Goal Tree");
      trashDialog.showModal();
      if (!matchMedia("(max-width: 760px)").matches) {
        requestAnimationFrame(() => trashForm.elements.reason.focus());
      }
    };

    const closeGoalTrashDialog = () => {
      if (!trashDialog?.open || trashPending) return;
      trashDialog.close();
      trashIntent = null;
      refreshBoard();
    };

    const submitGoalTrashForm = async () => {
      if (!trashIntent || !trashForm || !trashError || !trashSubmit || trashPending) return;
      const reason = String(new FormData(trashForm).get("reason") || "").trim();
      if (!reason) {
        trashError.textContent = L("请说明本次操作原因。");
        trashError.hidden = false;
        trashForm.elements.reason.focus();
        return;
      }
      trashError.hidden = true;
      const intent = { ...trashIntent };
      setTrashPending(true);
      let redirecting = false;
      try {
        const result = await molisWorkRequest(route("${GOALS_PLUGIN_API}/goals/" + encodeURIComponent(intent.goalId) + "/trash"), {
          method: "POST",
          body: {
            trashed: intent.trashed,
            reason,
            user_confirmed: true,
          },
          fallback: L("操作失败"),
        });
        const expected = intent.trashed
          ? ["trashed", "already_trashed"]
          : ["restored", "already_active"];
        if (!expected.includes(result.status)) throw new Error(L("Molis Work 返回了无法识别的回收站状态"));
        redirecting = true;
        trashDialog.close();
        clearCollectionUiState();
        navigate(route((intent.trashed ? "/trash/goals/" : "/goals/") + encodeURIComponent(intent.goalId)));
      } catch (error) {
        trashError.textContent = error.message || L("操作失败，请检查后重试");
        trashError.hidden = false;
      } finally {
        if (!redirecting) setTrashPending(false);
      }
    };

`;

/** The composer stays a writing surface: the example retires on the first keystroke and the
 * outcome grows with what is written (data-fit, the shared intrinsic sizing) up to 260px. */
const GOALS_CREATE_COMPOSE_SCRIPT = `    const composeExample = dialog?.querySelector("[data-create-example]");
    const composeOutcome = dialog?.querySelector(".create-compose-outcome");
    const syncExample = () => {
      if (composeExample) composeExample.hidden = Boolean(form?.elements.title.value.trim());
    };
    // An HTML maxlength counts UTF-16 units and stopped a title of two-unit characters at 60 while the route counts 120 characters;
    // the box is cut here, to whole characters, before the form reads it.
    const capComposeTitle = () => {
      const title = form?.elements.title;
      if (!title || title.value.length <= 120) return;
      const chars = [...title.value];
      if (chars.length > 120) title.value = chars.slice(0, 120).join("");
    };
    const prepareCompose = () => {
      if (composeOutcome) { composeOutcome.style.height = ""; window.molisFit?.(composeOutcome); }
      syncExample();
    };
    form?.elements.title?.addEventListener("input", () => { capComposeTitle(); syncExample(); });

`

const GOALS_DIALOG_CLICK_SCRIPT = `      if (target.closest("[data-open-create]")) { openCreate(); return true; }
      if (target.closest("[data-close-create]")) {
        dialog.close();
        refreshBoard();
        return true;
      }
      const trashAction = target.closest("[data-open-goal-trash]");
      if (trashAction) {
        openGoalTrashDialog(trashAction, true);
        return true;
      }
      const restoreAction = target.closest("[data-open-goal-restore]");
      if (restoreAction) {
        openGoalTrashDialog(restoreAction, false);
        return true;
      }
      if (target.closest("[data-close-goal-trash]")) {
        closeGoalTrashDialog();
        return true;
      }
      return false;
`;

const GOALS_CREATE_SUBMIT_SCRIPT = `    form?.addEventListener("change", updateRelationPreviews);

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      formError.hidden = true;
      const values = new FormData(form);
      const payload = {
        goal_id: String(values.get("goal_id") || "").trim() || undefined,
        title: String(values.get("title") || "").trim(),
        outcome: String(values.get("outcome") || "").trim(),
        why: String(values.get("why") || "").trim(),
        business_logic: String(values.get("business_logic") || "").trim(),
        priority: Number(values.get("priority") || 0),
        parent_goal_id: String(values.get("parent_goal_id") || "").trim() || undefined,
        dependency_goal_ids: values.getAll("dependency_goal_ids").map(String),
        acceptance_criteria: String(values.get("acceptance_criteria") || "").split("\\n").map((line) => line.trim()).filter(Boolean),
      };
      try {
        const key = form.dataset.idempotencyKey || (globalThis.crypto?.randomUUID?.() || (String(Date.now()) + Math.random()));
        form.dataset.idempotencyKey = key;
        const result = await molisWorkRequest(route("${GOALS_PLUGIN_API}/goals"), {
          method: "POST",
          body: { ...payload, idempotency_key: key },
          fallback: "创建失败",
        });
        delete form.dataset.idempotencyKey;
        clearCurrentGoalUiState();
        // The reply names the Goal inside Goals' own pages; the project prefix is the page's to join (BL-386).
        navigate(route(result.goal_path));
      } catch (error) {
        formError.textContent = error.message || "创建失败，请检查输入后重试";
        formError.hidden = false;
        submit.disabled = false;
      }
    });

`;

const GOALS_DIALOG_ESCAPE_SCRIPT = `      if (event.key === "Escape" && dialog.open) {
        dialog.close();
        refreshBoard();
      }
      if (event.key === "Escape" && trashDialog?.open) closeGoalTrashDialog();
`;

/** Dialog-local intent and draft state; Host supplies shared refresh, storage and navigation. */
export const GOALS_DIALOGS_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { dialog, form, route, refreshBoard,
      updateRelationPreviews, currentLocale, translate: L, clearCollectionUiState, clearCurrentGoalUiState, navigate } = host;
    const formError = document.querySelector("[data-create-error]");
    const trashDialog = document.querySelector("[data-goal-trash-dialog]");
    const trashForm = document.querySelector("[data-goal-trash-form]");
    const trashError = document.querySelector("[data-goal-trash-error]");
    const trashSubmit = document.querySelector("[data-goal-trash-submit]");
    let trashIntent = null;
    let trashPending = false;
    const setTrashPending = (pending) => {
      trashPending = pending;
      trashForm.setAttribute("aria-busy", String(pending));
      trashSubmit.disabled = pending;
      trashSubmit.textContent = pending ? L("正在保存…") : L(trashIntent.trashed ? "移入回收站" : "恢复到 Goal Tree");
      trashForm.elements.reason.readOnly = pending;
      trashDialog.querySelectorAll("[data-close-goal-trash]").forEach((button) => { button.disabled = pending; });
    };
    trashDialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeGoalTrashDialog();
    });
${GOALS_TRASH_DIALOG_SCRIPT}
${GOALS_CREATE_COMPOSE_SCRIPT}
    const readCreateDraft = () => {
      if (!form) return null;
      const values = {};
      [...form.elements].forEach((control) => {
        if (!control.name) return;
        if (control.type === "checkbox") {
          values[control.name] ||= [];
          if (control.checked) values[control.name].push(control.value);
          return;
        }
        values[control.name] = control.value;
      });
      const active = document.activeElement;
      return {
        values,
        focus: active && form.contains(active) && active.name
          ? { name: active.name, value: active.value, start: active.selectionStart, end: active.selectionEnd }
          : null,
      };
    };

    const applyCreateDraft = (draft) => {
      if (!form || !draft) return;
      [...form.elements].forEach((control) => {
        if (!control.name || !(control.name in draft.values)) return;
        if (control.type === "checkbox") {
          control.checked = draft.values[control.name].includes(control.value);
          return;
        }
        control.value = draft.values[control.name];
      });
      updateRelationPreviews();
      if (!draft.focus) return;
      const focused = [...form.elements].find((control) =>
        control.name === draft.focus.name &&
        (control.type !== "checkbox" || control.value === draft.focus.value)
      );
      if (!focused) return;
      focused.focus({ preventScroll: true });
      if (typeof focused.setSelectionRange === "function" && draft.focus.start != null) {
        focused.setSelectionRange(draft.focus.start, draft.focus.end);
      }
    };


    const refreshCreateChoices = (nextDialog, draft) => {
      form.elements.parent_goal_id.innerHTML = nextDialog.querySelector('[name="parent_goal_id"]').innerHTML;
      form.querySelector(".goal-choice-list").innerHTML = nextDialog.querySelector(".goal-choice-list").innerHTML;
      applyCreateDraft(draft);
    };
    const openCreate = () => {
      if (!dialog || !form || dialog.open) return;
      formError.hidden = true;
      dialog.showModal();
      updateRelationPreviews();
      prepareCompose();
      requestAnimationFrame(() => form.elements.title.focus());
    };
    const handleGoalDialogClick = (target) => {
${GOALS_DIALOG_CLICK_SCRIPT}    };
    const handleGoalTrashSubmit = (submittedForm, event) => {
      if (!submittedForm.closest?.("[data-goal-trash-form]")) return null;
      event.preventDefault();
      return submitGoalTrashForm();
    };
    const bindGoalCreateEvents = () => {
${GOALS_CREATE_SUBMIT_SCRIPT}    };
    const handleGoalDialogEscape = (event) => {
${GOALS_DIALOG_ESCAPE_SCRIPT}    };
    return { readCreateDraft, refreshCreateChoices, openCreate, handleGoalDialogClick, handleGoalTrashSubmit,
      bindGoalCreateEvents, handleGoalDialogEscape };
  }`;

const GOALS_LIFECYCLE_CLICK_SCRIPT = `      const archiveAction = target.closest("[data-goal-archive]");
      if (archiveAction) {
        archiveAction.disabled = true;
        const archived = archiveAction.dataset.goalArchive === "true";
        const goalId = archiveAction.dataset.goalId;
        try {
          await molisWorkRequest(route("${GOALS_PLUGIN_API}/goals/" + encodeURIComponent(goalId) + "/archive"), {
            method: "POST",
            body: {
              archived,
              reason: archived ? "用户在 Molis Work 手动归档已完成 Goal" : "用户在 Molis Work 恢复归档 Goal",
            },
            fallback: "操作失败",
          });
          navigate(route((archived ? "/archive/goals/" : "/goals/") + encodeURIComponent(goalId)));
        } catch (error) {
          archiveAction.disabled = false;
          showToast(error.message || "操作失败", true);
        }
        return;
      }
`;

/** Archive and restore-from-archive use the existing Host HTTP. */
export const GOALS_LIFECYCLE_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { route, showToast, navigate } = host;
    const handleMatchedLifecycleClick = async (target) => {
${GOALS_LIFECYCLE_CLICK_SCRIPT}    };
    const handleGoalLifecycleClick = (target) => target.closest("[data-goal-archive]")
      ? handleMatchedLifecycleClick(target) : null;
    return { handleGoalLifecycleClick };
  }`;
