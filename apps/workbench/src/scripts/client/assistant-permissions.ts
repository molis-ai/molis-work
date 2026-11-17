export const ASSISTANT_PERMISSIONS_PART = String.raw`
  let openSubtaskPermission = async () => false;
  const permissionDialog = island.querySelector("[data-assistant-permission-dialog]");
  const permissionText = (key, args) => readText("workbench.authorization." + key, args);
  if (permissionDialog) {
    const form = permissionDialog.querySelector("form"), scope = form.querySelector("[data-permission-scope]");
    const save = form.querySelector("[data-permission-save]"), error = form.querySelector("[data-permission-error]");
    const status = form.querySelector("[data-permission-status]");
    let permissionResult, permissionAbort, permissionChanged = false;
    let openPermission, snapshot, readVersion = 0, busy = false, selection = null;
    const mode = () => form.elements.mode.value, lifetime = () => form.elements.lifetime.value;
    const choice = () => snapshot?.automatic?.candidates?.[0];
    const present = value => typeof value === "string" ? value : globalThis.say.text(value);
    const selected = () => selection ?? choice()?.operations?.map(row => row.key) ?? [];
    const route = at => (at.work.scope.kind === "project" ? "/projects/" + encodeURIComponent(at.work.scope.project_id) : "")
      + "/api/assistant/works/" + encodeURIComponent(at.work.work_id) + "/permission";
    const bodyAt = at => ({ lifetime: lifetime(), ...(at.review ? { review_id: at.review.review_id, version: at.review.version } : {}) });
    const problemAt = failure => { molisWorkRequest.show(error, failure); error.hidden = false; };
    function renderScope() {
      const allowed = choice(), auto = mode() === "automatic";
      const enabled = allowed?.state === "ready";
      form.querySelector("[name=mode][value=automatic]").disabled = !enabled;
      form.querySelector("[data-permission-mode-note]").textContent = permissionText(mode() + "-note");
      form.querySelector("[data-permission-lifetime-note]").textContent = permissionText(lifetime() + "-end");
      form.querySelector("[data-permission-work]").textContent = openPermission?.work.title ?? "";
      scope.replaceChildren();
      if (auto && enabled) {
        scope.append(el("h4", "", allowed.title));
        if (allowed.provider_title && allowed.provider_title !== allowed.title) scope.append(el("p", "settings-muted", allowed.provider_title));
        if (allowed.exact_parameters) scope.append(el("pre", "", allowed.exact_parameters));
        for (const operation of allowed.operations ?? []) {
          const box = document.createElement("input");
          box.type = "checkbox"; box.value = operation.key; box.checked = selected().includes(operation.key);
          const label = el("label", "settings-check");
          label.append(box, document.createTextNode(operation.title_text ? present(operation.title_text) : operation.title));
          scope.append(label);
          for (const target of operation.targets) scope.append(el("p", "", target.values.map(value => present(value.label)).join(permissionText("separator"))));
        }
      } else {
        scope.append(el("p", "", allowed?.reason ?? permissionText(auto ? "choose-review" : mode() + "-scope")));
      }
      const current = snapshot?.current.selection;
      if (current && current.revoked_at === null) scope.append(el("p", "settings-muted", permissionText("replace", { mode: permissionText(current.mode) })));
      if (openPermission?.review) scope.append(el("p", "settings-muted", permissionText("next-round")));
      canSave();
    }
    function canSave() {
      const auto = mode() === "automatic";
      save.disabled = busy || !snapshot || snapshot.current.lifecycle === "ending"
        || auto && (!snapshot.preview?.candidate_digest || choice()?.state !== "ready" || choice().operations && !selected().length);
    }
    async function load(rebuild = true) {
      const at = openPermission, version = ++readVersion;
      if (!at) return;
      busy = true; canSave(); error.hidden = true;
      status.textContent = permissionText("loading");
      const query = new URLSearchParams(bodyAt(at));
      if (!rebuild && selection?.length) query.set("selected", selection.join(","));
      try {
        const data = await molisWorkRequest(route(at) + "?" + query);
        if (at !== openPermission || version !== readVersion) return;
        if (!rebuild && snapshot?.current.storage_version !== data.preview.storage_version) { await load(); return; }
        snapshot = rebuild ? data : { ...snapshot, preview: data.preview };
        status.textContent = snapshot.current.lifecycle === "ending" ? permissionText("ending") : "";
        if (rebuild) {
          if (selection?.length && choice()?.operations) { renderScope(); await load(false); return; }
          renderScope();
        }
      } catch (failure) {
        if (at !== openPermission || version !== readVersion) return;
        snapshot = null; status.textContent = ""; problemAt(failure);
      } finally { if (at === openPermission && version === readVersion) { busy = false; canSave(); } }
    }
    form.addEventListener("change", event => {
      const target = event.target;
      if (target.name === "mode") renderScope();
      else if (target.name === "lifetime") void load();
      else if (scope.contains(target)) {
        selection = [...scope.querySelectorAll("input:checked")].map(box => box.value);
        if (selection.length) void load(false); else { ++readVersion; busy = false; status.textContent = ""; canSave(); }
      }
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const at = openPermission, current = snapshot;
      if (!at || !current || save.disabled) return;
      const modeValue = mode();
      const digest = modeValue === "automatic" ? current.preview.candidate_digest : current.current.candidate_digest;
      const payload = { ...bodyAt(at), mode: modeValue, expected_version: current.current.storage_version, candidate_digest: digest, selected: selected() };
      busy = true; canSave(); status.textContent = permissionText("saving"); error.hidden = true;
      try {
        await molisWorkRequest(route(at), { method: "POST", body: payload });
        permissionChanged = true; window.dispatchEvent(new CustomEvent("molis:authorization-changed"));
        if (at === openPermission) { status.textContent = permissionText("saved"); save.disabled = true; }
        if (getWork()?.work_id === at.work.work_id) await reload().catch(() => undefined);
      } catch (failure) {
        if (at !== openPermission) return;
        status.textContent = ""; problemAt(failure);
        busy = false; canSave();
        if (failure.status === 409) { await load(); if (at === openPermission) problemAt(failure); }
      }
    });
    permissionDialog.addEventListener("click", event => { if (event.target.closest("[data-dialog-close]")) permissionDialog.close(); });
    permissionDialog.addEventListener("close", () => { openPermission = null; ++readVersion; snapshot = null; permissionAbort?.(); permissionResult?.(permissionChanged); permissionResult = undefined; });
    openSubtaskPermission = (trigger, work, review, signal) => {
      if (permissionDialog.open || signal?.aborted || work.executor.kind !== "assistant" || work.archived || work.reply_target) return Promise.resolve(false);
      openPermission = { work, review }; permissionChanged = false;
      busy = false; snapshot = null; selection = null; form.reset();
      if (review) form.querySelector("[name=mode][value=automatic]").checked = true;
      const close = () => permissionDialog.close();
      signal?.addEventListener('abort', close, { once: true });
      permissionAbort = () => { signal?.removeEventListener('abort', close); if (trigger?.isConnected && !signal?.aborted) trigger.focus({ preventScroll: true }); };
      const result = new Promise(resolve => { permissionResult = resolve; });
      renderScope(); permissionDialog.showModal(); void load();
      return result;
    };
    island.addEventListener("click", event => {
      const button = event.target.closest("[data-assistant-permission-open]");
      if (!button) return;
      const work = getWork();
      if (!work || work.executor.kind !== "assistant" || work.archived || work.reply_target) return;
      const reviewId = button.dataset.assistantPermissionOpen;
      const review = reviewId ? view?.reviews?.find(row => row.review_id === reviewId) : undefined;
      if (reviewId && !review) return;
      void openSubtaskPermission(button, work, review);
    });
  }
  const paintPermissionSummary = work => {
    const suggestion = island.querySelector("[data-assistant-automation]");
    if (suggestion) {
      const projectId = work ? (work.scope.kind === "project" ? work.scope.project_id : "") : project?.id ?? "";
      suggestion.dataset.automationOpen = projectId;
      suggestion.hidden = !projectId;
    }
    const permission = island.querySelector("[data-assistant-permission-summary]");
    if (permission) permission.hidden = !work || work.executor.kind !== "assistant" || work.archived || Boolean(work.reply_target);
  };
`;
