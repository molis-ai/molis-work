import { installCapture, remembered } from "./capture.js";
import { installDetail } from "./detail.js";
import { messageOf, statusOf } from "./dom.js";
import { installImages } from "./images.js";
import { installList } from "./list.js";
import { isPending, issuesPage } from "./page.js";
import { installReview } from "./review.js";
import type { Issue, IssuesHost, IssuesPage } from "./types.js";

/** The button a click landed on, and what it asks for. */
async function onClick(page: IssuesPage, event: Event) {
  const { el, state, L } = page;
  const button = (event.target as Element).closest<HTMLElement>("button, a[data-issue-id]");
  if (!button || state.saving) return;
  const is = (key: string) => button.hasAttribute("data-issue-" + key);
  const current = state.current;
  if (button.dataset.issueId) await page.open(button.dataset.issueId);
  else if (button.dataset.type) { page.pick(button.dataset.type); page.flag(); }
  else if (is("back")) await page.back();
  else if (is("edit") && current) { state.editing = true; page.fill(current as Issue); page.mode(); el.titleInput.focus(); }
  else if (is("cancel") && current) { if (isPending(current)) await page.abandon(current); else page.show(current as Issue); }
  else if (is("redo") && current) { if (isPending(current)) await page.redo(current); else await page.reviewIssue(); }
  else if (is("delete") && current && !isPending(current)) {
    const target = current;
    if (!await page.confirm(L("issues.editor.delete-title"), target.title + "\n\n" + L("issues.editor.delete-text"), L("issues.detail.delete"),
      () => page.api("delete", { id: target.id, expected_version: target.version }))) return;
    state.rows = state.rows.filter((row) => row.id !== target.id);
    if (state.current === target) await page.back();
    page.toast(L("issues.editor.deleted"));
  }
  else if (is("more")) await page.load(true);
  else if (is("reload")) await page.refresh();
  else if (is("toast-action") && state.toastRun) {
    const then = state.toastRun;
    el.toastBox.hidden = true;
    state.toastRun = null;
    await then();
  }
}

/** An item that is gone is said where it would have been, and the workbench is told so it neither names it nor carries it; a reopen nobody asked for (quiet) forgets it without a word. */
function onSelectItem(page: IssuesPage, event: Event) {
  const detail = (event as CustomEvent<{ itemId?: unknown; quiet?: unknown } | undefined>).detail;
  const id = detail?.itemId, quiet = detail?.quiet === true;
  if (typeof id !== "string") return;
  page.el.gone.hidden = true;
  page.run(() => page.open(id).catch((error: unknown) => {
    const status = statusOf(error);
    if (status !== 404 && status !== 403) throw error;
    page.el.root.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: id } }));
    if (!quiet || status === 403) { page.el.gone.textContent = messageOf(error); page.el.gone.hidden = false; }
  }));
}

function listenToKeys(page: IssuesPage) {
  const { el, state, scope } = page;
  scope.listen(el.composer, "submit", (event) => { event.preventDefault(); page.run(page.submit); });
  scope.listen(el.editor, "submit", (event) => { event.preventDefault(); page.run(page.save); });
  scope.listen(el.root, "keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.key === "Enter" && (key.metaKey || key.ctrlKey) && !key.isComposing) {
      const form = (key.target as Element).closest?.("form");
      if (form === el.composer || form === el.editor) { key.preventDefault(); form.requestSubmit(); }
    } else if (key.key === "Escape" && !el.detail.hidden && !state.editing && !el.root.querySelector("dialog[open]")) { key.preventDefault(); page.run(page.back); }
  });
  scope.listen(el.root, "input", (event) => {
    const target = event.target;
    if (target === el.desc) {
      page.fit(el.desc);
      page.ready();
      remembered(() => localStorage.setItem(page.storageKey, el.desc.value));
    }
    if (target instanceof HTMLTextAreaElement && target.form === el.editor) page.fit(el.detailInput);
  });
}

function listenToPage(page: IssuesPage) {
  const { el, state, scope } = page;
  scope.listen(window, "beforeunload", (event) => {
    if (state.importing || state.pictureWrites || state.pictureFault || state.pending.some((item) => item.state === "organizing")
      || (state.editing && !page.draft() && Object.keys(page.changed()).length)) { event.preventDefault(); (event as BeforeUnloadEvent).returnValue = ""; }
  });
  // The side panel focuses this frame when it is summoned: land in the composer, ready to type. A click into the
  // frame also focuses it; that click goes where it was aimed, with nothing moved under it.
  let pointed = 0;
  scope.listen(document, "pointerdown", () => { pointed = Date.now(); }, true);
  scope.listen(window, "blur", () => { pointed = 0; });
  scope.listen(window, "focus", () => {
    if (Date.now() - pointed < 500 || el.home.hidden || ![document.body, null].includes(document.activeElement as HTMLElement | null)) return;
    el.home.scrollTop = 0;
    el.desc.focus({ preventScroll: true });
  });
  scope.listen(window, "storage", (event) => {
    const change = event as StorageEvent;
    if (change.key === page.storageKey && document.activeElement !== el.desc) { el.desc.value = change.newValue || ""; page.fit(el.desc); page.ready(); }
  });
}

/** One view in every place it mounts. Writing is never blocked: a capture leaves the composer at once and Issue names it in the background (capture.ts). Opening a record replaces the list; Back returns to it. */
export function mountIssues(host: IssuesHost): void {
  const page = issuesPage(host);
  if (!page) return;
  const { el, scope } = page;
  page.$("key").textContent = page.mac ? "⌘↵" : "Ctrl↵";
  installList(page);
  installDetail(page);
  installImages(page);
  installCapture(page);
  installReview(page);
  listenToKeys(page);
  scope.listen(el.root, "click", (event) => page.run(() => onClick(page, event)));
  scope.listen(el.root, "molis-work:select-item", (event) => onSelectItem(page, event));
  listenToPage(page);
  try { el.desc.value = localStorage.getItem(page.storageKey) || ""; } catch { el.desc.value = ""; }
  page.ready();
  scope.whenVisible(() => {
    page.run(page.refresh);
    scope.frame(() => page.fit(el.desc));
    return scope.listen(window, "molis:assistant-effect", (event) => {
      const capability = (event as CustomEvent<{ capability_id?: unknown } | undefined>).detail?.capability_id;
      if (typeof capability === "string" && capability.startsWith("issues.")) page.run(page.refresh);
    });
  });
}
