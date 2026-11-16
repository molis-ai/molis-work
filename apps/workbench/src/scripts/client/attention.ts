/**
 * What waits on the person, read once for the whole page (W4-10): `/api/attention` answers the Assistant's notices for the
 * plugin in front and the plugin deliveries waiting in the market in one request; on a project page also the project's work line
 * and the tasks behind it (the bottom line and the task panel paint from them, browser/work-bar.ts), on the Home page the
 * background tasks of every open project. It is read again whenever the Host says something it shows may have changed (one stream,
 * `GET /api/attention/events`, WLN-27: no beat), when the person moves to another plugin, and when a reader asks (`molis-work:attention-refresh`, after the person acted on something). The Assistant's bell, with the plugin
 * notification count, paints from `molis-work:attention`; this module paints the Home page's background-tasks tab (a project page has none: specs/work-line §4.5): its
 * badge counts the tasks not finished (running plus waiting on the person), and its view lists them, in this project and every
 * other open one, with the background commands they left running and a button to stop each (the row's own command, through the mainline service). It knows no plugin: each row names where it opens, the words under its title and whether
 * it waits on the person, as the provider that owns the task said them (PG-043, specs/work-line §6). A task here
 * opens in place, one elsewhere opens its project on it.
 *
 * The notices asked for are those of the plugin in front (the person's rules hold some while it matches). Each read
 * carries when it started: a count the market reports later than that is newer than its answer (assistant-island.ts).
 * A failed read leaves what the page last showed: each part is a convenience. A 404 (the project or Home is gone) stops the reads
 * and the stream of that address, until it names another project (the chooser's). A lost stream is said once
 * (`molis-work:attention-unreachable`, as of the last read) and connected again, twice as long after each loss (up to two minutes);
 * a hidden page keeps no stream (N54).
 */
import { objectLinkAt } from "@molis-ai/molis-work-contracts/platform/object-link";

export const ATTENTION_FACTORY_SCRIPT = `(host) => {
  const { translate: readText, projectId, openItem, route } = host;
  if (document.body.dataset.paneEmbedded === "true") return;
  const tab = document.querySelector('[data-side-tab="tasks"]');
  const count = tab?.parentElement?.querySelector("[data-background-tasks-count]");
  const list = document.querySelector("[data-background-tasks-list]");
  let tasks = [], key = "", reading = false, again = false;
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
      detail.append(node("span", [task.step, ...task.details].filter(Boolean).map(phrase => phrase.text).join(" · ")));
      if (task.project_id !== projectId) detail.append(node("span", task.project_name, "background-task-project"));
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
        const line = node("div", undefined, "background-task-command");
        const stop = node("button", globalThis.t.text("workbench.attention.stop"), "mw-btn mw-btn--ghost"); stop.type = "button";
        const feedback = node("div", "", "background-task-detail"); feedback.setAttribute("role", "alert");
        stop.addEventListener("click", async () => {
          stop.disabled = true; feedback.replaceChildren();
          try {
            await molisWorkRequest("/projects/" + encodeURIComponent(task.project_id) + "/api/mainline/tasks/command", { body: { source: task.source, subject: task.subject, command } });
            line.remove(); key = ""; void read();
          } catch (error) { if (!list.contains(feedback)) list.append(feedback); molisWorkRequest.show(feedback, error); stop.disabled = false; }
        });
        line.append(node("span", globalThis.t.text("workbench.attention.background-command"), "background-task-command-label"), node("code", command.summary), stop);
        list.append(line, feedback);
      }
    }
  };
  const surface = () => { const shown = document.querySelector(".plugin-rail-items [aria-current][data-plugin-id]"); return shown ? shown.dataset.pluginId : ""; };
  // A 404 means the project (or Home) this address reads is gone: an old tab stops asking it (N54). It is kept by address: the
  // project chooser's route follows the project chosen, and another one is asked.
  const gone = new Set();
  const LONGEST = 120000;
  // A stream that spoke and was lost connects again at once; one the Host never answered waits 30 s, then twice as long each time (N54).
  let heard = null, stream = null, streamAt = "", retry = 0, delay = 1000, lost = false, spoke = false;
  // One stream for every window of a project (FSS-06: a browser holds six connections to one Host): the window holding the lock listens
  // and passes each word on; the others hear it on the channel, so a window keeps one long connection (its appearance) to the Host.
  // Where a browser has neither, each window listens itself.
  const shared = typeof BroadcastChannel === "function" && Boolean(navigator.locks);
  let lease = null, ear = null;
  const read = async () => {
    if (document.hidden || gone.has(route("/api/attention"))) return;
    if (reading) { again = true; return; }
    reading = true; again = false;
    const started = performance.now();
    try {
      const data = await molisWorkRequest(route("/api/attention?surface=" + encodeURIComponent(surface())));
      const rows = data.background_tasks, next = JSON.stringify(rows);
      if (Array.isArray(rows) && next !== key) { key = next; tasks = rows; render(); }
      document.dispatchEvent(new CustomEvent("molis-work:attention", { detail: Object.assign(data, { started }) }));
      heard = new Date().toISOString();
    } catch (error) {
      // Any other failure keeps what it showed; the next word from the stream reads again.
      if (error && error.status === 404) { gone.add(route("/api/attention")); close(); }
      else document.dispatchEvent(new CustomEvent("molis-work:attention-unreachable", { detail: { since: heard } }));
    }
    // Words that came while reading are one more read, half a second after this one began at the soonest: a round that writes
    // all the time is read at most twice a second, never back to back.
    finally { reading = false; if (again) { reading = true; setTimeout(() => { reading = false; void read(); }, Math.max(0, 500 - (performance.now() - started))); } else if (route("/api/attention/events") !== streamAt) void listen(); }
  };
  const unreachable = () => { if (!lost) { lost = true; document.dispatchEvent(new CustomEvent("molis-work:attention-unreachable", { detail: { since: heard } })); } };
  const close = () => {
    clearTimeout(retry); streamAt = "";
    if (stream) { const open = stream; stream = null; open.abort(); }
    if (lease) { lease.abort(); lease = null; }
    if (ear) { ear.close(); ear = null; }
  };
  // The Host's word that something here may have changed (WLN-27): one stream, read again on each word. There is no beat; a lost
  // stream is the page losing the Host (said once, as of the last read), and it connects again, waiting longer each time.
  const connect = async (address) => {
    clearTimeout(retry);
    if (streamAt !== address || stream) return;
    const connection = new AbortController(); stream = connection;
    try {
      const reply = await molisWorkRequest(address, { as: "response", signal: connection.signal, headers: { accept: "text/event-stream" } });
      if (reply.status === 404) { gone.add(route("/api/attention")); return; }
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
        if (!connection.signal.aborted && streamAt === address && !document.hidden && !gone.has(route("/api/attention"))) {
          unreachable(); ear?.postMessage("lost");
          if (!spoke) delay = Math.max(delay, 30000);
          spoke = false;
          retry = setTimeout(() => void connect(address), delay); delay = Math.min(delay * 2, LONGEST);
        }
      }
    }
  };
  const listen = () => {
    const address = route("/api/attention/events");
    if (document.hidden || gone.has(route("/api/attention"))) { close(); return; }
    if (streamAt === address) return;
    close(); streamAt = address;
    if (!shared) { void connect(address); return; }
    const name = "molis-work-attention:" + address, held = new AbortController(), channel = new BroadcastChannel(name);
    lease = held; ear = channel;
    channel.onmessage = (event) => { if (event.data === "changed") { lost = false; void read(); } else if (event.data === "lost") unreachable(); };
    // Holding the lock is listening: it is given back when this window stops (hidden, gone, another project), and the next
    // window waiting takes the stream, whose first word everyone reads.
    const lead = () => new Promise((release) => {
      if (held.signal.aborted) { release(); return; }
      held.signal.addEventListener("abort", () => release(), { once: true });
      void connect(address);
    });
    // A window that joins another one already listening reads once itself, then waits its turn.
    navigator.locks.request(name, { ifAvailable: true }, (lock) => {
      if (lock) return lead();
      if (held.signal.aborted) return;
      void read();
      navigator.locks.request(name, { signal: held.signal }, lead).catch(() => {});
    }).catch(() => {});
  };
  document.addEventListener("molis-work:attention-refresh", read);
  // A hidden page hears nothing (N54); coming back it connects again, and the stream's first word reads. A page told it is shown
  // while its stream is still open reads once: what changed outside the Host's word (a store a crash left) shows when it is looked at.
  document.addEventListener("visibilitychange", () => { if (document.hidden) close(); else if (streamAt === route("/api/attention/events")) void read(); else void listen(); });
  document.querySelector(".plugin-rail-items")?.addEventListener("click", () => setTimeout(read, 300));
  // The chooser's address follows the project chosen: its stream (whose first word reads) is that project's at once.
  const chooser = document.querySelector(".chooser");
  if (chooser) new MutationObserver(() => listen()).observe(chooser, { attributes: true, attributeFilter: ["data-selected"] });
  listen();
}`;
