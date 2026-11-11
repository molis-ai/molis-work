/**
 * The bundle's entry (dist/settings-view-height-client.js, the package's build). The settings shell gives the height of its
 * scrolling area (`.settings-content`, the standalone settings page's and the settings stage's in the workbench) as
 * `--settings-view-h`, so a part that stays in view inside it knows how tall it may be: the list and detail with
 * `data-sticky-detail` (design system, docs/design/capability-pack/README.md「组件板新增」8). Both areas are in the page from the
 * start (the stage is hidden until opened), so one ResizeObserver over them keeps the value, the stage's included when it first
 * shows. Where the observer is missing the parts fall back to the window's height.
 */
const page = globalThis as { molisSettingsViewHeight?: boolean };

if (typeof ResizeObserver === "function" && !page.molisSettingsViewHeight) {
  page.molisSettingsViewHeight = true;
  const sizes = new ResizeObserver(entries => {
    for (const entry of entries) (entry.target as HTMLElement).style.setProperty("--settings-view-h", `${entry.target.clientHeight}px`);
  });
  const watch = () => document.querySelectorAll(".settings-content").forEach(area => sizes.observe(area));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch, { once: true });
  else watch();
}
