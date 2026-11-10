import { prepareAppearance, readDocumentAppearance, setAppearanceScope } from "./appearance-view.js";
import { discussionDocument, onDiscussionReady } from "./discussion-document.js";

export function mountDiscussionAppearance(report: (failed: boolean) => void) {
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
      report(false);
    }, () => { if (active()) report(true); });
  };
  onDiscussionReady(project);
  window.addEventListener("molis-work:ui-environment-changed", project);
  new MutationObserver(theme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-resolved-theme"] });
  project();
  return { retry: project };
}
