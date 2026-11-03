import { el } from "../dom.js";
import type { Page } from "./page.js";
import type { Overlap } from "./shapes.js";

/** What the person chose about work that names the same files. */
export type OverlapChoice = "cancel" | "parallel" | "wait";

/** What an overlapping piece of work is doing, in words. */
function overlapLine(page: Page, overlap: Overlap): string {
  const { L } = page, values = { task: (overlap.task || "").split("\n")[0]!.slice(0, 80), paths: overlap.paths.join(L("coding.list.joiner")) };
  return overlap.state === "running" ? L("coding.overlap.running", values) : L("coding.overlap.waiting", values);
}

/** Other work under way names the same files: wait for it, go ahead side by side, or not send. */
export function askOverlap(page: Page, overlaps: readonly Overlap[]): Promise<OverlapChoice> {
  const { L, lifetime, root } = page;
  return new Promise(resolve => {
    const dialog = el("dialog", "", "mw-dialog coding-overlap"), box = el("div", "", "mw-dialog__shell coding-overlap-body"), list = el("ul"), actions = el("div", "", "coding-overlap-actions");
    dialog.setAttribute("aria-label", L("coding.overlap.label"));
    for (const overlap of overlaps) {
      const item = el("li");
      item.append(el("strong", L("coding.quote", { title: overlap.title })), document.createTextNode(overlapLine(page, overlap)));
      list.append(item);
    }
    const choose = (value: OverlapChoice) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const button = (label: string, value: OverlapChoice, primary = false) => {
      const node = el("button", label, "mw-btn" + (primary ? " mw-btn--primary" : ""));
      node.type = "button";
      node.dataset.codingOverlap = value;
      lifetime.listen(node, "click", () => choose(value));
      actions.append(node);
    };
    button(L("coding.overlap.cancel"), "cancel");
    button(L("coding.overlap.parallel"), "parallel");
    button(L("coding.overlap.wait", { title: overlaps[0]!.title.slice(0, 20) }), "wait", true);
    lifetime.listen(dialog, "cancel", event => {
      event.preventDefault();
      choose("cancel");
    });
    box.append(el("h2", L("coding.overlap.title")), list, el("p", L("coding.overlap.hint")), actions);
    dialog.append(box);
    root.append(dialog);
    dialog.showModal();
  });
}
