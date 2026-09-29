import { parseTodoQuickText } from "./quick-parse.js";

/** Todo workbench client: views, quick entry, inline completion, batch changes, the detail editor and undo. */
export const TODO_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-todo=workbench]");
  if (!workbench) return;
  const parseQuick = (${parseTodoQuickText.toString()});
  const $ = (selector) => workbench.querySelector(selector);
  const list = $("[data-todo=directory]");
  const rowsEl = $("[data-todo-rows]");
  const empty = $("[data-todo-empty]");
  const loading = $("[data-todo-loading]");
  const summary = $("[data-todo-summary]");
  const remindersBox = $("[data-todo-reminders]");
  const note = $("[data-todo-note]");
  const noteText = $("[data-todo-note-text]");
  const undoButton = $("[data-todo-undo]");
  const quick = $("[data-todo-quick]");
  const quickInput = $("[data-todo-quick-input]");
  const quickParts = $("[data-todo-quick-parts]");
  const quickPlacement = $("[data-todo-quick-placement]");
  const quickSubmit = $("[data-todo-quick-submit]");
  const search = $("[data-todo-search]");
  const scopeButton = $("[data-todo-scope]");
  const batchBar = $("[data-todo-batch]");
  const workspace = $("[data-todo-stage-workspace]");
  const heading = $("[data-todo-editor-heading]");
  const saveStatus = $("[data-todo-save-status]");
  const detailNote = $("[data-todo-detail-note]");
  const confirmDialog = $("[data-todo-confirm]");
  const field = (name) => workbench.querySelector('[data-todo-field="' + name + '"]');

  const STATUS = { open: L("待处理"), doing: L("进行中"), waiting: L("等待他人"), done: L("已完成"), cancelled: L("已取消") };
  const PLACEMENT = { personal: L("个人"), project: L("这个项目"), unassigned: L("暂未归类") };
  const FLAG = { overdue: L("已逾期"), due_today: L("今天截止"), planned_past: L("计划日已过"), stale: L("很久没动") };
  const EMPTY = {
    today: [L("今天没有要处理的事"), L("有截止日期、计划今天做或正在做的事会出现在这里。")],
    waiting: [L("没有在等别人的事"), L("把一件事的状态改成“等待他人”，写上等谁、等什么。")],
    unscheduled: [L("每件事都有安排了"), L("没有日期的新事项会先放在这里，有空时再安排。")],
    upcoming: [L("未来 7 天没有截止的事"), L("有截止日期的事会按日期出现在这里。")],
    all: [L("还没有待办"), L("在上面记下一件事，例如“周四前给王总回电话”。")],
    closed: [L("还没有完成的事"), L("完成或取消的事会留在这里，可以重新打开。")],
    search: [L("没有找到"), L("换个词，或者到“全部”里看看。")],
  };
  const WEEK = [L("周日"), L("周一"), L("周二"), L("周三"), L("周四"), L("周五"), L("周六")];

  let view = "today";
  let query = "";
  let everything = false;
  let items = [];
  let counts = {};
  let today = "";
  let listSeq = 0;
  let selected = null;
  let history = [];
  let backlinks = [];
  let linkPool = [];
  const picked = new Set();
  let undo = null;
  let noteTimer = 0;
  let saveTimer = 0;
  let saving = null;
  let dirtyFields = new Set();
  let busy = false;
  let quickAttempt = null;
  let dropped = new Set();
  let placementChoice = "";
  const projectId = () => (typeof host.projectId === "function" ? host.projectId() : host.projectId) || "";
  try { placementChoice = window.localStorage.getItem("molis.todo.quick-placement") || ""; } catch { placementChoice = ""; }

  const headers = () => typeof molisWorkControlHeaders === "function" ? molisWorkControlHeaders() : { "content-type": "application/json" };
  const route = (path) => typeof host.route === "function" ? host.route(path) : path;
  const request = async (method, path, body) => {
    const response = await fetch(route(path), { method, headers: headers(), body: body === undefined || method === "GET" ? undefined : JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || L("待办请求失败"));
      error.code = payload.code;
      throw error;
    }
    return payload;
  };

  const pad = (value) => String(value).padStart(2, "0");
  const isoDay = (at) => at.getFullYear() + "-" + pad(at.getMonth() + 1) + "-" + pad(at.getDate());
  const dayDiff = (date) => Math.round((new Date(date + "T00:00:00").getTime() - new Date((today || isoDay(new Date())) + "T00:00:00").getTime()) / 86400000);
  const dayLabel = (date) => {
    if (!date) return "";
    const diff = dayDiff(date);
    if (diff === 0) return L("今天");
    if (diff === 1) return L("明天");
    if (diff === -1) return L("昨天");
    const at = new Date(date + "T00:00:00");
    const sameYear = at.getFullYear() === new Date().getFullYear();
    const written = (sameYear ? L("{m}月{d}日") : L("{y}年{m}月{d}日")).replace("{y}", at.getFullYear()).replace("{m}", at.getMonth() + 1).replace("{d}", at.getDate());
    return written + " " + WEEK[at.getDay()];
  };
  const timeLabel = (iso) => {
    const at = new Date(iso);
    return dayLabel(isoDay(at)) + " " + pad(at.getHours()) + ":" + pad(at.getMinutes());
  };
  const toLocalInput = (iso) => {
    if (!iso) return "";
    const at = new Date(iso);
    return isoDay(at) + "T" + pad(at.getHours()) + ":" + pad(at.getMinutes());
  };
  const fromLocalInput = (value) => value ? new Date(value).toISOString() : null;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const iconSvg = (name) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const arrive = (node) => {
    if (!node) return;
    node.classList.remove("is-arriving");
    void node.offsetWidth;
    node.classList.add("is-arriving");
  };

  const showNote = (text, options = {}) => {
    clearTimeout(noteTimer);
    note.hidden = !text;
    noteText.textContent = text || "";
    note.classList.toggle("is-error", Boolean(options.error));
    undo = options.undo || null;
    undoButton.hidden = !undo;
    if (text && !options.error) noteTimer = setTimeout(() => { note.hidden = true; undo = null; }, options.undo ? 12000 : 4000);
  };
  const showDetailNote = (text, error) => {
    detailNote.hidden = !text;
    detailNote.textContent = text || "";
    detailNote.classList.toggle("is-error", Boolean(error));
  };
  const ask = (message, okLabel) => new Promise((resolve) => {
    confirmDialog.querySelector("[data-confirm-text]").textContent = message;
    confirmDialog.querySelector("[data-confirm-ok]").textContent = okLabel;
    confirmDialog.returnValue = "cancel";
    const onClose = () => { confirmDialog.removeEventListener("close", onClose); resolve(confirmDialog.returnValue === "ok"); };
    confirmDialog.addEventListener("close", onClose);
    confirmDialog.showModal();
  });

  // What the Assistant sees when the person turns to it: the open todo, its revision and unsaved input.
  const publishContext = () => {
    const context = { plugin_id: "io.molis.work.todo", surface_title: L("待办") };
    if (selected) {
      context.object = { kind: "todo_item", id: selected.id, version: selected.revision, title: field("title").value || selected.title };
      context.starters = [
        { label: L("帮我推进这件事"), prompt: L("帮我推进这件待办") },
        { label: L("拆成几步"), prompt: L("把这件待办拆成几个可以直接做的步骤") },
      ];
      if (dirtyFields.size || saveTimer) context.unsaved = true;
    } else {
      context.starters = [
        { label: L("整理材料里要做的事"), prompt: L("帮我整理这些材料里需要我做的事") },
        { label: L("看看有没有遗漏"), prompt: L("看看最近有没有遗漏的待办") },
      ];
    }
    workbench.setAttribute("data-assistant-context", JSON.stringify(context));
  };

  const placementLabel = (item) => item.placement === "project" ? (item.project_id === projectId() ? L("这个项目") : L("其他项目")) : PLACEMENT[item.placement];
  const renderPlacementChoices = (container, current, attribute) => {
    container.replaceChildren();
    ["personal", ...(projectId() ? ["project"] : []), "unassigned"].forEach((value) => {
      const on = value === current;
      const button = make("button", "mw-toggle" + (on ? " is-current" : ""), PLACEMENT[value]);
      button.type = "button";
      button.setAttribute(attribute, value);
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(on));
      container.append(button);
    });
  };
  const quickDefaultPlacement = () => {
    if (placementChoice && (placementChoice !== "project" || projectId())) return placementChoice;
    return projectId() ? "unassigned" : "personal";
  };

  // ---------- quick entry ----------
  const quickState = () => {
    const text = quickInput.value.trim();
    if (!text) return null;
    const parsed = parseQuick(text, new Date());
    const parts = parsed.parts.filter((part) => !dropped.has(part.phrase));
    if (parts.length === parsed.parts.length) return { title: parsed.title, parts };
    // A dropped date goes back into the title as written.
    let title = text;
    parts.forEach((part) => { title = title.replace(part.phrase, " "); });
    return { title: title.replace(/\\s+/g, " ").trim() || text, parts };
  };
  const renderQuick = () => {
    const state = quickState();
    quickSubmit.disabled = !state || busy;
    quickParts.replaceChildren();
    if (!state) return;
    state.parts.forEach((part) => {
      const chip = make("span", "todo-chip todo-chip--" + part.field);
      const label = part.field === "due_date" ? L("截止") : part.field === "planned_date" ? L("计划") : L("提醒");
      chip.append(make("span", "", label + " " + dayLabel(part.date) + (part.time ? " " + part.time : "")));
      chip.title = L("原文：") + part.phrase;
      const remove = make("button", "todo-chip-remove");
      remove.type = "button";
      remove.dataset.todoQuickDrop = part.phrase;
      remove.setAttribute("aria-label", L("不按这个日期"));
      remove.innerHTML = iconSvg("x");
      chip.append(remove);
      quickParts.append(chip);
    });
    if (state.parts.some((part) => part.field === "remind_at")) quickParts.append(make("span", "todo-quick-hint", L("关着应用时不会按时提醒")));
  };
  const viewNameFor = (item) => {
    if (item.status === "waiting") return L("等待中");
    if ((item.planned_date && item.planned_date <= today) || (item.due_date && item.due_date <= today) || item.status === "doing") return L("今天");
    if (!item.planned_date && !item.due_date) return L("未安排");
    if (item.due_date && dayDiff(item.due_date) <= 7) return L("即将到期");
    return L("全部");
  };
  const submitQuick = async () => {
    const state = quickState();
    if (!state || busy) return;
    const input = { title: state.title, placement: quickDefaultPlacement() };
    state.parts.forEach((part) => {
      if (part.field === "due_date") { input.due_date = part.date; if (part.time) input.due_time = part.time; }
      if (part.field === "planned_date") input.planned_date = part.date;
      if (part.field === "remind_at") input.remind_at = new Date(part.date + "T" + (part.time || "09:00") + ":00").toISOString();
    });
    const fingerprint = JSON.stringify(input);
    if (!quickAttempt || quickAttempt.fingerprint !== fingerprint) quickAttempt = { fingerprint, request_id: crypto.randomUUID() };
    setBusy(true);
    try {
      const payload = await request("POST", "/api/todo", { ...input, request_id: quickAttempt.request_id });
      quickAttempt = null;
      quickInput.value = "";
      dropped = new Set();
      renderQuick();
      await load();
      const shown = items.some((entry) => entry.id === payload.item.id);
      const where = shown ? "" : L("，在“{view}”里").replace("{view}", viewNameFor(payload.item));
      showNote(L("已记下「{title}」").replace("{title}", payload.item.title) + where, { undo: { change_id: payload.change_id } });
      arrive(rowsEl.querySelector('[data-todo-row="' + payload.item.id + '"]'));
    } catch (error) {
      showNote(error.message || L("没记下，请再试一次"), { error: true });
    } finally { setBusy(false); quickInput.focus(); }
  };

  // ---------- list ----------
  const summaryText = () => {
    if (query) return L("找到 {count} 件").replace("{count}", items.length);
    if (!items.length) return "";
    if (view === "today") {
      const overdue = items.filter((item) => item.flags.includes("overdue")).length;
      const dueToday = items.filter((item) => item.flags.includes("due_today"));
      const waitingDue = dueToday.filter((item) => item.status === "waiting").length;
      const parts = [];
      if (overdue) parts.push(L("{count} 件已逾期").replace("{count}", overdue));
      if (dueToday.length) parts.push(L("{count} 件今天截止").replace("{count}", dueToday.length) + (waitingDue ? L("，其中 {count} 件还在等别人").replace("{count}", waitingDue) : ""));
      const rest = items.length - overdue - dueToday.length;
      if (rest > 0) parts.push(L("{count} 件计划今天做或正在做").replace("{count}", rest));
      return parts.join("；");
    }
    if (view === "waiting") {
      const due = items.filter((item) => item.waiting && item.waiting.follow_up_on && item.waiting.follow_up_on <= today).length;
      return L("在等 {count} 件事").replace("{count}", items.length) + (due ? L("，{count} 件到了约定的跟进日").replace("{count}", due) : "");
    }
    if (view === "unscheduled") return L("{count} 件还没有日期，有空时安排一下").replace("{count}", items.length);
    if (view === "upcoming") return L("未来 7 天有 {count} 件截止").replace("{count}", items.length);
    return "";
  };
  const groupsFor = () => {
    if (query || view === "waiting" || view === "unscheduled" || view === "closed") return [{ key: "all", title: "", items }];
    if (view === "today") {
      const overdue = items.filter((item) => item.flags.includes("overdue"));
      const replan = items.filter((item) => !item.flags.includes("overdue") && item.flags.includes("planned_past"));
      const rest = items.filter((item) => !overdue.includes(item) && !replan.includes(item));
      return [{ key: "overdue", title: L("已逾期"), items: overdue }, { key: "replan", title: L("计划日已过，重新安排一下"), items: replan }, { key: "today", title: L("今天"), items: rest }].filter((group) => group.items.length);
    }
    if (view === "upcoming") {
      const byDay = new Map();
      items.forEach((item) => { if (!byDay.has(item.due_date)) byDay.set(item.due_date, []); byDay.get(item.due_date).push(item); });
      return [...byDay.entries()].map(([key, group]) => ({ key, title: dayLabel(key), items: group }));
    }
    const keyOf = (item) => item.placement === "project" ? (item.project_id === projectId() ? "project-here" : "project-other") : item.placement;
    const titles = { personal: L("个人"), "project-here": L("这个项目"), "project-other": L("其他项目"), unassigned: L("暂未归类") };
    return ["personal", "project-here", "project-other", "unassigned"].map((key) => ({ key, title: titles[key], items: items.filter((item) => keyOf(item) === key) })).filter((group) => group.items.length);
  };
  const metaFor = (item) => {
    const meta = [];
    if (item.due_date) meta.push(["due", L("截止") + " " + dayLabel(item.due_date) + (item.due_time ? " " + item.due_time : "")]);
    if (item.planned_date && view !== "upcoming") meta.push(["planned", L("计划") + " " + dayLabel(item.planned_date)]);
    if (item.status === "waiting") meta.push(["waiting", L("在等") + (item.waiting && item.waiting.who ? " " + item.waiting.who : "") + (item.waiting && item.waiting.follow_up_on ? " · " + dayLabel(item.waiting.follow_up_on) + L("跟进") : "")]);
    if (item.remind_at && item.status !== "done" && item.status !== "cancelled") meta.push(["remind", L("提醒") + " " + timeLabel(item.remind_at)]);
    if (view !== "all" || query) meta.push(["placement", placementLabel(item)]);
    return meta;
  };
  const renderRow = (item) => {
    const closed = item.status === "done" || item.status === "cancelled";
    const row = make("article", "feed-stage-item todo-row" + (closed ? " is-closed" : "") + (selected && selected.id === item.id ? " is-selected" : ""));
    row.dataset.todoRow = item.id;
    row.setAttribute("role", "listitem");
    const pick = make("input", "mw-check todo-pick");
    pick.type = "checkbox";
    pick.dataset.todoPick = item.id;
    pick.checked = picked.has(item.id);
    pick.setAttribute("aria-label", L("选中「{title}」").replace("{title}", item.title));
    const done = make("button", "todo-done" + (item.status === "done" ? " is-done" : ""));
    done.type = "button";
    done.dataset.todoDone = item.id;
    done.setAttribute("aria-label", (item.status === "done" ? L("重新打开「{title}」") : L("完成「{title}」")).replace("{title}", item.title));
    done.innerHTML = iconSvg(item.status === "done" ? "check" : "circle");
    const open = make("button", "feed-stage-entry directory-list-row todo-entry");
    open.type = "button";
    open.dataset.todoId = item.id;
    const title = make("strong", "todo-title", item.title);
    title.title = item.title;
    const line = make("span", "todo-meta");
    metaFor(item).forEach(([kind, text]) => line.append(make("span", "todo-meta-part todo-meta-part--" + kind, text)));
    const trail = make("span", "todo-trail");
    if (item.important) trail.append(make("span", "mw-status mw-status--attention", L("重要")));
    item.flags.filter((flag) => FLAG[flag]).forEach((flag) => trail.append(make("span", "mw-status mw-status--" + (flag === "overdue" ? "blocked" : flag === "stale" ? "quiet" : "attention"), FLAG[flag])));
    if (item.status === "doing" || item.status === "cancelled" || (item.status === "waiting" && view !== "waiting")) trail.append(make("span", "mw-status mw-status--" + (item.status === "doing" ? "progress" : "quiet"), STATUS[item.status]));
    open.append(title, line, trail);
    row.append(pick, done, open);
    return row;
  };
  const renderList = () => {
    const top = list.scrollTop;
    loading.hidden = true;
    rowsEl.replaceChildren();
    const emptyKey = query ? "search" : view;
    empty.hidden = items.length > 0;
    $("[data-todo-empty-title]").textContent = EMPTY[emptyKey][0];
    $("[data-todo-empty-text]").textContent = EMPTY[emptyKey][1];
    groupsFor().forEach((group) => {
      if (!group.title) { group.items.forEach((item) => rowsEl.append(renderRow(item))); return; }
      const fold = make("details", "goal-collection-fold todo-group");
      fold.open = true;
      fold.dataset.todoGroup = group.key;
      const head = make("summary");
      head.innerHTML = '<span class="goal-collection-caret">' + iconSvg("chevron-down") + "</span>";
      head.append(make("strong", "", group.title), make("span", "", String(group.items.length)));
      fold.append(head);
      group.items.forEach((item) => fold.append(renderRow(item)));
      rowsEl.append(fold);
    });
    summary.textContent = summaryText();
    summary.hidden = !summary.textContent;
    workbench.querySelectorAll("[data-todo-view]").forEach((button) => {
      const on = button.dataset.todoView === view;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-pressed", String(on));
      const count = counts[button.dataset.todoView];
      button.textContent = button.dataset.todoViewLabel + (count && !["all", "closed"].includes(button.dataset.todoView) ? " " + count : "");
    });
    scopeButton.setAttribute("aria-pressed", String(everything));
    scopeButton.classList.toggle("is-current", everything);
    scopeButton.hidden = !projectId();
    renderBatch();
    list.scrollTop = top;
  };
  const load = async () => {
    const seq = ++listSeq;
    const params = new URLSearchParams({ view: query ? "all" : view });
    if (query) params.set("q", query);
    if (everything) params.set("all", "1");
    const payload = await request("GET", "/api/todo?" + params.toString());
    if (seq !== listSeq) return;
    if (query) {
      params.set("view", "closed");
      const closed = await request("GET", "/api/todo?" + params.toString());
      if (seq !== listSeq) return;
      payload.items = [...payload.items, ...closed.items];
    }
    items = payload.items || [];
    counts = payload.counts || {};
    void loadReminders().catch(() => {});
    today = payload.today || isoDay(new Date());
    for (const id of [...picked]) if (!items.some((item) => item.id === id)) picked.delete(id);
    renderList();
  };

  // ---------- reminders ----------
  let reminders = [];
  let reminderSeq = 0;
  const laterOptions = () => {
    const now = new Date();
    const at = (hours, minutes, dayOffset) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hours, minutes); return d; };
    const tonight = at(20, 0, 0);
    return [
      [L("15 分钟后"), new Date(now.getTime() + 15 * 60000)],
      [L("1 小时后"), new Date(now.getTime() + 60 * 60000)],
      ...(tonight.getTime() - now.getTime() > 30 * 60000 ? [[L("今晚 20:00"), tonight]] : []),
      [L("明早 9:00"), at(9, 0, 1)],
    ];
  };
  const renderReminders = () => {
    remindersBox.hidden = reminders.length === 0;
    const late = reminders.filter((entry) => entry.late).length;
    $("[data-todo-reminders-title]").textContent = late === reminders.length && late > 1
      ? L("错过了 {count} 条提醒（当时应用没打开）").replace("{count}", late)
      : L("到了时间的提醒");
    const box = $("[data-todo-reminder-rows]");
    box.replaceChildren();
    reminders.forEach(({ item, late: missed }) => {
      const row = make("div", "todo-reminder");
      row.dataset.todoReminder = item.id;
      const text = make("div", "todo-reminder-text");
      const title = make("button", "mw-btn mw-btn--link", item.title);
      title.type = "button";
      title.dataset.todoId = item.id;
      text.append(title, make("small", "", (missed ? L("错过：") : "") + timeLabel(item.remind_at)));
      const actions = make("div", "todo-reminder-actions");
      const button = (label, attrs) => { const node = make("button", "mw-btn mw-btn--ghost", label); node.type = "button"; Object.assign(node.dataset, attrs); return node; };
      const later = make("details", "todo-reminder-later");
      const summaryNode = make("summary", "mw-btn mw-btn--ghost", L("稍后"));
      const menu = make("div", "mw-menu");
      menu.setAttribute("role", "menu");
      laterOptions().forEach(([label, when]) => { const option = button(label, { todoReminderLater: item.id, todoReminderAt: when.toISOString() }); option.className = "mw-menu__item"; menu.append(option); });
      later.append(summaryNode, menu);
      actions.append(button(L("完成"), { todoReminderDone: item.id }), later, button(L("知道了"), { todoReminderAck: item.id }), button(L("关闭提醒"), { todoReminderClose: item.id }));
      row.append(text, actions);
      box.append(row);
    });
  };
  const loadReminders = async () => {
    const seq = ++reminderSeq;
    const payload = await request("GET", "/api/todo/reminders");
    if (seq !== reminderSeq) return;
    reminders = payload.reminders || [];
    renderReminders();
  };

  // ---------- batch ----------
  const renderBatch = () => {
    batchBar.hidden = picked.size === 0;
    $("[data-todo-batch-count]").textContent = L("已选 {count} 件").replace("{count}", picked.size);
    batchBar.querySelector('[data-todo-batch-action="archive"]').hidden = view !== "closed";
    workbench.setAttribute("data-todo-picking", picked.size ? "true" : "false");
  };
  const runBatch = async (change, doneText) => {
    const ids = [...picked];
    const expected = Object.fromEntries(items.filter((item) => picked.has(item.id)).map((item) => [item.id, item.revision]));
    const payload = await request("POST", "/api/todo/batch", { ids, change, expected_revisions: expected });
    picked.clear();
    await load();
    if (selected && ids.includes(selected.id)) await openDetail(selected.id, true);
    showNote(doneText.replace("{count}", ids.length), { undo: { batch_id: payload.batch_id } });
  };

  // ---------- detail ----------
  const setBusy = (value) => {
    busy = value;
    workbench.setAttribute("aria-busy", String(value));
    quickSubmit.disabled = value || !quickInput.value.trim();
  };
  const paintSave = () => {
    saveStatus.textContent = saving ? L("保存中") : dirtyFields.size ? L("尚未保存") : selected ? STATUS[selected.status] : "";
    const tone = saving || dirtyFields.size ? "quiet" : selected && selected.status === "done" ? "done" : selected && selected.status === "doing" ? "progress" : "quiet";
    saveStatus.className = "mw-status mw-status--" + tone;
    publishContext();
  };
  const SOURCE_KIND = { manual: L("手动"), material: L("材料"), assistant: L("助理"), onboarding: L("开始使用时"), inbox: "Inbox" };
  const renderSources = (item) => {
    const box = $("[data-todo-sources]");
    box.replaceChildren();
    item.sources.forEach((source) => {
      const entry = make("div", "todo-source");
      const head = make("div", "todo-source-head");
      head.append(make("span", "todo-link-kind", SOURCE_KIND[source.kind] || ""), make("strong", "", source.title), make("small", "", timeLabel(source.added_at)));
      entry.append(head);
      if (source.reason) entry.append(make("p", "", source.reason));
      if (source.excerpt) entry.append(make("blockquote", "", source.excerpt));
      box.append(entry);
    });
  };
  const RELATION = { blocked_by: L("要等它先完成"), blocks: L("它在等这件"), split_from: L("拆分自"), merged: L("合并自"), related: L("相关") };
  const renderLinks = (item) => {
    const box = $("[data-todo-links]");
    box.replaceChildren();
    const rows = [
      ...item.links.map((link) => ({ link, text: link.title, target: link.kind === "todo" ? link.subject.id : "",
        detail: link.kind === "todo" ? RELATION[link.relation] : link.kind === "outcome" ? (link.outcome === "done" ? L("已完成的动作") : L("草稿")) : link.kind === "goal" ? "Goal" : link.kind === "work" ? L("助理工作") : L("材料") })),
      ...backlinks.map((back) => ({ text: back.title, target: back.item_id, detail: back.relation === "blocked_by" ? L("在等这件") : back.relation === "blocks" ? L("要等它先完成") : L("相关") })),
    ];
    if (!rows.length) box.append(make("p", "todo-muted", L("还没有关联。")));
    rows.forEach((entry) => {
      const line = make("div", "todo-link");
      const name = entry.target ? make("button", "mw-btn mw-btn--link", entry.text) : make("span", "", entry.text);
      if (entry.target) { name.type = "button"; name.dataset.todoOpenLinked = entry.target; }
      line.append(make("span", "todo-link-kind", entry.detail), name);
      if (entry.link) {
        const remove = make("button", "mw-btn mw-btn--ghost mw-btn--icon-only");
        remove.type = "button";
        remove.dataset.todoUnlink = entry.link.link_id;
        remove.setAttribute("aria-label", L("去掉这项关联"));
        remove.innerHTML = iconSvg("x");
        line.append(remove);
      }
      box.append(line);
    });
    const select = $("[data-todo-link-target]");
    select.replaceChildren(new Option(L("选一件待办"), ""));
    // Any active todo can be linked, not only the ones in the current view.
    linkPool.filter((other) => other.id !== item.id && !item.links.some((link) => link.subject.id === other.id)).forEach((other) => select.append(new Option(other.title, other.id)));
  };
  const FIELD_NAME = { title: L("标题"), notes: L("说明"), due_date: L("截止日期"), due_time: L("截止时间"), planned_date: L("计划日期"), remind_at: L("提醒"), placement: L("归属"), important: L("重要"), waiting: L("等待"), project_id: L("归属") };
  const describe = (change) => {
    const actor = change.actor === "user" ? L("你") : change.actor === "assistant" ? L("助理") : L("其他入口");
    if (change.kind === "create") return actor + L("创建");
    if (change.kind === "status") return actor + L("改为") + STATUS[change.after.status];
    if (change.kind === "archive") return actor + L("归档");
    if (change.kind === "unarchive") return actor + L("取回");
    if (change.kind === "link") return actor + (change.after.link_added ? L("关联了「{title}」").replace("{title}", change.after.link_added.title) : L("去掉了一项关联"));
    if (change.kind === "revert") return actor + L("撤销了一次修改");
    return actor + L("改了") + " " + [...new Set(Object.keys(change.after).map((key) => FIELD_NAME[key]).filter(Boolean))].join("、");
  };
  const renderHistory = () => {
    const box = $("[data-todo-history]");
    box.replaceChildren();
    const latest = history.find((change) => change.kind !== "revert");
    history.forEach((change) => {
      const entry = make("li", change.reverted_by ? "is-reverted" : "");
      entry.append(make("time", "", timeLabel(change.at)), make("span", "", describe(change) + (change.reverted_by ? L("（已撤销）") : "")));
      if (change === latest && !change.reverted_by && selected && change.revision_after === selected.revision) {
        const button = make("button", "mw-btn mw-btn--link", change.kind === "create" ? L("撤销创建") : L("撤销"));
        button.type = "button";
        button.dataset.todoRevert = change.change_id;
        entry.append(button);
      }
      box.append(entry);
    });
  };
  const fillEditor = (item) => {
    selected = item;
    dirtyFields = new Set();
    clearTimeout(saveTimer); saveTimer = 0;
    const opening = workspace.hidden;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    if (opening) arrive(workspace);
    heading.textContent = item.title;
    field("title").value = item.title;
    field("notes").value = item.notes;
    field("due_date").value = item.due_date || "";
    field("due_time").value = item.due_time || "";
    field("planned_date").value = item.planned_date || "";
    field("remind_at").value = toLocalInput(item.remind_at);
    field("important").checked = item.important;
    field("waiting.who").value = item.waiting ? item.waiting.who : "";
    field("waiting.what").value = item.waiting ? item.waiting.what : "";
    field("waiting.follow_up_on").value = item.waiting && item.waiting.follow_up_on ? item.waiting.follow_up_on : "";
    $("[data-todo-waiting]").hidden = item.status !== "waiting";
    $("[data-todo-remind-hint]").hidden = !item.remind_at;
    workbench.querySelectorAll("[data-todo-status]").forEach((button) => {
      const on = button.dataset.todoStatus === item.status;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-pressed", String(on));
    });
    renderPlacementChoices($("[data-todo-placement-choices]"), item.placement === "project" && item.project_id !== projectId() ? "" : item.placement, "data-todo-placement");
    const archiveButton = $("[data-todo-archive]");
    archiveButton.textContent = item.archived_at ? L("取回") : L("归档");
    archiveButton.disabled = !item.archived_at && item.status !== "done" && item.status !== "cancelled";
    archiveButton.title = archiveButton.disabled ? L("完成或取消后才能归档") : "";
    renderSources(item);
    renderLinks(item);
    renderHistory();
    showDetailNote("");
    paintSave();
    rowsEl.querySelectorAll("[data-todo-row]").forEach((row) => row.classList.toggle("is-selected", row.dataset.todoRow === item.id));
  };
  const openDetail = async (id, keepEdits) => {
    const [payload, pool] = await Promise.all([request("GET", "/api/todo/" + encodeURIComponent(id)),
      request("GET", "/api/todo?view=all" + (everything ? "&all=1" : "")).catch(() => ({ items: [] }))]);
    history = payload.history || [];
    backlinks = payload.backlinks || [];
    linkPool = pool.items || [];
    if (keepEdits && selected && selected.id === id && dirtyFields.size) { selected = payload.item; paintSave(); return; }
    fillEditor(payload.item);
  };
  const patchFromEditor = () => {
    const patch = {};
    for (const name of dirtyFields) {
      if (name === "waiting") patch.waiting = { who: field("waiting.who").value.trim(), what: field("waiting.what").value.trim(), follow_up_on: field("waiting.follow_up_on").value || null };
      else if (name === "important") patch.important = field("important").checked;
      else if (name === "remind_at") patch.remind_at = fromLocalInput(field("remind_at").value);
      else if (name === "title" || name === "notes") patch[name] = field(name).value;
      else patch[name] = field(name).value || null;
    }
    return patch;
  };
  const flush = async () => {
    clearTimeout(saveTimer); saveTimer = 0;
    if (saving) await saving.catch(() => {});
    if (!selected || !dirtyFields.size) return;
    if (dirtyFields.has("title") && !field("title").value.trim()) { showDetailNote(L("标题不能是空的"), true); return; }
    const patch = patchFromEditor();
    const sent = new Set(dirtyFields);
    dirtyFields = new Set();
    const target = selected;
    const run = async () => {
      try {
        const payload = await request("POST", "/api/todo/" + encodeURIComponent(target.id), { ...patch, expected_revision: target.revision });
        const detail = await request("GET", "/api/todo/" + encodeURIComponent(target.id));
        if (!selected || selected.id !== target.id) return;
        selected = payload.item;
        heading.textContent = selected.title;
        history = detail.history || [];
        backlinks = detail.backlinks || [];
        renderHistory();
        $("[data-todo-remind-hint]").hidden = !selected.remind_at;
        showDetailNote("");
        void load().catch(() => {});
      } catch (error) {
        sent.forEach((name) => dirtyFields.add(name));
        showDetailNote(error.code === "todo.conflict" ? L("这件待办已在别处修改，你的输入还在。复制需要保留的内容后点“更多 → 重新读取”。") : error.message, true);
        throw error;
      }
    };
    saving = run().finally(() => { saving = null; paintSave(); });
    paintSave();
    await saving.catch(() => {});
  };
  const queueSave = (name) => {
    dirtyFields.add(name);
    paintSave();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = 0; void flush(); }, ["title", "notes", "waiting"].includes(name) ? 600 : 50);
  };
  const closeDetail = async () => {
    await flush();
    selected = null;
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    rowsEl.querySelectorAll(".is-selected").forEach((row) => row.classList.remove("is-selected"));
    publishContext();
  };
  const setStatus = async (id, status, revision) => {
    const payload = await request("POST", "/api/todo/" + encodeURIComponent(id) + "/status", { status, expected_revision: revision });
    await load();
    if (selected && selected.id === id) await openDetail(id, true);
    const text = status === "done" ? L("已完成「{title}」") : status === "open" ? L("已重新打开「{title}」") : L("「{title}」已改为") + STATUS[status];
    showNote(text.replace("{title}", payload.item.title), { undo: payload.change_id ? { change_id: payload.change_id } : null });
    const row = rowsEl.querySelector('[data-todo-row="' + id + '"]');
    if (status === "done" && row && window.molisCraft && typeof window.molisCraft.celebrate === "function") window.molisCraft.celebrate(row);
  };

  // ---------- events ----------
  quickInput.addEventListener("input", () => { dropped = new Set(); renderQuick(); });
  quickInput.addEventListener("keydown", (event) => {
    // An Enter that confirms an IME composition must not submit.
    if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault();
  });
  quick.addEventListener("submit", (event) => { event.preventDefault(); void submitQuick(); });
  let searchTimer = 0;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = search.value.trim(); picked.clear(); void load().catch((error) => showNote(error.message, { error: true })); }, 250);
  });
  workbench.addEventListener("change", (event) => {
    const pick = event.target.closest("[data-todo-pick]");
    if (pick) { if (pick.checked) picked.add(pick.dataset.todoPick); else picked.delete(pick.dataset.todoPick); renderBatch(); return; }
    const target = event.target.closest("[data-todo-field]");
    if (target && selected) queueSave(target.dataset.todoField.startsWith("waiting.") ? "waiting" : target.dataset.todoField);
  });
  workbench.addEventListener("input", (event) => {
    const target = event.target.closest("[data-todo-field]");
    if (!target || !selected || ["checkbox", "date", "time", "datetime-local"].includes(target.type)) return;
    queueSave(target.dataset.todoField.startsWith("waiting.") ? "waiting" : target.dataset.todoField);
  });
  workbench.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.closest("dialog") || button.disabled) return;
    try {
      if (button.matches("[data-todo-view]")) { view = button.dataset.todoView; picked.clear(); await load(); return; }
      if (button.matches("[data-todo-scope]")) { everything = !everything; await load(); return; }
      if (button.matches("[data-todo-quick-drop]")) { dropped.add(button.dataset.todoQuickDrop); renderQuick(); quickInput.focus(); return; }
      if (button.matches("[data-todo-quick-placement-choice]")) {
        placementChoice = button.dataset.todoQuickPlacementChoice;
        try { window.localStorage.setItem("molis.todo.quick-placement", placementChoice); } catch {}
        renderPlacementChoices(quickPlacement, quickDefaultPlacement(), "data-todo-quick-placement-choice");
        return;
      }
      if (button.matches("[data-todo-undo]") && undo) {
        const target = undo;
        undo = null; undoButton.hidden = true;
        const payload = await request("POST", "/api/todo/revert", target);
        await load();
        if (selected && payload.removed_ids.includes(selected.id)) await closeDetail();
        else if (selected) await openDetail(selected.id, true);
        showNote(L("已撤销"));
        return;
      }
      if (button.matches("[data-todo-done]")) {
        const item = items.find((entry) => entry.id === button.dataset.todoDone);
        if (item) await setStatus(item.id, item.status === "done" ? "open" : "done", item.revision);
        return;
      }
      if (button.matches("[data-todo-id]")) { await flush(); await openDetail(button.dataset.todoId); return; }
      const reminder = reminders.find((entry) => [button.dataset.todoReminderDone, button.dataset.todoReminderAck, button.dataset.todoReminderClose, button.dataset.todoReminderLater].includes(entry.item.id));
      if (reminder) {
        const item = reminder.item;
        if (button.dataset.todoReminderAck) {
          await request("POST", "/api/todo/" + encodeURIComponent(item.id) + "/acknowledge", {});
          await loadReminders();
          return;
        }
        if (button.dataset.todoReminderDone) { await setStatus(item.id, "done", item.revision); return; }
        const remindAt = button.dataset.todoReminderLater ? button.dataset.todoReminderAt : null;
        if (button.dataset.todoReminderLater) button.closest("details").open = false;
        const payload = await request("POST", "/api/todo/" + encodeURIComponent(item.id), { remind_at: remindAt, expected_revision: item.revision });
        await load();
        if (selected && selected.id === item.id) await openDetail(item.id, true);
        showNote(remindAt ? L("会在 {time} 再提醒「{title}」").replace("{time}", timeLabel(remindAt)).replace("{title}", item.title) : L("已关闭「{title}」的提醒").replace("{title}", item.title),
          { undo: payload.change_id ? { change_id: payload.change_id } : null });
        return;
      }
      if (button.matches("[data-todo-open-linked]")) { await flush(); await openDetail(button.dataset.todoOpenLinked); return; }
      if (button.matches("[data-todo-back]")) { await closeDetail(); return; }
      if (button.matches("[data-todo-batch-action]")) {
        const action = button.dataset.todoBatchAction;
        if (action === "clear") { picked.clear(); renderList(); return; }
        if (action === "done") await runBatch({ status: "done" }, L("已完成 {count} 件"));
        if (action === "shift") await runBatch({ shift_days: 1 }, L("已把 {count} 件推后一天"));
        if (action === "today") await runBatch({ planned_date: today }, L("已把 {count} 件安排到今天"));
        if (action === "unplan") await runBatch({ planned_date: null }, L("已取消 {count} 件的计划日期"));
        if (action === "archive") await runBatch({ archive: true }, L("已归档 {count} 件"));
        return;
      }
      if (button.matches("[data-todo-batch-placement]")) {
        button.closest("details").open = false;
        await runBatch({ placement: button.dataset.todoBatchPlacement }, L("已把 {count} 件移到") + PLACEMENT[button.dataset.todoBatchPlacement]);
        return;
      }
      if (!selected) return;
      if (button.matches("[data-todo-status]")) {
        await flush();
        await setStatus(selected.id, button.dataset.todoStatus, selected.revision);
        return;
      }
      if (button.matches("[data-todo-placement]")) {
        await flush();
        const payload = await request("POST", "/api/todo/" + encodeURIComponent(selected.id), { placement: button.dataset.todoPlacement, expected_revision: selected.revision });
        await load(); await openDetail(payload.item.id);
        showNote(L("已移到") + PLACEMENT[button.dataset.todoPlacement], { undo: payload.change_id ? { change_id: payload.change_id } : null });
        return;
      }
      if (button.matches("[data-todo-revert]")) {
        const payload = await request("POST", "/api/todo/revert", { change_id: button.dataset.todoRevert });
        await load();
        if (payload.removed_ids.includes(selected.id)) { await closeDetail(); showNote(L("已撤销创建")); }
        else { await openDetail(selected.id); showNote(L("已撤销")); }
        return;
      }
      if (button.matches("[data-todo-link-add]")) {
        const target = $("[data-todo-link-target]").value;
        if (!target) { showDetailNote(L("先选一件待办"), true); return; }
        await flush();
        const other = linkPool.find((entry) => entry.id === target);
        await request("POST", "/api/todo/" + encodeURIComponent(selected.id) + "/link", { expected_revision: selected.revision,
          add: { kind: "todo", subject: { kind: "todo_item", id: target }, title: other ? other.title : target, relation: $("[data-todo-link-relation]").value } });
        await openDetail(selected.id);
        return;
      }
      if (button.matches("[data-todo-unlink]")) {
        await flush();
        await request("POST", "/api/todo/" + encodeURIComponent(selected.id) + "/link", { expected_revision: selected.revision, remove_link_id: button.dataset.todoUnlink });
        await openDetail(selected.id);
        return;
      }
      if (button.matches("[data-todo-archive]")) {
        await flush();
        button.closest("details").open = false;
        const payload = await request("POST", "/api/todo/" + encodeURIComponent(selected.id) + "/archive", { archived: !selected.archived_at, expected_revision: selected.revision });
        await load(); await openDetail(payload.item.id);
        showNote(payload.item.archived_at ? L("已归档") : L("已取回"), { undo: payload.change_id ? { change_id: payload.change_id } : null });
        return;
      }
      if (button.matches("[data-todo-reload]")) {
        button.closest("details").open = false;
        if (dirtyFields.size && !await ask(L("重新读取会丢掉还没保存的输入。继续吗？"), L("重新读取"))) return;
        dirtyFields = new Set();
        await openDetail(selected.id);
        return;
      }
      if (button.matches("[data-todo-delete]")) {
        button.closest("details").open = false;
        if (!await ask(L("永久删除「{title}」？删除后不能撤销，修改记录也会一起删掉。").replace("{title}", selected.title), L("删除"))) return;
        dirtyFields = new Set();
        const title = selected.title;
        await request("POST", "/api/todo/" + encodeURIComponent(selected.id) + "/delete", { expected_revision: selected.revision });
        await closeDetail();
        await load();
        showNote(L("已删除「{title}」").replace("{title}", title));
      }
    } catch (error) {
      if (selected && button.closest("[data-todo-stage-workspace]")) showDetailNote(error.message || L("待办请求失败"), true);
      else showNote(error.message || L("待办请求失败"), { error: true });
      if (error.code === "todo.conflict") void load().catch(() => {});
    }
  });
  // Opening from search or another surface: the workbench names the item.
  workbench.addEventListener("molis-work:select-item", (event) => {
    const id = event.detail && event.detail.itemId;
    if (!id) return;
    void flush().then(() => openDetail(id)).catch((error) => showNote(error.message, { error: true }));
  });
  // The Assistant changed a todo: reread, never over unsaved input.
  window.addEventListener("molis:assistant-effect", (event) => {
    const capability = event.detail && event.detail.capability_id;
    if (typeof capability !== "string" || capability.indexOf("todo.") !== 0) return;
    void load().then(async () => {
      if (!selected) return;
      if (dirtyFields.size) { showDetailNote(L("助理刚改过这件待办；你还有没保存的输入，保存时会提示冲突，不会覆盖。"), true); return; }
      await openDetail(selected.id).catch(() => closeDetail());
    }).catch(() => {});
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !dirtyFields.size) void load().catch(() => {}); });
  // Reminders come due while the page stays open.
  setInterval(() => { if (!document.hidden && !workbench.hidden) void loadReminders().catch(() => {}); }, 60000);
  window.addEventListener("beforeunload", (event) => { if (dirtyFields.size || saving) { event.preventDefault(); event.returnValue = ""; } });

  renderPlacementChoices(quickPlacement, quickDefaultPlacement(), "data-todo-quick-placement-choice");
  publishContext();
  void load().catch((error) => { loading.hidden = true; showNote(error.message || L("待办没打开，请刷新再试"), { error: true }); });
}`;
