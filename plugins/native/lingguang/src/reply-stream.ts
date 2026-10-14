/** A progress event the page reads while a streamed 灵光 route is still working. */
export type LingguangStreamEvent = { readonly stage: string; readonly progress: number; readonly text_delta?: string };

const STREAMED = [/^\/api\/lingguang\/(?:material|source)$/u, /^\/api\/lingguang\/conversations\/[^/]+\/messages$/u];

/** A POST the page asked to read line by line. The host forwards these; it does not decide which routes qualify. */
export function lingguangStreams(method: string, url: URL): boolean {
  return method === "POST" && url.searchParams.get("stream") === "1" && STREAMED.some(path => path.test(url.pathname));
}

/** The first line, before any preview text: a reply is waiting, and a file or a page is being read. */
export function lingguangStreamOpening(pathname: string): { type: "progress"; stage: "waiting" | "extracting"; progress: 0 } {
  return { type: "progress", stage: pathname.endsWith("/messages") ? "waiting" : "extracting", progress: 0 };
}

/** One later line, as the action reported it, including a reply's preview text when that action sent some. */
export function lingguangStreamLine(event: LingguangStreamEvent): { type: "progress" } & LingguangStreamEvent {
  return { type: "progress", ...event };
}
