/**
 * 「作为 Goal 的输入」 in a 成果 version's detail (specs/artifact-positioning A4b): choose a Goal of this project and record
 * the version as its input. Runs inside the workbench's 成果 client and shares its `route`, `L` and `loadArtifacts`.
 */
export const ARTIFACT_GOAL_INPUT_CLIENT_SCRIPT = String.raw`
  const goalInputHeaders = () => ({ ...(globalThis.molisWorkControlHeaders?.() || {}), "content-type": "application/json", "x-molis-work-idempotency-key": crypto.randomUUID() });
  // The Goals to choose from are read when the person opens the control, not with every detail.
  document.addEventListener("toggle", async (event) => {
    const box = event.target;
    if (!(box instanceof HTMLDetailsElement) || !box.matches("[data-artifact-goal-input]") || !box.open || box.dataset.loaded === "1") return;
    const select = box.querySelector("select"), status = box.querySelector("[data-artifact-goal-input-status]");
    try {
      const response = await fetch(route("/api/goals/directory"), { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || L("目标读取失败"));
      select.replaceChildren(...(payload.goals || []).map((goal) => Object.assign(document.createElement("option"), { value: goal.goal_id, textContent: goal.title })));
      if (!select.options.length) status.textContent = L("这个项目还没有目标。");
      box.dataset.loaded = "1";
    } catch (error) { status.textContent = error.message; }
  }, true);
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest?.("[data-artifact-goal-input-form]");
    if (!form) return;
    event.preventDefault();
    const goal = form.elements.goal.value, button = form.querySelector("button[type=submit]"), status = form.querySelector("[data-artifact-goal-input-status]");
    if (!goal || button.disabled) return;
    button.disabled = true; status.textContent = "";
    try {
      const response = await fetch(route("/api/goals/" + encodeURIComponent(goal) + "/artifact-inputs"), { method: "POST", headers: goalInputHeaders(),
        body: JSON.stringify({ reference: JSON.parse(form.dataset.artifactReference), used: true }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || L("没有记下输入"));
      // The detail reloads so 「被谁引用」 shows the Goal.
      void loadArtifacts(artifactPath || route("/artifacts"), true);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
`;
