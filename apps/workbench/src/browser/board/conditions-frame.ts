import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * The component board's conditions frame (apps/workbench/src/condition-frame.ts, specs/visual-ui-experience VUX-39): what the
 * Assistant's island does with a reply (`bindText`: the code figure's copy from `data-code` and its fold; `molisStreamText`
 * with the figure's `grow`; `molisFollow` for the thread), driven by the fixed steps the page carries instead of a run. The
 * reply starts written, so nothing moves until 重播; 停止 is the cancel. A copy refused by the query is the clipboard refusing,
 * through the same `molisCopy`. What the browser gives (zoom, pointer, reduced motion) is read out, never set.
 */
type Follower = { readonly state: string; pin(): void; toLatest(): void };
type PagePrograms = {
  molisBoardCodeGrow?: CodeGrow;
  molisCopy?: (button: HTMLElement, source: () => string | Promise<string>, labels?: { done?: string; failed?: string }) => Promise<boolean>;
  molisFollow?: (scroller: HTMLElement, options?: { onChange?: (state: string) => void }) => Follower;
  molisStreamText?: (container: HTMLElement, html: string, options?: { reveal?: boolean; grow?: (kept: Element, next: Element) => boolean }) => unknown;
  molisShowMore?: (list: HTMLElement, options: { key: string; label: string; limit?: number; keep?: string }) => void;
};
type Frame = { steps: string[]; reply: string; copy: "ok" | "fail"; pace: number };
/** The island's own code-figure program (`createAssistantCodeGrow`), which the page carries as written (condition-frame.ts). */
type CodeGrow = (text: typeof uiText.text) => { bindMore(figure: HTMLElement): void; growCode(kept: Element, next: Element): boolean; paint(figure: HTMLElement): void };

const page = window as Window & PagePrograms;
const one = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

const S = JSON.parse(one("#mw-cond-data").textContent ?? "{}") as Frame;
const reply = one("[data-cond-reply]"), thread = one("[data-cond-thread]"), latest = one("[data-cond-latest]");
const status = one("[data-cond-state]"), stop = one<HTMLButtonElement>("[data-cond-stop]");
const code = page.molisBoardCodeGrow!(uiText.text);

const source = (read: () => string) => S.copy === "fail" ? () => Promise.reject(new Error("simulated")) : read;
const copyFrom = (button: HTMLElement, read: () => string) => page.molisCopy?.(button, source(read), { done: uiText.text("workbench.conditions-frame.copied"), failed: uiText.text("workbench.conditions-frame.could-not-copy") });
const bindText = (root: HTMLElement) => root.querySelectorAll<HTMLElement>(".assistant-code:not([data-bound])").forEach((figure) => {
  figure.dataset.bound = "";
  const copy = figure.querySelector<HTMLElement>(".assistant-code-copy")!;
  copy.addEventListener("click", () => { void copyFrom(copy, () => figure.dataset.code ?? ""); });
  code.bindMore(figure);
  if (figure.dataset.paint) code.paint(figure);
});
const follow = page.molisFollow?.(thread, { onChange: (state) => { if (state === "following") latest.hidden = true; } });
const show = (html: string, reveal: boolean) => {
  if (page.molisStreamText) page.molisStreamText(reply, html, { reveal, grow: code.growCode });
  else reply.innerHTML = html;
  bindText(reply);
  if (!follow || follow.state === "following") follow?.pin(); else latest.hidden = false;
};
const setState = (name: "writing" | "stopped" | "done") => {
  status.dataset.condState = name;
  stop.disabled = name !== "writing";
  status.textContent = name === "writing" ? uiText.text("workbench.conditions-frame.writing-reply") : name === "stopped" ? uiText.text("workbench.conditions-frame.stopped-what-was-written-stays") : uiText.text("workbench.conditions-frame.finished");
};

let timer = 0;
const play = () => {
  clearInterval(timer);
  reply.replaceChildren();
  follow?.toLatest();
  setState("writing");
  let at = 0;
  timer = window.setInterval(() => {
    show(S.steps[at]!, at < S.steps.length - 1);
    at += 1;
    if (at >= S.steps.length) { clearInterval(timer); setState("done"); }
  }, S.pace);
};
one("[data-cond-replay]").addEventListener("click", play);
stop.addEventListener("click", () => { clearInterval(timer); setState("stopped"); });
latest.addEventListener("click", () => follow?.toLatest());
one("[data-cond-copy-reply]").addEventListener("click", (event) => { void copyFrom(event.currentTarget as HTMLElement, () => S.reply); });
show(S.steps[S.steps.length - 1]!, false);
setState("done");
for (const [selector, key] of [["[data-cond-tools]", "cond-tools"], ["[data-cond-tools-edge]", "cond-tools-edge"]] as const) {
  page.molisShowMore?.(one(selector), { key, label: uiText.text("workbench.conditions-frame.show-n-more"), keep: "[data-cond-kept]" });
}

const env = () => {
  one("[data-cond-env-zoom]").textContent = "×" + Math.round(devicePixelRatio * 100) / 100;
  one("[data-cond-env-pointer]").textContent = matchMedia("(pointer: coarse)").matches ? uiText.text("workbench.conditions-frame.touch") : uiText.text("workbench.conditions-frame.fine");
  one("[data-cond-env-motion]").textContent = matchMedia("(prefers-reduced-motion: reduce)").matches ? uiText.text("workbench.conditions-frame.reduced") : uiText.text("workbench.conditions-frame.full");
};
env();
addEventListener("resize", env);
for (const query of ["(pointer: coarse)", "(prefers-reduced-motion: reduce)"]) matchMedia(query).addEventListener("change", env);
