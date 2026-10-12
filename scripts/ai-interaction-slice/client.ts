import { mountScene } from "./controller.ts";
import { find, text } from "./dom.ts";
import type { Layout } from "./model.ts";

let active: Layout = "assistant";
function updateCounters(): void {
  const controller = scenes[active];
  text(document, "[data-counts]", `演示回答 ${controller.state.answerAttempts} 次 · 演示执行 ${controller.state.effectAttempts} 次`);
  text(document, "[data-demo-mode]", controller.description());
}
const scenes = {
  assistant: mountScene(find(document, '[data-scene="assistant"]'), "assistant", updateCounters),
  coding: mountScene(find(document, '[data-scene="coding"]'), "coding", updateCounters),
};
document.querySelectorAll<HTMLButtonElement>("[data-layout]").forEach(button => button.addEventListener("click", () => {
  const next = button.dataset.layout;
  if (next !== "assistant" && next !== "coding") return;
  active = next;
  for (const name of ["assistant", "coding"] as const) find(document, `[data-scene="${name}"]`).hidden = name !== next;
  document.querySelectorAll("[data-layout]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === button)));
  scenes[active].refresh();
}));
find(document, "[data-theme-toggle]").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  text(document, "[data-theme-toggle] [data-slot=button-label]", dark ? "切换浅色" : "切换深色");
});
find(document, ".demo-controls").addEventListener("click", event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("[data-action]");
  if (button?.dataset.action) scenes[active].action(button.dataset.action);
});
updateCounters();
document.documentElement.dataset.sliceReady = "true";
