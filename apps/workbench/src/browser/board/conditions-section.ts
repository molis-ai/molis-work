/**
 * The board's parameter strips (apps/workbench/src/condition-specimens.ts, specs/visual-ui-experience VUX-39): one choice is one
 * parameter of the frame in its own section (条件与状态, 助理信息与任务), either in the frame's address (the rest of it stays
 * as it was) or, for the container, the frame's width.
 */
document.addEventListener("click", (event) => {
  const choice = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cond-param]") : null;
  const frame = choice?.closest("[data-primitive]")?.querySelector<HTMLIFrameElement>("iframe");
  if (!choice || !frame) return;
  const name = choice.dataset.condParam ?? "", value = choice.dataset.condValue ?? "";
  if (name === "width") { frame.style.width = value + "px"; return; }
  const url = new URL(frame.src, location.href);
  if (url.searchParams.get(name) === value) return;
  url.searchParams.set(name, value);
  frame.src = url.pathname + url.search;
});
