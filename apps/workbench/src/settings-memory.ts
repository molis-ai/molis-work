import { MEMORY_CLASS_SETTINGS_CLIENT_SCRIPT } from "./settings-memory-classes.js";
import { MEMORY_IMPORT_CLIENT_SCRIPT } from "./settings-memory-import.js";

export { renderMemorySettings } from "./settings-memory-view.js";

/** Candidate and change cards open the same memory settings owner, using the current project at click time. */
export const MEMORY_SETTINGS_NAVIGATION_FACTORY_SCRIPT = String.raw`(projectFor, L) => (target) => {
  const project = projectFor();
  if (target.scope === "character" && !target.project_id) throw new Error(L("角色建议缺少项目，无法打开设置"));
  const scoped = target.scope === "character" ? target.project_id : target.scope === "project" ? target.project_id || project?.id : "";
  location.assign(scoped ? "/projects/" + encodeURIComponent(scoped) + "/settings/memory" : "/settings/memory");
}`;

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
    const unread = L("读取未完成，请重新读取。");
    const scope = root.dataset.memoryScope === "project" ? "project" : "personal";
    const project = root.dataset.project || "";
    const base = (scope === "project" && project ? "/projects/" + encodeURIComponent(project) : "") + "/api/memory";
    const $ = (selector) => root.querySelector(selector);
    const part = name => $("[data-memory-" + name + "]");
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined && text !== null) node.textContent = text; return node; };
    const button = (text, variant, label) => { const node = el("button", "mw-btn " + (variant || "mw-btn--ghost") + " mw-btn--sm", text); node.type = "button"; if (label) node.setAttribute("aria-label", label); return node; };
    // A step that cannot be undone asks first, in the catalog's alert dialog (never the browser's own prompt).
    const ask = (title, description, yesLabel) => new Promise((resolve) => {
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
      dialog.addEventListener("close", () => { dialog.remove(); resolve(answer); });
      root.append(dialog); dialog.showModal(); cancel.focus();
    });
    const KIND = { preference: "偏好", convention: "约定", fact: "背景事实", experience: "经验" };
    const FORMAL_KIND = { ...KIND, habit: "习惯", "project-decision": "项目决策" };
    const CLASS = { coding: "Coding", assistant: "助理", common: "通用", "long-term": "长期", "short-term": "短期", session: "会话内", habit: "习惯", "project-decision": "项目决策" };
    const SOURCE = { said: "你说的", accepted: "你认可的", auto: "自动记住", manual: "手动添加", imported: "导入", plugin: "插件记下" };
    const STATE = { active: "生效", disabled: "停用", paused: "已暂停" };
    const CHANGE = { kept: "记住", auto_kept: "自动记住", replaced: "替换", auto_replaced: "自动替换", merged: "合并", edited: "修改", restored: "回到旧版本", moved: "改范围",
      disabled: "停用", auto_disabled: "自动停用", enabled: "启用", paused: "已暂停", resumed: "恢复", removed: "删除", accepted: "认可", imported: "导入", cleared: "清空" };
    const day = (iso) => { const date = new Date(iso); return !iso || isNaN(date) ? "" : (date.getMonth() + 1) + "/" + date.getDate(); };
    const appliesText = (applies, itemScope) => {
      const parts = [];
      if (applies?.plugin_ids?.length) parts.push(L("插件") + " " + applies.plugin_ids.join("、"));
      if (applies?.object_kinds?.length) parts.push(L("对象") + " " + applies.object_kinds.join("、"));
      // Goals by name when their plugin can still read them; one it cannot is said so rather than shown as an id.
      if (applies?.goal_ids?.length) parts.push("Goal " + applies.goal_ids.map((id) => {
        const title = data && data.labels && data.labels.goals ? data.labels.goals[id] : null; return title ? "「" + title + "」" : L("（读不到的 Goal）"); }).join("、"));
      if (applies && applies.task) parts.push(applies.task);
      if (applies && applies.until) parts.push(L("到") + " " + applies.until.slice(0, 10));
      return parts.length ? parts.join(" · ") : L(itemScope === "character" ? "这个角色在本项目承担的工作" : scope === "project" ? "这个项目的所有工作" : "所有工作");
    };
    let data = null, busy = false, reading = false, readFailed = false, reader, currentCursor, previous = [], pairsOpened = false, pairsReader;
    const filters = { scene: "", kind: "", lifecycle: "", source: "", state: "", expired: "", query: "" };
    const error = part("error");
    const board = () => document.querySelector("[data-settings-toast], [data-toast]");
    const toast = (text) => {
      const box = board();
      if (!box) return;
      box.textContent = text; box.classList.remove("is-error"); box.classList.add("is-visible");
      setTimeout(() => box.classList.remove("is-visible"), 2600);
    };
    // The reason shows at the top of the page and, since the action may be far below it, in the toast where the person is.
    const fail = (failure) => { molisWorkRequest.show(error, failure); error.hidden = false; if (board()) molisWorkRequest.toast(board(), failure, undefined, { ms: 5000 }); };
    const api = (path, payload) => molisWorkRequest(base + path, { body: payload });
    const paintClasses = (${MEMORY_CLASS_SETTINGS_CLIENT_SCRIPT})(L, part, el, button, () => data?.prefs, async rules => {
      const saved = await api("/prefs", { scope, prefs: { class_restrictions: rules } });
      data.prefs = saved.prefs; await load();
    });
    const pendingCommands = new Map();
    const selected = new Map(), selectionKey = item => JSON.stringify([item.scope, item.owner, item.memory_id]);
    const batchStatus = part("batch-status"), batchResults = part("batch-results");
    const batchStorageKey = "memory-selection:" + base;
    let batchPreview = null, batchRequest = null, batchStorageUnread = false;
    try {
      const saved = JSON.parse(localStorage.getItem(batchStorageKey) || "null");
      if (saved && typeof saved.preview_id === "string" && ["disable", "remove"].includes(saved.action)) batchPreview = saved;
    } catch {
      batchStorageUnread = true; batchStatus.hidden = false;
      batchStatus.textContent = L("无法读取原预览。请恢复浏览器存储后重新打开页面，或明确结束本次操作。");
    }
    const paintSelection = () => {
      part("selected").textContent = L("已选") + " " + selected.size + " / 100";
      part("batch-disable").disabled = part("batch-remove").disabled = !selected.size || !!batchPreview || batchStorageUnread || busy || reading || readFailed;
      part("batch-retry").hidden = !batchPreview; part("batch-retry").disabled = busy;
      root.querySelectorAll("[data-memory-select]").forEach(input => { input.disabled = busy || !!batchPreview || batchStorageUnread; });
      part("selection-reset").textContent = L(batchPreview || batchStorageUnread ? "结束本次操作，重新选择" : "取消勾选");
    };
    const showBatch = (done) => {
      const status = batchStatus, list = batchResults;
      status.hidden = list.hidden = false;
      status.textContent = L(done.complete ? "所选记忆已全部处理完成" : "本次操作尚未完成；重试只处理原预览，已完成项不会重复执行。");
      list.replaceChildren();
      const labels = { completed: "已完成", conflict: "版本冲突", refused: "当前权限拒绝", unknown: "结果未知，可能已有部分清理", "not-executed": "尚未执行" };
      done.items.forEach(item => {
        const original = selected.get(selectionKey(item));
        list.append(el("li", "memory-row", (done.action === "remove" ? item.memory_id : original?.text || item.memory_id) + " · v" + item.expected_version + " · " + L(labels[item.outcome])));
      });
    };
    const applyBatch = async () => {
      try { localStorage.setItem(batchStorageKey, JSON.stringify(batchPreview)); }
      catch { throw new Error(L("无法保存原预览，尚未开始执行。请恢复浏览器存储后重试原预览；关闭页面会丢失本页恢复入口。")); }
      batchStatus.hidden = false;
      batchStatus.textContent = L("正在处理原预览；若中断，请重试原预览。");
      const done = await api("/batch/apply", { preview_id: batchPreview.preview_id, operation_id: crypto.randomUUID() });
      showBatch(done);
      if (done.complete) {
        selected.clear();
        try { localStorage.removeItem(batchStorageKey); batchPreview = batchRequest = null; }
        catch { batchStatus.textContent += " " + L("处理已完成，但原预览引用未能清理；重试只核对原结果，不会重复处理。"); }
      }
      paintSelection();
    };
    const previewBatch = (action) => run(async () => {
      batchStatus.textContent = ""; batchResults.replaceChildren();
      batchStatus.hidden = batchResults.hidden = true;
      const values = [...selected.values()];
      const items = values.map(({ text, ...item }) => item);
      const signature = JSON.stringify({ action, items });
      if (!batchRequest || batchRequest.signature !== signature) batchRequest = { signature, body: { action, items, operation_id: crypto.randomUUID() } };
      const preview = await api("/batch/preview", batchRequest.body);
      const summary = values.map(item => "· " + item.text + " (v" + item.expected_version + ")").join("\n");
      if (!await ask(L(action === "remove" ? "遗忘这些记忆？" : "停用这些记忆？"),
        preview.items.length + " " + L("条已选记忆；后来新增不进入本次操作。") + "\n" + summary, L("确认执行"))) return;
      batchPreview = { preview_id: preview.preview_id, action: preview.action };
      paintSelection(); await applyBatch();
    });
    part("batch-disable").addEventListener("click", () => previewBatch("disable"));
    part("batch-remove").addEventListener("click", () => previewBatch("remove"));
    part("batch-retry").addEventListener("click", () => run(applyBatch));
    part("selection-reset").addEventListener("click", () => {
      if (busy) return;
      try { localStorage.removeItem(batchStorageKey); }
      catch { fail(new Error(L("无法清理原预览引用，本次操作仍保留。请恢复浏览器存储后重试。"))); return; }
      selected.clear(); batchPreview = batchRequest = null; batchStorageUnread = false;
      batchStatus.hidden = batchResults.hidden = true;
      paintItems(); paintSelection();
    });
    paintSelection();

    const commandTitle = (path, payload) => {
      const actions = { renew: "续期", reclassify: "纠正分类", update: "修改", disable: "停用", enable: "启用", remove: "删除", move: "改范围", restore: "回到旧版本", items: "添加", import: "导入", undo: "撤销", accept: "认可", discard: "不用" };
      const title = L(actions[payload.action || path.split("/").at(-1)]);
      const subject = payload.text || data?.items?.find(item => item.memory_id === payload.memory_id)?.text
        || data?.candidates?.find(item => path.startsWith("/candidates/" + encodeURIComponent(item.candidate_id) + "/"))?.text;
      return title + (subject ? "：「" + subject + "」" : "");
    };
    const dispatch = async (command) => {
      try {
        const result = await api(command.path, JSON.parse(command.body));
        if (command.path === "/import") toast(L("导入") + " " + result.written + " " + L("条") + (result.skipped ? " · " + L("跳过") + " " + result.skipped : "") + (result.refused ? " · " + L("没有导入") + " " + result.refused : ""));
        pendingCommands.delete(command.id); paintRetries(); return result;
      } catch (failure) { pendingCommands.set(command.id, command); paintRetries(); throw failure; }
    };
    function paintRetries() {
      part("retries").hidden = !pendingCommands.size;
      const list = part("retry-list"); list.replaceChildren();
      for (const command of pendingCommands.values()) {
        const row = el("li", "memory-row"), copy = el("strong", "memory-row-copy", command.title);
        const retry = button(L("重试这次操作"), "mw-btn--secondary", L("重试这次操作") + "：" + command.title);
        retry.dataset.memoryRetry = "";
        retry.addEventListener("click", () => run(() => dispatch(command), command.path === "/import" ? undefined : "这次操作已完成"));
        row.append(copy, retry); list.append(row);
      }
    }
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
      busy = true; error.hidden = true; paintSelection();
      try { await work(); await load(); if (message) toast(L(message)); }
      catch (failure) { fail(failure); }
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
        if (reader !== active || !root.isConnected) return;
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
    const load = async () => { await readPage(undefined, [], true); if (pairsOpened) await readPairs(); };

    function paintNavigation() {
      part("list").setAttribute("aria-busy", String(reading));
      part("list").inert = reading || readFailed;
      part("previous").disabled = reading || readFailed || !previous.length;
      const next = part("next"); next.disabled = reading || readFailed || !data?.cursor || data.exhausted;
      next.textContent = L(data && !data.items.length && !data.exhausted ? "继续查找" : "下一页");
      part("reload").disabled = reading; paintSelection();
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
      const list = part("changes"), changes = (data.changes || []).filter((change) => change.by !== "person" || change.work).slice(0, 6);
      part("changes-section").hidden = !changes.length;
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
    }

    function paintCandidates() {
      const list = part("candidates"), candidates = data.candidates || [];
      part("candidates-section").hidden = data.candidates !== null && !candidates.length;
      list.replaceChildren();
      if (data.candidates === null) list.append(el("li", "settings-muted", unread));
      candidates.forEach((candidate) => {
        const row = el("li", "memory-row memory-row--candidate"), submit = mutation();
        row.dataset.memoryCandidate = candidate.candidate_id;
        const decide = (action, values = {}) => submit("/candidates/" + encodeURIComponent(candidate.candidate_id) + "/" + action, { ...values, expected_version: candidate.version });
        const copy = el("div", "memory-row-copy");
        copy.append(el("strong", "memory-text", candidate.text));
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", L(KIND[candidate.kind] || candidate.kind)));
        // Held by the gate, the reason it waits is its whole basis: said once, below, not twice.
        if (candidate.why && candidate.why !== candidate.hold_reason) meta.append(el("span", "", L("依据") + "：" + candidate.why));
        if (candidate.work) meta.append(el("span", "", L("工作") + "「" + candidate.work.title + "」"));
        if (candidate.waiting_expires_at) meta.append(el("span", "", L("建议等待至") + "：" + new Date(candidate.waiting_expires_at).toLocaleString()));
        copy.append(meta);
        if (candidate.hold_reason) copy.append(el("span", "memory-hold", candidate.hold_reason));
        const actions = el("div", "memory-actions");
        const keep = button(L("记住"), "mw-btn--primary", L("记住") + "：" + candidate.text);
        const needsDecision = !candidate.classification?.scenes?.length || candidate.classification.scenes.some(scene => !["coding", "assistant", "common"].includes(scene))
          || !["long-term", "short-term"].includes(candidate.classification.lifecycle) || candidate.formal_expires_at === undefined;
        const openDecision = () => { const form = itemEditor({ ...candidate, expires_at: candidate.formal_expires_at }, values => decide("accept", values), "candidate"); row.replaceChildren(form); form.querySelector("textarea").focus(); };
        if (needsDecision) keep.textContent = L("明确分类与期限");
        keep.addEventListener("click", () => needsDecision ? openDecision() : run(() => decide("accept"), "已记住"));
        const reword = button(L("改一下再记"), "mw-btn--ghost");
        reword.addEventListener("click", () => {
          if (needsDecision) { openDecision(); return; }
          const editor = itemEditor(candidate, values => decide("accept", values), "text");
          row.replaceChildren(editor); editor.querySelector("textarea").focus();
        });
        const drop = button(L("不用"), "mw-btn--ghost", L("不用") + "：" + candidate.text);
        drop.addEventListener("click", () => run(() => decide("discard"), "不会再提这一条"));
        actions.append(keep, reword, drop);
        row.append(copy, actions);
        list.append(row);
      });
    }

    const classificationText = classification => classification
      ? classification.scenes.map(scene => L(CLASS[scene] || scene)).concat(L(CLASS[classification.lifecycle] || classification.lifecycle)).join(" · ") : L("未归类");
    const expiryText = expires => expires === undefined ? L("尚未决定") : expires ? new Date(expires).toLocaleString() : L("无固定期限");

    function classificationFields(item, adopting = false) {
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
      if (item.classification?.lifecycle === "session") {
        const option = el("option", "", L("会话内")); option.value = "session"; option.disabled = true; lifecycle.append(option);
      }
      lifecycle.value = item.classification?.lifecycle || "";
      const initialLifecycle = lifecycle.value;
      const expiry = el("select", "mw-select"); expiry.setAttribute("aria-label", L("期限决定")); expiry.dataset.memoryExpiry = "";
      for (const [key, title] of [[adopting && item.expires_at === undefined ? "" : "keep", adopting && item.expires_at === undefined ? "请选择正式期限" : "保留原期限"], ["set", "设置截止时间"], ["remove", "移除固定期限"]]) {
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
        if (item.expired || item.classification?.lifecycle === "session") throw new Error(L(item.expired
          ? "这条记忆已到期，请先在更多操作中明确续期，再纠正分类。" : "会话内记忆需要可信会话绑定，暂不支持在这里纠正分类。"));
        if (!lifecycle.value) throw new Error(L("请选择保留类型"));
        if (!selected.length) throw new Error(L("至少选择一个适用场景"));
        if (!expiry.value) throw new Error(L("请选择正式期限"));
        const expires = expiry.value === "keep" ? item.expires_at : expiry.value === "remove" ? null : new Date(date.value).toISOString();
        if (lifecycle.value === "short-term" && (!expires || Date.parse(expires) <= Date.now())) throw new Error(L("短期记忆需要未来的截止时间"));
        if (expiry.value === "set" && Date.parse(expires) <= Date.now()) throw new Error(L("截止时间必须晚于现在"));
        const classification = { scenes: selected, lifecycle: lifecycle.value };
        const expanded = selected.some(scene => !item.classification?.scenes.includes(scene))
          || (item.classification?.lifecycle === "short-term" && lifecycle.value === "long-term")
          || (item.expires_at && (!expires || Date.parse(expires) > Date.parse(item.expires_at)));
        const removed = (item.classification?.scenes || []).filter(scene => !sceneNames.includes(scene));
        if (item.classification && !["long-term", "short-term", "session"].includes(item.classification.lifecycle)) removed.push(item.classification.lifecycle);
        return { classification, ...(adopting || expiry.value !== "keep" ? { expires_at: expires } : {}),
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

    function itemEditor(item, onSave, mode) {
      const adopting = mode === "candidate";
      const form = el("form", "memory-editor");
      const area = el("textarea", "mw-input memory-editor-text"); area.value = item ? item.text : ""; area.maxLength = 400; area.rows = 2; area.required = true;
      area.placeholder = L("一句能单独读懂的话，例如：周报用要点列表，每条一句"); area.setAttribute("aria-label", L("记忆内容"));
      const row = el("div", "memory-editor-actions"), ok = button(L(adopting ? "记住" : "保存"), "mw-btn--primary"), cancel = button(L("取消"), "mw-btn--ghost");
      ok.type = "submit"; cancel.addEventListener("click", paint); row.append(ok, cancel);
      if (mode === "text") {
        form.append(area, row);
        form.addEventListener("submit", event => { event.preventDefault(); const text = area.value.trim(); if (text) run(() => onSave({ text }), "已记住"); });
        return form;
      }
      const fields = el("div", "memory-editor-fields");
      const kind = el("select", "mw-select"); kind.setAttribute("aria-label", L("类别"));
      if (adopting) kind.dataset.memoryCandidateKind = "";
      const kinds = item ? FORMAL_KIND : KIND;
      Object.keys(kinds).forEach((key) => { const option = el("option", "", L(kinds[key])); option.value = key; kind.append(option); });
      kind.value = item ? item.kind : (scope === "project" ? "convention" : "preference");
      const task = el("input", "mw-input"); task.maxLength = 200; task.placeholder = L("适用于（可选），例如：写周报时"); task.setAttribute("aria-label", L("适用情境"));
      task.value = item && item.applies && item.applies.task ? item.applies.task : "";
      fields.append(kind); if (!adopting) fields.append(task);
      const correction = item ? classificationFields(item, adopting) : null;
      if (adopting) { correction.host.open = true; form.append(el("p", "settings-muted", L("正式记忆的保留时间与建议等待期限分开。请明确这条记忆以后怎样使用。"))); }
      form.append(area, fields); if (correction) form.append(correction.host); form.append(row);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = area.value.trim(); if (!text || busy || ok.disabled) return;
        const applies = Object.assign({}, item ? item.applies : {}); if (task.value.trim()) applies.task = task.value.trim(); else delete applies.task;
        ok.disabled = true;
        try {
          const corrected = correction?.read(adopting || kind.value !== item.kind);
          if (adopting) {
            const { confirmation, ...values } = corrected;
            if (!await ask(L("记住这条建议"), confirmation || classificationText(values.classification) + "；" + L("有效至") + "：" + expiryText(values.expires_at), L("记住"))) return;
            const request = { text, formal: { kind: kind.value, ...values } };
            form.replaceChildren(el("p", "settings-muted", L("正在保存…")));
            return await run(() => onSave(request), "已记住");
          }
          if (corrected) {
            const { confirmation, ...values } = corrected;
            if (confirmation && !await ask(L("确认分类与期限变更？"), confirmation, L("确认保存"))) return;
            await run(() => onSave({ action: "reclassify", kind: kind.value, ...values, ...(text !== item.text ? { text } : {}),
              ...(task.value.trim() !== (item.applies?.task || "") ? { applies } : {}) }), "已保存");
          } else await run(() => onSave({ ...(item ? { action: "update" } : {}), text, kind: kind.value, applies }), item ? "已保存" : "已记住");
        } catch (failure) { fail(failure); }
        finally { ok.disabled = false; }
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
          entry.append(el("span", "settings-muted", L(FORMAL_KIND[revision.kind] || revision.kind) + " · " + classificationText(revision.classification)
            + " · " + L("有效至") + "：" + (revision.expires_at || revision.snapshot_available ? expiryText(revision.expires_at) : L("期限未知"))));
          if (revision.version !== item.version && revision.snapshot_available) {
            const back = button(L("回到这一版"), "mw-btn--link"), restore = mutation();
            back.addEventListener("click", () => run(() => restore("/change", { memory_id: item.memory_id, expected_version: item.version, action: "restore", version: revision.version }), "已回到这一版"));
            entry.append(back);
            entry.append(el("span", "settings-muted", L("恢复时仍会核对当前权限、期限和会话条件。")));
          } else if (revision.version !== item.version) {
            const use = button(L("使用这段旧文字"), "mw-btn--link"), update = mutation();
            use.addEventListener("click", async () => {
              if (await ask(L("使用这段旧文字？"), L("只替换正文，保留当前分类、适用条件、期限、来源和状态。"), L("使用这段旧文字")))
                await run(() => update("/change", { memory_id: item.memory_id, expected_version: item.version, action: "update", text: revision.text }), "已使用旧文字");
            });
            entry.append(el("span", "memory-tag", L("缺少完整快照，不能恢复")), use);
          } else entry.append(el("span", "memory-tag", L("当前")));
          list.append(entry);
        });
        panel.append(list);
      }).catch((failure) => { const note = el("span", "settings-form-error"); molisWorkRequest.show(note, failure); panel.replaceChildren(note); });
    }

    function paintItems() {
      const list = part("list");
      list.replaceChildren();
      const items = data.items;
      if (!items.length) {
        const filtered = previous.length || Object.values(filters).some(Boolean);
        list.append(el("li", "memory-empty settings-muted", !data.exhausted ? L("尚未查完，可以继续查找。") : filtered ? L("没有符合筛选的记忆") : scope === "project"
          ? L("这个项目还没有记忆：在项目的工作里说“记住……”，或点“添加”。") : L("还没有记住任何事：在对话里说“以后……”或“记住……”，或点“添加”。")));
        return;
      }
      items.forEach((item) => {
        const row = el("li", "memory-row memory-row--selectable" + (item.state !== "active" || item.expired ? " is-off" : "")), submit = mutation();
        const change = values => submit("/change", { ...values, memory_id: item.memory_id, expected_version: item.version });
        row.dataset.memoryId = item.memory_id;
        const checkbox = el("input"); checkbox.type = "checkbox"; checkbox.dataset.memorySelect = "";
        checkbox.setAttribute("aria-label", L("选择") + "：" + item.text);
        checkbox.checked = selected.has(selectionKey(item)); checkbox.disabled = !!batchPreview;
        checkbox.addEventListener("change", () => {
          const key = selectionKey(item);
          if (checkbox.checked && !selected.has(key)) {
            if (selected.size >= 100) { checkbox.checked = false; toast(L("一次最多选择 100 条")); return; }
            selected.set(key, { scope: item.scope, owner: item.owner, memory_id: item.memory_id, expected_version: item.version, text: item.text });
          } else selected.delete(key);
          batchRequest = null; paintSelection();
        });

        const copy = el("div", "memory-row-copy");
        copy.append(el("strong", "memory-text", item.text));
        const meta = el("div", "memory-meta");
        meta.append(el("span", "memory-tag", L(KIND[item.kind] || CLASS[item.kind] || item.kind)));
        const classification = item.classification;
        meta.append(el("span", "memory-tag", classification
          ? classification.scenes.map(scene => L(CLASS[scene] || scene)).concat(L(CLASS[classification.lifecycle] || classification.lifecycle)).join(" · ") : L("未归类")));
        if (item.scope === "character") meta.append(el("span", "memory-tag memory-tag--character", L("角色") + "「" + (item.character_title || item.character_id) + "」"));
        if (item.plugin_id) meta.append(el("span", "memory-tag", L("插件") + " " + item.plugin_id));
        meta.append(el("span", "memory-tag memory-tag--" + item.source, L(SOURCE[item.source] || item.source) + " " + day(item.created_at)));
        if (item.state !== "active") { const status = el("span", "memory-tag memory-tag--state", L(STATE[item.state]) + (item.state_reason ? " · " + item.state_reason : "")); status.dataset.mwState = item.state; meta.append(status); }
        if (item.expired || item.expires_at) meta.append(el("span", "memory-tag", L(item.expired ? "已到期" : "有效至") + (item.expires_at ? " " + new Date(item.expires_at).toLocaleString() : "")));
        meta.append(el("span", "", L("适用") + "：" + appliesText(item.applies, item.scope)));
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
        if (item.scope === "project" && project) menuItem(L("升级为项目说明"), () => {
          const target = "/projects/" + encodeURIComponent(project) + "/settings/guidance?draft=" + encodeURIComponent(item.text);
          window.location.assign(target);
        });
        menuItem(L("删除"), async () => {
          if (await ask(L("删除这条记忆？"), L("删除后任何地方都不会再用到这条，历史版本也一起删除。") + "「" + item.text + "」", L("删除"))) run(() => change({ action: "remove" }), "已删除");
        }, true);
        more.append(summary, menu);
        actions.append(edit, toggle, more);
        row.append(checkbox, copy, actions);
        list.append(row);
      });
    }

    function paintPrefs() {
      const prefs = (data.prefs) || {};
      root.querySelectorAll("[data-memory-pref]").forEach((box) => {
        const path = box.dataset.memoryPref.split(".");
        const value = path.length === 2 ? (prefs[path[0]] || {})[path[1]] : prefs[path[0]];
        box.checked = Boolean(value);
        box.disabled = false;
      });
      paintClasses();
    }

    async function readPairs() {
      pairsOpened = true; pairsReader?.abort();
      const active = pairsReader = new AbortController(), open = part("pairs-read"), list = part("pairs");
      open.disabled = true; open.textContent = L("正在读取…"); list.inert = true;
      try {
        const body = await molisWorkRequest(base + "/pairs?scope=" + scope, { signal: active.signal });
        if (pairsReader === active && root.isConnected) { data.pairs = body.pairs; paintPairs(); }
      } catch (failure) {
        if (pairsReader === active && root.isConnected) { data.pairs = null; paintPairs(); fail(failure); }
      } finally {
        if (pairsReader === active) { pairsReader = null; open.disabled = false; open.textContent = L("重新读取"); list.inert = false; }
      }
    }

    function paintPairs() {
      const list = part("pairs"), pairs = data.pairs, open = part("pairs-read");
      open.disabled = Boolean(pairsReader);
      open.textContent = L(pairsReader ? "正在读取…" : pairsOpened ? "重新读取" : "查看可能重复或冲突");
      list.replaceChildren();
      if (!pairs) return;
      if (!pairs.length) list.append(el("li", "settings-muted", L("没有需要处理的")));
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
      const box = part("upkeep"), last = data.last_upkeep;
      if (!last) return;
      const done = [last.expired ? L("到期停用") + " " + last.expired : "", last.unused ? L("长期没用停用") + " " + last.unused : "", last.merged ? L("合并") + " " + last.merged : "",
        last.paused ? L("依据不在暂停") + " " + last.paused : "", last.pairs ? L("交给你选") + " " + last.pairs : ""].filter(Boolean).join(" · ");
      box.textContent = L("上次整理") + " " + day(last.at) + " " + new Date(last.at).toTimeString().slice(0, 5) + " · " + (done || L("没有需要处理的"));
    }

    function paint() {
      if (!data) return;
      paintSummary(); paintChanges(); paintPairs(); paintCandidates(); paintItems(); paintPrefs(); paintUpkeep(); paintNavigation();
      part("new").hidden = true;
    }

    root.querySelectorAll("[data-memory-filter]").forEach((control) => control.addEventListener(control.tagName === "INPUT" ? "input" : "change", () => {
      filters[control.dataset.memoryFilter] = control.value;
      readPage(undefined, [], !data);
    }));
    part("previous").addEventListener("click", () => readPage(previous.at(-1), previous.slice(0, -1)));
    part("next").addEventListener("click", () => readPage(data.cursor, [...previous, currentCursor]));
    part("reload").addEventListener("click", load);
    part("pairs-read").addEventListener("click", readPairs);
    part("add").addEventListener("click", () => {
      const slot = part("new"), write = mutation();
      const editor = itemEditor(null, (value) => write("/items", { scope, text: value.text, kind: value.kind, applies: value.applies }));
      slot.replaceChildren(editor); slot.hidden = false; editor.querySelector("textarea").focus();
    });
    part("upkeep-run").addEventListener("click", () => run(() => api("/upkeep", {}), "整理好了，结果在最近变动里"));
    part("export").addEventListener("click", () => run(async () => {
      const body = await api("/export", { scope });
      const blob = new Blob([JSON.stringify(body.package, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "molis-memory-" + scope + "-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }, "已导出"));
    const importPackage = mutation();
    const prepareImport = (${MEMORY_IMPORT_CLIENT_SCRIPT})({ L, el, button, ask, run }, part("import-editor"),
      pack => importPackage("/import", { scope, package: pack }), { kinds: FORMAL_KIND, classes: CLASS, sources: SOURCE,
        appliesText, expiryText, targetTitle: L(scope === "project" ? "项目记忆" : "个人记忆") });
    part("import").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      run(async () => {
        let pack;
        try { pack = JSON.parse(await file.text()); } catch { throw new Error(L("这个文件不是记忆包")); }
        await prepareImport(pack);
      });
    });
    let clearPreview = null;
    const clearButton = part("clear"), resetClear = part("clear-reset"), clearStatus = part("clear-status");
    const showClear = (message) => {
      clearStatus.textContent = message; clearStatus.hidden = false;
      clearButton.textContent = L(clearPreview ? "重试本次清空" : "清空…"); resetClear.hidden = !clearPreview;
    };
    clearButton.addEventListener("click", () => run(async () => {
      if (!clearPreview) {
        const preview = await api("/preview", { scope });
        if (!preview.count) { toast(L("没有可以清空的记忆")); return; }
        if (!await ask(L("清空这些记忆？"), L("将删除") + " " + preview.count + " " + L("条记忆，删除后任何地方都不会再用到。"), L("确定清空"))) return;
        clearPreview = preview;
      }
      showClear(L("本次清空尚未完成；重试仍只处理已确认的记忆。"));
      const done = await api("/clear", { scope, fingerprint: clearPreview.fingerprint });
      if (done.complete) {
        clearPreview = null;
        showClear(L("清空已完成") + " · " + L("已删除") + " " + done.removed + " " + L("条"));
        toast(clearStatus.textContent);
      } else {
        const count = (outcome) => done.items.filter((item) => item.outcome === outcome).length;
        showClear(L("本次清空尚未完成；重试仍只处理已确认的记忆。") + " · " + L("已删除") + " " + done.removed
          + " · " + L("版本冲突") + " " + count("conflict") + " · " + L("结果未知") + " " + count("unknown") + " · " + L("尚未执行") + " " + count("not-executed"));
      }
    }));
    resetClear.addEventListener("click", () => run(async () => {
      if (!await ask(L("重新预览清空范围？"), L("停止重试本次确认。已删除的不会恢复；新的清空范围需要重新确认。"), L("重新预览…"))) return;
      clearPreview = null; showClear(L("下次清空会重新预览并确认当前范围。"));
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
  globalThis.molisWorkBindMemorySettings = (container = document) => {
    if (container.matches?.("[data-memory-settings]")) bind(container);
    else container.querySelectorAll?.("[data-memory-settings]").forEach(bind);
  };
  const start = () => document.querySelectorAll("[data-memory-settings]").forEach(bind);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
`;
