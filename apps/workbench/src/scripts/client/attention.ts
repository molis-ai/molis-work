/**
 * What waits on the person, read once for the whole page (W4-10): `/api/attention` answers the background tasks, the
 * Assistant's notices for the plugin in front and the plugin deliveries waiting in the market in one request. It is read
 * every 15 seconds while the page is visible, at once when the person comes back or moves to another plugin, and when a
 * reader asks (`molis-work:attention-refresh`, after the person acted on something). The Assistant's bell, with the plugin
 * notification count, paints from `molis-work:attention`; this module paints the title bar's list of background tasks
 * running or waiting on the person, in this project and every other open one, with the background commands they left running
 * (each can be stopped here). It knows no plugin: each row names the surface and item it opens, the words under its title, whether
 * it waits on the person and the URL that stops each command, as the plugin that owns the task said them (PG-043). A task here
 * opens in place, one elsewhere opens its project on it.
 *
 * The notices asked for are those of the plugin in front (the person's rules hold some while it matches). Each read
 * carries when it started: a count the market reports later than that is newer than its answer (assistant-island.ts).
 * A failed read leaves what the page last showed: each part is a convenience.
 */
export const ATTENTION_FACTORY_SCRIPT = `(host) => {
  const { translate: L, projectId, openItem, route } = host;
  if (document.body.dataset.paneEmbedded === "true") return;
  const button = document.querySelector("[data-background-tasks]");
  const count = button?.querySelector("[data-background-tasks-count]");
  const menu = document.createElement("div");
  menu.className = "background-tasks-menu mw-menu"; menu.setAttribute("popover", "auto"); menu.setAttribute("aria-label", L("后台任务"));
  if (button) document.body.append(menu);
  let tasks = [], key = "", reading = false, again = false;
  const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
  const when = (at) => { const date = new Date(at); return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };
  const hrefFor = (task) => {
    const url = new URL("/projects/" + encodeURIComponent(task.project_id) + "/", location.origin);
    url.searchParams.set("openPlugin", task.surface); url.searchParams.set("openItem", task.id); url.searchParams.set("openTitle", task.title);
    const desktop = new URLSearchParams(location.search).get("desktop"); if (desktop) url.searchParams.set("desktop", desktop);
    return url.pathname + url.search;
  };
  const render = () => {
    if (!button) return;
    button.hidden = !tasks.length;
    count.textContent = String(tasks.length);
    // A task listed only for the commands it left running does not wait on the person.
    const waiting = tasks.filter(task => task.waiting).length;
    button.dataset.backgroundTasksWaiting = waiting ? "true" : "false";
    button.title = tasks.length ? L("后台任务") + " · " + tasks.length + (waiting ? " · " + waiting + " " + L("个等你处理") : "") : L("后台任务");
    button.setAttribute("aria-label", button.title);
    menu.replaceChildren(node("strong", L("后台任务")));
    for (const task of tasks) {
      const row = node("a", undefined, "background-task"); row.href = hrefFor(task); row.dataset.state = task.state;
      const head = node("span", undefined, "background-task-head");
      head.append(node("span", task.title, "background-task-title"), node("time", when(task.updated_at)));
      const detail = node("span", undefined, "background-task-detail");
      detail.append(node("span", task.standing.map(phrase => L(phrase.text, { n: phrase.count })).join(" · ")));
      if (task.project_id !== projectId) detail.append(node("span", task.project_name, "background-task-project"));
      row.append(head, detail);
      row.addEventListener("click", (event) => {
        if (task.project_id !== projectId || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault(); menu.hidePopover?.(); openItem(task.surface, task.id, task.title);
      });
      menu.append(row);
      // Commands it left running: stopping one is the same reviewed stop the task's own panel offers.
      for (const command of task.commands || []) {
        const line = node("div", undefined, "background-task-command");
        const stop = node("button", L("停止"), "mw-btn mw-btn--ghost"); stop.type = "button";
        const feedback = node("div", "", "background-task-detail"); feedback.setAttribute("role", "alert");
        stop.addEventListener("click", async () => {
          stop.disabled = true; feedback.replaceChildren();
          try {
            await molisWorkRequest(command.stop_url, { body: {} });
            line.remove(); key = ""; void read();
          } catch (error) { if (!menu.contains(feedback)) menu.append(feedback); molisWorkRequest.show(feedback, error); stop.disabled = false; }
        });
        line.append(node("span", L("后台命令"), "background-task-command-label"), node("code", command.summary), stop);
        menu.append(line, feedback);
      }
    }
  };
  const surface = () => { const shown = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]"); return shown ? shown.dataset.pluginId : ""; };
  const read = async () => {
    if (document.hidden) return;
    if (reading) { again = true; return; }
    reading = true; again = false;
    const started = performance.now();
    try {
      const data = await molisWorkRequest(route("/api/attention?surface=" + encodeURIComponent(surface())));
      const list = data.background_tasks, next = JSON.stringify(list);
      if (Array.isArray(list) && next !== key) { key = next; tasks = list; render(); }
      document.dispatchEvent(new CustomEvent("molis-work:attention", { detail: Object.assign(data, { started }) }));
    } catch { /* keeps what it showed */ }
    finally { reading = false; if (again) void read(); }
  };
  button?.addEventListener("click", () => {
    const box = button.getBoundingClientRect();
    menu.style.top = Math.round(box.bottom + 6) + "px"; menu.style.right = Math.max(8, Math.round(innerWidth - box.right)) + "px"; menu.style.left = "auto";
    menu.togglePopover?.();
  });
  document.addEventListener("molis-work:attention-refresh", read);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void read(); });
  document.querySelector(".plugin-rail-items")?.addEventListener("click", () => setTimeout(read, 300));
  void read();
  setInterval(read, 15000);
}`;
