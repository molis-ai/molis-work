import type { UiFrameLanguage, UiSayTool } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ProducedLog } from "@molis-ai/molis-work-design-system/produced-text";

interface DiscussionLanguage {
  tag(): string;
  prepare(before: Document, after: Document, target: UiFrameLanguage): {
    produced: ProducedLog;
    retext: UiSayTool["text"];
    use(): void;
    restore(): void;
  };
}

type DiscussionDocument = Document & { molisImLanguage?: DiscussionLanguage };
export const DISCUSSION_SHELL = "/im?embedded=1";

export const discussionFrame = () => document.querySelector<HTMLIFrameElement>('[data-side-body="discussion"] iframe');

/** Discussion is the one same-origin IM frame owned by this Workbench and its current project. */
export function discussionDocument() {
  const frame = discussionFrame();
  const page = frame?.contentDocument as DiscussionDocument | null | undefined;
  const project = document.body?.dataset.projectId;
  if (!frame || !page?.molisImLanguage || !project) return null;
  const expected = new URL(DISCUSSION_SHELL, location.href);
  expected.searchParams.set("project", project);
  if (page.URL !== expected.href || frame.src !== expected.href) return null;
  return { frame, page, client: page.molisImLanguage };
}

export function onDiscussionReady(run: () => void): void {
  window.addEventListener("message", event => {
    if (event.origin !== location.origin || event.data?.type !== "molis:im-ready") return;
    const mounted = discussionDocument();
    if (mounted && event.source === mounted.frame.contentWindow) run();
  });
}
