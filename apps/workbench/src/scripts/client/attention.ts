/**
 * What waits on the person, read once for the whole page (W4-10): `/api/attention` answers the Assistant's notices for the
 * plugin in front and the plugin deliveries waiting in the market in one request; on a project page also the project's work line
 * and the tasks behind it (the bottom line and the task panel paint from them, browser/work-bar.ts), on the Home page the
 * background tasks of open and resting projects. It is read again whenever the Host says something it shows may have changed (one stream,
 * `GET /api/attention/events`, WLN-27: no beat), when the person moves to another plugin, and when a reader asks (`molis-work:attention-refresh`, after the person acted on something). The Assistant's bell, with the plugin
 * notification count, paints from `molis-work:attention`; this module paints the Home page's background-tasks tab (a project page has none: specs/work-line §4.5): its
 * badge counts the tasks not finished (running plus waiting on the person), and its view lists them across open and resting
 * projects, with the background commands they left running and a button to stop each (the row's own command, through the mainline service). It knows no plugin: each row names where it opens, the words under its title and whether
 * it waits on the person, as the provider that owns the task said them (PG-043, specs/work-line §6). A task here
 * opens in place, one elsewhere opens its project on it.
 *
 * The notices asked for are those of the plugin in front (the person's rules hold some while it matches). Each read
 * carries when it started: a count the market reports later than that is newer than its answer (assistant-island.ts).
 * A failed read leaves what the page last showed: each part is a convenience. Only the Host's word that the project is gone (a 404
 * with `catalog.project_not_found`) stops the reads and the stream of that address, until it names another project (the chooser's); any
 * other 404 (a Host restarting, say) is a failure like the rest, and the stream connects again (BL-attention-404-by-code). Gone is kept by
 * address (N54): the chooser's route follows the project chosen, and another one is asked. A stream told it lets go of itself and the shared
 * lock, as a read told it does, so another window can listen. A lost stream is said once
 * (`molis-work:attention-unreachable`, as of the last read) and connected again, twice as long after each loss (up to two minutes);
 * a hidden page keeps no stream (N54).
 */
import { objectLinkAt } from "@molis-ai/molis-work-contracts/platform/object-link";

export const ATTENTION_FACTORY_SCRIPT = `(host) => {
  const { translate: readText, projectId, openItem, route: contextRoute, home = false, eventsPath = "/api/attention/events" } = host;
  const route = (path) => { const address = contextRoute(path); return home ? address + (address.includes("?") ? "&" : "?") + "view=home" : address; };
  if (document.body.dataset.paneEmbedded === "true") return;
  const tab = document.querySelector('[data-side-tab="tasks"]');
  const count = tab?.parentElement?.querySelector("[data-background-tasks-count]");
  const list = document.querySelector("[data-background-tasks-list]");
  let background = { tasks: [], incomplete: true }, key = "", reading = null, scheduled = null, again = false, readSequence = 0;
  globalThis.molisWorkAttentionSequence = () => readSequence;
  // These are this page's command attempts, not the provider's task states. A refreshed row keeps the same in-flight attempt.
  const commands = new Map();
  const commandKey = (task, command) => JSON.stringify([task.project_id, task.id, command.role, command.action, command.input]);
  const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
  const when = (at) => { const date = new Date(at); return Number.isNaN(date.getTime()) ? "" : globalThis.t.text("common.generated.formatted", { value: { kind: "date", at: date.toISOString(), style: "time" } }); };
  const linkAt = (${objectLinkAt.toString()});
  const hrefFor = (task) => {
    const place = task.open && task.open.id ? { surface: task.open.surface, id: task.open.id, title: task.open.title } : { surface: task.open ? task.open.surface : task.origin.surface };
    const desktop = new URLSearchParams(location.search).get("desktop"); if (desktop) place.params = { desktop };
    return linkAt("/projects/" + encodeURIComponent(task.project_id), place);
  };
  const render = () => {
    if (!tab || !list) return;
    const { tasks, incomplete } = background;
    // Every task the attention read lists is unfinished: running, or waiting on the person.
    count.hidden = !tasks.length;
    count.textContent = String(tasks.length) + (incomplete ? "+" : "");
    tab.setAttribute("aria-label", globalThis.t.text("workbench.attention.background-job") + (tasks.length ? " · " + globalThis.t.text("workbench.attention.n-background-n-not-finished", { n: tasks.length }) : ""));
    list.replaceChildren(...(tasks.length || incomplete ? [] : [node("p", globalThis.t.text("workbench.attention.no-background-tasks-right-now"), "side-tasks-empty")]));
    if (incomplete) {
      const problem = node("div", undefined, "mw-alert"); problem.dataset.backgroundTasksProblem = ""; problem.setAttribute("role", "status");
      const retry = node("button", globalThis.t.text("common.control.retry"), "mw-btn mw-btn--ghost"); retry.type = "button"; retry.dataset.backgroundTasksRetry = "";
      retry.addEventListener("click", async () => { retry.disabled = true; try { await read(true); } finally { retry.disabled = false; } });
      problem.append(node("p", globalThis.t.text("workbench.attention.tasks-incomplete")), retry); list.append(problem);
    }
    for (const task of tasks) {
      const row = node("a", undefined, "background-task"); row.href = hrefFor(task); row.dataset.state = task.state;
      const head = node("span", undefined, "background-task-head");
      head.append(node("span", task.title, "background-task-title"), node("time", when(task.updated_at)));
      const detail = node("span", undefined, "background-task-detail");
      detail.append(node("span", [task.step, ...task.details].filter(Boolean).map(phrase => phrase.text).join(" · ")));
      if (task.project_id !== projectId) detail.append(node("span", task.resting ? globalThis.t.text("workbench.attention.project-resting", { project: task.project_name }) : task.project_name, "background-task-project"));
      row.append(head, detail);
      row.addEventListener("click", (event) => {
        if (task.project_id !== projectId || event.metaKey || event.ctrlKey || event.shiftKey) return;
        if (!task.open || !task.open.id) return;
        event.preventDefault(); openItem(task.open.surface, task.open.id, task.open.title);
      });
      list.append(row);
      // What the row offers to stop: the mainline service asks the provider again and runs the command only if it is still offered (specs/work-line §6).
      for (const command of task.commands || []) {
        if (command.role !== "stop") continue;
        const id = commandKey(task, command), attempt = commands.get(id);
        if (attempt?.state === "succeeded") continue;
        const line = node("div", undefined, "background-task-command");
        const stop = node("button", globalThis.t.text("workbench.attention.stop"), "mw-btn mw-btn--ghost"); stop.type = "button";
        stop.disabled = attempt?.state === "pending";
        const feedback = node("div", "", "background-task-detail"); feedback.setAttribute("role", "alert");
        if (attempt?.state === "failed") molisWorkRequest.show(feedback, attempt.error);
        stop.addEventListener("click", async () => {
          if (["pending", "succeeded"].includes(commands.get(id)?.state)) return;
          commands.set(id, { state: "pending" });
          stop.disabled = true; feedback.replaceChildren();
          try {
            await molisWorkRequest("/projects/" + encodeURIComponent(task.project_id) + "/api/mainline/tasks/command", { body: { source: task.source, subject: task.subject, command } });
            commands.set(id, { state: "succeeded", after: readSequence }); key = ""; void read(true);
          } catch (error) { commands.set(id, { state: "failed", error }); }
          finally { render(); }
        });
        line.append(node("span", globalThis.t.text("workbench.attention.background-command"), "background-task-command-label"), node("code", command.summary), stop);
        list.append(line, feedback);
      }
    }
  };
  const showTasks = (result, sequence) => {
    if (!tab) return;
    const value = { tasks: result ? result.tasks : background.tasks, incomplete: !result || result.issues.length > 0 };
    // Only a read started after the receipt may replace that receipt's short-lived feedback with the owner's current offer.
    let commandChanged = false;
    if (result) for (const [id, attempt] of commands) if (attempt.state === "succeeded" && sequence > attempt.after) { commands.delete(id); commandChanged = true; }
    if (!value.incomplete) {
      const offered = new Set(value.tasks.flatMap(task => task.commands.map(command => commandKey(task, command))));
      for (const [id, attempt] of commands) if (attempt.state !== "pending" && !offered.has(id)) commands.delete(id);
    }
    const next = JSON.stringify(value);
    if (next !== key || commandChanged) { key = next; background = value; render(); }
  };
  const surface = () => { const shown = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]"); return shown ? shown.dataset.pluginId : ""; };
  const gone = new Set(), GONE = "catalog.project_not_found";
  const LONGEST = 120000;
  // A stream that spoke and was lost connects again at once; one the Host never answered waits 30 s, then twice as long each time (N54).
  let heard = null, stream = null, listening = false, retry = 0, delay = 1000, lost = false, spoke = false;
  // The Home's content-free stream is shared by visible windows of this origin (FSS-06).
  // The window holding the lock relays a notice. Each window still reads under its own current page scope.
  // Where a browser has neither, each window listens itself.
  const shared = typeof BroadcastChannel === "function" && Boolean(navigator.locks);
  let lease = null, ear = null;
  const readAddress = () => route("/api/attention?surface=" + encodeURIComponent(surface()));
  const discardRead = () => {
    const previous = reading; reading = null; previous?.controller.abort();
    clearTimeout(scheduled?.timer); scheduled = null; again = false;
  };
  const read = async (immediate = false) => {
    if (document.hidden || gone.has(route("/api/attention"))) return;
    const address = readAddress();
    if ((reading && reading.address !== address) || (scheduled && scheduled.address !== address)) discardRead();
    if (immediate && scheduled) { clearTimeout(scheduled.timer); scheduled = null; }
    if (reading || scheduled) { again = true; return; }
    const current = { address, controller: new AbortController() };
    reading = current; again = false;
    const started = performance.now(), sequence = ++readSequence;
    try {
      const data = await molisWorkRequest(address, { signal: current.controller.signal });
      if (reading !== current || address !== readAddress()) return;
      showTasks(data.background_tasks, sequence);
      document.dispatchEvent(new CustomEvent("molis-work:attention", { detail: Object.assign(data, { started, sequence }) }));
      heard = new Date().toISOString();
    } catch (error) {
      if (reading !== current || address !== readAddress()) return;
      // Any other failure keeps what it showed; the next word from the stream reads again.
      if (error && error.status === 404 && error.code === GONE) { gone.add(route("/api/attention")); close(); }
      else { showTasks(null); document.dispatchEvent(new CustomEvent("molis-work:attention-unreachable", { detail: { since: heard } })); }
    }
    // Let the Host do other work between passive reads. Changes during the read or the next half second share one follow-up.
    finally {
      if (reading === current) {
        reading = null;
        scheduled = { address, timer: setTimeout(() => { scheduled = null; if (again) void read(); }, 500) };
      }
    }
  };
  const unreachable = () => { if (!lost) { lost = true; document.dispatchEvent(new CustomEvent("molis-work:attention-unreachable", { detail: { since: heard } })); } };
  const close = () => {
    clearTimeout(retry); listening = false;
    if (stream) { const open = stream; stream = null; open.abort(); }
    if (lease) { lease.abort(); lease = null; }
    if (ear) { ear.close(); ear = null; }
  };
  // The Host's word that something here may have changed (WLN-27): one stream, read again on each word. There is no beat; a lost
  // stream is the page losing the Host (said once, as of the last read), and it connects again, waiting longer each time.
  const connect = async () => {
    clearTimeout(retry);
    if (!listening || stream) return;
    const connection = new AbortController(); stream = connection;
    try {
      const reply = await molisWorkRequest(eventsPath, { as: "response", signal: connection.signal, headers: { accept: "text/event-stream" } });
      if (stream !== connection || !listening) return;
      if (reply.status === 404 && (await reply.json().catch(() => null))?.code === GONE) { if (stream === connection) { gone.add(route("/api/attention")); discardRead(); close(); } return; }
      if (reply.status !== 200 || !reply.body) throw new Error("no stream");
      const reader = reply.body.getReader(), decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        for (let end = buffer.indexOf("\\n\\n"); end >= 0; end = buffer.indexOf("\\n\\n")) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          // The stream opens with a word: only then is the Host there, so one that answers and closes at once keeps backing off.
          if (/^event: changed$/m.test(block)) { delay = 1000; lost = false; spoke = true; ear?.postMessage("changed"); void read(); }
        }
      }
    } catch { /* told below */ }
    finally {
      if (stream === connection) {
        stream = null;
        if (!connection.signal.aborted && listening && !document.hidden && !gone.has(route("/api/attention"))) {
          unreachable(); ear?.postMessage("lost");
          if (!spoke) delay = Math.max(delay, 30000);
          spoke = false;
          retry = setTimeout(() => void connect(), delay); delay = Math.min(delay * 2, LONGEST);
        }
      }
    }
  };
  const listen = (preserveHeard = false) => {
    if (document.hidden || gone.has(route("/api/attention"))) { discardRead(); close(); return; }
    if (listening) { void read(true); return; }
    if (!preserveHeard) heard = null;
    listening = true;
    if (!shared) { void connect(); return; }
    const name = "molis-work-attention:" + eventsPath, held = new AbortController(), channel = new BroadcastChannel(name);
    lease = held; ear = channel;
    channel.onmessage = (event) => { if (event.data === "changed") { lost = false; void read(); } else if (event.data === "lost") unreachable(); };
    // Holding the lock is listening: it is given back when this window stops (hidden or gone), and the next
    // window waiting takes the stream, whose first word everyone reads.
    const lead = () => new Promise((release) => {
      if (held.signal.aborted) { release(); return; }
      held.signal.addEventListener("abort", () => release(), { once: true });
      void connect();
    });
    // A window that joins another one already listening reads once itself, then waits its turn.
    navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      if (lock) return lead();
      if (held.signal.aborted) return;
      void read();
      navigator.locks.request(name, { signal: held.signal }, lead).catch(() => {});
    }).catch(() => {});
  };
  document.addEventListener("molis-work:attention-refresh", (event) => {
    if (event?.detail?.reconnected === true) {
      delay = 1000;
      lost = false;
      if (!document.hidden && !gone.has(route("/api/attention"))) {
        // Re-enter via close()+listen(true) so navigator.locks single-leader ownership is preserved,
        // any wedged stream is replaced, and prior heard state survives a transient first read failure.
        close();
        listen(true);
      }
    }
    void read(true);
  });
  // A hidden page hears nothing (N54); coming back it connects again, and the stream's first word reads. A page told it is shown
  // while its stream is still open reads once: what changed outside the Host's word (a store a crash left) shows when it is looked at.
  document.addEventListener("visibilitychange", () => listen());
  document.querySelector(".plugin-rail-items")?.addEventListener("click", () => setTimeout(read, 300));
  // The chooser reads the new project at once, independent of the shared stream.
  const chooser = document.querySelector(".chooser");
  if (chooser) new MutationObserver(() => { discardRead(); heard = null; listen(); }).observe(chooser, { attributes: true, attributeFilter: ["data-selected"] });
  listen();
}`;
