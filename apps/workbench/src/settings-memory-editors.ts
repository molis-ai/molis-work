/**
 * Editing one memory on the memory settings page: its text, its classification and expiry, renewal, and its version history.
 * The page script calls this factory once per bound page and keeps the list, paging, commands and batch work itself; values the
 * page changes while it runs (busy, the current reader, an in-flight removal, the scope) are read through getters.
 */
export const MEMORY_EDITORS_CLIENT_SCRIPT = String.raw`({ L, el, button, paint, run, ask, fail, api, mutation, day, appliesText, CLASS, KIND, FORMAL_KIND, sessionMode, params,
  scope, busy, reader, removing }) => {
  function textEditor(text, save, done) {
    const form = el("form", "memory-editor");
    const area = el("textarea", "mw-input memory-editor-text"); area.value = text; area.maxLength = 400; area.rows = 2; area.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.memory-2"));
    const row = el("div", "memory-editor-actions");
    const ok = button(globalThis.t.text("workbench.settings-memory.save"), "mw-btn--primary"); ok.type = "submit";
    const cancel = button(globalThis.t.text("workbench.settings-memory.cancel"), "mw-btn--ghost");
    cancel.addEventListener("click", () => paint());
    row.append(ok, cancel);
    form.append(area, row);
    form.addEventListener("submit", (event) => { event.preventDefault(); const value = area.value.trim(); if (value) run(() => save(value), done); });
    return form;
  }

  const classificationText = classification => classification
    ? classification.scenes.map(scene => globalThis.t.text(CLASS[scene] || scene)).concat(globalThis.t.text(CLASS[classification.lifecycle] || classification.lifecycle)).join(" · ") : globalThis.t.text("workbench.settings-memory.unclassified");
  const expiryText = expires => expires === undefined ? globalThis.t.text("workbench.settings-memory.not-yet-decided") : expires ? new Date(expires).toLocaleString() : globalThis.t.text("workbench.settings-memory.no-fixed-expiry");

  function classificationFields(item) {
    const host = el("details", "memory-origin"), scenes = el("div", "memory-editor-fields");
    host.append(el("summary", "", globalThis.t.text("workbench.settings-memory.classification-expiry")), el("p", "settings-muted", globalThis.t.text("workbench.settings-memory.original-classification") + globalThis.t.text("common.punctuation.label-separator") + classificationText(item.classification)));
    const sceneNames = ["coding", "assistant", "common"];
    const initialScenes = sceneNames.filter(scene => item.classification?.scenes.includes(scene));
    scenes.setAttribute("role", "group"); scenes.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.applies-2"));
    host.append(el("strong", "settings-muted", globalThis.t.text("workbench.settings-memory.applies-2")), scenes);
    for (const scene of sceneNames) {
      const label = el("label", "settings-check"), box = el("input"); box.type = "checkbox"; box.value = scene;
      box.dataset.memoryScene = ""; box.checked = Boolean(item.classification?.scenes.includes(scene));
      label.append(box, document.createTextNode(" " + globalThis.t.text(CLASS[scene]))); scenes.append(label);
    }
    const fields = el("div", "memory-editor-fields"), lifecycle = el("select", "mw-select");
    lifecycle.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.retention")); lifecycle.dataset.memoryLifecycle = "";
    for (const [key, title] of [["", "workbench.settings-memory.choose-retention-type"], ["long-term", "workbench.settings-memory.long-term"], ["short-term", "workbench.settings-memory.short-term"]]) {
      const option = el("option", "", globalThis.t.text(title)); option.value = key; lifecycle.append(option);
    }
    if (sessionMode || item.classification?.lifecycle === "session") {
      const option = el("option", "", globalThis.t.text("workbench.settings-memory.within-session")); option.value = "session"; option.disabled = !sessionMode; lifecycle.append(option);
    }
    lifecycle.value = item.classification?.lifecycle || "";
    const initialLifecycle = lifecycle.value;
    const expiry = el("select", "mw-select"); expiry.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.expiry-decision")); expiry.dataset.memoryExpiry = "";
    for (const [key, title] of [["keep", "workbench.settings-memory.keep-original-expiry"], ["set", "workbench.settings-memory.set-expiry-time"], ["remove", "workbench.settings-memory.remove-fixed-expiry"]]) {
      const option = el("option", "", globalThis.t.text(title)); option.value = key; expiry.append(option);
    }
    const date = el("input", "mw-input"); date.type = "datetime-local"; date.step = "1"; date.disabled = true; date.hidden = true;
    date.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.expiry-time-local-time")); date.dataset.memoryExpiresAt = "";
    expiry.addEventListener("change", () => { date.disabled = date.hidden = expiry.value !== "set"; date.required = expiry.value === "set"; });
    fields.append(lifecycle, expiry, date);
    host.append(fields, el("p", "settings-muted", globalThis.t.text("workbench.settings-memory.original-expiry") + globalThis.t.text("common.punctuation.label-separator") + (item.expires_at === undefined ? globalThis.t.text("workbench.settings-memory.not-yet-decided") : expiryText(item.expires_at))),
      el("p", "settings-muted", globalThis.t.text("workbench.settings-memory.long-term-does-not-remove-existing-expiry-short")));
    return { host, read: kindChanged => {
      const selected = Array.from(scenes.querySelectorAll("input:checked"), box => box.value);
      if (!kindChanged && selected.length === initialScenes.length && selected.every(scene => initialScenes.includes(scene))
        && lifecycle.value === initialLifecycle && expiry.value === "keep") return null;
      host.open = true;
      if (item.expired || !sessionMode && item.classification?.lifecycle === "session") throw new Error(globalThis.t.text(item.expired
        ? "workbench.settings-memory.memory-expired-classification-cannot-corrected-here-yet" : "workbench.settings-memory.session-memories-need-trusted-session-binding-classification-changes"));
      if (!lifecycle.value) throw new Error(globalThis.t.text("workbench.settings-memory.choose-retention-type"));
      if (!selected.length) throw new Error(globalThis.t.text("workbench.settings-memory.choose-least-one-applicable-scene"));
      if (!expiry.value) throw new Error(globalThis.t.text("workbench.settings-memory.choose-formal-retention"));
      const expires = expiry.value === "keep" ? item.expires_at : expiry.value === "remove" ? null : new Date(date.value).toISOString();
      if (lifecycle.value === "short-term" && (!expires || Date.parse(expires) <= Date.now())) throw new Error(globalThis.t.text("workbench.settings-memory.short-term-memories-need-future-expiry-time"));
      if (expiry.value === "set" && Date.parse(expires) <= Date.now()) throw new Error(globalThis.t.text("workbench.settings-memory.expiry-must-future"));
      const classification = { scenes: selected, lifecycle: lifecycle.value };
      const expanded = selected.some(scene => !item.classification?.scenes.includes(scene))
        || (item.classification?.lifecycle === "session" && lifecycle.value !== "session")
        || (item.classification?.lifecycle === "short-term" && lifecycle.value === "long-term")
        || (item.expires_at && (!expires || Date.parse(expires) > Date.parse(item.expires_at)));
      const removed = (item.classification?.scenes || []).filter(scene => !sceneNames.includes(scene));
      if (item.classification && !["long-term", "short-term", "session"].includes(item.classification.lifecycle)) removed.push(item.classification.lifecycle);
      return { classification, ...(expiry.value !== "keep" ? { expires_at: expires } : {}),
        confirmation: expanded || removed.length ? globalThis.t.text("workbench.settings-memory.applicable-scenes-retention") + globalThis.t.text("common.punctuation.label-separator") + classificationText(item.classification) + " → " + classificationText(classification)
          + globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-memory.valid-until") + globalThis.t.text("common.punctuation.label-separator") + expiryText(item.expires_at) + " → " + expiryText(expires)
          + (removed.length ? globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-memory.undeclared-classification-values-remove") + globalThis.t.text("common.punctuation.label-separator") + removed.join(globalThis.t.text("common.list.separator")) : "") : "" };
    } };
  }

  function renewalEditor(item, onSave) {
    const form = el("form", "memory-editor");
    const date = el("input", "mw-input"); date.type = "datetime-local"; date.step = "1"; date.required = true;
    date.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.new-expiry-time-local-time")); date.dataset.memoryRenewExpiry = "";
    const row = el("div", "memory-editor-actions"), ok = button(globalThis.t.text("workbench.settings-memory.confirm-renewal"), "mw-btn--primary"), cancel = button(globalThis.t.text("workbench.settings-memory.cancel"), "mw-btn--ghost");
    ok.type = "submit"; cancel.addEventListener("click", () => paint()); row.append(ok, cancel);
    form.append(el("p", "settings-muted", globalThis.t.text("workbench.settings-memory.original-expiry") + globalThis.t.text("common.punctuation.label-separator") + expiryText(item.expires_at)),
      el("p", "settings-muted", globalThis.t.text("workbench.settings-memory.renewal-only-changes-expiry-time-disabled-paused-memories")), date, row);
    form.addEventListener("submit", async event => {
      event.preventDefault(); if (busy() || ok.disabled) return;
      ok.disabled = true;
      try {
        const millis = date.value && date.validity.valid ? new Date(date.value).getTime() : NaN;
        if (!Number.isFinite(millis)) throw new Error(globalThis.t.text("workbench.settings-memory.choose-valid-expiry-time"));
        if (millis <= Date.now()) throw new Error(globalThis.t.text("workbench.settings-memory.expiry-must-future"));
        const expires_at = new Date(millis).toISOString();
        if (!await ask(globalThis.t.text("workbench.settings-memory.confirm-renewal-2"), globalThis.t.text("workbench.settings-memory.valid-until") + globalThis.t.text("common.punctuation.label-separator") + expiryText(item.expires_at) + " → " + expiryText(expires_at)
          + globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-memory.renewal-only-changes-expiry-time-disabled-paused-memories"), globalThis.t.text("workbench.settings-memory.confirm-renewal"))) return;
        await run(() => onSave({ action: "renew", expires_at }), "workbench.settings-memory.expiry-updated");
      } catch (failure) { fail(failure); }
      finally { ok.disabled = false; }
    });
    return form;
  }

  function itemEditor(item, onSave) {
    const form = el("form", "memory-editor");
    const area = el("textarea", "mw-input memory-editor-text"); area.value = item ? item.text : ""; area.maxLength = 400; area.rows = 2; area.required = true;
    area.placeholder = globalThis.t.text("workbench.settings-memory.one-sentence-that-reads-its-own-e-g"); area.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.memory-2"));
    const fields = el("div", "memory-editor-fields");
    const kind = el("select", "mw-select"); kind.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.kind"));
    Object.keys(item ? FORMAL_KIND : KIND).forEach((key) => { const option = el("option", "", globalThis.t.text((item ? FORMAL_KIND : KIND)[key])); option.value = key; kind.append(option); });
    kind.value = item ? item.kind : (scope() === "project" ? "convention" : "preference");
    const task = el("input", "mw-input"); task.maxLength = 200; task.placeholder = globalThis.t.text("workbench.settings-memory.applies-when-optional-e-g-writing-weekly-reports"); task.setAttribute("aria-label", globalThis.t.text("workbench.settings-memory.applies-when"));
    task.value = item && item.applies && item.applies.task ? item.applies.task : "";
    fields.append(kind, task);
    const row = el("div", "memory-editor-actions");
    const ok = button(globalThis.t.text("workbench.settings-memory.save"), "mw-btn--primary"); ok.type = "submit";
    const cancel = button(globalThis.t.text("workbench.settings-memory.cancel"), "mw-btn--ghost");
    cancel.addEventListener("click", () => paint());
    row.append(ok, cancel);
    const correction = item || sessionMode ? classificationFields(item || { classification: { scenes: [params.get("memory_session_kind")], lifecycle: "session" }, expires_at: null }) : null;
    form.append(area, fields); if (correction) form.append(correction.host); form.append(row);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = area.value.trim(); if (!text) return;
      const applies = Object.assign({}, item ? item.applies : {}); if (task.value.trim()) applies.task = task.value.trim(); else delete applies.task;
      try {
        const correctionValue = correction?.read(!item || kind.value !== item.kind);
        if (correctionValue) {
          const { confirmation, ...values } = correctionValue;
          if (confirmation && !await ask(globalThis.t.text("workbench.settings-memory.correct-classification"), confirmation, globalThis.t.text("workbench.settings-memory.save"))) return;
          await run(() => onSave({ ...(item ? { action: "reclassify" } : {}), ...values, text, kind: kind.value, applies }), "workbench.settings-memory.saved");
        } else await run(() => onSave({ ...(item ? { action: "update" } : {}), text, kind: kind.value, applies }), item ? "workbench.settings-memory.saved" : "workbench.settings-memory.kept");
      } catch (failure) { fail(failure); }
    });
    return form;
  }

  function historyPanel(item, host) {
    const active = reader();
    const panel = el("div", "memory-history"); panel.append(el("span", "settings-muted", globalThis.t.text("workbench.settings-memory.loading")));
    host.append(panel);
    api("/items/" + encodeURIComponent(item.memory_id) + "/history").then((body) => {
      if (reader() !== active || !panel.isConnected || removing()) return;
      panel.replaceChildren();
      const list = el("ol", "memory-history-list");
      body.revisions.slice().reverse().forEach((revision) => {
        const entry = el("li", "");
        entry.dataset.memoryHistoryVersion = revision.version;
        entry.append(el("span", "memory-history-version", globalThis.t.text("workbench.settings-memory.version-number", { version: revision.version }) + " · " + day(revision.at)), el("span", "", revision.text),
          el("span", "settings-muted", globalThis.t.text(FORMAL_KIND[revision.kind] || revision.kind) + " · " + appliesText(revision.applies, item.scope, revision.classification)),
          el("span", "settings-muted", revision.classification ? classificationText(revision.classification) + " · " + globalThis.t.text("workbench.settings-memory.valid-until") + globalThis.t.text("common.punctuation.label-separator") + expiryText(revision.expires_at) : globalThis.t.text("workbench.settings-memory.historical-classification-expiry-unknown")),
          el("span", "settings-muted", globalThis.t.text(revision.snapshot_available ? "workbench.settings-memory.complete-historical-snapshot" : "workbench.settings-memory.incomplete-history-only-text-can-adopted")));
        if (revision.version !== item.version) {
          const complete = revision.snapshot_available, label = complete ? "workbench.settings-memory.go-back-version" : "workbench.settings-memory.use-old-text";
          const back = button(globalThis.t.text(label), "mw-btn--link"), restore = mutation();
          back.addEventListener("click", async () => {
            if (busy() || back.disabled) return;
            back.disabled = true;
            try {
              const classification = sessionMode || !complete ? item.classification : revision.classification;
              const expiry = sessionMode || !complete ? item.expires_at : revision.expires_at;
              const description = globalThis.t.text("workbench.settings-memory.memory-2") + globalThis.t.text("common.punctuation.label-separator") + item.text + " → " + revision.text
                + globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-memory.applicable-scenes-retention") + globalThis.t.text("common.punctuation.label-separator") + classificationText(item.classification) + " → " + classificationText(classification)
                + globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-memory.valid-until") + globalThis.t.text("common.punctuation.label-separator") + expiryText(item.expires_at) + " → " + expiryText(expiry)
                + globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text(complete ? "workbench.settings-memory.use-version-s-category-conditions-source-enabled-paused" : "workbench.settings-memory.only-adopt-old-text-current-classification-expiry-source")
                + (complete ? globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-memory.kind") + globalThis.t.text("common.punctuation.label-separator") + globalThis.t.text(FORMAL_KIND[item.kind] || item.kind) + " → " + globalThis.t.text(FORMAL_KIND[revision.kind] || revision.kind)
                  + globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-memory.applies") + globalThis.t.text("common.punctuation.label-separator") + appliesText(item.applies, item.scope, item.classification) + " → " + appliesText(revision.applies, item.scope, classification) : "")
                + (complete && sessionMode ? globalThis.t.text("common.punctuation.semicolon") + globalThis.t.text("workbench.settings-memory.session-restore-keeps-current-classification-session-binding-expiry") : "");
              if (!await ask(globalThis.t.text(label), description, globalThis.t.text(label))) return;
              await run(() => restore("/change", { memory_id: item.memory_id, expected_version: item.version,
                ...(complete ? { action: "restore", version: revision.version } : { action: "update", text: revision.text }) }), complete ? "workbench.settings-memory.went-back-that-version" : "workbench.settings-memory.old-text-adopted");
            } finally { back.disabled = false; }
          });
          entry.append(back);
        } else entry.append(el("span", "memory-tag", globalThis.t.text("workbench.settings-memory.current")));
        list.append(entry);
      });
      panel.append(list);
    }).catch((failure) => { if (reader() !== active || !panel.isConnected) return; const note = el("span", "settings-form-error"); molisWorkRequest.show(note, failure); panel.replaceChildren(note); });
  }

  return { textEditor, classificationText, expiryText, renewalEditor, itemEditor, historyPanel };
}`;
