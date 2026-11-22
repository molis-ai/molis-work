/**
 * The bundle's entry (dist/settings-view-height-client.js, the package's build). The settings shell gives the height of its
 * scrolling area (`.settings-content`, the standalone settings page's and the settings stage's in the workbench) as
 * `--settings-view-h`, so a part that stays in view inside it knows how tall it may be: the list and detail with
 * `data-sticky-detail` (design system, docs/design/capability-pack/README.md「组件板新增」8). Both areas are in the page from the
 * start (the stage is hidden until opened), so one ResizeObserver over them keeps the value, the stage's included when it first
 * shows. Where the observer is missing the parts fall back to the window's height.
 */
const page = globalThis as { molisSettingsViewHeight?: boolean; molisSettingsNavFilter?: boolean };

if (typeof ResizeObserver === "function" && !page.molisSettingsViewHeight) {
  page.molisSettingsViewHeight = true;
  const sizes = new ResizeObserver(entries => {
    for (const entry of entries) {
      (entry.target as HTMLElement).style.setProperty("--settings-view-h", `${entry.target.clientHeight}px`);
    }
  });
  const watch = () => document.querySelectorAll(".settings-content").forEach(area => sizes.observe(area));
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch, { once: true });
  } else {
    watch();
  }
}

function applySettingsNavFilter(input: HTMLInputElement): void {
  const scope = input.closest(".settings-navigation, .plugin-section-body");
  if (!scope) return;
  const list = scope.querySelector(".settings-nav-body, [data-settings-directory-nav]");
  if (!list) return;
  const query = input.value.trim().toLowerCase();
  const groupSelector = ".settings-nav-group-label, .settings-directory-group";
  let currentGroup: HTMLElement | null = null;
  let groupShown = 0;
  let totalShown = 0;
  for (const child of Array.from(list.children)) {
    const el = child as HTMLElement;
    if (el.matches(groupSelector)) {
      if (currentGroup) {
        currentGroup.hidden = query !== "" && groupShown === 0;
      }
      currentGroup = el;
      groupShown = 0;
      continue;
    }
    const text = (el.textContent || "").toLowerCase();
    const match = query === "" || text.includes(query);
    el.hidden = !match;
    if (match) {
      groupShown++;
      totalShown++;
    }
  }
  if (currentGroup) {
    currentGroup.hidden = query !== "" && groupShown === 0;
  }
  const empty = scope.querySelector<HTMLElement>("[data-settings-nav-empty]");
  if (empty) {
    empty.hidden = query === "" || totalShown > 0;
  }
}

if (typeof document !== "undefined" && !page.molisSettingsNavFilter) {
  page.molisSettingsNavFilter = true;
  document.addEventListener("input", event => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches("[data-settings-nav-filter]")) {
      applySettingsNavFilter(target);
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const target = event.target;
    if (target instanceof HTMLInputElement && target.matches("[data-settings-nav-filter]") && target.value) {
      event.preventDefault();
      target.value = "";
      applySettingsNavFilter(target);
    }
  });
}
