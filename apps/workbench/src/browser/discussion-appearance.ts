import { prepareAppearance, readDocumentAppearance, setAppearanceScope } from "./appearance-view.js";
import { discussionDocument, discussionFrame, onDiscussionReady } from "./discussion-document.js";

function reveal(frame: HTMLIFrameElement): void {
  if (!frame.hidden) return;
  frame.parentElement?.querySelector("[data-discussion-loading]")?.remove();
  frame.hidden = false;
}

export function mountDiscussionAppearance(report: (failed: boolean) => void) {
  const frame = discussionFrame();
  if (!frame) return undefined;
  let generation = 0;
  const theme = () => {
    const mounted = discussionDocument();
    const shown = document.documentElement.dataset.resolvedTheme;
    if (mounted && (shown === "light" || shown === "dark")) mounted.page.documentElement.dataset.resolvedTheme = shown;
    return mounted;
  };
  const project = () => {
    const mounted = theme(), current = readDocumentAppearance();
    if (!mounted || !current) { report(false); return; }
    const { page } = mounted, turn = ++generation;
    const active = () => turn === generation && discussionDocument()?.page === page && readDocumentAppearance()?.snapshot.revision === current.snapshot.revision;
    void prepareAppearance(current, undefined, page).then(() => {
      if (!active()) return;
      setAppearanceScope(page.documentElement, current.snapshot);
      reveal(frame);
      report(false);
    }, () => { if (active()) { reveal(frame); report(true); } });
  };
  onDiscussionReady(project);
  frame.addEventListener("load", () => {
    // A failed page does not announce readiness. Let its current same-origin response appear instead of leaving a spinner.
    const page = frame.contentDocument;
    if (frame.hidden && page?.URL === frame.src && !discussionDocument()) { reveal(frame); report(true); }
  });
  window.addEventListener("molis-work:ui-environment-changed", project);
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-resolved-theme"] });
  project();
  return { retry: project };
}
