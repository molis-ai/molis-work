import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";
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
  const viewButton = $("[data-todo-note-view]");
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
  // Where a todo sits, in the workbench's words: 个人空间, 项目「名称」 (暂未归类 is the personal space, not sorted yet).
  const hereName = () => {
    const title = typeof host.projectTitle === "function" ? host.projectTitle() : host.projectTitle;
    return title ? L("项目「{name}」").replace("{name}", title) : L("这个项目");
  };
  const PLACEMENT = { personal: L("个人空间"), project: L("这个项目"), unassigned: L("暂未归类") };
  const placeName = (value) => value === "project" ? hereName() : PLACEMENT[value];
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
  // The Assistant's works that relate to the open todo (read from the Assistant; empty when it is not there).
  let works = [];
  let worksTimer = 0;
  // Just after handing a todo over, its work may not have started yet: keep looking for a minute.
  let watchWorksUntil = 0;
  let history = [];
  let backlinks = [];
  let linkPool = [];
  const picked = new Set();
  let undo = null;
  let noteView = null;
  let noteTimer = 0;
  let saveTimer = 0;
  let saving = null;
  let dirtyFields = new Set();
  let busy = false;
  let quickAttempt = null;
  let dropped = new Set();
  let placementChoice = "";
  // The personal space is a location, not a project: there Todo is the personal view (personal and unplaced todos).
  const projectId = () => {
    const current = (typeof host.projectId === "function" ? host.projectId() : host.projectId) || "";
    return current === ${JSON.stringify(PERSONAL_SPACE_PROJECT_ID)} ? "" : current;
  };
  // The batch menu is drawn without the project's name, and in the personal space there is no project to move into.
  const batchProject = workbench.querySelector('[data-todo-batch-placement="project"]');
  if (batchProject) { batchProject.textContent = hereName(); batchProject.hidden = !projectId(); }
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
    // Works that relate to a todo read it again when it changes here (the Assistant's page message; not a request).
    if (method === "POST" && path.indexOf("/api/todo") === 0) (payload.item ? [payload.item] : payload.items || []).forEach((item) => { if (item && item.id) tellAssistant("change", item); });
    return payload;
  };
  // The resident Assistant hears about a todo through its page message (spec 8.3 of the Assistant): the todo as the
  // object, its details as material. Handing over needs a real click here; anything else is only offered to the person.
  const todoObject = (item) => ({ kind: "todo_item", id: item.id, title: item.title, version: item.revision });
  const todoMaterial = (item) => ({
    title: L("待办") + "「" + item.title + "」",
    text: [
      L("要做什么") + "：" + item.title,
      L("状态") + "：" + (STATUS[item.status] || item.status),
      item.due_date ? L("截止日期") + "：" + item.due_date + (item.due_time ? " " + item.due_time : "") : "",
      item.planned_date ? L("计划处理日期") + "：" + item.planned_date : "",
      item.waiting ? L("在等谁") + "：" + item.waiting.who + (item.waiting.what ? "，" + item.waiting.what : "") : "",
      item.notes ? L("说明") + "：" + item.notes : "",
      ...item.sources.filter((source) => source.kind !== "manual").map((source) => L("来源") + "：" + source.title + (source.reason ? "（" + source.reason + "）" : "") + (source.excerpt ? "\\n“" + source.excerpt + "”" : "")),
      ...item.links.map((link) => L("关联") + "：" + link.title),
    ].filter(Boolean).join("\\n"),
  });
  const tellAssistant = (purpose, item, extra) => {
    window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: {
      message_id: crypto.randomUUID(), purpose, source: { surface: "todo", title: L("待办") }, object: todoObject(item), ...(extra || {}),
    } }));
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
    noteView = options.view || null;
    viewButton.hidden = !noteView;
    if (text && !options.error) noteTimer = setTimeout(() => { note.hidden = true; undo = null; noteView = null; }, options.undo ? 12000 : 4000);
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
      if (dirtyFields.size || saveTimer) context.unsaved = true;
    }
    workbench.setAttribute("data-assistant-context", JSON.stringify(context));
  };

  const placementLabel = (item) => item.placement === "project" ? (item.project_id === projectId() ? hereName() : L("其他项目")) : placeName(item.placement);
  const renderPlacementChoices = (container, current, attribute) => {
    container.replaceChildren();
    ["personal", ...(projectId() ? ["project"] : []), "unassigned"].forEach((value) => {
      const on = value === current;
      const button = make("button", "mw-toggle" + (on ? " is-current" : ""), placeName(value));
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
      // A planned day has no time of its own; the time stays in the title as written.
      chip.append(make("span", "", label + " " + dayLabel(part.date) + (part.time && part.field !== "planned_date" ? " " + part.time : "")));
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
  const viewKeyFor = (item) => {
    if (item.status === "waiting") return "waiting";
    if ((item.planned_date && item.planned_date <= today) || (item.due_date && item.due_date <= today) || item.status === "doing") return "today";
    if (!item.planned_date && !item.due_date) return "unscheduled";
    if (item.due_date && dayDiff(item.due_date) <= 7) return "upcoming";
    return "all";
  };
  const viewNameFor = (item) => workbench.querySelector('[data-todo-view="' + viewKeyFor(item) + '"]').dataset.todoViewLabel;
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
      showNote(L("已记下「{title}」").replace("{title}", payload.item.title) + where, { undo: { change_id: payload.change_id }, ...(shown ? {} : { view: { key: viewKeyFor(payload.item), id: payload.item.id } }) });
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
    const titles = { personal: L("个人空间"), "project-here": hereName(), "project-other": L("其他项目"), unassigned: L("暂未归类") };
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
      // On a narrow screen the strip scrolls: the chosen view is never left half out of it.
      if (on && !button.hidden) button.scrollIntoView({ inline: "nearest", block: "nearest" });
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
    const reviewing = view === "review";
    reviewEl.hidden = !reviewing;
    rowsEl.hidden = reviewing;
    if (reviewing) {
      empty.hidden = true;
      loading.hidden = true;
      summary.hidden = true;
      batchBar.hidden = true;
      await loadBatches();
      if (seq !== listSeq) return;
      workbench.querySelectorAll("[data-todo-view]").forEach((button) => {
        const on = button.dataset.todoView === view;
        button.classList.toggle("is-current", on);
        button.setAttribute("aria-pressed", String(on));
        if (on && !button.hidden) button.scrollIntoView({ inline: "nearest", block: "nearest" });
      });
      void loadReminders().catch(() => {});
      return;
    }
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
    void loadBatches().catch(() => {});
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

  // ---------- review: organizing results waiting for the person ----------
  const reviewEl = $("[data-todo-review]");
  const reviewToggle = $('[data-todo-view="review"]');
  let batches = [];
  let focusBatch = "";
  const choices = new Map();
  const KIND = { request: L("要你处理"), commitment: L("你的承诺"), waiting: L("在等别人"), suggestion: L("建议") };
  const ACTION_OF = { same: "merge", update: "update", conflict: "update", maybe_done: "complete", reopen: "reopen" };
  const DONE_AS = { added: L("已加入"), merged: L("已合并"), updated: L("已更新"), ignored: L("已忽略") };
  const FIELD = { title: L("标题"), due_date: L("截止日期"), due_time: L("截止时间"), planned_date: L("计划日期"), notes: L("说明") };
  const choiceOf = (candidate) => {
    if (!choices.has(candidate.candidate_id)) choices.set(candidate.candidate_id, { picked: candidate.selected, edits: {}, accept: new Set(), editing: false });
    return choices.get(candidate.candidate_id);
  };
  const actionOf = (candidate) => candidate.existing ? ACTION_OF[candidate.existing.relation] : "add";
  const fieldValue = (field, value) => value === null || value === undefined || value === "" ? L("空") : field.endsWith("date") ? dayLabel(value) : String(value);
  const applyLabel = (batch) => {
    const counts = { add: 0, merge: 0, update: 0, complete: 0, reopen: 0 };
    batch.candidates.filter((candidate) => !candidate.decision && choiceOf(candidate).picked).forEach((candidate) => { counts[actionOf(candidate)] += 1; });
    const parts = [];
    if (counts.add) parts.push(L("加入 {count} 项待办").replace("{count}", counts.add));
    if (counts.merge) parts.push(L("合并 {count} 项").replace("{count}", counts.merge));
    if (counts.update) parts.push(L("更新 {count} 项").replace("{count}", counts.update));
    if (counts.complete) parts.push(L("标完成 {count} 项").replace("{count}", counts.complete));
    if (counts.reopen) parts.push(L("重新打开 {count} 项").replace("{count}", counts.reopen));
    return parts.join(L("、"));
  };
  const existingText = (candidate) => {
    const existing = candidate.existing;
    if (!existing) return "";
    const changes = Object.entries(existing.changes).map(([field, value]) => FIELD[field] + " " + fieldValue(field, value)).join(L("，"));
    if (existing.relation === "same") return L("和已有的「{title}」是同一件事，会补上这份来源").replace("{title}", existing.title);
    if (existing.relation === "update") return L("会更新「{title}」：{changes}").replace("{title}", existing.title).replace("{changes}", changes);
    if (existing.relation === "conflict") return L("你改过「{title}」，材料里的说法不同").replace("{title}", existing.title);
    if (existing.relation === "maybe_done") return L("「{title}」可能已经完成").replace("{title}", existing.title) + (existing.reason ? L("：") + existing.reason : "");
    return L("「{title}」已结束，材料带来了新要求").replace("{title}", existing.title) + (changes ? L("：") + changes : "");
  };
  const renderCandidate = (batch, candidate) => {
    const choice = choiceOf(candidate);
    const row = make("article", "todo-candidate" + (candidate.decision ? " is-decided" : ""));
    row.dataset.todoCandidate = candidate.candidate_id;
    const pick = make("input", "mw-check");
    pick.type = "checkbox";
    pick.dataset.todoPickCandidate = candidate.candidate_id;
    pick.checked = !candidate.decision && choice.picked;
    pick.disabled = Boolean(candidate.decision);
    pick.setAttribute("aria-label", L("选中「{title}」").replace("{title}", candidate.title));
    const body = make("div", "todo-candidate-body");
    const head = make("div", "todo-candidate-head");
    head.append(make("span", "todo-candidate-kind todo-candidate-kind--" + candidate.kind, KIND[candidate.kind]), make("strong", "", choice.edits.title || candidate.title));
    body.append(head);
    const facts = make("div", "todo-meta");
    const due = choice.edits.due_date !== undefined ? choice.edits.due_date : candidate.due_date;
    if (due) facts.append(make("span", "todo-meta-part todo-meta-part--due", L("截止") + " " + dayLabel(due) + (candidate.due_phrase && due === candidate.due_date ? L("（原文“{phrase}”）").replace("{phrase}", candidate.due_phrase) : "")));
    facts.append(make("span", "todo-meta-part", candidate.kind === "waiting" ? L("在等 {who}").replace("{who}", candidate.waiting && candidate.waiting.who || L("别人"))
      : L("负责：{who}").replace("{who}", candidate.owner.value || L("你")) + (candidate.owner.stated ? "" : L("（不确定）"))));
    if (candidate.topic) facts.append(make("span", "todo-meta-part", candidate.topic));
    const planned = choice.edits.planned_date;
    if (planned) facts.append(make("span", "todo-meta-part", L("计划") + " " + dayLabel(planned)));
    else if (candidate.suggested_date && candidate.suggested_date !== due && !candidate.decision) {
      const suggest = make("button", "mw-btn mw-btn--link todo-candidate-suggest", L("建议 {day} 做，按建议安排").replace("{day}", dayLabel(candidate.suggested_date)));
      suggest.type = "button";
      suggest.dataset.todoCandidateSuggest = candidate.candidate_id;
      facts.append(suggest);
    }
    body.append(facts);
    if (candidate.why) body.append(make("p", "todo-candidate-why", candidate.why));
    if (candidate.existing) {
      const line = make("p", "todo-candidate-existing todo-candidate-existing--" + candidate.existing.relation, existingText(candidate));
      body.append(line);
      candidate.existing.protected.forEach((entry) => {
        const label = make("label", "mw-check-row todo-candidate-protected");
        const box = make("input", "mw-check");
        box.type = "checkbox";
        box.dataset.todoAcceptProtected = candidate.candidate_id;
        box.dataset.field = entry.field;
        box.checked = choice.accept.has(entry.field);
        box.disabled = Boolean(candidate.decision);
        label.append(box, make("span", "", L("{field}改用材料里的：{value}（你现在的保留不动，除非勾这里）").replace("{field}", FIELD[entry.field]).replace("{value}", fieldValue(entry.field, entry.value))));
        body.append(label);
      });
    }
    candidate.evidence.forEach((entry) => {
      const quote = make("blockquote", "todo-candidate-evidence", "“" + entry.excerpt + "”");
      const material = batch.materials[entry.material - 1];
      quote.append(make("small", "", " — " + (material ? material.title : L("材料"))));
      body.append(quote);
    });
    if (candidate.uncertain.length) body.append(make("p", "todo-candidate-uncertain", L("不确定：") + candidate.uncertain.join(L("；"))));
    if (choice.editing && !candidate.decision) {
      const editor = make("div", "todo-candidate-editor");
      const input = (label, field, type, value) => {
        const wrap = make("label", "todo-field");
        wrap.append(make("span", "", label));
        const node = make("input", "mw-input");
        node.type = type;
        node.value = value || "";
        node.dataset.todoCandidateField = field;
        node.dataset.candidate = candidate.candidate_id;
        wrap.append(node);
        return wrap;
      };
      editor.append(input(L("要做什么"), "title", "text", choice.edits.title || candidate.title), input(L("截止日期"), "due_date", "date", due || ""), input(L("计划处理日期"), "planned_date", "date", planned || ""));
      const place = make("div", "mw-toggle-group");
      place.setAttribute("role", "radiogroup");
      place.setAttribute("aria-label", L("放在"));
      renderPlacementChoices(place, choice.edits.placement || candidate.placement, "data-todo-candidate-placement");
      place.querySelectorAll("button").forEach((button) => { button.dataset.candidate = candidate.candidate_id; });
      editor.append(place);
      body.append(editor);
    }
    const actions = make("div", "todo-candidate-actions");
    if (candidate.decision) actions.append(make("span", "mw-status mw-status--" + (candidate.decision.action === "ignored" ? "quiet" : "done"), DONE_AS[candidate.decision.action]));
    else {
      if (actionOf(candidate) === "add") {
        const edit = make("button", "mw-btn mw-btn--ghost", choice.editing ? L("收起") : L("改一下"));
        edit.type = "button";
        edit.dataset.todoCandidateEditToggle = candidate.candidate_id;
        actions.append(edit);
      }
      const ignore = make("button", "mw-btn mw-btn--ghost", L("忽略"));
      ignore.type = "button";
      ignore.dataset.todoCandidateIgnore = candidate.candidate_id;
      actions.append(ignore);
    }
    row.append(pick, body, actions);
    return row;
  };
  const renderReview = () => {
    reviewEl.replaceChildren();
    if (!batches.length) {
      const none = make("div", "mw-empty");
      none.append(make("strong", "", L("没有等你确认的整理结果")), make("p", "", L("让底部的助理整理材料，结果会先放在这里，由你决定加不加。")));
      reviewEl.append(none);
      return;
    }
    batches.forEach((batch) => {
      const section = make("section", "todo-batch-review");
      section.dataset.todoBatchReview = batch.batch_id;
      const open = batch.candidates.filter((candidate) => !candidate.decision).length;
      const head = make("header", "todo-batch-head");
      head.append(make("h2", "", batch.title), make("small", "", L("{count} 项等你确认").replace("{count}", open) + " · " + timeLabel(batch.created_at)));
      section.append(head);
      batch.notes.forEach((line) => section.append(make("p", "todo-muted", line)));
      const read = make("details", "todo-batch-materials");
      read.append(make("summary", "", L("读了 {count} 份材料").replace("{count}", batch.materials.length)));
      batch.materials.forEach((material) => read.append(make("p", "todo-muted", material.title + (material.read === "read" ? "" : material.read === "failed" ? L("（没读成）") : L("（没读完）")))));
      section.append(read);
      batch.candidates.forEach((candidate) => section.append(renderCandidate(batch, candidate)));
      if (batch.reference_only.length) {
        const reference = make("details", "todo-batch-reference");
        reference.append(make("summary", "", L("另有 {count} 条仅供参考，未列入").replace("{count}", batch.reference_only.length)));
        batch.reference_only.forEach((entry) => reference.append(make("p", "todo-muted", entry.summary + " — " + (batch.materials[entry.material - 1] ? batch.materials[entry.material - 1].title : ""))));
        section.append(reference);
      }
      const foot = make("footer", "todo-batch-foot");
      const label = applyLabel(batch);
      const apply = make("button", "mw-btn mw-btn--primary", label || L("先勾选要保留的"));
      apply.type = "button";
      apply.dataset.todoApply = batch.batch_id;
      apply.disabled = !label;
      const rest = batch.candidates.filter((candidate) => !candidate.decision && !choiceOf(candidate).picked).length;
      const ignoreRest = make("button", "mw-btn mw-btn--ghost", L("忽略没选的 {count} 项").replace("{count}", rest));
      ignoreRest.type = "button";
      ignoreRest.dataset.todoIgnoreRest = batch.batch_id;
      ignoreRest.hidden = rest === 0;
      const close = make("button", "mw-btn mw-btn--ghost", L("先收起"));
      close.type = "button";
      close.dataset.todoCloseBatch = batch.batch_id;
      foot.append(apply, ignoreRest, close);
      section.append(foot);
      reviewEl.append(section);
    });
    if (focusBatch) {
      const target = reviewEl.querySelector('[data-todo-batch-review="' + focusBatch + '"]');
      if (target) { target.scrollIntoView({ block: "start" }); arrive(target); }
      focusBatch = "";
    }
  };
  const loadBatches = async () => {
    const payload = await request("GET", "/api/todo/organize");
    batches = payload.batches || [];
    const waiting = batches.reduce((sum, batch) => sum + batch.candidates.filter((candidate) => !candidate.decision).length, 0);
    reviewToggle.hidden = !batches.length && view !== "review";
    reviewToggle.textContent = reviewToggle.dataset.todoViewLabel + (waiting ? " " + waiting : "");
    if (view === "review") renderReview();
  };
  const decide = async (batch, decisions, text) => {
    const payload = await request("POST", "/api/todo/organize/" + encodeURIComponent(batch.batch_id) + "/apply", { expected_revision: batch.revision, decisions });
    decisions.forEach((decision) => choices.delete(decision.candidate_id));
    await load();
    showNote(text, { undo: payload.results.some((result) => result.item_id) ? { batch_id: payload.change_batch_id } : null });
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
  const SOURCE_KIND = { manual: L("手动"), material: L("材料"), assistant: L("助理"), onboarding: L("开始使用时"), inbox: "Inbox", lingguang: L("灵光") };
  const renderSources = (item) => {
    const box = $("[data-todo-sources]");
    // The same version drawn again (the detail is often asked for twice as it opens) keeps its nodes, so a click already
    // under way on a source is not lost to a redraw.
    const drawn = item.id + "@" + item.revision + "@" + projectId();
    if (box.dataset.drawn === drawn) return;
    box.dataset.drawn = drawn;
    box.replaceChildren();
    item.sources.forEach((source) => {
      const entry = make("div", "todo-source");
      const head = make("div", "todo-source-head");
      // The original opens where it lives: an Inbox entry or 灵光 belongs to the project the todo was made in.
      const here = source.open && projectId() && item.project_id === projectId();
      const name = here ? make("button", "mw-btn mw-btn--link", source.title) : make("strong", "", source.title);
      if (here) {
        name.type = "button";
        name.dataset.workbenchItemPlugin = source.open.surface;
        name.dataset.workbenchItemId = source.open.id;
        name.dataset.workbenchItemTitle = source.title;
        name.title = L("打开原条目");
      }
      head.append(make("span", "todo-link-kind", SOURCE_KIND[source.kind] || ""), name, make("small", "", timeLabel(source.added_at)));
      entry.append(head);
      if (source.reason) entry.append(make("p", "", source.reason));
      if (source.excerpt) entry.append(make("blockquote", "", source.excerpt));
      box.append(entry);
    });
  };
  // Progress lives with the Assistant's work; the todo shows where each one stands and continues it (no second record).
  const WORK_STATE = { idle: L("尚未开始"), running: L("进行中"), "waiting-input": L("等你回答"), "waiting-review": L("等你确认"), paused: L("已暂停"),
    completed: L("已完成"), failed: L("没有完成"), stopped: L("已停止"), "needs-check": L("需要核对") };
  // What a work produced (drafts, documents, notes), as the Assistant recorded them from their owners: the object's
  // own kind and where it opens, so the todo shows the results without anyone retyping them.
  const RESULT_STATE = { changed: L("之后改过"), missing: L("已不存在"), unavailable: L("暂时读不到"), moved: L("已移到别处") };
  const renderWorks = () => {
    const box = $("[data-todo-works]");
    box.replaceChildren();
    $("[data-todo-works-section]").hidden = !works.length;
    works.forEach((work) => {
      const line = make("div", "todo-link");
      const go = make("button", "mw-btn mw-btn--link", L("继续推进"));
      go.type = "button";
      go.dataset.todoContinueWork = work.work_id;
      line.append(make("span", "todo-link-kind", WORK_STATE[work.state] || work.state), make("span", "", work.title), go);
      box.append(line);
      (work.results || []).forEach((result) => {
        const row = make("div", "todo-link todo-work-result");
        const reachable = result.open && !["missing", "moved"].includes(result.state);
        const name = reachable ? make("button", "mw-btn mw-btn--link", result.title) : make("span", "", result.title);
        if (reachable) {
          name.type = "button";
          name.dataset.workbenchItemPlugin = result.open.surface;
          name.dataset.workbenchItemId = result.open.id;
          name.dataset.workbenchItemTitle = result.title;
        }
        row.append(make("span", "todo-link-kind", L("产出")), name);
        // Moved is not gone: say where it went, in the Assistant's words for the place.
        const state = result.state === "moved" && result.moved_to && result.moved_to.title ? L("已移到「{place}」").replace("{place}", result.moved_to.title) : RESULT_STATE[result.state];
        if (state) row.append(make("small", "todo-muted", state));
        box.append(row);
      });
    });
  };
  const loadWorks = async (item) => {
    let found = [];
    try { found = (await request("GET", "/api/assistant/related?kind=todo_item&id=" + encodeURIComponent(item.id))).works || []; } catch { found = []; }
    // One work can relate to the todo more than once (where it started, and as material): list it once.
    const unique = found.filter((work, index) => found.findIndex((other) => other.work_id === work.work_id) === index);
    const withResults = await Promise.all(unique.map(async (work) => {
      try {
        const view = await request("GET", "/api/assistant/works/" + encodeURIComponent(work.work_id));
        const results = (view.objects || []).filter((object) => object.relation === "result" && !(object.subject.kind === "todo_item" && object.subject.id === item.id));
        return { ...work, results };
      } catch { return { ...work, results: [] }; }
    }));
    if (!selected || selected.id !== item.id) return;
    works = withResults;
    renderWorks();
    // A round has no “finished” message for pages, so while one runs, look again now and then (only while this todo is open).
    clearTimeout(worksTimer);
    if (works.some((work) => work.state === "running") || Date.now() < watchWorksUntil) worksTimer = setTimeout(() => { if (selected && selected.id === item.id && !document.hidden) void loadWorks(item); }, 4000);
  };
  const RELATION = { blocked_by: L("要等它先完成"), blocks: L("它在等这件"), split_from: L("拆分自"), merged: L("合并自"), related: L("相关") };
  const renderLinks = (item) => {
    const box = $("[data-todo-links]");
    const drawn = item.id + "@" + item.revision + "@" + backlinks.map((back) => back.item_id + ":" + back.relation).join(",") + "@" + linkPool.map((other) => other.id + ":" + other.title).join(",");
    if (box.dataset.drawn === drawn) return;
    box.dataset.drawn = drawn;
    box.replaceChildren();
    const rows = [
      ...item.links.map((link) => ({ link, text: link.title, target: link.kind === "todo" ? link.subject.id : "",
        detail: link.kind === "todo" ? RELATION[link.relation] : link.kind === "outcome" ? (link.outcome === "done" ? L("已完成的动作") : L("草稿")) : link.kind === "goal" ? "Goal" : link.kind === "work" ? L("助理工作") : L("材料") })),
      ...backlinks.map((back) => ({ text: back.title, target: back.item_id, detail: back.relation === "blocked_by" ? L("在等这件") : back.relation === "blocks" ? L("要等它先完成") : L("相关") })),
    ];
    if (!rows.length) box.append(make("p", "todo-muted", L("还没有关联。")));
    rows.forEach((entry) => {
      const line = make("div", "todo-link");
      // A draft, a finished result or a material that says where it opens is reached from here, as a source is.
      const opens = !entry.target && entry.link && entry.link.open && projectId() && item.project_id === projectId();
      const name = entry.target || opens ? make("button", "mw-btn mw-btn--link", entry.text) : make("span", "", entry.text);
      if (entry.target) { name.type = "button"; name.dataset.todoOpenLinked = entry.target; }
      if (opens) {
        name.type = "button";
        name.dataset.workbenchItemPlugin = entry.link.open.surface;
        name.dataset.workbenchItemId = entry.link.open.id;
        name.dataset.workbenchItemTitle = entry.text;
      }
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
    const switching = !selected || selected.id !== item.id;
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
    if (switching) { works = []; renderWorks(); }
    void loadWorks(item);
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
    const pickCandidate = event.target.closest("[data-todo-pick-candidate]");
    if (pickCandidate) { const batch = batches.find((entry) => entry.candidates.some((candidate) => candidate.candidate_id === pickCandidate.dataset.todoPickCandidate));
      if (batch) { choiceOf(batch.candidates.find((candidate) => candidate.candidate_id === pickCandidate.dataset.todoPickCandidate)).picked = pickCandidate.checked; renderReview(); } return; }
    const accept = event.target.closest("[data-todo-accept-protected]");
    if (accept) { const batch = batches.find((entry) => entry.candidates.some((candidate) => candidate.candidate_id === accept.dataset.todoAcceptProtected));
      if (batch) { const choice = choiceOf(batch.candidates.find((candidate) => candidate.candidate_id === accept.dataset.todoAcceptProtected));
        if (accept.checked) choice.accept.add(accept.dataset.field); else choice.accept.delete(accept.dataset.field); } return; }
    const candidateField = event.target.closest("[data-todo-candidate-field]");
    if (candidateField) { const batch = batches.find((entry) => entry.candidates.some((candidate) => candidate.candidate_id === candidateField.dataset.candidate));
      if (batch) { const choice = choiceOf(batch.candidates.find((candidate) => candidate.candidate_id === candidateField.dataset.candidate));
        const value = candidateField.value.trim(); choice.edits[candidateField.dataset.todoCandidateField] = candidateField.dataset.todoCandidateField === "title" ? (value || undefined) : (value || null);
        if (choice.edits.title === undefined) delete choice.edits.title; } return; }
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
      if (button.matches("[data-todo-note-view]") && noteView) {
        const target = noteView;
        noteView = null; viewButton.hidden = true;
        view = target.key; picked.clear();
        await load();
        arrive(rowsEl.querySelector('[data-todo-row="' + target.id + '"]'));
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
      const candidateId = button.dataset.todoCandidateIgnore || button.dataset.todoCandidateEditToggle || button.dataset.todoCandidateSuggest || button.dataset.candidate;
      const owner = candidateId ? batches.find((entry) => entry.candidates.some((candidate) => candidate.candidate_id === candidateId)) : null;
      if (owner) {
        const candidate = owner.candidates.find((entry) => entry.candidate_id === candidateId);
        const choice = choiceOf(candidate);
        if (button.dataset.todoCandidateIgnore) { await decide(owner, [{ candidate_id: candidateId, action: "ignore" }], L("已忽略「{title}」").replace("{title}", candidate.title)); return; }
        if (button.dataset.todoCandidateEditToggle) { choice.editing = !choice.editing; renderReview(); return; }
        if (button.dataset.todoCandidateSuggest) { choice.edits.planned_date = candidate.suggested_date; renderReview(); return; }
        if (button.dataset.todoCandidatePlacement) { choice.edits.placement = button.dataset.todoCandidatePlacement; renderReview(); return; }
      }
      const batchId = button.dataset.todoApply || button.dataset.todoIgnoreRest || button.dataset.todoCloseBatch;
      const batch = batchId ? batches.find((entry) => entry.batch_id === batchId) : null;
      if (batch) {
        if (button.dataset.todoCloseBatch) {
          await request("POST", "/api/todo/organize/" + encodeURIComponent(batch.batch_id) + "/close", {});
          await load();
          showNote(L("已收起「{title}」，没处理的留在原处").replace("{title}", batch.title));
          return;
        }
        const pending = batch.candidates.filter((candidate) => !candidate.decision);
        if (button.dataset.todoIgnoreRest) {
          const rest = pending.filter((candidate) => !choiceOf(candidate).picked);
          await decide(batch, rest.map((candidate) => ({ candidate_id: candidate.candidate_id, action: "ignore" })), L("已忽略 {count} 项").replace("{count}", rest.length));
          return;
        }
        const label = applyLabel(batch);
        const decisions = pending.filter((candidate) => choiceOf(candidate).picked).map((candidate) => {
          const choice = choiceOf(candidate);
          const decision = { candidate_id: candidate.candidate_id, action: actionOf(candidate) };
          if (Object.keys(choice.edits).length) decision.edits = choice.edits;
          if (choice.accept.size) decision.accept_protected = [...choice.accept];
          return decision;
        });
        await decide(batch, decisions, L("已处理：{what}").replace("{what}", label));
        return;
      }
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
      // Handing over or continuing: the same work whether started here or from the bottom bar, so an unfinished one goes on.
      if (button.matches("[data-todo-delegate]") && selected) {
        await flush();
        const going = works.find((work) => !["completed", "failed", "stopped"].includes(work.state));
        tellAssistant("delegate", selected, { text: L("帮我推进「{title}」").replace("{title}", selected.title), materials: [todoMaterial(selected)], ...(going ? { work_id: going.work_id } : {}) });
        const asked = selected;
        watchWorksUntil = Date.now() + 60000;
        setTimeout(() => { if (selected && selected.id === asked.id) void loadWorks(asked); }, 1500);
        return;
      }
      if (button.matches("[data-todo-continue-work]") && selected) {
        await flush();
        tellAssistant("delegate", selected, { text: L("继续推进「{title}」").replace("{title}", selected.title), materials: [todoMaterial(selected)], work_id: button.dataset.todoContinueWork });
        const asked = selected;
        watchWorksUntil = Date.now() + 60000;
        setTimeout(() => { if (selected && selected.id === asked.id) void loadWorks(asked); }, 1500);
        return;
      }
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
        await runBatch({ placement: button.dataset.todoBatchPlacement }, L("已把 {count} 件移到") + placeName(button.dataset.todoBatchPlacement));
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
        showNote(L("已移到") + placeName(button.dataset.todoPlacement), { undo: payload.change_id ? { change_id: payload.change_id } : null });
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
    if (String(id).indexOf("batch:") === 0) {
      focusBatch = String(id).slice(6);
      view = "review";
      void flush().then(() => closeDetail()).then(() => load()).catch((error) => showNote(error.message, { error: true }));
      return;
    }
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
  // Moved from the placement panel: same todo, new place. Read it again; close it if it left what this page shows.
  window.addEventListener("molis:placement-changed", (event) => {
    const detail = event.detail || {};
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("todo_item")) return;
    void load().then(async () => {
      if (!selected || !detail.from || selected.id !== detail.from.id || dirtyFields.size) return;
      try {
        // The person can still read it (the page may show every project), so the event alone does not say where it went:
        // read it, and close it when it now belongs to a project this page is not showing.
        await openDetail(selected.id);
        if (selected && !everything && selected.project_id && selected.project_id !== projectId()) await closeDetail();
      } catch { await closeDetail(); }
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
