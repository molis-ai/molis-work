import { API } from "./request.js";
import { showNote } from "./page.js";
import { renderView } from "./view.js";
import { statusOf } from "./util.js";
import type { JellyCommand, JellyPage, JellyWorkspace } from "./types.js";

/** A read asked before a command answered must not take the workspace back to an older revision (the next command would be refused as a conflict). */
export function take(page: JellyPage, next: JellyWorkspace): void {
  if (!page.state || next.revision >= page.state.revision) page.state = next;
}

/** One change at a time, each against the revision the page last saw; a conflict re-reads the workspace and keeps the person's edit. */
export function command(page: JellyPage, value: JellyCommand): Promise<JellyWorkspace> {
  const operation = page.mutationQueue.catch(() => undefined).then(async () => {
    const current = page.ws();
    try {
      const result = await page.request<{ state: JellyWorkspace }>("POST", `${API}/commands`, { expected_revision: current.revision, command: value });
      page.state = result.state;
      await renderView(page);
      return result.state;
    } catch (error) {
      if (statusOf(error) === 409) {
        const fresh = await page.request<{ state: JellyWorkspace }>("GET", `${API}/`);
        take(page, fresh.state);
        await renderView(page);
        showNote(page, page.L("jelly.sync.other-window"), true);
      }
      throw error;
    }
  });
  page.mutationQueue = operation;
  return operation;
}

export async function loadList(page: JellyPage): Promise<void> {
  const result = await page.request<{ state: JellyWorkspace }>("GET", `${API}/`);
  take(page, result.state);
  await renderView(page);
}
