/** A new element with the given text (none: empty). */
export function el<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, text = ""): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

/** What an Error says (the Host's words, when a request was refused); anything else thrown is shown as it is. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
