import { mountScene } from "./controller.ts";
import { find, text } from "./dom.ts";
import type { Layout } from "./model.ts";

let active: Layout = "assistant";
let mounted: Record<Layout, ReturnType<typeof mountScene>> | null = null;
function updateCounters(): void {
  const controller = mounted?.[active];
  if (!controller) return;
  text(document, "[data-counts]", `演示回答 ${controller.state.answerAttempts} 次 · 演示执行 ${controller.state.effectAttempts} 次`);
  text(document, "[data-demo-mode]", controller.description());
}
const scenes: Record<Layout, ReturnType<typeof mountScene>> = mounted = {
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
const themeToggle = find(document, "[data-theme-toggle]");
const paintTheme = () => text(themeToggle, "[data-slot=button-label]", document.documentElement.dataset.theme === "dark" ? "浅色" : "深色");
themeToggle.addEventListener("click", () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  paintTheme();
});
new MutationObserver(paintTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
// The demo's own switches: a menu that closes after a choice, on Escape and on a click elsewhere.
const controls = find<HTMLDetailsElement>(document, ".demo-controls");
controls.addEventListener("click", event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>("[data-action]");
  if (!button?.dataset.action) return;
  scenes[active].action(button.dataset.action);
  controls.open = false;
});
document.addEventListener("click", event => {
  if (controls.open && event.target instanceof Node && !controls.contains(event.target)) controls.open = false;
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && controls.open) { controls.open = false; find(controls, "summary").focus(); }
});
updateCounters();
document.documentElement.dataset.sliceReady = "true";
