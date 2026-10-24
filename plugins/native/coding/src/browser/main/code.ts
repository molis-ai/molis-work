import { codeLanguage, codeTokens, diffRowTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
import { el } from "../dom.js";
import { paintable } from "./boundary.js";
import type { Page } from "./page.js";

/**
 * Web addresses in a turn (a dev server the round started, a page it read) are links, built from text nodes, never from
 * model-written markup; the Workbench opens them in the side panel's browser (specs/archive/side-panel).
 */
export function linkedText(node: HTMLElement, text: string) {
  node.replaceChildren();
  let at = 0;
  const pattern = /https?:\/\/[^\s<>"'`）】」]+[^\s<>"'`）】」.,;:!?。，；：！？)]/g;
  for (const match of text.matchAll(pattern)) {
    if (match.index > at) node.append(document.createTextNode(text.slice(at, match.index)));
    const link = el("a", match[0]);
    link.href = match[0];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    node.append(link);
    at = match.index + match[0].length;
  }
  if (at < text.length) node.append(document.createTextNode(text.slice(at)));
}

/** The rows of one side of a diff list, with the text each holds. */
function diffRows(codes: readonly HTMLElement[]) {
  return codes.map(code => {
    const sign = code.querySelector(".diff-sign");
    return { code, sign, kind: code.dataset.kind || code.parentElement?.dataset.kind || "", text: [...code.childNodes].filter(node => node !== sign).map(node => node.textContent).join("") };
  });
}

/** Colours the diffs of a container, a slice a frame; a row is painted once. */
export function paintDiffs(page: Page, scope: ParentNode) {
  const { host, lifetime } = page, { paintRows } = page.refs;
  scope.querySelectorAll<HTMLElement>("[data-code-path] .diff-rows").forEach(list => (list.classList.contains("diff-split") ? [".diff-left", ".diff-right"] : [""]).forEach(side => {
    const codes = [...list.querySelectorAll<HTMLElement>(":scope > li > code" + side)].filter(code => code.dataset.kind !== "blank");
    if (!codes.some(code => !code.dataset.painted)) return;
    const language = codeLanguage(list.closest<HTMLElement>("[data-code-path]")?.dataset.codePath || ""), rows = diffRows(codes);
    // A line past 40,000 characters stays text and the rest are coloured, a slice a frame (paintRows); splitting is cheap.
    const painted = language ? diffRowTokens(rows, language, codeTokens) : null;
    const fresh = rows.flatMap((row, index) => {
      const pieces = painted?.[index];
      if (row.code.dataset.painted || !pieces) return [];
      row.code.dataset.painted = "true";
      return [{ code: paintable(row.code), sign: row.sign, text: row.text, pieces }];
    });
    paintRows(fresh, step => lifetime.frame(() => {
      if (list.isConnected) step();
    }), paintable(list), release => host.mountPluginClient(list)?.own(release) ?? (() => undefined));
  }));
}

/** Code blocks of a turn get colours and a copy button; the copy is the text as written, not from the colours. */
export function enrichCode(page: Page, node: ParentNode) {
  const { L, lifetime } = page, { codeSource, paintBlock } = page.refs;
  node.querySelectorAll<HTMLElement>("pre:not([data-enriched])").forEach(pre => {
    pre.dataset.enriched = "";
    const code = pre.querySelector("code");
    codeSource.set(paintable(pre), (code || pre).textContent ?? "");
    if (code) paintBlock(paintable(code));
    const button = el("button", L("coding.copy.label"), "mw-btn coding-code-copy");
    button.type = "button";
    lifetime.listen(button, "click", () => window.molisCopy?.(button, () => codeSource.get(paintable(pre)) ?? "", { done: L("coding.copy.done"), failed: L("coding.copy.failed") }));
    pre.append(button);
  });
}
