import type { IssueListResult } from "../store.js";
import { esc, isAbort } from "./dom.js";
import type { IssuesPage, IssueSummary, Pending } from "./types.js";

export const KIND_KEYS: Record<string, string> = { bug: "issues.kind.bug", experience: "issues.kind.experience", feature: "issues.kind.feature" };

const MINUTE_MS = 60_000;
const DAY_MS = 864e5;

/** The list: the person's captures that are still on their way, then their saved records, newest first. */
export function installList(page: IssuesPage): void {
  const { el, state, L, host, mac } = page;
  const when = (iso: string) => {
    const date = new Date(iso), now = new Date();
    const minutes = Math.round((now.getTime() - date.getTime()) / MINUTE_MS), today = new Date(now).setHours(0, 0, 0, 0);
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return minutes < 1 ? L("issues.when.now") : minutes < 60 ? L("issues.when.minutes-ago", { count: minutes })
      : date.getTime() >= today ? L("issues.when.today", { time }) : date.getTime() >= today - DAY_MS ? L("issues.when.yesterday", { time })
      : date.toLocaleDateString([], { month: "short", day: "numeric" });
  };
  const excerpt = (item: Pending) => item.text.trim().split("\n")[0]!.slice(0, 90) || L("issues.list.screenshots", { count: item.images.length });
  const row = (id: string, title: string, meta: string, kind = "") =>
    '<li><button type="button" class="issues-row"' + (id === state.fresh ? " data-craft-new" : "") + ' data-issue-id="' + esc(id) + '"'
    + (kind ? ' data-state="' + kind + '"' : "") + ">" + (kind ? '<span data-mw-state="' + (kind === "organizing" ? "running" : "answer") + '" aria-hidden="true"></span>' : "")
    + "<span><b>" + esc(title) + "</b><small>" + esc(meta) + "</small></span></button></li>";
  const savedRow = (issue: IssueSummary) => row(issue.id, issue.title, [L(KIND_KEYS[issue.type] ?? issue.type), when(issue.created_at), issue.context?.page?.title?.split(" · ")[0],
    issue.image_count ? L("issues.list.shot-count", { count: issue.image_count }) : ""].filter(Boolean).join(" · "));

  page.render = () => {
    // The shell marks this tool while a capture is on its way or needs the person, also when the panel is closed.
    const status = state.pending.some((item) => item.state === "attention") ? "attention" : state.pending.length ? "busy" : "";
    if (status !== state.reported) { state.reported = status; host.status?.(status); }
    page.remember();
    el.list.removeAttribute("aria-busy");
    el.list.innerHTML = state.pending.map((item) => row(item.id, excerpt(item), item.state === "organizing" ? L("issues.list.organizing") : item.note ?? "", item.state)).join("")
      // Where it was written (the place before the project) tells two short titles apart at a glance.
      + state.rows.map(savedRow).join("")
      || '<li class="issues-empty">' + esc(L("issues.list.empty", { keys: mac ? "⌘⇧I" : "Ctrl+Shift+I" })) + "</li>";
    page.$("more").hidden = !state.next;
    state.fresh = null;
  };
  page.load = async (more = false) => {
    const epoch = ++state.listEpoch;
    const result = await page.api<IssueListResult>("list" + (more && state.next ? "?cursor=" + encodeURIComponent(JSON.stringify(state.next)) : ""));
    if (epoch !== state.listEpoch) return;
    state.rows = more ? [...state.rows, ...result.items] : result.items;
    state.next = result.next_cursor;
    state.pending = state.pending.filter((item) => !item.restored || !state.rows.some((saved) => saved.id === item.id));
    page.render();
  };
  page.refresh = () => page.load().catch((error: unknown) => {
    if (isAbort(error)) return;
    el.list.removeAttribute("aria-busy");
    el.list.innerHTML = '<li class="issues-empty">' + esc(L("issues.list.read-failed")) + ' <button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-issue-reload>' + esc(L("issues.list.retry")) + "</button></li>";
  });
}
