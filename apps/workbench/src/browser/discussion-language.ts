import type { UiFrameLanguage } from "@molis-ai/molis-work-contracts/platform/ui";
import { discussionDocument, DISCUSSION_SHELL, onDiscussionReady } from "./discussion-document.js";
import { planLocaleText } from "./locale-switch.js";

type ReadPublicDocument = (path: string, signal: AbortSignal, init: Pick<RequestInit, "credentials" | "headers" | "redirect">) => Promise<Response>;

async function readDiscussionShell(read: ReadPublicDocument, locale: string, signal: AbortSignal): Promise<Document> {
  const response = await read(DISCUSSION_SHELL, signal, {
    credentials: "omit", redirect: "error",
    headers: { accept: "text/html", "accept-language": locale },
  });
  if (!response.ok || new URL(response.url).origin !== location.origin || !response.headers.get("content-type")?.startsWith("text/html")) {
    throw new Error("Cannot read discussion language");
  }
  const page = new DOMParser().parseFromString(await response.text(), "text/html");
  if (!page.querySelector("main.is-embedded[data-im-app]")) throw new Error("Cannot read discussion language");
  return page;
}

async function prepareDiscussionLanguage(read: ReadPublicDocument, target: UiFrameLanguage, signal: AbortSignal) {
  const mounted = discussionDocument();
  if (!mounted) return;
  const { page, client } = mounted, shown = client.tag();
  if (shown === target.tag) return;
  const [old, next] = await Promise.all([readDiscussionShell(read, shown, signal), readDiscussionShell(read, target.tag, signal)]);
  if (discussionDocument()?.page !== page || client.tag() !== shown) return;
  const { produced, retext, use, restore } = client.prepare(old, next, target);
  return { apply(commit: () => void = () => {}) {
    if (discussionDocument()?.page !== page || client.tag() !== shown) { commit(); return; }
    // An SSE result may have painted while the preference was saved. Read the live nodes at commit.
    planLocaleText({ root: page, old, next, produced, retext }).apply(() => { use(); commit(); }, restore);
  } };
}

export function mountDiscussionLanguage(readPublic: ReadPublicDocument, current: () => UiFrameLanguage, failed: () => void) {
  const prepare = (target: UiFrameLanguage, signal: AbortSignal) => prepareDiscussionLanguage(readPublic, target, signal);
  let pending: AbortController | undefined;
  const sync = () => {
    pending?.abort();
    const mounted = discussionDocument(), target = current();
    if (!mounted || mounted.client.tag() === target.tag) return;
    const { page } = mounted, read = pending = new AbortController();
    const active = () => !read.signal.aborted && pending === read && current().tag === target.tag && discussionDocument()?.page === page;
    void prepare(target, read.signal).then(result => {
      if (active()) result?.apply();
    }).catch(() => { if (active()) failed(); });
  };
  onDiscussionReady(sync);
  return { prepare, sync };
}
