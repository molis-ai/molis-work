export const AUTOMATION_RECOMMENDATIONS_CLIENT = String.raw`
globalThis.molisWorkOpenAutomation = (project, trigger) => {
  const dialog = document.querySelector("[data-automation-dialog]");
  if (!dialog) return;
  if (!dialog.openAutomation) dialog.openAutomation = (() => {
  const text = (key, args) => globalThis.t.text("workbench.automation." + key, args);
  const status = dialog.querySelector("[data-automation-progress]");
  const error = dialog.querySelector("[data-automation-error]");
  const result = dialog.querySelector("[data-automation-result]");
  const save = dialog.querySelector("[data-automation-save]"), retry = dialog.querySelector("[data-automation-retry]");
  let request, report, entry, sending = false, documentId;
  const node = (tag, content, className) => {
    const element = document.createElement(tag);
    if (content) element.textContent = content;
    if (className) element.className = className;
    return element;
  };
  const link = (label, href) => {
    const item = node("a", label, "mw-btn mw-btn--secondary mw-btn--sm");
    item.href = href;
    return item;
  };
  const button = (label, call) => {
    const item = node("button", label, "mw-btn mw-btn--ghost mw-btn--sm");
    item.type = "button";
    item.onclick = () => { void call(); };
    return item;
  };
  const prefix = id => "/projects/" + encodeURIComponent(id);
  function nextOf(next) {
    const base = prefix(entry.project);
    if (next.kind === "connection") return link(text("connect"), "/settings/connectors?" + new URLSearchParams({ connector: next.service_id }));
    if (next.kind === "skill") {
      const ref = next.ref;
      return link(text("open-skill"), base + "/settings/kit?" + new URLSearchParams({
        skill: ref.skill_id, install: ref.install_id, generation: ref.installation_generation, version: ref.version,
      }));
    }
    return link(text("open-role"), base + "/settings/kit?" + new URLSearchParams({
      owner: next.owner_id, role: next.role_id, install: next.install_id, version: next.plugin_version,
    }));
  }
  function suggestion(row) {
    const details = node("details"), summary = node("summary", row.title);
    details.dataset.automationSuggestion = row.id;
    details.append(summary, node("p", row.reason), node("p", row.effect), node("p", text("confidence-" + row.confidence)));
    const evidence = node("ul");
    for (const file of row.evidence) evidence.append(node("li", file.workspace + " / " + file.path));
    details.append(evidence);
    if (row.requirements.length) details.append(node("p", text("requires", { items: row.requirements.join(globalThis.t.text("common.list.separator")) })));
    details.append(node("p", row.risk));
    const controls = node("div", "", "automation-actions");
    controls.append(nextOf(row.next));
    if (report.preferences) for (const choice of ["ignored", "already-have", "hidden"]) controls.append(button(text(choice), () => preference(row.id, choice)));
    details.append(controls);
    return details;
  }
  function draw() {
    result.replaceChildren();
    for (const group of report.groups) {
      const section = node("section"), title = node("h3", text(group.category));
      section.append(title);
      for (const row of group.suggestions) section.append(suggestion(row));
      if (!group.suggestions.length) section.append(node("p", text("empty"), "settings-muted"));
      result.append(section);
    }
    if (report.gaps.length) {
      const gaps = node("details"), list = node("ul");
      gaps.append(node("summary", text("partial")), list);
      for (const gap of report.gaps) {
        const at = [gap.category && text(gap.category), gap.workspace, gap.path].filter(Boolean).join(" / ");
        list.append(node("li", text(gap.code) + (at ? " · " + at : "")));
      }
      result.append(gaps);
    }
    if (report.preferences?.choices.length) {
      const prefs = node("details");
      prefs.append(node("summary", text("preferences")));
      for (const row of report.preferences.choices) {
        const line = node("div", "", "automation-actions");
        line.append(node("span", row.title + " · " + text(row.choice)), button(text("show"), () => preference(row.id, "show")));
        prefs.append(line);
      }
      result.append(prefs);
    }
  }
  const showError = failure => { error.hidden = false; molisWorkRequest.show(error, failure); };
  const route = at => prefix(at.project) + "/api/automation/recommendations";
  async function load() {
    const at = entry;
    request?.abort();
    const pending = new AbortController(); request = pending;
    report = undefined; error.hidden = true; save.hidden = true; retry.hidden = true;
    status.textContent = text("loading"); result.replaceChildren();
    try {
      const loaded = await molisWorkRequest(route(at), { signal: pending.signal });
      if (pending.signal.aborted || at !== entry) return;
      report = loaded; draw(); status.textContent = "";
      save.hidden = false; save.disabled = false;
    } catch (failure) {
      if (pending.signal.aborted || at !== entry) return;
      status.textContent = ""; showError(failure); retry.hidden = false;
    }
  }
  async function change(action, body, complete) {
    if (sending || !report || !entry) return;
    const at = entry, source = report;
    const pending = new AbortController(); request = pending;
    const controls = [...result.querySelectorAll("button"), save];
    sending = true; controls.forEach(button => { button.disabled = true; });
    error.hidden = true; status.textContent = text("saving");
    try {
      const answer = await molisWorkRequest(route(at) + "/" + action, { body: { ...body, save_token: source.save_token }, signal: pending.signal });
      if (pending.signal.aborted || at !== entry) return;
      await complete(answer);
    } catch (failure) {
      if (pending.signal.aborted || at !== entry) return;
      status.textContent = ""; showError(failure);
      if (failure?.status === 409) retry.hidden = false;
    } finally {
      if (at === entry) {
        sending = false; controls.forEach(button => { button.disabled = false; });
      }
    }
  }
  const preference = (id, choice) => change("preference", { suggestion_id: id, choice, expected_revision: report.preferences.revision }, async () => {
    await load();
    if (report) status.textContent = text("preference-saved");
  });
  retry.onclick = () => { void load(); };
  save.onclick = () => {
    if (documentId) {
      location.href = prefix(entry.project) + "/?" + new URLSearchParams({ openPlugin: "pages", openItem: documentId, openTitle: text("title") });
      return;
    }
    void change("save", {}, value => {
      documentId = value.document_id;
      status.textContent = text("saved");
      save.querySelector("[data-slot=button-label]").textContent = text("open-document");
    });
  };
  function open(project, trigger) {
    if (!project || project === "personal" || dialog.open) return;
    entry = { project, trigger };
    documentId = undefined;
    save.querySelector("[data-slot=button-label]").textContent = text("save");
    dialog.showModal(); void load();
  }
  dialog.querySelector("[data-dialog-close]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    request?.abort();
    entry?.trigger.focus(); entry = undefined; report = undefined; sending = false;
    result.replaceChildren();
  });
  return open;
  })();
  dialog.openAutomation(project, trigger);
};
`;

export const AUTOMATION_RECOMMENDATIONS_LOADER = String.raw`
(() => {
  function open(project, trigger) {
    if (!project || project === "personal" || trigger.getAttribute("aria-busy") === "true") return;
    const problem = document.querySelector("[data-automation-load-error]");
    if (problem) problem.hidden = true;
    if (globalThis.molisWorkOpenAutomation) { globalThis.molisWorkOpenAutomation(project, trigger); return; }
    trigger.setAttribute("aria-busy", "true");
    void globalThis.molisWorkLoadCapabilities().then(() => {
      if (trigger.isConnected) globalThis.molisWorkOpenAutomation(project, trigger);
    }).catch(() => {
      if (problem) { problem.hidden = false; problem.textContent = globalThis.t.text("workbench.automation.load-error"); }
    }).finally(() => trigger.removeAttribute("aria-busy"));
  }
  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-automation-open]");
    if (!button) return;
    event.preventDefault();
    open(button.dataset.automationOpen || document.body.dataset.projectId, button);
  });
  document.addEventListener("molis:automation-suggestions-open", event => open(document.body.dataset.projectId, event.detail.trigger));
})();
`;

export const CAPABILITY_ASSET_LOADER = String.raw`
globalThis.molisWorkLoadCapabilities ??= (() => {
  let loading;
  return () => loading ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/assets/molis-work-capabilities.js";
    script.onload = resolve;
    script.onerror = () => {
      loading = undefined; script.remove();
      reject(new Error(globalThis.t.text("workbench.settings-directory.try-again-moment")));
    };
    document.head.append(script);
  });
})();
`;
