import type { TimelineRun, TimelineTurnChanges } from "./timeline.js";

/** Runs in the browser only; the plugin build has no DOM library, so elements are typed structurally. */
interface Element {
  className: string;
  dataset: Record<string, string | undefined>;
  innerHTML: string;
  children: Iterable<Element>;
  querySelector(selector: string): { open?: boolean } | null;
}
declare const document: { createElement(tag: string): Element };

/**
 * The row for what one turn wrote. Injected into the browser with `toString()` like the timeline, so it stays
 * self-contained, and its comments stay out here: whatever is inside the function ships to every page.
 *
 * `place` finds this turn's row in the round's block (kept across renders) or makes it, and draws what the turn really
 * wrote, as the runtime counted it from its write receipts (never the model's own account): a row where it happened,
 * styled as a timeline row and a run card's file list, the round's changes one click away, and — once the session is
 * idle and the round has ended — a reviewed rewind to before each write. It is rebuilt only when what it shows changes,
 * so an open row stays open while the round goes on.
 */
export function createCodingTurnChanges() {
  const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] as string));
  const place = (block: Element, changes: TimelineTurnChanges, run: TimelineRun, rewindable: boolean) => {
    const id = `${run.ref.run_id}:${changes.turn}`, files = changes.files, key = JSON.stringify([files.map(file => [file.path, file.digest, file.checkpoint_id]), rewindable]);
    const node = [...block.children].find((child: Element) => child.dataset.codingTurnChanges === id) ?? document.createElement("div");
    node.dataset.codingTurnChanges = id;
    if (node.dataset.key !== key) {
      node.dataset.key = key;
      const names = files.slice(0, 3).map(file => file.path.split("/").at(-1)).join(" · ") + (files.length > 3 ? ` 等 ${files.length} 个` : "");
      node.innerHTML = `<details class="coding-tool"${node.querySelector("details")?.open ? " open" : ""}><summary><span class="coding-tool-icon"><svg aria-hidden="true"><use href="#icon-edit"></use></svg></span><span class="coding-tool-verb">本轮写入 ${files.length} 个文件</span><span class="coding-tool-preview">${escape(names)}</span></summary>`
        + `<ul class="coding-run-files">${files.map(file => `<li><code>${escape(file.path)}</code><small class="coding-run-round" title="SHA-256 ${escape(file.digest)}">${file.byte_length} 字节</small>`
          + (rewindable ? `<button type="button" class="mw-btn mw-btn--ghost" data-coding-rewind="${escape(file.checkpoint_id)}" aria-label="${escape("预览回退到写入 " + file.path + " 之前")}">预览回退</button>` : "") + "</li>").join("")}</ul>`
        + `<p class="coding-run-facts">按写入回执记下的实际修改，不是模型的说法。命令改动的文件不在这里。</p><div class="coding-run-actions"><button type="button" class="mw-btn mw-btn--ghost" data-coding-change-open="${escape(run.ref.run_id)}">查看这一轮的变更</button></div></details>`;
    }
    return node;
  };
  return { place };
}
