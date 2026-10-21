import type { TimelineRun, TimelineTurnChanges } from "./timeline.js";

/** Runs in the browser only; the plugin build has no DOM library, so elements are typed by the fields this script touches. */
type TurnNode = {
  className: string;
  dataset: { codingTurnChanges?: string; key?: string };
  innerHTML: string;
  children: Iterable<TurnNode>;
  querySelector(selector: string): { open?: boolean } | null;
};
declare const document: { createElement(tag: string): TurnNode };

/**
 * The row for what one turn wrote. Injected into the browser with `toString()` like the timeline, so it stays
 * self-contained.
 */
export function createCodingTurnChanges(L: (key: string, values?: Record<string, string | number>) => string) {
  const svg = (name: string) => `<svg aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
  /**
   * What one turn really wrote, as the runtime counted it from its write receipts (never the model's own account): a
   * row where it happened, the round's changes one click away, and — once the round has ended — a reviewed rewind to
   * before each write. Rebuilt only when what it shows changes, so an open row stays open while the round goes on.
   */
  const render = (node: TurnNode, changes: TimelineTurnChanges, run: TimelineRun, rewindable: boolean) => {
    const key = JSON.stringify([changes.files.map(file => [file.path, file.digest, file.checkpoint_id]), rewindable]);
    node.className = "coding-turn-changes";
    node.dataset.codingTurnChanges = `${run.ref.run_id}:${changes.turn}`;
    if (node.dataset.key === key) return;
    node.dataset.key = key;
    const files = changes.files;
    const names = files.slice(0, 3).map(file => file.path.split("/").at(-1)).join(" · ") + (files.length > 3 ? L("coding.turn-changes.and-more", { count: files.length }) : "");
    const open = node.querySelector("details")?.open ? " open" : "";
    node.innerHTML = `<details${open}><summary><span class="coding-tool-icon">${svg("edit")}</span><span class="coding-tool-verb">${escape(L("coding.turn-changes.summary", { count: files.length }))}</span><span class="coding-tool-preview">${escape(names)}</span></summary>`
      + `<ul class="coding-turn-changes-files">${files.map(file => `<li><code>${escape(file.path)}</code><small title="${escape(L("coding.turn-changes.digest", { digest: file.digest }))}">${escape(L("coding.turn-changes.bytes", { count: file.byte_length }))}</small>`
        + (rewindable ? `<button type="button" class="mw-btn mw-btn--ghost" data-coding-rewind="${escape(file.checkpoint_id)}" aria-label="${escape(L("coding.turn-changes.rewind-label", { path: file.path }))}">${escape(L("coding.turn-changes.rewind"))}</button>` : "") + "</li>").join("")}</ul>`
      + `<p class="coding-turn-changes-note">${escape(L("coding.turn-changes.note"))}</p>`
      + `<button type="button" class="mw-btn mw-btn--ghost" data-coding-change-open="${escape(run.ref.run_id)}">${escape(L("coding.turn-changes.open"))}</button></details>`;
  };
  /** The row for this turn in the round's block (kept across renders), drawn. A rewind is offered only once the session is idle. */
  const place = (block: TurnNode, changes: TimelineTurnChanges, run: TimelineRun, rewindable: boolean) => {
    const key = `${run.ref.run_id}:${changes.turn}`;
    const node = [...block.children].find(child => child.dataset.codingTurnChanges === key) ?? document.createElement("div");
    render(node, changes, run, rewindable);
    return node;
  };
  return { render, place };
}
