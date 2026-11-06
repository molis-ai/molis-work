import { foldConnectionCard, mountConnectionItems, startConnectionCard, updateConnectionProgress, type ConnectionProgressState } from "../service-connection-item.js";

/**
 * The program of the board's 服务连接 section (apps/workbench/src/service-connection-specimens.ts). What changes on the page is the
 * parts' own program (src/browser/service-connection-item.ts); this only drives the two 试一下 specimens on timers — a sample of
 * a connection, nothing signs in.
 */
mountConnectionItems();

const demo = document.querySelector<HTMLElement>("[data-conn-progress-demo]");
const demoProgress = demo?.querySelector<HTMLElement>("[data-connection-progress]");
if (demo && demoProgress) {
  const last = JSON.parse(demoProgress.dataset.steps ?? "[]").length - 1;
  let at = 0, state: ConnectionProgressState = "running";
  demo.addEventListener("click", (event) => {
    const act = (event.target as Element).closest<HTMLElement>("[data-conn-step]")?.dataset.connStep;
    if (!act) return;
    if (act === "reset") { at = 0; state = "running"; }
    else if (act === "next") {
      if (state !== "running") state = "running";
      else { at = Math.min(at + 1, last); if (at === last) state = "done"; }
    } else if (state !== "done") state = act as ConnectionProgressState;
    updateConnectionProgress(demoProgress, { at, state });
  });
}

const box = document.querySelector<HTMLElement>("[data-conn-card-demo]");
const need = box?.querySelector<HTMLElement>("[data-connection-need]");
const progress = need?.querySelector<HTMLElement>("[data-connection-progress]");
const say = need?.querySelector<HTMLElement>("[data-conn-card-say]");
const said = say?.querySelector(".mw-status > span:last-child");
const note = say?.querySelector<HTMLElement>("p");
if (box && need && progress && say && said && note) {
  const waiting = said.textContent ?? "";
  const timers: number[] = [];
  const reset = () => {
    timers.splice(0).forEach(clearTimeout);
    need.dataset.state = "ask";
    need.querySelector(".connection-need__line")?.replaceChildren();
    const fold = need.querySelector<HTMLElement>(".connection-need__fold");
    if (fold) fold.inert = false;
    said.textContent = waiting; note.hidden = false;
    updateConnectionProgress(progress, { at: 0, state: "running" });
  };
  box.querySelector("[data-conn-card-go]")?.addEventListener("click", () => {
    startConnectionCard(need);
    timers.push(window.setTimeout(() => { updateConnectionProgress(progress, { at: 1, state: "running" }); said.textContent = say.dataset.connCardSay ?? ""; note.hidden = true; }, 1400));
    timers.push(window.setTimeout(() => updateConnectionProgress(progress, { at: 2, state: "done" }), 2600));
    timers.push(window.setTimeout(() => foldConnectionCard(need), 3400));
  });
  box.querySelector("[data-conn-card-reset]")?.addEventListener("click", reset);
}
