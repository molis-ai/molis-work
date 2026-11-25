export type CatalogBrowserSay = (key: string, values?: Record<string, string | number>) => string;

/** Read a localized string from the page's installed `globalThis.t.text` reader inside catalog browser scripts. */
export const catalogBrowserSay: CatalogBrowserSay = (key, values) => {
  const tool: unknown = Reflect.get(globalThis, "t");
  const read: unknown = typeof tool === "object" && tool !== null ? Reflect.get(tool, "text") : undefined;
  return typeof read === "function" ? String((read as CatalogBrowserSay)(key, values)) : key;
};
