export const AUTOMATION_RECOMMENDATIONS_CLIENT = String.raw`
globalThis.molisWorkOpenAutomation = (project, trigger) => {
  const dialog = document.querySelector("[data-automation-dialog]");
  if (!dialog) return;
  if (!dialog.openAutomation) dialog.openAutomation = (() => {
  const text = (key, args) => globalThis.t.text("workbench.automation." + key, args);
  const part = name => dialog.querySelector("[data-automation-" + name + "]");
  const status = part("progress"), error = part("error"), result = part("result");
  const save = part("save"), retry = part("retry");
  const saveLabel = key => { save.querySelector("[data-slot=button-label]").textContent = text(key); };
  const setStatus = key => { status.textContent = key ? text(key) : ""; };
  let request, report, entry, sending = false, documentId;
  const node = (tag, content, className) => {
    const element = document.createElement(tag);
    if (content) element.textContent = content;
    if (className) element.className = className;
    return element;
  };
  const actionClass = variant => "mw-btn mw-btn--" + variant + " mw-btn--sm";
  const link = (label, path, fields) => Object.assign(node("a", text(label), actionClass("secondary")), {
    href: path + "?" + new URLSearchParams(fields),
  });
  const button = (label, call) => {
    const item = node("button", label, actionClass("ghost"));
    item.type = "button";
    item.onclick = () => { void call(); };
    return item;
  };
  const prefix = id => "/projects/" + encodeURIComponent(id);
  function nextOf(next) {
    if (next.kind === "connection") return link("connect", "/settings/connectors", { connector: next.service_id });
    const path = prefix(entry.project) + "/settings/kit";
    if (next.kind === "skill") {
      const ref = next.ref;
      return link("open-skill", path, {
        skill: ref.skill_id, install: ref.install_id, generation: ref.installation_generation, version: ref.version,
      });
    }
    return link("open-role", path, {
      owner: next.owner_id, role: next.role_id, install: next.install_id, version: next.plugin_version,
    });
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
  const showError = failure => { setStatus(); error.hidden = false; molisWorkRequest.show(error, failure); };
  const route = () => prefix(entry.project) + "/api/automation/recommendations";
  const begin = () => (request = new AbortController()).signal;
  const stale = (signal, at) => signal.aborted || at !== entry;
  async function load() {
    const at = entry;
    request?.abort();
    const signal = begin();
    report = undefined; error.hidden = true; save.hidden = true; retry.hidden = true;
    setStatus("loading"); result.replaceChildren();
    try {
      const loaded = await molisWorkRequest(route(), { signal });
      if (stale(signal, at)) return;
      report = loaded; draw(); setStatus();
      save.hidden = false; save.disabled = false;
    } catch (failure) {
      if (stale(signal, at)) return;
      showError(failure); retry.hidden = false;
    }
  }
  async function change(action, body, complete) {
    if (sending || !report || !entry) return;
    const at = entry, source = report;
    const signal = begin();
    const controls = [...result.querySelectorAll("button"), save];
    sending = true; controls.forEach(button => { button.disabled = true; });
    error.hidden = true; setStatus("saving");
    try {
      const answer = await molisWorkRequest(route() + "/" + action, { body: { ...body, save_token: source.save_token }, signal });
      if (stale(signal, at)) return;
      await complete(answer);
    } catch (failure) {
      if (stale(signal, at)) return;
      showError(failure);
      if (failure?.status === 409) retry.hidden = false;
    } finally {
      if (at === entry) {
        sending = false; controls.forEach(button => { button.disabled = false; });
      }
    }
  }
  const preference = (id, choice) => change("preference", { suggestion_id: id, choice, expected_revision: report.preferences.revision }, async () => {
    await load();
    if (report) setStatus("preference-saved");
  });
  retry.onclick = () => { void load(); };
  save.onclick = () => {
    if (documentId) {
      location.href = prefix(entry.project) + "/?" + new URLSearchParams({ openPlugin: "pages", openItem: documentId, openTitle: text("title") });
      return;
    }
    void change("save", {}, value => {
      documentId = value.document_id;
      setStatus("saved"); saveLabel("open-document");
    });
  };
  function open(project, trigger) {
    if (!project || project === "personal" || dialog.open) return;
    entry = { project, trigger };
    documentId = undefined;
    saveLabel("save");
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
