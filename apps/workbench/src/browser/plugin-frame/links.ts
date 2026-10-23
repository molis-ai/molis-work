import type { FrameScope } from "./types.js";

/** Downloads use the page's exact read authority. The plugin never receives the owner's blob URL. */
export async function downloadFrameFile(url: URL, pageId: string, scope: FrameScope): Promise<void> {
  if (url.origin !== location.origin) throw new Error("Download refused");
  const response = await molisWorkRequest<Response>(url.href, { headers: { "x-molis-plugin-page": pageId }, as: "response", scope, signal: scope.signal });
  if (!response.ok) throw new Error(molisWorkRequest.text(await response.json()));
  const blob = await response.blob(); scope.assertCurrent();
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(response.headers.get("content-disposition") ?? "")?.[1];
  downloadPageBlob(blob, encoded ? decodeURIComponent(encoded).slice(0, 200) : "download", scope);
}

export function downloadPageBlob(blob: Blob, filename: string, scope: FrameScope): void {
  const address = URL.createObjectURL(blob), link = document.createElement("a");
  link.download = filename.slice(0, 200);
  link.href = address; link.hidden = true; document.body.append(link); link.click(); link.remove();
  scope.own(() => URL.revokeObjectURL(address));
}
