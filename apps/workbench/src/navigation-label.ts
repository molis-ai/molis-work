import { workbenchPlatformText } from "./platform-languages.js";

/** Read a platform navigation label from the active UI text context, falling back to the default workbench pack when outside a request scope. */
export function workbenchNavigationLabel(key: string, read: () => string): string {
  try {
    return read();
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ui.text_no_context") {
      const value = workbenchPlatformText.pack(workbenchPlatformText.default)?.messages[key];
      return typeof value === "string" ? value : key;
    }
    throw error;
  }
}
