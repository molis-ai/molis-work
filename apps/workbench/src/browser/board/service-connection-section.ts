import { mountConnectionItems } from "../service-connection-item.js";

/**
 * The program of the board's 服务连接 section (apps/workbench/src/service-connection-specimens.ts): the rows open and close as the
 * product's will, and the two 试一下 specimens step on timers — a sample of a connection, nothing signs in.
 */
type ProgressState = "running" | "hold" | "failed" | "cancelled" | "done";

mountConnectionItems();

/** Moves a drawn progress on: the marks, the caption (the live region), and the word after it for a step that did not go on. */
function paint(box: HTMLElement, steps: readonly string[], caption: string, at: number, state: ProgressState, word?: string): void {
  const progress = box.querySelector<HTMLElement>("[data-connection-progress]");
  const line = progress?.querySelector(".connection-progress__caption");
  if (!progress || !line) return;
  progress.dataset.state = state;
  progress.querySelectorAll(".mw-steps li").forEach((li, index) => {
    li.classList.toggle("is-done", state === "done" || index < at);
    if (state !== "done" && index === at) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
  });
  const n = state === "done" ? steps.length : at + 1;
  line.textContent = caption.replace("{n}", String(n)).replace("{total}", String(steps.length)).replace("{step}", steps[n - 1] ?? "");
  if (word) {
    const tag = document.createElement("span");
    tag.className = "connection-progress__state";
    tag.textContent = `· ${word}`;
    line.append(" ", tag);
  }
}

const demo = document.querySelector<HTMLElement>("[data-conn-progress-demo]");
if (demo) {
  const steps = JSON.parse(demo.dataset.steps ?? "[]") as string[], words = JSON.parse(demo.dataset.words ?? "{}") as Record<string, string>;
  let at = 0, state: ProgressState = "running";
  demo.addEventListener("click", (event) => {
    const act = (event.target as Element).closest<HTMLElement>("[data-conn-step]")?.dataset.connStep;
    if (!act) return;
    if (act === "reset") { at = 0; state = "running"; }
    else if (act === "next") {
      if (state !== "running") state = "running";
      else { at = Math.min(at + 1, steps.length - 1); if (at === steps.length - 1) state = "done"; }
    } else if (state !== "done") state = act as ProgressState;
    paint(demo, steps, demo.dataset.caption ?? "", at, state, words[state]);
  });
}

const box = document.querySelector<HTMLElement>("[data-conn-card-demo]");
const need = box?.querySelector<HTMLElement>("[data-connection-need]");
const go = box?.querySelector<HTMLElement>("[data-conn-card-go]");
const body = need?.querySelector<HTMLElement>(".connection-card__body");
const say = need?.querySelector<HTMLElement>("[data-conn-card-say]");
const said = say?.querySelector(".mw-status > span:last-child");
const note = say?.querySelector<HTMLElement>("p");
const line = need?.querySelector<HTMLElement>(".connection-need__line");
const fold = need?.querySelector<HTMLElement>(".connection-need__fold");
if (box && need && go && body && say && said && note && line && fold) {
  const steps = JSON.parse(box.dataset.steps ?? "[]") as string[], caption = box.dataset.caption ?? "", waiting = said.textContent ?? "";
  const timers: number[] = [];
  const reset = () => {
    timers.splice(0).forEach(clearTimeout);
    need.dataset.state = "ask"; fold.inert = false; line.replaceChildren(); body.hidden = true; go.hidden = false;
    said.textContent = waiting; note.hidden = false;
    paint(box, steps, caption, 0, "running");
  };
  go.addEventListener("click", () => {
    // The button that started it goes away: the focus stays in the card, and moves to the line once the card folds.
    need.dataset.state = "running"; body.hidden = false; go.hidden = true;
    need.querySelector<HTMLElement>(".connection-card")?.focus();
    timers.push(window.setTimeout(() => { paint(box, steps, caption, 1, "running"); said.textContent = say.dataset.connCardSay ?? ""; note.hidden = true; }, 1400));
    timers.push(window.setTimeout(() => paint(box, steps, caption, 2, "done"), 2600));
    timers.push(window.setTimeout(() => {
      const mark = document.createElement("span"), text = document.createElement("span");
      mark.className = "mw-status mw-status--done mw-status--plain"; mark.dataset.slot = "status"; mark.dataset.mwState = "done";
      text.textContent = need.dataset.connectedLabel ?? ""; mark.append(text);
      const held = need.contains(document.activeElement);
      line.replaceChildren(mark); need.dataset.state = "done"; fold.inert = true;
      if (held) line.parentElement?.focus();
    }, 3400));
  });
  box.querySelector("[data-conn-card-reset]")?.addEventListener("click", reset);
  reset();
}
