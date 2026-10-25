import type { GitSentenceTable } from "../say.js";
import { installDiff } from "./diff.js";
import { refresh } from "./list.js";
import { createPage, reading } from "./page.js";
import { installResults } from "./results.js";
import { afterDecision, installSource } from "./source.js";
import type { GitBrowser, GitHost } from "./types.js";

/** Reads through the plugin's declared routes; no Git process or approval lives in the browser. */
export function gitClient(host: GitHost, sentences: GitSentenceTable): GitBrowser | null {
  const page = createPage(host, sentences);
  if (!page) return null;
  const { L, lifetime, refreshButton, notice, result, list } = page;
  installResults(page);
  installDiff(page);
  installSource(page);
  lifetime.listen(refreshButton, "click", () => void (host.refreshWorkspace ? host.refreshWorkspace() : refresh(page)));
  lifetime.whenVisible((signal) => {
    page.viewSignal = signal;
    page.initialRead = true;
    reading(page, true);
    notice.textContent = L("git.list.reading-workspace");
    return () => {
      page.generation++; page.ticket++; page.resultsTicket++; page.conflictTicket++;
      result.setAttribute("aria-busy", "false");
      reading(page, false);
      list.setAttribute("aria-busy", "false");
    };
  });
  lifetime.watchRevision((signal) => host.request("/view-revision", "GET", undefined, signal), async () => {
    if (page.preparing || result.getAttribute("aria-busy") === "true" || (refreshButton.disabled && !page.initialRead)) return false;
    page.initialRead = false;
    await refresh(page);
  });
  return {
    refresh: () => refresh(page),
    afterDecision: (outcome) => afterDecision(page, outcome),
    show(face) {
      page.directory.hidden = face !== "files";
      if (face !== "files") { page.ticket++; result.hidden = true; }
    },
  };
}
