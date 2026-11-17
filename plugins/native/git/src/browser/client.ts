import { clearResultSelection } from "./result-selection.js";
import { installFormDrafts, offerCommitDraft, resetEditors } from "./form-drafts.js";
import { installDiff } from "./diff.js";
import { refresh } from "./list.js";
import { createPage, reading } from "./page.js";
import { installResults } from "./results.js";
import { afterDecision, installSource } from "./source.js";
import type { GitBrowser, GitHost } from "./types.js";

const uiText = globalThis.t;

/** Reads through the plugin's declared routes; no Git process or approval lives in the browser. */
export function gitClient(host: GitHost): GitBrowser | null {
  const page = createPage(host);
  if (!page) return null;
  const { lifetime, refreshButton, notice, result, list } = page;
  const currentReview = () => {
    const selection = page.resultSelection;
    if (selection?.kind === "review" || (selection?.kind === "diff" && selection.preparation.phase === "review")) return selection;
  };
  installResults(page);
  installDiff(page);
  installFormDrafts(page);
  installSource(page);
  lifetime.listen(refreshButton, "click", () => void (host.refreshWorkspace ? host.refreshWorkspace() : refresh(page)));
  lifetime.whenVisible((signal) => {
    page.viewSignal = signal;
    // The same mounted result can display its review again, with a fresh identity for this visible period.
    const review = currentReview();
    if (review) page.resultSelection = { ...review, signal };
    page.initialRead = true;
    reading(page, true);
    notice.textContent = uiText.text("git.list.reading-workspace");
    return () => {
      page.generation++; page.resultsTicket++;
      if (!lifetime.alive || !currentReview()) clearResultSelection(page);
      reading(page, false);
      list.setAttribute("aria-busy", "false");
    };
  });
  lifetime.watchRevision((signal) => host.request("/view-revision", "GET", undefined, signal), async () => {
    if (page.busy || (page.resultSelection?.kind === "diff" && page.resultSelection.preparation.phase === "waiting") || result.getAttribute("aria-busy") === "true" || (refreshButton.disabled && !page.initialRead)) return false;
    page.initialRead = false;
    await refresh(page);
  });
  return {
    refresh: () => refresh(page),
    browse(id) { if (id === page.folder && id === page.workspace) return; clearResultSelection(page); resetEditors(page); page.folder = id; void refresh(page); },
    offerCommitDraft: (workspace, message) => offerCommitDraft(page, workspace, message),
    afterDecision: (outcome) => afterDecision(page, outcome),
    show(face) {
      page.directory.hidden = face !== "files";
      if (face !== "files") clearResultSelection(page);
    },
  };
}
