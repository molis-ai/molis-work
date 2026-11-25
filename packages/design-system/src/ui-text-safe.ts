/** Run a `t.text(...)` lookup with a static fallback only when rendered outside any UI text context. */
export function uiTextOrFallback(fallback: string, read: () => string): string {
  try {
    return read();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ui.text_no_context") return fallback;
    throw error;
  }
}
