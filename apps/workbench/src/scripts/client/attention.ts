/**
 * What waits on the person, read once for the whole page (W4-10): `/api/attention` answers the background tasks, the
 * Assistant's notices for the plugin in front and the plugin deliveries waiting in the market in one request. It is read on a
 * beat while the page is visible (15 seconds after the last read ends, longer after a failure: see below), at once when the person
 * comes back or moves to another plugin, and when a reader asks (`molis-work:attention-refresh`, after the person acted on something). The Assistant's bell, with the plugin
 * notification count, paints from `molis-work:attention`; this module paints the right side's background-tasks tab: its
 * badge counts the tasks not finished (running plus waiting on the person), and its view lists them, in this project and every
 * other open one, with the background commands they left running (each can be stopped here). It knows no plugin: each row names the surface and item it opens, the words under its title, whether
 * it waits on the person and the URL that stops each command, as the plugin that owns the task said them (PG-043). A task here
 * opens in place, one elsewhere opens its project on it.
 *
 * The notices asked for are those of the plugin in front (the person's rules hold some while it matches). Each read
 * carries when it started: a count the market reports later than that is newer than its answer (assistant-island.ts).
 * A failed read leaves what the page last showed: each part is a convenience. A 404 (the project or Home is gone) stops the reads
 * of that address; the beat goes on, and reads the address again once it names another project (the chooser's).
 * One beat is waiting at a time, 15 seconds after the last read ends; a read that failed waits twice as long as the last before the
 * next (up to two minutes), so a host that is not answering is not asked every 15 seconds; a hidden page waits for nothing (N54).
 */
export const ATTENTION_FACTORY_SCRIPT = `(host) => {
  const { translate: L, projectId, openItem, route } = host;
  if (document.body.dataset.paneEmbedded === "true") return;
  const tab = document.querySelector('[data-side-tab="tasks"]');
  const count = tab?.parentElement?.querySelector("[data-background-tasks-count]");
  const list = document.querySelector("[data-background-tasks-list]");
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
    if (!tab || !list) return;
    // Every task the attention read lists is unfinished: running, or waiting on the person.
    count.hidden = !tasks.length;
    count.textContent = String(tasks.length);
    tab.setAttribute("aria-label", globalThis.t.text("workbench.attention.background-job") + (tasks.length ? " · " + globalThis.t.text("workbench.attention.n-background-n-not-finished", { n: tasks.length }) : ""));
    list.replaceChildren(...(tasks.length ? [] : [node("p", globalThis.t.text("workbench.attention.no-background-tasks-right-now"), "side-tasks-empty")]));
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
        event.preventDefault(); openItem(task.surface, task.id, task.title);
      });
      list.append(row);
      // Commands it left running: stopping one is the same reviewed stop the task's own panel offers.
      for (const command of task.commands || []) {
        const line = node("div", undefined, "background-task-command");
        const stop = node("button", globalThis.t.text("workbench.attention.stop"), "mw-btn mw-btn--ghost"); stop.type = "button";
        const feedback = node("div", "", "background-task-detail"); feedback.setAttribute("role", "alert");
        stop.addEventListener("click", async () => {
          stop.disabled = true; feedback.replaceChildren();
          try {
            await molisWorkRequest(command.stop_url, { body: {} });
            line.remove(); key = ""; void read();
          } catch (error) { if (!list.contains(feedback)) list.append(feedback); molisWorkRequest.show(feedback, error); stop.disabled = false; }
        });
        line.append(node("span", globalThis.t.text("workbench.attention.background-command"), "background-task-command-label"), node("code", command.summary), stop);
        list.append(line, feedback);
      }
    }
  };
  const surface = () => { const shown = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]"); return shown ? shown.dataset.pluginId : ""; };
  // A 404 means the project (or Home) this address reads is gone: an old tab stops asking it instead of reading a 404 every
  // 15 seconds (N54). It is kept by address: the project chooser's route follows the project chosen, and another one is asked.
  const gone = new Set();
  const BEAT = 15000, LONGEST = 120000;
  let beat = 0, wait = BEAT;
  // The beat keeps going past a gone address: the chooser's route may follow another project by the next beat (N54).
  const schedule = () => { clearTimeout(beat); if (!document.hidden) beat = setTimeout(read, wait); };
  const read = async () => {
    if (document.hidden) { clearTimeout(beat); return; }
    if (gone.has(route("/api/attention"))) { schedule(); return; }
    if (reading) { again = true; return; }
    clearTimeout(beat);
    reading = true; again = false;
    const started = performance.now();
    try {
      const data = await molisWorkRequest(route("/api/attention?surface=" + encodeURIComponent(surface())));
      const rows = data.background_tasks, next = JSON.stringify(rows);
      if (Array.isArray(rows) && next !== key) { key = next; tasks = rows; render(); }
      document.dispatchEvent(new CustomEvent("molis-work:attention", { detail: Object.assign(data, { started }) }));
      wait = BEAT;
    } catch (error) {
      // Any other failure keeps what it showed and is asked again on a later beat.
      if (error && error.status === 404) gone.add(route("/api/attention"));
      else wait = Math.min(wait * 2, LONGEST);
    }
    finally { reading = false; if (again) void read(); else schedule(); }
  };
  document.addEventListener("molis-work:attention-refresh", read);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void read(); });
  document.querySelector(".plugin-rail-items")?.addEventListener("click", () => setTimeout(read, 300));
  void read();
}`;
