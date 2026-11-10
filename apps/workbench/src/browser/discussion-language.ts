import type { UiFrameLanguage } from "@molis-ai/molis-work-contracts/platform/ui";
import { discussionDocument, DISCUSSION_SHELL, onDiscussionReady } from "./discussion-document.js";
import { planLocaleText } from "./locale-switch.js";

async function readDiscussionShell(locale: string, signal: AbortSignal): Promise<Document> {
  const response = await fetch(DISCUSSION_SHELL, {
    credentials: "omit", cache: "no-store", redirect: "error", signal,
    headers: { accept: "text/html", "accept-language": locale },
  });
  if (!response.ok || new URL(response.url).origin !== location.origin || !response.headers.get("content-type")?.startsWith("text/html")) {
    throw new Error("Cannot read discussion language");
  }
  const page = new DOMParser().parseFromString(await response.text(), "text/html");
  if (!page.querySelector("main.is-embedded[data-im-app]")) throw new Error("Cannot read discussion language");
  return page;
}

async function prepareDiscussionLanguage(target: UiFrameLanguage, signal: AbortSignal) {
  const mounted = discussionDocument();
  if (!mounted) return;
  const { page, client } = mounted, shown = client.tag();
  if (shown === target.tag) return;
  const [old, next] = await Promise.all([readDiscussionShell(shown, signal), readDiscussionShell(target.tag, signal)]);
  if (discussionDocument()?.page !== page || client.tag() !== shown) return;
  const { produced, retext, use, restore } = client.prepare(old, next, target);
  return { apply(commit: () => void = () => {}) {
    if (discussionDocument()?.page !== page || client.tag() !== shown) { commit(); return; }
    // An SSE result may have painted while the preference was saved. Read the live nodes at commit.
    planLocaleText({ root: page, old, next, produced, retext }).apply(() => { use(); commit(); }, restore);
  } };
}

export function mountDiscussionLanguage(current: () => UiFrameLanguage, failed: () => void) {
  let pending: AbortController | undefined;
  const sync = () => {
    pending?.abort();
    const mounted = discussionDocument(), target = current();
    if (!mounted || mounted.client.tag() === target.tag) return;
    const { page } = mounted, read = pending = new AbortController();
    const active = () => !read.signal.aborted && pending === read && current().tag === target.tag && discussionDocument()?.page === page;
    void prepareDiscussionLanguage(target, read.signal).then(result => {
      if (active()) result?.apply();
    }).catch(() => { if (active()) failed(); });
  };
  onDiscussionReady(sync);
  return { prepare: prepareDiscussionLanguage, sync };
}
