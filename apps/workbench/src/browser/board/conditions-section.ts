/**
 * The board's 条件与状态 strip (apps/workbench/src/condition-specimens.ts, specs/visual-ui-experience VUX-39): one choice is one
 * parameter, either in the frame's address (the rest of it stays as it was) or, for the container, the frame's width.
 */
const frame = document.querySelector<HTMLIFrameElement>("[data-cond-frame]");
if (frame) document.addEventListener("click", (event) => {
  const choice = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cond-param]") : null;
  if (!choice) return;
  const name = choice.dataset.condParam ?? "", value = choice.dataset.condValue ?? "";
  if (name === "width") { frame.style.width = value + "px"; return; }
  const url = new URL(frame.src, location.href);
  if (url.searchParams.get(name) === value) return;
  url.searchParams.set(name, value);
  frame.src = url.pathname + url.search;
});
