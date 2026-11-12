/**
 * The bundle's entry (dist/owner-unavailable-copy-client.js): the one copy button of the page that stands in for a part an upgrade stopped
 * (U3 §2.3). The page has no workbench shell and so no shared copy feedback; this answers its button the same way, with
 * `data-copy="done"` or `"failed"` for two and a half seconds.
 */
document.addEventListener("click", event => {
  const button = (event.target as Element | null)?.closest<HTMLElement>("[data-copy-value]");
  if (!button) return;
  const settle = (state: "done" | "failed") => { button.dataset.copy = state; setTimeout(() => { delete button.dataset.copy; }, 2500); };
  navigator.clipboard.writeText(button.dataset.copyValue ?? "").then(() => settle("done"), () => settle("failed"));
});
