/**
 * The memory settings page (specs/memory-system §10): 个人 → 记忆 in the global settings, and 项目记忆 in a project's
 * settings. Both are the same page in a different scope; everything it shows and changes goes through `/api/memory/*`,
 * which invokes the shared directory's `memory.*` actions as the person.
 */
export function renderMemorySettings({ L, scope, projectId }: { L(text: string): string; scope: "personal" | "project"; projectId: string | null }): string {
  const personal = scope === "personal";
  const title = personal ? L("记忆") : L("项目记忆");
  const lead = personal
    ? L("你的偏好和习惯：助理、Agent 工作、插件和界面推荐都会用到，在所有项目里生效。每一条都能看到从哪来、最近用在哪，可以修改、停用或删除。")
    : L("这个项目的约定、背景和经验：只在这个项目里使用。和“项目说明”不同，它按相关性参考，不是必须遵守的规矩。");
  return `<section class="settings-document memory-settings" aria-labelledby="memory-title" data-memory-settings data-memory-scope="${scope}" data-project="${projectId ?? ""}">
    <header class="settings-page-heading memory-heading"><h1 id="memory-title">${title}</h1><p>${lead}</p>
      <p class="memory-summary" data-memory-summary aria-live="polite">${L("正在读取…")}</p></header>
    <p class="settings-form-error" data-memory-error role="alert" hidden></p>
    <section class="settings-section memory-changes" aria-labelledby="memory-changes-title" data-memory-changes-section hidden>
      <h2 id="memory-changes-title">${L("最近变动")}</h2>
      <ul class="memory-change-list" data-memory-changes></ul>
    </section>
    <section class="settings-section memory-candidates" aria-labelledby="memory-candidates-title" data-memory-candidates-section hidden>
      <h2 id="memory-candidates-title">${L("等你认可")}</h2>
      <p class="settings-muted">${L("从工作、界面操作里提出，或写入门没有直接记住的内容。认可之前不会被使用。")}</p>
      <ul class="memory-list" data-memory-candidates></ul>
    </section>
    <section class="settings-section memory-items" aria-labelledby="memory-items-title">
      <div class="memory-items-head"><h2 id="memory-items-title">${personal ? L("我的记忆") : L("这个项目的记忆")}</h2>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-add>${L("添加")}</button></div>
      <div class="memory-toolbar" role="group" aria-label="${L("筛选记忆")}">
        <select class="mw-select" data-memory-filter="kind" aria-label="${L("类别")}"><option value="">${L("全部类别")}</option><option value="preference">${L("偏好")}</option><option value="convention">${L("约定")}</option><option value="fact">${L("背景事实")}</option><option value="experience">${L("经验")}</option></select>
        <select class="mw-select" data-memory-filter="source" aria-label="${L("来源")}"><option value="">${L("全部来源")}</option><option value="said">${L("你说的")}</option><option value="accepted">${L("你认可的")}</option><option value="auto">${L("自动记住")}</option><option value="manual">${L("手动添加")}</option><option value="imported">${L("导入")}</option></select>
        <select class="mw-select" data-memory-filter="state" aria-label="${L("状态")}"><option value="">${L("全部状态")}</option><option value="active">${L("生效")}</option><option value="disabled">${L("停用")}</option><option value="paused">${L("暂停")}</option></select>
        <input class="mw-input memory-search" type="search" data-memory-filter="query" placeholder="${L("搜索记忆")}" aria-label="${L("搜索记忆")}">
      </div>
      <div class="memory-editor-slot" data-memory-new hidden></div>
      <ul class="memory-list" data-memory-list><li class="settings-muted">${L("正在读取…")}</li></ul>
    </section>
    <section class="settings-section memory-prefs" aria-labelledby="memory-form-title">
      <h2 id="memory-form-title">${L("怎么形成")}</h2>
      ${prefRow(L, "form", L("允许记住"), personal ? L("总开关。关掉后不再形成新的记忆，也不提建议；已有的照常使用。") : L("关掉后不再为这个项目形成新的记忆，也不提建议。"))}
      <div class="settings-setting-row memory-pref-static"><span class="setting-copy"><strong>${L("明确要求时记住")}</strong><span>${L("你说“以后……”“记住……”时直接记住，并告诉你在哪里生效。")}</span></span><span class="setting-value settings-muted">${L("总是")}</span></div>
      ${prefRow(L, "auto", L("自动记住低风险的偏好与经验"), L("你在两次不同的工作里都这样要求时自动记住，出现在“最近变动”里，可以撤销。关掉则都先问你。"))}
      ${prefRow(L, "learn_from_work", L("从工作里提出建议"), L("工作结束时提出值得记住的内容，等你认可。"))}
      ${prefRow(L, "learn_from_ui", L("从界面操作里学习"), L("只数你采纳、忽略、改写、撤销界面建议的次数，不保存内容；反复出现才提出建议。"))}
    </section>
    <section class="settings-section memory-prefs" aria-labelledby="memory-use-title">
      <h2 id="memory-use-title">${L("谁可以用")}</h2>
      ${prefRow(L, "consumers.assistant", L("助理"), L("你在底栏交给助理的工作。"))}
      ${prefRow(L, "consumers.agent", L("Agent 工作"), L("Coding、插件里的 Agent 和工作流。"))}
      ${prefRow(L, "consumers.ui", L("界面推荐"), L("根据你正在看的内容给出的建议。"))}
      ${prefRow(L, "consumers.plugin", L("插件"), L("插件只能读到偏好和约定，不会读到背景事实。"))}
      ${prefRow(L, "consumers.mcp", L("外部 AI 客户端"), personal ? L("通过 MCP 连接的客户端。个人记忆默认不开放。") : L("通过 MCP 连接的客户端，只读。"))}
    </section>
    ${personal ? `<p class="settings-muted memory-rules-note">${L("交互规则（例如“写方案时别打断”）由助理按规则执行，在“助理”设置里管理。")} <a href="/settings/assistant">${L("去助理设置")}</a></p>` : ""}
  </section>`;
}

function prefRow(_L: (text: string) => string, key: string, title: string, description: string): string {
  return `<label class="settings-setting-row memory-pref"><span class="setting-copy"><strong>${title}</strong><span>${description}</span></span>
    <span class="setting-value"><span class="mw-switch"><input type="checkbox" role="switch" data-memory-pref="${key}" aria-label="${title}"><span class="mw-switch__track" aria-hidden="true"></span></span></span></label>`;
}

/**
 * Binds one memory page (a standalone settings page, or the same page fetched into the settings cover): safe to call
 * again for a new root. Everything is drawn with textContent; nothing the memories say is ever parsed as markup.
 */
export const MEMORY_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
  const bind = (root) => {
    if (!root || root.dataset.memoryBound === "1") return;
    root.dataset.memoryBound = "1";
    const L = globalThis.L || ((text) => text);
    const scope = root.dataset.memoryScope === "project" ? "project" : "personal";
    const project = root.dataset.project || "";
    const base = (scope === "project" && project ? "/projects/" + encodeURIComponent(project) : "") + "/api/memory";
    const $ = (selector) => root.querySelector(selector);
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
    const button = (text, variant, label) => { const node = el("button", "mw-btn " + (variant || "mw-btn--ghost") + " mw-btn--sm", text); node.type = "button"; if (label) node.setAttribute("aria-label", label); return node; };
    const KIND = { preference: "偏好", convention: "约定", fact: "背景事实", experience: "经验" };
    const SOURCE = { said: "你说的", accepted: "你认可的", auto: "自动记住", manual: "手动添加", imported: "导入" };
    const STATE = { active: "生效", disabled: "停用", paused: "暂停" };
    const CHANGE = { kept: "记住", auto_kept: "自动记住", replaced: "替换", auto_replaced: "自动替换", merged: "合并", edited: "修改", restored: "回到旧版本", moved: "改范围",
      disabled: "停用", auto_disabled: "自动停用", enabled: "启用", paused: "暂停", resumed: "恢复", removed: "删除", accepted: "认可", imported: "导入", cleared: "清空" };
    const day = (iso) => { const date = new Date(iso); return isNaN(date.getTime()) ? "" : (date.getMonth() + 1) + "/" + date.getDate(); };
    const appliesText = (applies) => {
      const parts = [];
      if (applies && applies.plugin_ids && applies.plugin_ids.length) parts.push(L("插件") + " " + applies.plugin_ids.join("、"));
      if (applies && applies.object_kinds && applies.object_kinds.length) parts.push(L("对象") + " " + applies.object_kinds.join("、"));
      if (applies && applies.goal_ids && applies.goal_ids.length) parts.push("Goal " + applies.goal_ids.join("、"));
      if (applies && applies.task) parts.push(applies.task);
      if (applies && applies.until) parts.push(L("到") + " " + applies.until.slice(0, 10));
      return parts.length ? parts.join(" · ") : L(scope === "project" ? "这个项目的所有工作" : "所有工作");
    };
    let data = null, busy = false;
    const filters = { kind: "", source: "", state: "", query: "" };
    const error = $("[data-memory-error]");
    const toast = (text) => {
      const box = document.querySelector("[data-settings-toast], [data-toast]");
      if (!box) return;
      box.textContent = text; box.classList.add("is-visible");
      setTimeout(() => box.classList.remove("is-visible"), 2600);
    };
    const fail = (failure) => { error.textContent = failure && failure.message ? failure.message : L("没有完成，请重试"); error.hidden = false; };
    const api = async (path, payload) => {
      const response = await fetch(base + path, payload === undefined ? undefined : { method: "POST", headers: globalThis.molisWorkControlHeaders(), body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || L("没有完成，请重试"));
      return body;
    };
    const run = async (work, message) => {
      if (busy) return;
      busy = true; error.hidden = true;
      try { await work(); await load(); if (message) toast(L(message)); }
      catch (failure) { fail(failure); }
      finally { busy = false; }
    };
    const load = async () => { data = await api("/overview?scope=" + scope); paint(); };

    function paintSummary() {
      const counts = data.counts || {};
      const total = scope === "project" ? counts.project : counts.personal;
      const parts = [L(scope === "project" ? "项目记忆" : "个人记忆") + " " + (total || 0) + " " + L("条")];
      if (counts.auto_this_week) parts.push(L("本周自动记住") + " " + counts.auto_this_week + " " + L("条"));
      if (counts.pending) parts.push(counts.pending + " " + L("条等你认可"));
      $("[data-memory-summary]").textContent = parts.join(" · ");
    }

    function paintChanges() {
      // What happened without the person's own hand here: automatic changes, and what works kept or forgot for them.
      const list = $("[data-memory-changes]"), changes = (data.changes || []).filter((change) => change.by !== "person" || change.work).slice(0, 6);
      $("[data-memory-changes-section]").hidden = !changes.length;
      list.replaceChildren();
      changes.forEach((change) => {
        const row = el("li", "memory-change" + (change.state === "undone" ? " is-undone" : ""));
        const copy = el("div", "memory-change-copy");
        const head = change.state === "undone" ? L("已撤销（已从记忆里删掉）")
          : L(CHANGE[change.kind] || change.kind) + (change.text ? "「" + change.text + "」" : "");
        copy.append(el("strong", "", head));
        const meta = [day(change.at), change.rule, change.reason, change.work ? L("工作") + "「" + change.work.title + "」" : ""].filter(Boolean).join(" · ");
        if (meta) copy.append(el("span", "settings-muted", meta));
        row.append(copy);
        if (change.undoable && change.state === "active") {
          const undo = button(L("撤销"), "mw-btn--secondary", L("撤销") + "：" + (change.text || ""));
          undo.addEventListener("click", () => run(() => api("/changes/" + encodeURIComponent(change.change_id) + "/undo", {}), "已撤销"));
          row.append(undo);
        }
        list.append(row);
      });
    }

    function paintCandidates() {
      const list = $("[data-memory-candidates]"), candidates = data.candidates || [];
      $("[data-memory-candidates-section]").hidden = !candidates.length;
      list.replaceChildren();
      candidates.forEach((candidate) => {
        const row = el("li", "memory-row memory-row--candidate");
        const copy = el("div", "memory-row-copy");
        copy.append(el("strong", "memory-text", candidate.text));
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", L(KIND[candidate.kind] || candidate.kind)));
        meta.append(el("span", "", L("依据") + "：" + candidate.why));
        if (candidate.work) meta.append(el("span", "", L("工作") + "「" + candidate.work.title + "」"));
        copy.append(meta);
        if (candidate.hold_reason) copy.append(el("span", "memory-hold", candidate.hold_reason));
        const actions = el("div", "memory-actions");
        const keep = button(L("记住"), "mw-btn--primary", L("记住") + "：" + candidate.text);
        keep.addEventListener("click", () => run(() => api("/candidates/" + encodeURIComponent(candidate.candidate_id) + "/accept", {}), "已记住"));
        const reword = button(L("改一下再记"), "mw-btn--ghost");
        reword.addEventListener("click", () => {
          const editor = textEditor(candidate.text, async (text) => { await api("/candidates/" + encodeURIComponent(candidate.candidate_id) + "/accept", { text }); }, "已记住");
          row.replaceChildren(editor); editor.querySelector("textarea").focus();
        });
        const drop = button(L("不用"), "mw-btn--ghost", L("不用") + "：" + candidate.text);
        drop.addEventListener("click", () => run(() => api("/candidates/" + encodeURIComponent(candidate.candidate_id) + "/discard", {}), "不会再提这一条"));
        actions.append(keep, reword, drop);
        row.append(copy, actions);
        list.append(row);
      });
    }

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

    function itemEditor(item, onSave) {
      const form = el("form", "memory-editor");
      const area = el("textarea", "mw-input memory-editor-text"); area.value = item ? item.text : ""; area.maxLength = 400; area.rows = 2; area.required = true;
      area.placeholder = L("一句能单独读懂的话，例如：周报用要点列表，每条一句"); area.setAttribute("aria-label", L("记忆内容"));
      const fields = el("div", "memory-editor-fields");
      const kind = el("select", "mw-select"); kind.setAttribute("aria-label", L("类别"));
      Object.keys(KIND).forEach((key) => { const option = el("option", "", L(KIND[key])); option.value = key; kind.append(option); });
      kind.value = item ? item.kind : (scope === "project" ? "convention" : "preference");
      const task = el("input", "mw-input"); task.maxLength = 200; task.placeholder = L("适用于（可选），例如：写周报时"); task.setAttribute("aria-label", L("适用情境"));
      task.value = item && item.applies && item.applies.task ? item.applies.task : "";
      fields.append(kind, task);
      const row = el("div", "memory-editor-actions");
      const ok = button(L("保存"), "mw-btn--primary"); ok.type = "submit";
      const cancel = button(L("取消"), "mw-btn--ghost");
      cancel.addEventListener("click", () => paint());
      row.append(ok, cancel);
      form.append(area, fields, row);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = area.value.trim(); if (!text) return;
        const applies = Object.assign({}, item ? item.applies : {}); if (task.value.trim()) applies.task = task.value.trim(); else delete applies.task;
        run(() => onSave({ text, kind: kind.value, applies }), item ? "已保存" : "已记住");
      });
      return form;
    }

    function historyPanel(item, host) {
      const panel = el("div", "memory-history"); panel.append(el("span", "settings-muted", L("正在读取…")));
      host.append(panel);
      api("/items/" + encodeURIComponent(item.memory_id) + "/history").then((body) => {
        panel.replaceChildren();
        const list = el("ol", "memory-history-list");
        body.revisions.slice().reverse().forEach((revision) => {
          const entry = el("li", "");
          entry.append(el("span", "memory-history-version", L("第") + " " + revision.version + " " + L("版") + " · " + day(revision.at)), el("span", "", revision.text));
          if (revision.version !== item.version) {
            const back = button(L("回到这一版"), "mw-btn--link");
            back.addEventListener("click", () => run(() => api("/change", { memory_id: item.memory_id, action: "restore", version: revision.version }), "已回到这一版"));
            entry.append(back);
          } else entry.append(el("span", "memory-tag", L("当前")));
          list.append(entry);
        });
        panel.append(list);
      }).catch((failure) => { panel.replaceChildren(el("span", "settings-form-error", failure.message)); });
    }

    function paintItems() {
      const list = $("[data-memory-list]");
      list.replaceChildren();
      const query = filters.query.trim().toLowerCase();
      const items = (data.items || []).filter((item) => item.scope === scope)
        .filter((item) => (!filters.kind || item.kind === filters.kind) && (!filters.source || item.source === filters.source) && (!filters.state || item.state === filters.state)
          && (!query || item.text.toLowerCase().includes(query)));
      if (!items.length) {
        const empty = (data.items || []).some((item) => item.scope === scope);
        list.append(el("li", "memory-empty settings-muted", empty ? L("没有符合筛选的记忆") : scope === "project"
          ? L("这个项目还没有记忆：在项目的工作里说“记住……”，或点“添加”。") : L("还没有记住任何事：在对话里说“以后……”或“记住……”，或点“添加”。")));
        return;
      }
      items.forEach((item) => {
        const row = el("li", "memory-row" + (item.state !== "active" ? " is-off" : ""));
        row.dataset.memoryId = item.memory_id;
        const copy = el("div", "memory-row-copy");
        copy.append(el("strong", "memory-text", item.text));
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", L(KIND[item.kind] || item.kind)));
        meta.append(el("span", "memory-tag memory-tag--" + item.source, L(SOURCE[item.source] || item.source) + " " + day(item.created_at)));
        if (item.state !== "active") meta.append(el("span", "memory-tag memory-tag--state", L(STATE[item.state]) + (item.state_reason ? " · " + item.state_reason : "")));
        meta.append(el("span", "", L("适用") + "：" + appliesText(item.applies)));
        meta.append(el("span", "", item.last_used ? L("最近用于") + "：" + item.last_used.title + " · " + day(item.last_used.at) : L("还没有用过")));
        copy.append(meta);
        const origin = el("details", "memory-origin"); origin.append(el("summary", "", L("出处")), el("p", "", item.origin));
        copy.append(origin);
        const actions = el("div", "memory-actions");
        const edit = button(L("修改"), "mw-btn--ghost", L("修改") + "：" + item.text);
        edit.addEventListener("click", () => {
          const editor = itemEditor(item, (value) => api("/change", { memory_id: item.memory_id, action: "update", text: value.text, kind: value.kind, applies: value.applies }));
          row.replaceChildren(editor); editor.querySelector("textarea").focus();
        });
        const toggle = button(L(item.state === "disabled" ? "启用" : "停用"), "mw-btn--ghost", L(item.state === "disabled" ? "启用" : "停用") + "：" + item.text);
        toggle.addEventListener("click", () => run(() => api("/change", { memory_id: item.memory_id, action: item.state === "disabled" ? "enable" : "disable" }), item.state === "disabled" ? "已启用" : "已停用，不会再被使用"));
        const more = el("details", "memory-more mw-menu-host");
        const summary = el("summary", "mw-btn mw-btn--ghost mw-btn--sm", "⋯"); summary.setAttribute("aria-label", L("更多操作") + "：" + item.text);
        const menu = el("div", "memory-menu mw-menu");
        const menuItem = (text, handler, danger) => { const node = el("button", "mw-menu__item" + (danger ? " mw-menu__item--danger" : ""), text); node.type = "button"; node.addEventListener("click", () => { more.open = false; handler(); }); menu.append(node); };
        menuItem(L(item.scope === "project" ? "改为个人记忆" : "改为项目记忆"), () => {
          if (item.scope === "personal" && !project) { fail(new Error(L("在项目的设置里才能改为那个项目的记忆"))); return; }
          run(() => api("/change", { memory_id: item.memory_id, action: "move", to: item.scope === "project" ? "personal" : "project" }), "已改范围");
        });
        menuItem(L("历史版本"), () => historyPanel(item, copy));
        if (item.scope === "project" && project) menuItem(L("升级为项目说明"), () => {
          const target = "/projects/" + encodeURIComponent(project) + "/settings/guidance?draft=" + encodeURIComponent(item.text);
          window.location.assign(target);
        });
        menuItem(L("删除"), () => { if (window.confirm(L("删除后任何地方都不会再用到这条，历史版本也一起删除。确定删除？"))) run(() => api("/change", { memory_id: item.memory_id, action: "remove" }), "已删除"); }, true);
        more.append(summary, menu);
        actions.append(edit, toggle, more);
        row.append(copy, actions);
        list.append(row);
      });
    }

    function paintPrefs() {
      const prefs = (data.prefs) || {};
      root.querySelectorAll("[data-memory-pref]").forEach((box) => {
        const path = box.dataset.memoryPref.split(".");
        const value = path.length === 2 ? (prefs[path[0]] || {})[path[1]] : prefs[path[0]];
        box.checked = Boolean(value);
      });
    }

    function paint() {
      if (!data) return;
      paintSummary(); paintChanges(); paintCandidates(); paintItems(); paintPrefs();
      $("[data-memory-new]").hidden = true;
    }

    root.querySelectorAll("[data-memory-filter]").forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", () => {
      filters[control.dataset.memoryFilter] = control.value; if (data) paintItems();
    }));
    $("[data-memory-add]").addEventListener("click", () => {
      const slot = $("[data-memory-new]");
      const editor = itemEditor(null, (value) => api("/items", { scope, text: value.text, kind: value.kind, applies: value.applies }));
      slot.replaceChildren(editor); slot.hidden = false; editor.querySelector("textarea").focus();
    });
    root.querySelectorAll("[data-memory-pref]").forEach((box) => box.addEventListener("change", () => {
      const path = box.dataset.memoryPref.split(".");
      const prefs = path.length === 2 ? { [path[0]]: { [path[1]]: box.checked } } : { [path[0]]: box.checked };
      run(() => api("/prefs", { scope, prefs }), "已保存");
    }));
    document.addEventListener("click", (event) => root.querySelectorAll(".memory-more[open]").forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; }));
    load().catch(fail);
  };
  globalThis.molisWorkBindMemorySettings = bind;
  const start = () => document.querySelectorAll("[data-memory-settings]").forEach(bind);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
`;
