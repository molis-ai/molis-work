/** Existing relation browser behavior, composed into the Workbench lexical host. */
const GOALS_RELATION_PREVIEW_SCRIPT = `    const updateRelationPreviews = () => {
      if (!form) return;
      const parent = form.elements.parent_goal_id?.selectedOptions?.[0];
      const parentPreview = form.querySelector("[data-parent-preview]");
      if (parentPreview) {
        parentPreview.textContent = parent?.value
          ? L("关系预览：新 Goal → 属于 → 「{name}」。这是目录层级，不需要等待它完成。", { name: parent.dataset.goalName || parent.textContent })
          : L("关系预览：新 Goal 将作为独立 Goal 出现在 Tree 中。");
      }
      const dependencies = [...form.querySelectorAll('[name="dependency_goal_ids"]:checked')];
      const dependencyPreview = form.querySelector("[data-dependency-preview]");
      if (dependencyPreview) {
        const names = dependencies.map((input) => "「" + (input.dataset.goalName || input.value) + "」");
        dependencyPreview.textContent = names.length
          ? L("关系预览：新 Goal → 依赖 → {names}；这些 Goal 完成前，新 Goal 还不能收尾。普通笔记和准备仍可先做。", { names: names.join(currentLocale() === "en" ? ", " : "、") })
          : L("关系预览：当前没有执行前置，Goal 可以独立推进。");
      }
    };

    const updateRelationFormPreview = (relationForm) => {
      if (!relationForm) return;
      const intent = relationForm.elements.relation_intent?.value || "other";
      const intentMap = {
        needs: ["outgoing", "depends_on"],
        belongs: ["outgoing", "part_of"],
        enables: ["incoming", "depends_on"],
        contains: ["incoming", "part_of"],
      };
      if (intentMap[intent]) {
        relationForm.elements.direction.value = intentMap[intent][0];
        relationForm.elements.type.value = intentMap[intent][1];
      }
      const preview = relationForm.querySelector("[data-relation-live-preview]");
      const type = relationForm.elements.type?.selectedOptions?.[0];
      const target = relationForm.elements.target_goal_id?.selectedOptions?.[0];
      const direction = relationForm.elements.direction?.value || "outgoing";
      if (!preview || !type || !target) return;
      const currentName = relationForm.dataset.currentGoalName || relationForm.dataset.goalId;
      const targetName = target.dataset.goalName || target.textContent;
      const left = direction === "outgoing" ? currentName : targetName;
      const right = direction === "outgoing" ? targetName : currentName;
      const label = type.dataset.outLabel || type.textContent;
      preview.querySelector("strong").textContent = left + " → " + label + " → " + right;
      preview.querySelector("p").textContent = type.dataset.description || "关系方向和原因会进入事件历史";
    };

    const updateAllRelationFormPreviews = () => {
      document.querySelectorAll("[data-relation-form]").forEach(updateRelationFormPreview);
    };

`;

const GOALS_RELATION_CHANGE_SCRIPT = `      const relationForm = changed.closest("[data-relation-form]");
      if (relationForm) {
        if ((changed.name === "direction" || changed.name === "type") && relationForm.elements.relation_intent) {
          relationForm.elements.relation_intent.value = "other";
        } else if (changed.name === "relation_intent" && changed.value === "other") {
          relationForm.elements.direction.value = "";
          relationForm.elements.type.value = "";
          const advanced = relationForm.querySelector("[data-progressive-fields]");
          if (advanced) advanced.open = true;
        }
        updateRelationFormPreview(relationForm);
      }
`;

const GOALS_RELATION_DISCLOSURE_SCRIPT = `      const openRelationDeactivate = target.closest("[data-relation-deactivate-open]");
      if (openRelationDeactivate) {
        const record = openRelationDeactivate.closest("[data-relation-id]");
        const deactivateForm = record?.querySelector("[data-relation-deactivate-form]");
        if (!deactivateForm) return true;
        deactivateForm.hidden = false;
        openRelationDeactivate.hidden = true;
        openRelationDeactivate.setAttribute("aria-expanded", "true");
        deactivateForm.querySelector("textarea")?.focus();
        return true;
      }
      const cancelRelationDeactivate = target.closest("[data-relation-deactivate-cancel]");
      if (cancelRelationDeactivate) {
        if (cancelRelationDeactivate.closest("form")?.getAttribute("aria-busy") === "true") return true;
        const record = cancelRelationDeactivate.closest(".relation-record");
        const deactivateForm = record?.querySelector("[data-relation-deactivate-form]");
        const openButton = record?.querySelector("[data-relation-deactivate-open]");
        if (deactivateForm) deactivateForm.hidden = true;
        if (openButton) {
          openButton.hidden = false;
          openButton.setAttribute("aria-expanded", "false");
          openButton.focus();
        }
        return true;
      }
      return false;
`;

const GOALS_RELATION_SUBMIT_SCRIPT = `      const relationForm = submittedForm.closest?.("[data-relation-form]");
      if (relationForm) {
        event.preventDefault();
        if (relationForm.getAttribute("aria-busy") === "true") return;
        const submit = relationForm.querySelector('button[type="submit"]');
        const errorBox = relationForm.querySelector("[data-relation-error]");
        if (requireFormFacts(relationForm, errorBox)) return;
        const values = new FormData(relationForm);
        const relationSummary = relationForm.querySelector("[data-relation-live-preview] strong")?.textContent?.trim() || L("当前 Goal 的关系");
        const submitLabel = submit.textContent;
        relationForm.setAttribute("aria-busy", "true");
        const controls = [...relationForm.querySelectorAll("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)")];
        controls.forEach(control => { control.disabled = true; });
        submit.textContent = L("正在保存…");
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/goals/" + encodeURIComponent(relationForm.dataset.goalId) + "/relations"), {
            method: "POST",
            headers: { ...molisWorkControlHeaders(), "x-molis-work-idempotency-key": relationForm.dataset.idempotencyKey ||= crypto.randomUUID() },
            body: JSON.stringify({
              direction: values.get("direction"),
              type: values.get("type"),
              target_goal_id: values.get("target_goal_id"),
              reason: String(values.get("reason") || "").trim(),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "关系建立失败");
          await refreshBoard(true);
          showFactorReceipt(
            "relations",
            L("关系已建立"),
            L("已建立：{relation}。准确方向和建立原因已进入完整记录。", { relation: relationSummary }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error instanceof TypeError ? L("无法连接本地服务，输入已保留，请重试。") : error.message, L("关系建立失败，请检查目标、方向和原因"));
          errorBox.hidden = false;
          submit.disabled = false;
          submit.textContent = submitLabel;
        } finally {
          relationForm.removeAttribute("aria-busy");
          controls.forEach(control => { control.disabled = false; });
        }
        return;
      }

      const relationDeactivateForm = submittedForm.closest?.("[data-relation-deactivate-form]");
      if (relationDeactivateForm) {
        event.preventDefault();
        if (relationDeactivateForm.getAttribute("aria-busy") === "true") return;
        const submit = relationDeactivateForm.querySelector('button[type="submit"]');
        const errorBox = relationDeactivateForm.querySelector("[data-relation-deactivate-error]");
        if (requireDecisionText(relationDeactivateForm, errorBox, "reason", "请填写解除原因。说明这条关系为什么不再成立。")) return;
        const reason = String(new FormData(relationDeactivateForm).get("reason") || "").trim();
        const relatedGoal = relationDeactivateForm.closest(".relation-record")?.querySelector(".relation-copy strong")?.textContent?.trim() || L("另一个 Goal");
        relationDeactivateForm.setAttribute("aria-busy", "true");
        const controls = [...relationDeactivateForm.querySelectorAll("input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)")];
        controls.forEach(control => { control.disabled = true; });
        errorBox.hidden = true;
        try {
          const response = await fetch(route("/api/relations/" + encodeURIComponent(relationDeactivateForm.dataset.relationId) + "/deactivate"), {
            method: "POST",
            headers: { ...molisWorkControlHeaders(), "x-molis-work-idempotency-key": relationDeactivateForm.dataset.idempotencyKey ||= crypto.randomUUID() },
            body: JSON.stringify({ reason }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "关系解除失败");
          await refreshBoard(true);
          showFactorReceipt(
            "relations",
            L("关系已解除"),
            L("与「{goal}」的关系已停止生效；原方向和解除原因仍保留在完整记录中。", { goal: relatedGoal }),
          );
        } catch (error) {
          errorBox.textContent = humanDecisionError(error instanceof TypeError ? L("无法连接本地服务，输入已保留，请重试。") : error.message, L("关系解除失败，请检查解除原因后重试"));
          errorBox.hidden = false;
          submit.disabled = false;
        } finally {
          relationDeactivateForm.removeAttribute("aria-busy");
          controls.forEach(control => { control.disabled = false; });
        }
        return;
      }

`;

export const GOALS_RELATION_CLIENT_FACTORY_SCRIPT = `(host) => {
    const { form, currentLocale, route, controlHeaders: molisWorkControlHeaders, translate: L,
      refreshBoard, requireFormFacts, requireDecisionText, showFactorReceipt, humanDecisionError } = host;
${GOALS_RELATION_PREVIEW_SCRIPT}
    const handleGoalRelationChange = (changed) => {
${GOALS_RELATION_CHANGE_SCRIPT}    };
    const handleGoalRelationDisclosureClick = (target) => {
${GOALS_RELATION_DISCLOSURE_SCRIPT}    };
    const submitMatchedRelation = async (submittedForm, event) => {
${GOALS_RELATION_SUBMIT_SCRIPT}    };
    const handleGoalRelationSubmit = (submittedForm, event) => submittedForm.closest?.("[data-relation-form], [data-relation-deactivate-form]")
      ? submitMatchedRelation(submittedForm, event) : null;
    return { updateRelationPreviews, updateAllRelationFormPreviews, handleGoalRelationChange,
      handleGoalRelationDisclosureClick, handleGoalRelationSubmit };
  }`;
