import type { FrameScope } from "./types.js";

/** The most characters a file name saved from a plugin page may have. */
const FILE_NAME_LIMIT = 200;

/**
 * Whole characters, not UTF-16 units (a two-unit character such as an emoji is one), and a cut keeps the extension: a dot and up to ten
 * ASCII letters or digits at the very end, which is why only the last 11 units are looked at. A name from a page has no limit of its own,
 * so only a bounded piece is spread into characters. A name that fits comes back unchanged.
 */
function savedFileName(name: string): string {
  const extension = /\.[A-Za-z0-9]{1,10}$/u.exec(name.slice(-11))?.[0] ?? "";
  return [...name.slice(0, name.length - extension.length).slice(0, 2 * FILE_NAME_LIMIT)].slice(0, FILE_NAME_LIMIT - extension.length).join("") + extension;
}

/** Downloads use the page's exact read authority. The plugin never receives the owner's blob URL. */
export async function downloadFrameFile(url: URL, pageId: string, scope: FrameScope): Promise<void> {
  if (url.origin !== location.origin) throw new Error("Download refused");
  const response = await molisWorkRequest<Response>(url.href, { headers: { "x-molis-plugin-page": pageId }, as: "response", scope, signal: scope.signal });
  if (!response.ok) throw new Error(molisWorkRequest.text(await response.json()));
  const blob = await response.blob(); scope.assertCurrent();
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get("content-disposition") ?? "")?.[1];
  downloadPageBlob(blob, encoded ? decodeURIComponent(encoded) : "download", scope);
}

export function downloadPageBlob(blob: Blob, filename: string, scope: FrameScope): void {
  const address = URL.createObjectURL(blob), link = document.createElement("a");
  link.download = savedFileName(filename);
  link.href = address; link.hidden = true; document.body.append(link); link.click(); link.remove();
  scope.own(() => URL.revokeObjectURL(address));
}
