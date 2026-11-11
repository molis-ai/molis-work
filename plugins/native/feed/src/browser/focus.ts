const CONTROL_KEYS = ["data-feed-entry-id", "data-feed-page", "data-feed-material-page",
  "data-feed-action", "data-open-source-record", "data-retry-feed-detail"] as const;

/** Find the same reading control after its page or detail is drawn in the new language. */
export function feedFocusReplacement(focused: Element, next: ParentNode): HTMLElement | null {
  const key = CONTROL_KEYS.find(name => focused.hasAttribute(name));
  if (key) return next.querySelector<HTMLElement>(`[${key}="${CSS.escape(focused.getAttribute(key)!)}"]`);
  if (focused.localName !== "summary") return null;
  const details = focused.parentElement;
  if (details?.matches(".feed-materials")) return next.querySelector<HTMLElement>(".feed-materials > summary");
  const material = details?.dataset.feedMaterialContent;
  return material === undefined ? null : next.querySelector<HTMLElement>(`[data-feed-material-content="${CSS.escape(material)}"] > summary`);
}
