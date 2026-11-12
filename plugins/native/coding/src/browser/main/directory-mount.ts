import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { el, errorMessage } from "../dom.js";
import type { CodingWorkbenchHost } from "../workbench.js";
import type { SessionRecord } from "./shapes.js";

/** The already declared directory surface reads its own owner, with the same filter and explicit restore as the workbench. */
export function mountCodingDirectory(host: CodingWorkbenchHost): void {
  const root = host.root, lifetime = host.mountPluginClient(root);
  if (!lifetime) return;
  const list = root.querySelector<HTMLElement>("[data-coding-sessions]"), archivedButton = root.querySelector<HTMLButtonElement>("[data-coding-archived]"),
    more = root.querySelector<HTMLButtonElement>("[data-coding-archived-more]");
  if (!list || !archivedButton || !more) return;
  const notice = el("p", "", "coding-face-note"); notice.setAttribute("role", "status"); list.after(notice);
  let archived = false, rows: SessionRecord[] = [], cursor: string | null = null, generation = 0, readTicket = 0, loading = false;
  const request = <T>(path: string, method: "GET" | "PATCH" = "GET", body?: unknown, signal?: AbortSignal) =>
    molisWorkRequest<T>(host.pluginRoute(path), { method, body, signal: signal ?? lifetime.signal, scope: lifetime, fallback: uiText.text("coding.error.request") });
  const render = () => {
    archivedButton.setAttribute("aria-pressed", String(archived));
    const needle = root.querySelector<HTMLInputElement>("[data-coding-search]")?.value.trim().toLocaleLowerCase() ?? "";
    const filter = root.querySelector<HTMLElement>("[data-coding-filter][aria-pressed=true]")?.dataset.codingFilter ?? "all";
    const visible = rows.filter(row => row.title.toLocaleLowerCase().includes(needle)
      && (archived || filter === "all" || filter === "running" && row.state === "running" || filter === "needs-you" && ["paused", "waiting-answer", "waiting-approval", "failed", "reconcile-required"].includes(row.state)));
    list.replaceChildren();
    for (const session of visible) {
      const incomplete = !session.archived && session.execution_state === "archived", restoring = archived || incomplete;
      const row = el("div", "", "mw-dir-row-wrap"), link = el("a", "", "mw-dir-row mw-dir-row--meta coding-session-row");
      link.href = "#session-" + encodeURIComponent(session.session_id); link.dataset.codingSession = session.session_id;
      const title = el("strong", session.title, "coding-session-title"); title.title = session.title;
      const copy = el("span", "", "mw-dir-row__copy"); copy.append(title);
      if (incomplete || session.runtime_session_id && session.execution_state === null) copy.append(el("small", uiText.text(incomplete ? "coding.session.lifecycle-incomplete" : "coding.session.lifecycle-unavailable"), "coding-session-state"));
      link.append(copy); row.append(link);
      const label = uiText.text(restoring ? "coding.session.restore" : "coding.context.archive");
      const change = el("button", restoring ? "↩" : "↓", "mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only"); change.type = "button";
      change.setAttribute("aria-label", label); change.title = label;
      if (restoring) change.dataset.codingRestore = session.session_id; else change.dataset.codingDirectoryArchive = session.session_id;
      row.append(change);
      list.append(row);
    }
    if (!visible.length) list.append(el("p", needle ? uiText.text("coding.directory.no-match") : uiText.text("coding.directory.empty"), "mw-empty"));
    more.hidden = cursor === null; more.disabled = loading;
  };
  const read = async (append = false, signal?: AbortSignal) => {
    const ticket = ++readTicket, started = generation; loading = true;
    try {
      const value = await request<{ sessions: SessionRecord[]; next_cursor: string | null }>("/sessions?archived=" + archived + "&limit=50"
        + (append && cursor ? "&cursor=" + encodeURIComponent(cursor) : ""), "GET", undefined, signal);
      lifetime.assertCurrent(signal);
      if (started !== generation || ticket !== readTicket) return;
      rows = append ? [...rows, ...value.sessions] : value.sessions; cursor = value.next_cursor; notice.textContent = ""; render();
    } finally { if (ticket === readTicket) { loading = false; more.disabled = false; } }
  };
  const fail = (error: unknown) => { if (lifetime.alive) notice.textContent = errorMessage(error); };
  lifetime.listen(root, "click", event => {
    const mouse = event as MouseEvent, target = (event.target as Element | null)?.closest<HTMLElement>("button,a");
    if (!target) return;
    const action = async () => {
      if (target === archivedButton) { archived = !archived; generation++; await read(); }
      else if (target === more) await read(true);
      else if (target.dataset.codingRestore || target.dataset.codingDirectoryArchive) {
        const archive = Boolean(target.dataset.codingDirectoryArchive), id = target.dataset.codingRestore ?? target.dataset.codingDirectoryArchive!;
        if (archive && !await host.confirm(uiText.text("coding.session.archive-confirm"))) return;
        target.setAttribute("disabled", "");
        try { await request("/sessions/" + encodeURIComponent(id), "PATCH", { archive }); await read(); notice.textContent = uiText.text(archive ? "coding.session.archived" : "coding.session.restored"); }
        finally { target.removeAttribute("disabled"); }
      } else if (target.dataset.codingSession) {
        event.preventDefault(); const session = rows.find(row => row.session_id === target.dataset.codingSession);
        if ((mouse.metaKey || mouse.ctrlKey) && host.openBeside) host.openBeside("coding", target.dataset.codingSession, session?.title);
        else host.openItem?.("coding", target.dataset.codingSession, session?.title);
      } else if (target.dataset.codingFilter) {
        root.querySelectorAll("[data-coding-filter]").forEach(button => button.setAttribute("aria-pressed", String(button === target))); render();
      } else if (target.hasAttribute("data-coding-search-toggle")) {
        const query = root.querySelector<HTMLElement>("[data-coding-query]"); if (query) { query.hidden = !query.hidden; target.setAttribute("aria-expanded", String(!query.hidden)); }
      } else if (target.hasAttribute("data-coding-new")) host.openPlugin?.("coding");
      else if (target.dataset.codingFace) host.openPlugin?.("coding");
    };
    void action().catch(fail);
  });
  const search = root.querySelector("[data-coding-search]"); if (search) lifetime.listen(search, "input", render);
  lifetime.watchRevision(signal => request("/view-revision", "GET", undefined, signal), async signal => { await read(false, signal); });
  lifetime.whenVisible(signal => { void read(false, signal).catch(fail); });
}
