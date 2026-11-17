import { renderButton } from "./button.js";
import type { MwComposerLabels } from "./composer.js";
import { cx, escapeHtml } from "./html.js";
import { icon } from "./icon.js";

/** Fills a label's `{name}` and the like (the page's own filler: the SDK's `formatMessage`). */
export type ComposerFill = (text: string, values: Readonly<Record<string, string>>) => string;

/**
 * One row of the attachment strip: `key` names it while it lives (the row is redrawn in its own element); `retry` offers 重试 on a
 * failed row; `thumb` is a read picture's own preview (an object or data URL), in place of the file mark. In the picture layout a
 * row also says its size and state in `meta` (「240 KB · 已存一份」), and `open` names the button its preview becomes.
 */
export interface ComposerStripItem {
  readonly key: string; readonly title: string; readonly state: "reading" | "attached" | "failed"; readonly reason?: string; readonly from?: string;
  readonly retry?: boolean; readonly thumb?: string; readonly meta?: string; readonly open?: string;
}

/**
 * The attachment strip (the board's upload rows): being read (`aria-busy`), read (with where a pick came from, or a picture's
 * preview) or refused with its reason, 重试 when trying again may help, and a remove (VUX-18). `pictures` lays it out as one row
 * of previews that scrolls sideways (Coding A3, docs/design/coding-daily-basics scheme A): each preview opens the picture
 * (`data-composer-open="<key>"`), and a refusal wraps to a second line rather than being cut.
 */
export function renderComposerStrip(labels: MwComposerLabels, items: readonly ComposerStripItem[], fill: ComposerFill, options: { readonly pictures?: boolean; readonly label?: string } = {}): string {
  if (!items.length) return "";
  return `<ul class="${cx("mw-uploads mw-composer__files", options.pictures && "is-pictures")}"${options.label ? ` aria-label="${escapeHtml(options.label)}"` : ""}>${items.map((item) => {
    const note = item.state === "reading" ? `<small>${escapeHtml(fill(labels.reading, { name: item.title }))}</small>`
      : item.state === "failed" ? `<small class="is-failed">${escapeHtml(item.reason ?? "")}</small>` : item.meta ?? item.from ? `<small>${escapeHtml((item.meta ?? item.from)!)}</small>` : "";
    const remove = fill(labels.remove, { name: item.title }), again = fill(labels.retryFile, { name: item.title });
    const picture = item.thumb ? `<img class="mw-composer__thumb" src="${escapeHtml(item.thumb)}" alt="">` : icon(item.from ? "package" : "file");
    const mark = item.thumb && item.open
      ? `<button type="button" class="mw-mark mw-composer__open" aria-label="${escapeHtml(item.open)}" data-composer-open="${escapeHtml(item.key)}">${picture}</button>`
      : `<span class="mw-mark">${picture}</span>`;
    const retry = item.state === "failed" && item.retry
      ? renderButton({ label: labels.retry, variant: "ghost", size: "sm", attrs: { "aria-label": again, title: again, "data-composer-retry": item.key } }) : "";
    return `<li class="mw-upload${item.state === "attached" ? "" : ` is-${item.state}`}" data-composer-file="${escapeHtml(item.key)}"${item.state === "reading" ? ' aria-busy="true"' : ""}>${mark}<span><span class="mw-composer__name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</span>${note}</span>${retry}${
      renderButton({ label: remove, variant: "ghost", size: "icon", icon: "x", iconOnly: true, attrs: { title: remove, "data-composer-remove": item.key } })}</li>`;
  }).join("")}</ul>`;
}
