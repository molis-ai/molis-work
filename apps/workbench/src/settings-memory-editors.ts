/**
 * Editing one memory on the memory settings page: its text, its classification and expiry, renewal, and its version history.
 * The page script calls this factory once per bound page and keeps the list, paging, commands and batch work itself; values the
 * page changes while it runs (busy, the current reader, an in-flight removal, the scope) are read through getters.
 */
export const MEMORY_EDITORS_CLIENT_SCRIPT = String.raw`({ L, el, button, paint, run, ask, fail, api, mutation, day, appliesText, CLASS, KIND, FORMAL_KIND, sessionMode, params,
  scope, busy, reader, removing }) => {
  function textEditor(text, save, done) {
    const form = el("form", "memory-editor");
    const area = el("textarea", "mw-input memory-editor-text"); area.value = text; area.maxLength = 400; area.rows = 2; area.setAttribute("aria-label", L("记忆内容"));
    const row = el("div", "memory-editor-actions");
    const ok = button(L("保存"), "mw-btn--primary"); ok.type = "submit";
    const cancel = button(L("取消"), "mw-btn--ghost");
    cancel.addEventListener("click", () => paint());
    row.append(ok, cancel);
    form.append(area, row);
    form.addEventListener("submit", (event) => { event.preventDefault(); const value = area.value.trim(); if (value) run(() => save(value), done); });
    return form;
  }

  const classificationText = classification => classification
    ? classification.scenes.map(scene => L(CLASS[scene] || scene)).concat(L(CLASS[classification.lifecycle] || classification.lifecycle)).join(" · ") : L("未归类");
  const expiryText = expires => expires === undefined ? L("尚未决定") : expires ? new Date(expires).toLocaleString() : L("无固定期限");

  function classificationFields(item) {
    const host = el("details", "memory-origin"), scenes = el("div", "memory-editor-fields");
    host.append(el("summary", "", L("分类与期限")), el("p", "settings-muted", L("原分类") + "：" + classificationText(item.classification)));
    const sceneNames = ["coding", "assistant", "common"];
    const initialScenes = sceneNames.filter(scene => item.classification?.scenes.includes(scene));
    scenes.setAttribute("role", "group"); scenes.setAttribute("aria-label", L("适用场景"));
    host.append(el("strong", "settings-muted", L("适用场景")), scenes);
    for (const scene of sceneNames) {
      const label = el("label", "settings-check"), box = el("input"); box.type = "checkbox"; box.value = scene;
      box.dataset.memoryScene = ""; box.checked = Boolean(item.classification?.scenes.includes(scene));
      label.append(box, document.createTextNode(" " + L(CLASS[scene]))); scenes.append(label);
    }
    const fields = el("div", "memory-editor-fields"), lifecycle = el("select", "mw-select");
    lifecycle.setAttribute("aria-label", L("保留时间")); lifecycle.dataset.memoryLifecycle = "";
    for (const [key, title] of [["", "请选择保留类型"], ["long-term", "长期"], ["short-term", "短期"]]) {
      const option = el("option", "", L(title)); option.value = key; lifecycle.append(option);
    }
    if (sessionMode || item.classification?.lifecycle === "session") {
      const option = el("option", "", L("会话内")); option.value = "session"; option.disabled = !sessionMode; lifecycle.append(option);
    }
    lifecycle.value = item.classification?.lifecycle || "";
    const initialLifecycle = lifecycle.value;
    const expiry = el("select", "mw-select"); expiry.setAttribute("aria-label", L("期限决定")); expiry.dataset.memoryExpiry = "";
    for (const [key, title] of [["keep", "保留原期限"], ["set", "设置截止时间"], ["remove", "移除固定期限"]]) {
      const option = el("option", "", L(title)); option.value = key; expiry.append(option);
    }
    const date = el("input", "mw-input"); date.type = "datetime-local"; date.step = "1"; date.disabled = true; date.hidden = true;
    date.setAttribute("aria-label", L("截止时间（本地时间）")); date.dataset.memoryExpiresAt = "";
    expiry.addEventListener("change", () => { date.disabled = date.hidden = expiry.value !== "set"; date.required = expiry.value === "set"; });
    fields.append(lifecycle, expiry, date);
    host.append(fields, el("p", "settings-muted", L("原期限") + "：" + (item.expires_at === undefined ? L("尚未决定") : expiryText(item.expires_at))),
      el("p", "settings-muted", L("改为长期不会自动移除期限；短期必须有未来的截止时间。")));
    return { host, read: kindChanged => {
      const selected = Array.from(scenes.querySelectorAll("input:checked"), box => box.value);
      if (!kindChanged && selected.length === initialScenes.length && selected.every(scene => initialScenes.includes(scene))
        && lifecycle.value === initialLifecycle && expiry.value === "keep") return null;
      host.open = true;
      if (item.expired || !sessionMode && item.classification?.lifecycle === "session") throw new Error(L(item.expired
        ? "这条记忆已到期，暂不支持在这里纠正分类。" : "会话内记忆需要可信会话绑定，暂不支持在这里纠正分类。"));
      if (!lifecycle.value) throw new Error(L("请选择保留类型"));
      if (!selected.length) throw new Error(L("至少选择一个适用场景"));
      if (!expiry.value) throw new Error(L("请选择正式期限"));
      const expires = expiry.value === "keep" ? item.expires_at : expiry.value === "remove" ? null : new Date(date.value).toISOString();
      if (lifecycle.value === "short-term" && (!expires || Date.parse(expires) <= Date.now())) throw new Error(L("短期记忆需要未来的截止时间"));
      if (expiry.value === "set" && Date.parse(expires) <= Date.now()) throw new Error(L("截止时间必须晚于现在"));
      const classification = { scenes: selected, lifecycle: lifecycle.value };
      const expanded = selected.some(scene => !item.classification?.scenes.includes(scene))
        || (item.classification?.lifecycle === "session" && lifecycle.value !== "session")
        || (item.classification?.lifecycle === "short-term" && lifecycle.value === "long-term")
        || (item.expires_at && (!expires || Date.parse(expires) > Date.parse(item.expires_at)));
      const removed = (item.classification?.scenes || []).filter(scene => !sceneNames.includes(scene));
      if (item.classification && !["long-term", "short-term", "session"].includes(item.classification.lifecycle)) removed.push(item.classification.lifecycle);
      return { classification, ...(expiry.value !== "keep" ? { expires_at: expires } : {}),
        confirmation: expanded || removed.length ? L("适用场景与保留时间") + "：" + classificationText(item.classification) + " → " + classificationText(classification)
          + "；" + L("有效至") + "：" + expiryText(item.expires_at) + " → " + expiryText(expires)
          + (removed.length ? "；" + L("将移除未声明的分类值") + "：" + removed.join("、") : "") : "" };
    } };
  }

  function renewalEditor(item, onSave) {
    const form = el("form", "memory-editor");
    const date = el("input", "mw-input"); date.type = "datetime-local"; date.step = "1"; date.required = true;
    date.setAttribute("aria-label", L("新的截止时间（本地时间）")); date.dataset.memoryRenewExpiry = "";
    const row = el("div", "memory-editor-actions"), ok = button(L("确认续期"), "mw-btn--primary"), cancel = button(L("取消"), "mw-btn--ghost");
    ok.type = "submit"; cancel.addEventListener("click", () => paint()); row.append(ok, cancel);
    form.append(el("p", "settings-muted", L("原期限") + "：" + expiryText(item.expires_at)),
      el("p", "settings-muted", L("续期只更新截止时间，停用或暂停状态保持不变。")), date, row);
    form.addEventListener("submit", async event => {
      event.preventDefault(); if (busy() || ok.disabled) return;
      ok.disabled = true;
      try {
        const millis = date.value && date.validity.valid ? new Date(date.value).getTime() : NaN;
        if (!Number.isFinite(millis)) throw new Error(L("请选择有效的截止时间"));
        if (millis <= Date.now()) throw new Error(L("截止时间必须晚于现在"));
        const expires_at = new Date(millis).toISOString();
        if (!await ask(L("确认续期？"), L("有效至") + "：" + expiryText(item.expires_at) + " → " + expiryText(expires_at)
          + "；" + L("续期只更新截止时间，停用或暂停状态保持不变。"), L("确认续期"))) return;
        await run(() => onSave({ action: "renew", expires_at }), "已更新期限");
      } catch (failure) { fail(failure); }
      finally { ok.disabled = false; }
    });
    return form;
  }

  function itemEditor(item, onSave) {
    const form = el("form", "memory-editor");
    const area = el("textarea", "mw-input memory-editor-text"); area.value = item ? item.text : ""; area.maxLength = 400; area.rows = 2; area.required = true;
    area.placeholder = L("一句能单独读懂的话，例如：周报用要点列表，每条一句"); area.setAttribute("aria-label", L("记忆内容"));
    const fields = el("div", "memory-editor-fields");
    const kind = el("select", "mw-select"); kind.setAttribute("aria-label", L("类别"));
    Object.keys(item ? FORMAL_KIND : KIND).forEach((key) => { const option = el("option", "", L((item ? FORMAL_KIND : KIND)[key])); option.value = key; kind.append(option); });
    kind.value = item ? item.kind : (scope() === "project" ? "convention" : "preference");
    const task = el("input", "mw-input"); task.maxLength = 200; task.placeholder = L("适用于（可选），例如：写周报时"); task.setAttribute("aria-label", L("适用情境"));
    task.value = item && item.applies && item.applies.task ? item.applies.task : "";
    fields.append(kind, task);
    const row = el("div", "memory-editor-actions");
    const ok = button(L("保存"), "mw-btn--primary"); ok.type = "submit";
    const cancel = button(L("取消"), "mw-btn--ghost");
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
          if (confirmation && !await ask(L("纠正分类"), confirmation, L("保存"))) return;
          await run(() => onSave({ ...(item ? { action: "reclassify" } : {}), ...values, text, kind: kind.value, applies }), "已保存");
        } else await run(() => onSave({ ...(item ? { action: "update" } : {}), text, kind: kind.value, applies }), item ? "已保存" : "已记住");
      } catch (failure) { fail(failure); }
    });
    return form;
  }

  function historyPanel(item, host) {
    const active = reader();
    const panel = el("div", "memory-history"); panel.append(el("span", "settings-muted", L("正在读取…")));
    host.append(panel);
    api("/items/" + encodeURIComponent(item.memory_id) + "/history").then((body) => {
      if (reader() !== active || !panel.isConnected || removing()) return;
      panel.replaceChildren();
      const list = el("ol", "memory-history-list");
      body.revisions.slice().reverse().forEach((revision) => {
        const entry = el("li", "");
        entry.dataset.memoryHistoryVersion = revision.version;
        entry.append(el("span", "memory-history-version", L("第") + " " + revision.version + " " + L("版") + " · " + day(revision.at)), el("span", "", revision.text),
          el("span", "settings-muted", L(FORMAL_KIND[revision.kind] || revision.kind) + " · " + appliesText(revision.applies, item.scope, revision.classification)),
          el("span", "settings-muted", revision.classification ? classificationText(revision.classification) + " · " + L("有效至") + "：" + expiryText(revision.expires_at) : L("历史分类与期限未知")),
          el("span", "settings-muted", L(revision.snapshot_available ? "完整历史快照" : "历史信息不完整，仅可采用正文")));
        if (revision.version !== item.version) {
          const complete = revision.snapshot_available, label = complete ? "回到这一版" : "使用这段旧文字";
          const back = button(L(label), "mw-btn--link"), restore = mutation();
          back.addEventListener("click", async () => {
            if (busy() || back.disabled) return;
            back.disabled = true;
            try {
              const classification = sessionMode || !complete ? item.classification : revision.classification;
              const expiry = sessionMode || !complete ? item.expires_at : revision.expires_at;
              const description = L("记忆内容") + "：" + item.text + " → " + revision.text
                + "；" + L("适用场景与保留时间") + "：" + classificationText(item.classification) + " → " + classificationText(classification)
                + "；" + L("有效至") + "：" + expiryText(item.expires_at) + " → " + expiryText(expiry)
                + "；" + L(complete ? "采用这一版的类别、适用情境和来源；启停状态保持不变。" : "只采用旧正文，当前分类、期限、来源、适用情境和状态保持不变。")
                + (complete ? "；" + L("类别") + "：" + L(FORMAL_KIND[item.kind] || item.kind) + " → " + L(FORMAL_KIND[revision.kind] || revision.kind)
                  + "；" + L("适用") + "：" + appliesText(item.applies, item.scope, item.classification) + " → " + appliesText(revision.applies, item.scope, classification) : "")
                + (complete && sessionMode ? "；" + L("会话内恢复保留当前分类、会话绑定和期限，不采用旧期限。") : "");
              if (!await ask(L(label), description, L(label))) return;
              await run(() => restore("/change", { memory_id: item.memory_id, expected_version: item.version,
                ...(complete ? { action: "restore", version: revision.version } : { action: "update", text: revision.text }) }), complete ? "已回到这一版" : "已采用旧文字");
            } finally { back.disabled = false; }
          });
          entry.append(back);
        } else entry.append(el("span", "memory-tag", L("当前")));
        list.append(entry);
      });
      panel.append(list);
    }).catch((failure) => { if (reader() !== active || !panel.isConnected) return; const note = el("span", "settings-form-error"); molisWorkRequest.show(note, failure); panel.replaceChildren(note); });
  }

  return { textEditor, classificationText, expiryText, renewalEditor, itemEditor, historyPanel };
}`;
