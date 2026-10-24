/** A new element with the given text (none: empty) and class. */
export function el<Tag extends keyof HTMLElementTagNameMap>(tag: Tag, text = "", className = ""): HTMLElementTagNameMap[Tag] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

/**
 * What an Error says (the Host's words, when a request was refused); anything else thrown is shown as it is. An error made in
 * another window (a plugin's frame, a test's context) is not an `instanceof Error` here, so it is read by its shape.
 */
export function errorMessage(error: unknown): string {
  return error !== null && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : String(error);
}
