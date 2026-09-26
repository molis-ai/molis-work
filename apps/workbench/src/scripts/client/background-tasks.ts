/**
 * Title bar list of Coding sessions running or waiting on the person, in this project and every other one.
 * Reads the service's cross-project list; a session here opens in place, one elsewhere opens its project on it.
 */
export const BACKGROUND_TASKS_FACTORY_SCRIPT = `(host) => {
  const { translate: L, projectId, openItem } = host;
  const button = document.querySelector("[data-background-tasks]");
  if (!button || document.body.dataset.paneEmbedded === "true") return;
  const count = button.querySelector("[data-background-tasks-count]");
  const menu = document.createElement("div");
  menu.className = "background-tasks-menu mw-menu"; menu.setAttribute("popover", "auto"); menu.setAttribute("aria-label", L("后台任务"));
  document.body.append(menu);
  const LABEL = { running: L("进行中"), paused: L("已暂停"), "waiting-answer": L("等你回答"), "waiting-approval": L("等你审查"), "reconcile-required": L("需要核对") };
  let tasks = [], key = "", reading = false;
  const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
  const when = (at) => { const date = new Date(at); return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
  const hrefFor = (task) => {
    const url = new URL("/projects/" + encodeURIComponent(task.project_id) + "/", location.origin);
    url.searchParams.set("openPlugin", "coding"); url.searchParams.set("openItem", task.session_id); url.searchParams.set("openTitle", task.title);
    const desktop = new URLSearchParams(location.search).get("desktop"); if (desktop) url.searchParams.set("desktop", desktop);
    return url.pathname + url.search;
  };
  const render = () => {
    button.hidden = !tasks.length;
    count.textContent = String(tasks.length);
    const waiting = tasks.filter(task => !task.before_restart && (task.state !== "running" || task.steps?.mine)).length;
    button.dataset.backgroundTasksWaiting = waiting ? "true" : "false";
    button.title = tasks.length ? L("后台任务") + " · " + tasks.length + (waiting ? " · " + waiting + " " + L("个等你处理") : "") : L("后台任务");
    button.setAttribute("aria-label", button.title);
    menu.replaceChildren(node("strong", L("后台任务")));
    for (const task of tasks) {
      const row = node("a", undefined, "background-task"); row.href = hrefFor(task); row.dataset.state = task.before_restart ? "reconcile-required" : task.state;
      const head = node("span", undefined, "background-task-head");
      head.append(node("span", task.title, "background-task-title"), node("time", when(task.updated_at)));
      const detail = node("span", undefined, "background-task-detail");
      // The round's standing, then who is on its open plan steps (a step you hold waits on you even after the round ended).
      const holders = task.steps ? [task.steps.mine ? L("你负责") + " " + task.steps.mine + " " + L("步") : "", task.steps.subtasks ? task.steps.subtasks + " " + L("步在子任务手上") : "",
        task.steps.unowned ? L("没人认领") + " " + task.steps.unowned + " " + L("步") : ""].filter(Boolean).join(" · ") : "";
      const standing = task.before_restart ? L("服务重启前没有结束，打开后核对") : LABEL[task.state] || (holders ? L("本轮已结束") : task.state);
      detail.append(node("span", holders ? standing + " · " + holders : standing));
      if (task.steps?.mine) row.dataset.state = row.dataset.state === "running" ? "running" : "waiting-answer";
      if (task.project_id !== projectId) detail.append(node("span", task.project_name, "background-task-project"));
      row.append(head, detail);
      row.addEventListener("click", (event) => {
        if (task.project_id !== projectId || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault(); menu.hidePopover?.(); openItem("coding", task.session_id, task.title);
      });
      menu.append(row);
    }
  };
  const refresh = async () => {
    if (reading || document.hidden) return; reading = true;
    try {
      const response = await fetch("/api/background-tasks", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json(), next = JSON.stringify(data.tasks || []);
      if (next !== key) { key = next; tasks = data.tasks || []; render(); }
    } catch { /* The list is a convenience; a failed read leaves the last one shown. */ }
    finally { reading = false; }
  };
  button.addEventListener("click", () => {
    const box = button.getBoundingClientRect();
    menu.style.top = Math.round(box.bottom + 6) + "px"; menu.style.right = Math.max(8, Math.round(innerWidth - box.right)) + "px"; menu.style.left = "auto";
    menu.togglePopover?.();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void refresh(); });
  void refresh();
  setInterval(() => void refresh(), 10000);
}`;
