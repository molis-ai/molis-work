import { MEMORY_CLASS_SETTINGS_CLIENT_SCRIPT, renderMemoryClassSettings } from "./settings-memory-classes.js";
/**
 * The memory settings page (specs/archive/memory-system §10): 个人 → 记忆 in the global settings, and 项目记忆 in a project's
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
    <header class="settings-page-heading memory-heading"><h1 id="memory-title" data-memory-title>${title}</h1><p data-memory-intro>${lead}</p>
      <p class="memory-summary" data-memory-summary aria-live="polite">${L("正在读取…")}</p></header>
    <p class="settings-form-error" data-memory-error role="alert" hidden></p>
    <section class="settings-section" data-memory-retries hidden aria-labelledby="memory-retries-title">
      <h2 id="memory-retries-title">${L("等待重试的操作")}</h2>
      <p class="settings-muted">${L("当前页保留原请求；已接受的遗忘和已确认批量会在重新进入后从服务恢复，不会改用后来版本。")}</p>
      <ul class="memory-list" data-memory-retry-list></ul>
    </section>
    <section class="settings-section memory-changes" aria-labelledby="memory-changes-title" data-memory-changes-section hidden>
      <h2 id="memory-changes-title">${L("最近变动")}</h2>
      <ul class="memory-change-list" data-memory-changes></ul>
    </section>
    <section class="settings-section memory-pairs" aria-labelledby="memory-pairs-title" data-memory-pairs-section>
      <h2 id="memory-pairs-title">${L("可能重复或冲突")}</h2>
      <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-pairs-read>${L("查看可能重复或冲突")}</button>
      <p class="settings-muted">${L("整理时发现的两两一对。选一条保留，另一条会停用（可以随时恢复）；都保留则不再提这一对。")}</p>
      <ul class="memory-list" data-memory-pairs></ul>
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
        <select class="mw-select" data-memory-filter="scene" aria-label="${L("场景")}"><option value="">${L("全部场景")}</option><option value="coding">${L("Coding")}</option><option value="assistant">${L("助理")}</option><option value="common">${L("通用")}</option><option value="unclassified">${L("未归类")}</option></select>
        <select class="mw-select" data-memory-filter="kind" aria-label="${L("类别")}"><option value="">${L("全部类别")}</option><option value="preference">${L("偏好")}</option><option value="convention">${L("约定")}</option><option value="fact">${L("背景事实")}</option><option value="experience">${L("经验")}</option><option value="habit">${L("习惯")}</option><option value="project-decision">${L("项目决策")}</option></select>
        <select class="mw-select" data-memory-filter="lifecycle" aria-label="${L("保留时间")}"><option value="">${L("全部保留类型")}</option><option value="long-term">${L("长期")}</option><option value="short-term">${L("短期")}</option><option value="session">${L("会话内")}</option></select>
        <select class="mw-select" data-memory-filter="source" aria-label="${L("来源")}"><option value="">${L("全部来源")}</option><option value="said">${L("你说的")}</option><option value="accepted">${L("你认可的")}</option><option value="auto">${L("自动记住")}</option><option value="manual">${L("手动添加")}</option><option value="imported">${L("导入")}</option><option value="plugin">${L("插件记下")}</option></select>
        <select class="mw-select" data-memory-filter="state" aria-label="${L("状态")}"><option value="">${L("全部状态")}</option><option value="active">${L("生效")}</option><option value="disabled">${L("停用")}</option><option value="paused">${L("已暂停")}</option></select>
        <select class="mw-select" data-memory-filter="expired" aria-label="${L("到期情况")}"><option value="">${L("全部期限")}</option><option value="true">${L("已到期")}</option><option value="false">${L("未到期")}</option></select>
        <input class="mw-input memory-search" type="search" maxlength="400" data-memory-filter="query" placeholder="${L("搜索记忆")}" aria-label="${L("搜索记忆")}">
      </div>
      <div class="memory-toolbar" data-memory-batch>
        <span class="settings-muted" data-memory-selected aria-live="polite"></span>
        <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-memory-batch-action="disable" disabled>${L("停用选中项…")}</button>
        <button type="button" class="mw-btn mw-btn--danger-outline mw-btn--sm" data-memory-batch-action="remove" disabled>${L("遗忘选中项…")}</button>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-memory-selection-reset>${L("取消选择")}</button>
      </div>
      <ul class="memory-list" data-memory-batch-results aria-live="polite" hidden></ul>
      <div class="memory-editor-slot" data-memory-new hidden></div>
      <ul class="memory-list" data-memory-list><li class="settings-muted">${L("正在读取…")}</li></ul>
      <nav class="memory-toolbar" aria-label="${L("记忆分页")}">
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-previous disabled>${L("上一页")}</button>
        <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-next disabled>${L("下一页")}</button>
        <button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-reload>${L("重新读取")}</button>
        <span class="settings-muted" data-memory-page-status aria-live="polite"></span>
      </nav>
    </section>
    ${renderMemoryClassSettings(L)}
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
    <section class="settings-section memory-data" aria-labelledby="memory-data-title">
      <h2 id="memory-data-title">${L("整理与数据")}</h2>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${L("整理")}</strong><span data-memory-upkeep>${L("每天整理一次：到期和长期没用到的停用，重复的自动记忆合并，依据不在的暂停。")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-upkeep-run>${L("现在整理")}</button></span></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${L("导出")}</strong><span>${L("下载一个记忆包，里面的密钥和本机路径已经去掉。")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-memory-export>${L("导出")}</button></span></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong>${L("导入")}</strong><span>${L("选择一个记忆包；已有的相同内容会跳过，包损坏时一条也不写入。")}</span></span>
        <span class="setting-value"><label class="mw-btn mw-btn--secondary mw-btn--sm memory-import">${L("导入")}<input type="file" accept="application/json,.json" data-memory-import hidden></label></span></div>
      <div class="settings-setting-row"><span class="setting-copy"><strong data-memory-clear-title>${personal ? L("清空个人记忆") : L("清空这个项目的记忆")}</strong><span>${L("先告诉你会删掉几条，确认后删除；删除后任何地方都不会再用到。")}</span></span>
        <span class="setting-value"><button class="mw-btn mw-btn--danger-outline mw-btn--sm" type="button" data-memory-clear>${L("清空…")}</button><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-memory-clear-reset hidden>${L("重新预览…")}</button></span></div>
      <p class="settings-muted" data-memory-clear-status aria-live="polite" hidden></p>
    </section>
    ${personal ? `<p class="settings-muted memory-rules-note">${L("交互规则（例如“写方案时别打断”）由助理按规则执行，在“助理”设置里管理。")} <a href="/settings/assistant">${L("去助理设置")}</a></p>` : ""}
  </section>`;
}

function prefRow(_L: (text: string) => string, key: string, title: string, description: string): string {
  return `<label class="settings-setting-row memory-pref"><span class="setting-copy"><strong>${title}</strong><span>${description}</span></span>
    <span class="setting-value"><span class="mw-switch"><input type="checkbox" role="switch" data-memory-pref="${key}" aria-label="${title}" disabled><span class="mw-switch__track" aria-hidden="true"></span></span></span></label>`;
}

/**
 * Binds one memory page (a standalone settings page, or the same page fetched into the settings cover): safe to call
 * again for a new root. Everything is drawn with textContent; nothing the memories say is ever parsed as markup.
 */
export const MEMORY_SETTINGS_CLIENT_SCRIPT = String.raw`
(() => {
  const bind = (root, context = null) => {
    if (!root || root.dataset.memoryBound === "1") return;
    root.dataset.memoryBound = "1";
    const L = globalThis.L || ((text) => text);
    let scope = root.dataset.memoryScope === "project" ? "project" : "personal";
    const project = root.dataset.project || "";
    const params = new URLSearchParams(context ? context.search : location.search);
    const kind = params.get("memory_session_kind"), sessionId = params.get("memory_session_id");
    const sessionMode = params.has("memory_session_kind") || params.has("memory_session_id");
    const validTarget = !sessionMode || ["coding", "assistant"].includes(kind) && sessionId && sessionId.trim() && sessionId.length <= 200
      && params.getAll("memory_session_kind").length === 1 && params.getAll("memory_session_id").length === 1 && (kind !== "coding" || project);
    const targetBase = target => (target.project_id ? "/projects/" + encodeURIComponent(target.project_id) : "")
      + "/api/memory/sessions/" + target.kind + "/" + encodeURIComponent(target.id);
    const base = sessionMode && validTarget ? targetBase({ kind, id: sessionId, project_id: project || null })
      : (scope === "project" && project ? "/projects/" + encodeURIComponent(project) : "") + "/api/memory";
    const $ = (selector) => root.querySelector(selector);
    const part = name => $("[data-memory-" + name + "]");
    const unread = L("读取未完成，请重新读取。");
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
    const button = (text, variant, label) => { const node = el("button", "mw-btn " + (variant || "mw-btn--ghost") + " mw-btn--sm", text); node.type = "button"; if (label) node.setAttribute("aria-label", label); return node; };
    // Whichever way a dialog closes, focus goes back to the element the person used: focus they have genuinely moved
    // somewhere visible stands, but a stale hidden remnant (the menu item a closed fold hides, the old dialog's own
    // focus) does not block the way back. A trigger that has since been hidden or redrawn away hands focus to a
    // visible fallback — the page's add button, or one the caller names.
    // Shown is more than a box: the focus a closing dialog hands back can still carry geometry from menu content its
    // fold has already closed, so every closed details ancestor decides — only a detail's own first summary line shows.
    const shown = (element) => {
      if (!element || !element.isConnected || !element.getClientRects().length || element.closest("[hidden]")) return null;
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.tagName !== "DETAILS" || ancestor.open) continue;
        const summary = Array.prototype.find.call(ancestor.children, (child) => child.tagName === "SUMMARY");
        if (!summary || !summary.contains(element)) return null;
      }
      return element;
    };
    const focusBack = (trigger, fallback) => {
      if (document.querySelector("dialog[open]")) return;
      const current = document.activeElement;
      // Unset focus — none, the body, the root — is not a choice the person made: the way back stays open.
      const chosen = current instanceof Element && current !== document.body && current !== document.documentElement
        && current !== trigger && shown(current);
      if (chosen) return;
      (shown(trigger) || shown(fallback) || $("[data-memory-add]"))?.focus({ preventScroll: true });
    };
    // A step that cannot be undone asks first, in the catalog's alert dialog (never the browser's own prompt).
    const ask = (title, description, yesLabel, trigger) => new Promise((resolve) => {
      const dialog = el("dialog", "mw-dialog mw-dialog--alert memory-confirm"); dialog.dataset.slot = "alert-dialog";
      const titleId = "memory-confirm-" + Date.now().toString(36); dialog.setAttribute("aria-labelledby", titleId);
      const form = el("form", "mw-form mw-dialog__shell"); form.method = "dialog";
      const header = el("header", "mw-form__header"), heading = el("div"), h2 = el("h2", "", title); h2.id = titleId;
      heading.append(h2, el("p", "", description)); header.append(heading);
      const footer = el("footer", "mw-form__footer"), cancel = el("button", "mw-btn mw-btn--secondary mw-btn--md", L("取消")), yes = el("button", "mw-btn mw-btn--danger mw-btn--md", yesLabel);
      cancel.type = "button"; yes.type = "button"; yes.dataset.memoryConfirmYes = "";
      footer.append(cancel, yes); form.append(header, footer); dialog.append(form);
      let answer = false;
      cancel.addEventListener("click", () => dialog.close());
      yes.addEventListener("click", () => { answer = true; dialog.close(); });
      dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
      dialog.addEventListener("close", () => { dialog.remove(); focusBack(trigger); resolve(answer); });
      root.append(dialog); dialog.showModal(); cancel.focus();
    });
    const KIND = { preference: "偏好", convention: "约定", fact: "背景事实", experience: "经验" };
    const FORMAL_KIND = { ...KIND, habit: "习惯", "project-decision": "项目决策" };
    const CLASS = { coding: "Coding", assistant: "助理", common: "通用", "long-term": "长期", "short-term": "短期", session: "会话内" };
    const SOURCE = { said: "你说的", accepted: "你认可的", auto: "自动记住", manual: "手动添加", imported: "导入", plugin: "插件记下" };
    const STATE = { active: "生效", disabled: "停用", paused: "已暂停" };
    const CHANGE = { kept: "记住", auto_kept: "自动记住", replaced: "替换", auto_replaced: "自动替换", merged: "合并", edited: "修改", restored: "回到旧版本", moved: "改范围",
      disabled: "停用", auto_disabled: "自动停用", enabled: "启用", paused: "已暂停", resumed: "恢复", removed: "删除", accepted: "认可", imported: "导入", cleared: "清空" };
    const day = (iso) => { const date = new Date(iso); return !iso || isNaN(date) ? "" : (date.getMonth() + 1) + "/" + date.getDate(); };
    const appliesText = (applies, itemScope, classification) => {
      const parts = classification?.lifecycle === "session" ? [L("会话内")] : [];
      if (applies && applies.plugin_ids && applies.plugin_ids.length) parts.push(L("插件") + " " + applies.plugin_ids.join("、"));
      if (applies && applies.object_kinds && applies.object_kinds.length) parts.push(L("对象") + " " + applies.object_kinds.join("、"));
      // Goals by name when their plugin can still read them; one it cannot is said so rather than shown as an id.
      if (applies && applies.goal_ids && applies.goal_ids.length) parts.push("Goal " + applies.goal_ids.map((id) => {
        const title = data && data.labels && data.labels.goals ? data.labels.goals[id] : null; return title ? "「" + title + "」" : L("（读不到的 Goal）"); }).join("、"));
      if (applies && applies.task) parts.push(applies.task);
      if (applies && applies.until) parts.push(L("到") + " " + applies.until.slice(0, 10));
      return parts.length ? parts.join(" · ") : L(itemScope === "character" ? "这个角色在本项目承担的工作" : scope === "project" ? "这个项目的所有工作" : "所有工作");
    };
    let data = null, busy = false, removing = false, reading = false, readFailed = false, reader, currentCursor, previous = [], pairsOpened = false;
    const filters = { scene: "", kind: "", lifecycle: "", source: "", state: "", expired: "", query: "" };
    const error = $("[data-memory-error]");
    const board = () => document.querySelector("[data-settings-toast], [data-toast]");
    const toast = (text) => {
      const box = board();
      if (!box) return;
      box.textContent = text; box.classList.remove("is-error"); box.classList.add("is-visible");
      setTimeout(() => box.classList.remove("is-visible"), 2600);
    };
    // The reason shows at the top of the page and, since the action may be far below it, in the toast where the person is.
    const fail = (failure) => { molisWorkRequest.show(error, failure); error.hidden = false; if (board()) molisWorkRequest.toast(board(), failure, undefined, { ms: 5000 }); };
    if (!validTarget) {
      error.textContent = L("会话选择不完整或无效，请从原会话重新打开。"); error.hidden = false;
      part("list").textContent = error.textContent; root.querySelectorAll("button, input, select").forEach(node => { node.disabled = true; }); return;
    }
    if (sessionMode) {
      part("title").textContent = L("本会话记忆");
      part("intro").textContent = L("这里只管理属于本会话的记忆与候选；清除不会删除对话，也不会清除其他会话或长期记忆。");
      part("clear-title").textContent = L("清除本会话全部记忆与候选"); part("clear").textContent = L("清除…");
      root.querySelectorAll(".memory-prefs, [data-memory-classes], [data-memory-pairs-section], [data-memory-changes-section], .memory-rules-note").forEach(node => { node.hidden = true; });
      for (const name of ["upkeep-run", "export", "import"]) part(name).closest(".settings-setting-row").hidden = true;
      if (project) {
        const label = el("label", "memory-toolbar", L("记忆范围")), choices = el("select", "mw-select"); choices.dataset.memoryScopeChoice = ""; choices.setAttribute("aria-label", L("记忆范围"));
        for (const [value, title] of [["personal", "个人"], ["project", "项目"]]) { const option = el("option", "", L(title)); option.value = value; choices.append(option); }
        choices.value = scope; choices.addEventListener("change", () => { scope = choices.value; selected.clear(); invalidateRead(); void load(); }); label.append(choices); root.querySelector(".memory-heading").append(label);
      }
    }
    const api = (path, payload, address = base) => molisWorkRequest(address + path, { body: payload });
    const pendingCommands = new Map(), discovered = new Set(), selected = new Map(), batchPositions = new Map();
    let operationsCursor;
    const pendingRemoval = () => [...pendingCommands.values()].some(command => JSON.parse(command.body).action === "remove" || command.removal || command.path === "/clear");
    const commandTitle = (path, payload, bodyless = false) => {
      const actions = { renew: "续期", reclassify: "纠正分类", update: "修改", disable: "停用", enable: "启用", remove: "删除", move: "改范围", restore: "回到旧版本", items: "添加", import: "导入", undo: "撤销", accept: "认可", discard: "不用" };
      const title = L(actions[payload.action || path.split("/").at(-1)]);
      if (bodyless || payload.action === "remove") return title;
      const subject = payload.text || data?.items?.find(item => item.memory_id === payload.memory_id)?.text
        || data?.candidates?.find(item => path.startsWith("/candidates/" + encodeURIComponent(item.candidate_id) + "/"))?.text;
      return title + (subject ? "：「" + subject + "」" : "");
    };
    const invalidateRead = () => {
      reader?.abort(); reader = undefined; reading = false; readFailed = true;
      for (const [id, command] of pendingCommands) pendingCommands.set(id, Object.freeze({ ...command, title: command.path === "/clear" || command.path === "/clear/apply" || command.path === "/batch/apply" ? command.title : commandTitle(command.path, JSON.parse(command.body), true) }));
      paintRetries();
      if (data) {
        data = { ...data, items: [], candidates: [], changes: [], pairs: [], cursor: undefined, exhausted: false, total: { kind: "unknown" } };
        paint();
      }
      part("list").replaceChildren(el("li", "memory-empty settings-muted", unread)); paintNavigation();
    };
    const dispatch = async (command) => {
      command = pendingCommands.get(command.id) || command;
      const removal = JSON.parse(command.body).action === "remove" || command.path === "/clear" || command.path === "/clear/apply" || command.path === "/batch/apply" && command.removal;
      if (removal) { removing = true; pendingCommands.set(command.id, command); invalidateRead(); }
      try {
        const result = await api(command.path, JSON.parse(command.body), command.base || base);
        if (command.path === "/import") toast(L("导入") + " " + result.written + " " + L("条") + (result.skipped ? " · " + L("跳过") + " " + result.skipped : "") + (result.refused ? " · " + L("没有导入") + " " + result.refused : ""));
        if (command.path === "/batch/apply") paintBatchResults(result.items);
        if (command.path === "/clear/apply") { if (result.complete && clearPreview?.preview_id === JSON.parse(command.body).preview_id) clearPreview = null; paintSessionResults(result.items); showClear(result.complete ? L("本会话清理已完成") : L("本次清理尚未完成，重试仍使用原预览。")); }
        if (command.path === "/clear") showClearResult(result, JSON.parse(command.body).fingerprint);
        if (result.complete === false) {
          pendingCommands.set(command.id, command); paintRetries();
          if (command.path === "/batch/apply") throw new Error(L("这次操作尚未完成，请继续原操作"));
          return result;
        }
        pendingCommands.delete(command.id); discovered.delete(command.id); paintRetries(); return result;
      } catch (failure) { pendingCommands.set(command.id, command); paintRetries(); if (command.path === "/clear/apply") showClear(L("清理结果尚未确认，保留原预览并重试或核对原操作。")); throw failure; }
      finally { if (removal) { removing = false; invalidateRead(); } }
    };
    function paintRetries() {
      $("[data-memory-retries]").hidden = !pendingCommands.size && !operationsCursor;
      $("[data-memory-retries] h2").textContent = L(pendingCommands.size ? "等待重试的操作" : "核对原操作");
      const list = $("[data-memory-retry-list]");
      const existing = new Map([...list.querySelectorAll("[data-memory-command]")].map(row => [row.dataset.memoryCommand, row]));
      for (const command of pendingCommands.values()) {
        const retained = existing.get(command.id);
        if (retained) { retained.querySelector("strong").textContent = command.title; retained.querySelector("button").setAttribute("aria-label", L("重试这次操作") + "：" + command.title); existing.delete(command.id); continue; }
        const row = el("li", "memory-row"), copy = el("strong", "memory-row-copy", command.title);
        const retry = button(L("重试这次操作"), "mw-btn--secondary", L("重试这次操作") + "：" + command.title);
        retry.dataset.memoryRetry = "";
        retry.addEventListener("click", () => run(() => dispatch(command), command.path === "/import" || command.path === "/clear" || command.path === "/clear/apply" ? undefined : "这次操作已完成"));
        row.dataset.memoryCommand = command.id; row.append(copy, retry); list.append(row);
      }
      for (const row of existing.values()) row.remove();
      list.querySelector("[data-memory-more-operations]")?.remove();
      if (operationsCursor) {
        const more = button(L("继续查找原操作"), "mw-btn--secondary");
        more.dataset.memoryMoreOperations = "";
        more.addEventListener("click", async () => {
          more.disabled = true;
          try {
            const result = await api("/operations?" + (sessionMode ? "" : "scope=" + scope + "&") + "cursor=" + encodeURIComponent(operationsCursor));
            if (root.isConnected) restoreCommands(result, false);
          } catch (failure) { if (root.isConnected) fail(failure); }
          finally { more.disabled = false; }
        });
        list.append(more);
      }
    }
    const restoreCommands = (page, replace) => {
      if (replace) { for (const id of discovered) pendingCommands.delete(id); discovered.clear(); }
      for (const item of page.items) {
        const path = item.kind === "session-clear" ? "/clear/apply" : item.kind === "remove" ? "/change" : item.kind === "scope-clear" ? "/clear" : "/batch/apply";
        const payload = item.request ? { ...item.request, operation_id: item.operation_id }
          : item.fingerprint ? { scope: item.scope, fingerprint: item.fingerprint }
          : item.preview_id ? { preview_id: item.preview_id } : undefined;
        if (item.cleanup === "needs-reconcile" || !payload) { fail(new Error(L("原操作需要核对，尚未完成清理"))); continue; }
        const held = item.kind === "session-clear" && [...pendingCommands.values()].find(command => command.path === path && command.body === JSON.stringify(payload) && (command.base || base) === targetBase(item.target));
        const id = held ? held.id : item.operation_id;
        if (!pendingCommands.has(id)) pendingCommands.set(id, Object.freeze({ id, path, ...(item.kind === "session-clear" ? { base: targetBase(item.target) } : {}), body: JSON.stringify(payload),
          title: L(item.forgetting === "accepted" ? "遗忘已接受，继续清理" : "继续原记忆操作"), removal: item.kind !== "batch" || item.action === "remove" }));
        discovered.add(id);
      }
      operationsCursor = page.cursor; paintRetries();
    };
    // The HTTP one-time key is fresh per delivery; the body's operation identity belongs to this exact decision.
    const mutation = () => {
      let previous;
      return (path, payload) => {
        const input = JSON.stringify([path, payload]);
        if (!previous || previous.input !== input || !pendingCommands.has(previous.id)) {
          const id = crypto.randomUUID();
          previous = Object.freeze({ id, input, path, body: JSON.stringify(Object.assign({}, payload, { operation_id: id })), title: commandTitle(path, payload) });
        }
        return dispatch(previous);
      };
    };
    const run = async (work, message) => {
      if (busy) return;
      busy = true; error.hidden = true;
      try { await work(); await load(); if (message) toast(L(message)); }
      catch (failure) { if (pendingRemoval()) await load().catch(fail); fail(failure); }
      finally { busy = false; paintSelection(); }
    };
    const pageInput = (cursor) => {
      const filter = {};
      for (const [key, plural] of [["kind", "kinds"], ["source", "sources"], ["state", "states"], ["lifecycle", "lifecycles"]]) {
        if (filters[key]) filter[plural] = [filters[key]];
      }
      if (filters.scene === "unclassified") filter.unclassified = true;
      else if (filters.scene) filter.scenes = [filters.scene];
      if (filters.expired) filter.expired = filters.expired === "true";
      return { scope, filter, ...(filters.query.trim() ? { query: filters.query.trim() } : {}), ...(cursor ? { cursor } : {}) };
    };
    const readPage = async (cursor, trail, overview = false) => {
      reader?.abort();
      const active = reader = new AbortController(), input = pageInput(cursor);
      reading = true; readFailed = false; error.hidden = true; paintNavigation();
      const request = path => molisWorkRequest(base + path, { signal: active.signal });
      try {
        const first = overview ? await request("/overview?scope=" + scope) : null;
        const page = first && !Object.keys(input.filter).length && !input.query && !cursor ? first
          : await request("/page?input=" + encodeURIComponent(JSON.stringify(input)));
        const operations = await request(sessionMode ? "/operations" : "/operations?scope=" + scope);
        if (reader !== active || !root.isConnected) return;
        restoreCommands(operations, true);
        if (removing) { invalidateRead(); return; }
        data = { ...data, ...first, ...page }; currentCursor = cursor; previous = trail;
        paint();
      } catch (failure) {
        if (reader === active && root.isConnected) {
          readFailed = true; fail(failure);
          part("list").replaceChildren(el("li", "memory-empty settings-muted", unread));
        }
      } finally {
        if (reader === active) { reading = false; paintNavigation(); }
      }
    };
    const readPairs = async () => {
      if (sessionMode) return;
      const active = reader;
      const result = await api("/pairs?scope=" + scope);
      if (reader !== active || !root.isConnected || removing) return; data = { ...data, ...result }; pairsOpened = true; paintPairs();
    };
    const load = async () => { await readPage(undefined, [], true); if (pairsOpened) await readPairs(); };

    function paintNavigation() {
      paintSelection();
      part("list").setAttribute("aria-busy", String(reading));
      part("list").inert = reading || readFailed;
      part("previous").disabled = reading || readFailed || !previous.length;
      const next = part("next"); next.disabled = reading || readFailed || !data?.cursor || data.exhausted;
      next.textContent = L(data && !data.items.length && !data.exhausted ? "继续查找" : "下一页");
      part("reload").disabled = reading;
      part("page-status").textContent = reading ? L("正在读取…") : readFailed ? unread : !data ? ""
        : L("本页显示") + " " + data.items.length + " · " + L(data.exhausted ? "已查完" : "尚未查完，可以继续查找。");
    }

    function paintSummary() {
      const parts = [L(scope === "project" ? "项目记忆" : "个人记忆") + " · " + (data.total.kind === "exact"
        ? data.total.value + " " + L("条") : L("总数未知"))];
      if (data.candidates?.length) parts.push(data.candidates.length + " " + L("条等你认可"));
      part("summary").textContent = parts.join(" · ");
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
          : L(CHANGE[change.kind] || change.kind) + (change.text ? "「" + change.text + "」" : change.memory_id && change.kind !== "removed" ? " · " + L("这条后来被删除了，内容不再保留") : "");
        copy.append(el("strong", "", head));
        const meta = [day(change.at), change.rule, change.reason, change.work ? L("工作") + "「" + change.work.title + "」" : ""].filter(Boolean).join(" · ");
        if (meta) copy.append(el("span", "settings-muted", meta));
        row.append(copy);
        if (change.undoable && change.state === "active") {
          const undo = button(L("撤销"), "mw-btn--secondary", L("撤销") + "：" + (change.text || "")), revert = mutation();
          undo.addEventListener("click", () => run(() => revert("/changes/" + encodeURIComponent(change.change_id) + "/undo", {}), "已撤销"));
          row.append(undo);
        }
        list.append(row);
      });
      paintSelection();
    }

    function paintCandidates() {
      const list = $("[data-memory-candidates]"), candidates = data.candidates || [];
      $("[data-memory-candidates-section]").hidden = !candidates.length;
      list.replaceChildren();
      candidates.forEach((candidate) => {
        const row = el("li", "memory-row memory-row--candidate"), submit = mutation();
        const decide = (action, values = {}) => submit("/candidates/" + encodeURIComponent(candidate.candidate_id) + "/" + action, { ...values, expected_version: candidate.version });
        const copy = el("div", "memory-row-copy");
        copy.append(el("strong", "memory-text", candidate.text));
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", L(KIND[candidate.kind] || candidate.kind)));
        // Held by the gate, the reason it waits is its whole basis: said once, below, not twice.
        if (candidate.why && candidate.why !== candidate.hold_reason) meta.append(el("span", "", L("依据") + "：" + candidate.why));
        if (candidate.work) meta.append(el("span", "", L("工作") + "「" + candidate.work.title + "」"));
        copy.append(meta);
        if (candidate.hold_reason) copy.append(el("span", "memory-hold", candidate.hold_reason));
        const actions = el("div", "memory-actions");
        const keep = button(L("记住"), "mw-btn--primary", L("记住") + "：" + candidate.text);
        keep.addEventListener("click", () => run(() => decide("accept"), "已记住"));
        const reword = button(L("改一下再记"), "mw-btn--ghost");
        reword.addEventListener("click", () => {
          const editor = textEditor(candidate.text, async (text) => { await decide("accept", { text }); }, "已记住");
          row.replaceChildren(editor); editor.querySelector("textarea").focus();
        });
        const drop = button(L("不用"), "mw-btn--ghost", L("不用") + "：" + candidate.text);
        drop.addEventListener("click", () => run(() => decide("discard"), "不会再提这一条"));
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
        event.preventDefault(); if (busy || ok.disabled) return;
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
      kind.value = item ? item.kind : (scope === "project" ? "convention" : "preference");
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
      const active = reader;
      const panel = el("div", "memory-history"); panel.append(el("span", "settings-muted", L("正在读取…")));
      host.append(panel);
      api("/items/" + encodeURIComponent(item.memory_id) + "/history").then((body) => {
        if (reader !== active || !panel.isConnected || removing) return;
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
              if (busy || back.disabled) return;
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
      }).catch((failure) => { if (reader !== active || !panel.isConnected) return; const note = el("span", "settings-form-error"); molisWorkRequest.show(note, failure); panel.replaceChildren(note); });
    }

    function paintSessionResults(items) {
      const list = part("batch-results"); list.replaceChildren(); list.hidden = !items.length;
      const states = { completed: "已完成", "already-absent": "已清除", conflict: "版本冲突", "not-executed": "尚未执行", unknown: "结果未知" };
      for (const [index, item] of items.entries()) {
        const row = el("li", "settings-muted", L("第") + " " + (index + 1) + " " + L("项") + " · " + L(item.kind === "memory-candidate" ? "待审候选" : "正式记忆")
          + " · " + L(states[item.outcome]) + " · " + L(item.forgetting === "accepted" ? "遗忘已接受" : "遗忘未接受") + " · " + L(item.cleanup === "complete" ? "清理完成" : item.cleanup === "pending" ? "清理待继续" : "需要核对"));
        row.dataset.memorySessionItem = item.kind + ":" + (item.kind === "memory-candidate" ? item.candidate_id : item.memory_id); list.append(row);
      }
    }
    function paintBatchResults(items) {
      batchPositions.clear(); items.forEach((item, index) => batchPositions.set(item.memory_id, index + 1));
      const list = part("batch-results"); list.replaceChildren(); list.hidden = !items.length;
      const states = { completed: "已完成", "already-absent": "已清除", conflict: "版本冲突", "not-executed": "尚未执行", unknown: "结果未知" };
      for (const [index, item] of items.entries()) list.append(el("li", "settings-muted", L("第") + " " + (index + 1) + " " + L("项") + " · " + L(states[item.outcome] || "需要核对")
        + (item.cleanup === "needs-reconcile" ? " · " + L("需要核对") : "")));
    }
    function paintSelection() {
      part("batch").hidden = sessionMode || !selected.size && !data?.items?.length;
      part("selection-reset").disabled = !selected.size || busy;
      part("selected").textContent = L("已选") + " " + selected.size;
      root.querySelectorAll("[data-memory-selection-index]").forEach(node => {
        const id = node.closest("[data-memory-id]").dataset.memoryId;
        const index = selected.has(id) ? [...selected.keys()].indexOf(id) + 1 : batchPositions.get(id);
        node.hidden = !index; node.textContent = index ? L("第") + " " + index + " " + L("项") : "";
      });
      root.querySelectorAll("[data-memory-batch-action]").forEach(node => { node.disabled = !selected.size || busy || reading; });
    }
    part("selection-reset").addEventListener("click", () => { selected.clear(); paintItems(); });
    root.querySelectorAll("[data-memory-batch-action]").forEach(node => node.addEventListener("click", () => run(async () => {
      const action = node.dataset.memoryBatchAction;
      const preview = await api("/batch/preview", { scope, action, items: [...selected].map(([memory_id, expected_version]) => ({ memory_id, expected_version })) });
      if (!await ask(L(action === "remove" ? "遗忘选中的记忆？" : "停用选中的记忆？"), L("本次只处理已选中的原版本") + " · " + preview.count + "。" + L("结果按选择时的序号对应"), L("确定"))) return;
      const command = Object.freeze({ id: "memory-batch:" + preview.preview_id, path: "/batch/apply", body: JSON.stringify({ preview_id: preview.preview_id }),
        title: L(action === "remove" ? "遗忘选中项" : "停用选中项"), removal: action === "remove" });
      batchPositions.clear(); [...selected.keys()].forEach((id, index) => batchPositions.set(id, index + 1));
      selected.clear(); paintSelection(); await dispatch(command);
    })));

    function paintItems() {
      const list = $("[data-memory-list]");
      list.replaceChildren(); paintSelection();
      // A project's page also holds the memories of the Characters working in it: each labelled with its Character.
      const mine = (item) => item.scope === scope || (scope === "project" && item.scope === "character");
      const items = (data.items || []).filter(mine);
      if (!items.length) {
        list.append(el("li", "memory-empty settings-muted", L(data.exhausted ? "没有符合筛选的记忆" : "尚未查完，可以继续查找。")));
        return;
      }
      items.forEach((item) => {
        const row = el("li", "memory-row" + (item.state !== "active" ? " is-off" : "")), submit = mutation();
        const change = values => submit("/change", { ...values, memory_id: item.memory_id, expected_version: item.version });
        row.dataset.memoryId = item.memory_id;
        const choice = el("input", ""); choice.type = "checkbox"; choice.dataset.memorySelect = ""; choice.hidden = sessionMode;
        choice.setAttribute("aria-label", L("选择这条记忆") + "：" + item.text); choice.checked = selected.has(item.memory_id);
        choice.addEventListener("change", () => {
          if (choice.checked && selected.size >= 100) { choice.checked = false; fail(new Error(L("一次最多选择100条记忆"))); return; }
          if (choice.checked) selected.set(item.memory_id, item.version); else selected.delete(item.memory_id);
          paintSelection();
        });
        const copy = el("div", "memory-row-copy"), heading = el("label", "memory-toolbar");
        const position = el("span", "settings-muted"); position.dataset.memorySelectionIndex = ""; position.hidden = true;
        heading.append(choice, position, el("strong", "memory-text", item.text)); copy.append(heading);
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", L(FORMAL_KIND[item.kind] || item.kind)));
        meta.append(el("span", "memory-tag", classificationText(item.classification)));
        meta.append(el("span", "", L("有效至") + "：" + expiryText(item.expires_at)));
        if (item.expired) meta.append(el("span", "memory-tag memory-tag--state", L("已到期")));
        if (item.scope === "character") meta.append(el("span", "memory-tag memory-tag--character", L("角色") + "「" + (item.character_title || item.character_id) + "」"));
        if (item.plugin_id) meta.append(el("span", "memory-tag", L("插件") + " " + item.plugin_id));
        meta.append(el("span", "memory-tag memory-tag--" + item.source, L(SOURCE[item.source] || item.source) + " " + day(item.created_at)));
        if (item.state !== "active") { const status = el("span", "memory-tag memory-tag--state", L(STATE[item.state]) + (item.state_reason ? " · " + item.state_reason : "")); status.dataset.mwState = item.state; meta.append(status); }
        meta.append(el("span", "", L("适用") + "：" + appliesText(item.applies, item.scope, item.classification)));
        meta.append(el("span", "", item.last_used ? L("最近参考轮次") + "：" + item.last_used.title + " · " + day(item.last_used.at) : L("暂无已确认参考")));
        copy.append(meta);
        const origin = el("details", "memory-origin"); origin.append(el("summary", "", L("出处")), el("p", "", item.origin));
        copy.append(origin);
        const actions = el("div", "memory-actions");
        const edit = button(L("修改"), "mw-btn--ghost", L("修改") + "：" + item.text);
        edit.addEventListener("click", () => {
          const editor = itemEditor(item, change);
          row.replaceChildren(editor); editor.querySelector("textarea").focus();
        });
        const toggleLabel = item.state === "paused" ? L("恢复使用") : L(item.state === "disabled" ? "启用" : "停用");
        const toggle = button(toggleLabel, "mw-btn--ghost", toggleLabel + "：" + item.text);
        toggle.addEventListener("click", () => run(() => change({ action: item.state === "active" ? "disable" : "enable" }), item.state === "active" ? "已停用，不会再被使用" : "已启用"));
        const more = el("details", "memory-more mw-menu-host");
        const summary = el("summary", "mw-btn mw-btn--ghost mw-btn--sm", "⋯"); summary.setAttribute("aria-label", L("更多操作") + "：" + item.text);
        const menu = el("div", "memory-menu mw-menu");
        const menuItem = (text, handler, danger) => { const node = el("button", "mw-menu__item" + (danger ? " mw-menu__item--danger" : ""), text); node.type = "button"; node.addEventListener("click", () => { more.open = false; handler(); }); menu.append(node); };
        if (item.scope !== "character" && !item.plugin_id) menuItem(L(item.scope === "project" ? "改为个人记忆" : "改为项目记忆"), () => {
          if (item.scope === "personal" && !project) { fail(new Error(L("在项目的设置里才能改为那个项目的记忆"))); return; }
          run(() => change({ action: "move", to: item.scope === "project" ? "personal" : "project" }), "已改范围");
        });
        if (item.expired && item.expires_at && item.classification?.lifecycle !== "session") menuItem(L("续期"), () => {
          const editor = renewalEditor(item, change); copy.replaceChildren(editor); editor.querySelector("input").focus();
        });
        menuItem(L("历史版本"), () => historyPanel(item, copy));
        if (item.scope === "project" && project) menuItem(L("升级为项目说明"), async () => {
          try {
            const prefix = "/projects/" + encodeURIComponent(project);
            const draft = await molisWorkRequest(prefix + "/api/contextual/draft-reference/issue", { body: { purpose: "project-guidance", text: JSON.stringify([item.memory_id, item.version]) } });
            window.location.assign(prefix + "/settings/guidance?draft_ref=" + encodeURIComponent(draft.reference));
          } catch (failure) { fail(failure); }
        });
        menuItem(L("删除"), async () => {
          if (await ask(L("删除这条记忆？"), L("删除后任何地方都不会再用到「{text}」，历史版本也一起删除。", { text: item.text }), L("删除"), summary)) {
            await run(() => change({ action: "remove" }), "已删除");
            // The confirmed delete repaints the list and takes the row's more button away: focus falls to the page's add button.
            focusBack(summary);
          }
        }, true);
        more.append(summary, menu);
        actions.append(edit, toggle, more);
        row.append(copy, actions);
        list.append(row);
      });
    }

    const paintClasses = sessionMode ? () => {} : (${MEMORY_CLASS_SETTINGS_CLIENT_SCRIPT})(L, part, el, button, () => data?.prefs, async rows => {
      // Keep the accepted prefs even when the following list refresh fails.
      data.prefs = (await api("/prefs", { scope, prefs: { class_restrictions: rows } })).prefs;
      await load().catch(fail);
    });

    function paintPrefs() {
      paintClasses();
      const prefs = (data.prefs) || {};
      root.querySelectorAll("[data-memory-pref]").forEach((box) => {
        const path = box.dataset.memoryPref.split(".");
        const value = path.length === 2 ? (prefs[path[0]] || {})[path[1]] : prefs[path[0]];
        box.checked = Boolean(value);
        box.disabled = false;
      });
    }

    function paintPairs() {
      const list = $("[data-memory-pairs]"), pairs = data.pairs || [];
      $("[data-memory-pairs-section]").hidden = false;
      list.replaceChildren();
      pairs.forEach((pair) => {
        const row = el("li", "memory-row memory-row--pair");
        const copy = el("div", "memory-row-copy");
        copy.append(el("span", "memory-tag memory-tag--state", L(pair.kind === "conflict" ? "可能冲突" : "可能重复") + (pair.why ? " · " + pair.why : "")));
        [["a", pair.a], ["b", pair.b]].forEach(([side, item]) => {
          const line = el("div", "memory-pair-line");
          line.append(el("strong", "memory-text", item.text), el("span", "settings-muted", L(SOURCE[item.source] || item.source)));
          const keep = button(L("保留这条"), "mw-btn--secondary", L("保留") + "：" + item.text);
          keep.addEventListener("click", () => run(() => api("/pairs/" + encodeURIComponent(pair.pair_id) + "/resolve", { keep: side }), "已保留，另一条已停用"));
          line.append(keep);
          copy.append(line);
        });
        const both = button(L("两条都留"), "mw-btn--ghost");
        both.addEventListener("click", () => run(() => api("/pairs/" + encodeURIComponent(pair.pair_id) + "/resolve", { keep: "both" }), "都保留了，不会再提这一对"));
        row.append(copy, el("div", "memory-actions"));
        row.lastChild.append(both);
        list.append(row);
      });
    }

    function paintUpkeep() {
      const box = $("[data-memory-upkeep]"), last = data.last_upkeep;
      if (!last) return;
      const done = [last.expired ? L("到期停用") + " " + last.expired : "", last.unused ? L("长期没用停用") + " " + last.unused : "", last.merged ? L("合并") + " " + last.merged : "",
        last.paused ? L("依据不在暂停") + " " + last.paused : "", last.pairs ? L("交给你选") + " " + last.pairs : ""].filter(Boolean).join(" · ");
      box.textContent = L("上次整理") + " " + day(last.at) + " " + new Date(last.at).toTimeString().slice(0, 5) + " · " + (done || L("没有需要处理的"));
    }

    function paint() {
      if (!data) return;
      paintSummary(); if (!sessionMode) { paintChanges(); paintPairs(); paintPrefs(); paintUpkeep(); } paintCandidates(); paintItems(); paintNavigation();
      $("[data-memory-new]").hidden = true;
    }

    root.querySelectorAll("[data-memory-filter]").forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", () => {
      filters[control.dataset.memoryFilter] = control.value; selected.clear(); void readPage(undefined, []);
    }));
    part("pairs-read").addEventListener("click", () => { void readPairs().catch(fail); });
    part("next").addEventListener("click", () => { if (!reading && data?.cursor) void readPage(data.cursor, [...previous, currentCursor]); });
    part("previous").addEventListener("click", () => { if (!reading && previous.length) void readPage(previous.at(-1), previous.slice(0, -1)); });
    part("reload").addEventListener("click", () => { void (sessionMode ? load() : readPage(undefined, [])); });
    window.addEventListener("pagehide", invalidateRead);
    window.addEventListener("pageshow", event => { if (event.persisted && root.isConnected) void load().catch(fail); });
    new MutationObserver((_, observer) => { if (!root.isConnected) { invalidateRead(); observer.disconnect(); } }).observe(document.body, { childList: true, subtree: true });
    $("[data-memory-add]").addEventListener("click", () => {
      const slot = $("[data-memory-new]"), write = mutation();
      const editor = itemEditor(null, (value) => write("/items", { scope, text: value.text, kind: value.kind, applies: value.applies, ...(value.classification ? { classification: value.classification, expires_at: value.expires_at } : {}) }));
      slot.replaceChildren(editor); slot.hidden = false; editor.querySelector("textarea").focus();
    });
    $("[data-memory-upkeep-run]").addEventListener("click", () => run(() => api("/upkeep", {}), "整理好了，结果在最近变动里"));
    $("[data-memory-export]").addEventListener("click", () => run(async () => {
      const body = await api("/export", { scope });
      const blob = new Blob([JSON.stringify(body.package, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "molis-memory-" + scope + "-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, "已导出"));
    const importPackage = mutation();
    $("[data-memory-import]").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      run(async () => {
        let pack;
        try { pack = JSON.parse(await file.text()); } catch { throw new Error(L("这个文件不是记忆包")); }
        await importPackage("/import", { scope, package: pack });
      });
    });
    let clearPreview = null;
    const clearButton = $("[data-memory-clear]"), resetClear = $("[data-memory-clear-reset]"), clearStatus = $("[data-memory-clear-status]");
    const showClear = (message) => {
      clearStatus.textContent = message; clearStatus.hidden = false;
      clearButton.textContent = L(sessionMode ? clearPreview ? "重试本次清理" : "清除…" : clearPreview ? "重试本次清空" : "清空…"); resetClear.hidden = !clearPreview;
    };
    const showClearResult = (done, fingerprint) => {
      clearPreview = done.complete ? null : { fingerprint };
      if (done.complete) {
        showClear(L("清空已完成") + " · " + L("已删除") + " " + done.removed + " " + L("条"));
        toast(clearStatus.textContent);
      } else {
        const count = (outcome) => done.items.filter((item) => item.outcome === outcome).length;
        showClear(L("本次清空尚未完成；重试仍只处理已确认的记忆。") + " · " + L("已删除") + " " + done.removed
          + " · " + L("版本冲突") + " " + count("conflict") + " · " + L("结果未知") + " " + count("unknown") + " · " + L("尚未执行") + " " + count("not-executed"));
      }
    };
    clearButton.addEventListener("click", () => run(async () => {
      if (sessionMode) {
        if (!clearPreview) {
          const preview = await api("/clear/preview", {});
          if (!preview.preview_id) { toast(L("没有可以清除的会话记忆或候选")); return; }
          if (!await ask(L("清除本会话记忆？"), L("正式记忆") + " " + preview.memory_count + " · " + L("待审候选") + " " + preview.candidate_count + "。" + L("只处理本次预览，不删除对话或其他记忆。"), L("确定清除"), clearButton)) return;
          clearPreview = preview;
        }
        await dispatch(Object.freeze({ id: "memory-session-clear:" + clearPreview.preview_id, path: "/clear/apply", body: JSON.stringify({ preview_id: clearPreview.preview_id }), title: L("清除本会话记忆"), removal: true })); return;
      }
      if (!clearPreview) {
        const preview = await api("/preview", { scope });
        if (!preview.count) { toast(L("没有可以清空的记忆")); return; }
        if (!await ask(L("清空这些记忆？"), L("将删除 {count} 条记忆，删除后任何地方都不会再用到。", { count: preview.count }), L("确定清空"), clearButton)) return;
        clearPreview = preview;
      }
      showClear(L("本次清空尚未完成；重试仍只处理已确认的记忆。"));
      await dispatch(Object.freeze({ id: "memory-clear:" + clearPreview.fingerprint, path: "/clear",
        body: JSON.stringify({ scope, fingerprint: clearPreview.fingerprint }), title: L("清空记忆"), removal: true }));
    }));
    resetClear.addEventListener("click", () => run(async () => {
      // The reset ask's own button hides when it lands, so the clear button — visible before and after — is the fallback.
      if (!await ask(L("重新预览清空范围？"), L("停止重试本次确认。已删除的不会恢复；新的清空范围需要重新确认。"), L("重新预览…"), resetClear)) return;
      clearPreview = null; showClear(L("下次清空会重新预览并确认当前范围。"));
      focusBack(resetClear, clearButton);
    }));
    root.querySelectorAll("[data-memory-pref]").forEach((box) => box.addEventListener("change", () => {
      const path = box.dataset.memoryPref.split(".");
      const prefs = path.length === 2 ? { [path[0]]: { [path[1]]: box.checked } } : { [path[0]]: box.checked };
      run(() => api("/prefs", { scope, prefs }), "已保存");
    }));
    document.addEventListener("click", (event) => root.querySelectorAll(".memory-more[open]").forEach((menu) => { if (!menu.contains(event.target)) menu.open = false; }));
    load().catch(fail);
  };
  // The settings directory hands every page it embeds to every binder: only a memory page is this one's.
  globalThis.molisWorkBindMemorySettings = (container = document, context = null) => {
    if (container.matches?.("[data-memory-settings]")) bind(container, context);
    else container.querySelectorAll?.("[data-memory-settings]").forEach(node => bind(node, context));
  };
  const start = () => document.querySelectorAll("[data-memory-settings]").forEach(node => bind(node));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
`;
