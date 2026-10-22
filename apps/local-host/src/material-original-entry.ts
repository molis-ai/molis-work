import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { HostOfferedOriginalFile } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The request header the Host's own clients (the desktop shell, a local client holding the control token) put on the import request
 * for the file the person chose: the absolute path, percent-encoded. The `Sec-` prefix is why page script cannot send it: a browser
 * refuses to let `fetch` or `XMLHttpRequest` set a header whose name starts with `Sec-`. A page the Host serves to a plugin holds the
 * control token, so the token alone proves nothing about who chose the file; this header is what says the Host's entry did.
 */
const ORIGINAL_PATH_HEADER = "sec-molis-work-original-path";
const MAX_PATH_LENGTH = 4096;

/**
 * The file this request offers, or nothing. Nothing unless: a POST (an import is a person's act, not a read), exactly one such header,
 * no `Sec-Fetch-*` header (a browser sends those on its own requests and page script cannot remove them, so a request that has any
 * came from a page, whatever else it carries), and a plain absolute path. Not read from the body, the query or any plugin input.
 * The path is only noted here; whether the plugin may keep or read it is the `materials:original` service's.
 */
export function offeredOriginalFile(request: IncomingMessage, installId: string): HostOfferedOriginalFile | undefined {
  if (request.method !== "POST") return undefined;
  const raw = request.headers[ORIGINAL_PATH_HEADER];
  if (typeof raw !== "string" || !raw) return undefined;
  let copies = 0;
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index]!.toLowerCase();
    if (name === ORIGINAL_PATH_HEADER) copies += 1;
    else if (name.startsWith("sec-fetch-")) return undefined;
  }
  if (copies !== 1) return undefined;
  let decoded: string;
  try { decoded = decodeURIComponent(raw); } catch { return undefined; }
  if (!decoded || decoded.length > MAX_PATH_LENGTH || decoded.includes("\0") || !path.isAbsolute(decoded)) return undefined;
  return { path: decoded, install_id: installId };
}
