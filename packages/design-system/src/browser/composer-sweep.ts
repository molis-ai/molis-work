import { COMPOSER_SWEEP_LIMIT, composerDraftInner, staleComposerDrafts } from "../composer-rules.js";

/**
 * Drafts a project or plugin no longer has (specs/unified-input-voice/implementation-plan.md §3.4, UIC-10), in the Workbench
 * document only; a framed plugin's drafts live in the same storage under its page's prefix, so they are swept here too.
 *
 * - At start: this machine's draft keys (never their text) go to the Host in bounded batches, which names those whose project is no longer in
 *   the Home or whose plugin is no longer in its project (`composer-sources-http.ts`); they are removed. No drafts, no request. A
 *   deleted project's page moves to the directory, a new document, so its drafts go then.
 * - A plugin removed from the project in place (`molis-work:plugins-changed`) takes its drafts with it at once.
 *
 * This part is in `workbench.js` itself; the composer's program (`/assets/molis-work-composer.js`) loads only when a page mounts one.
 */

type Request = <T>(url: string, init: { body?: unknown }) => Promise<T>;

/** Every key holding a platform draft, a framed page's included. */
function drafts(): string[] {
  const store = localStorage;
  return Array.from({ length: store.length }, (_, index) => store.key(index)).filter((key): key is string => key !== null && composerDraftInner(key) !== null);
}

async function sweep() {
  let found: string[];
  try { found = drafts(); } catch { return; /* storage refused: no drafts to sweep */ }
  const request = (globalThis as { molisWorkRequest?: Request }).molisWorkRequest;
  if (!found.length || !request) return;
  for (let start = 0; start < found.length; start += COMPOSER_SWEEP_LIMIT) {
    const keys = found.slice(start, start + COMPOSER_SWEEP_LIMIT);
    const answer = await request<{ remove: string[] }>("/api/composer/drafts/sweep", { body: { keys } });
    for (const key of answer.remove) if (keys.includes(key)) localStorage.removeItem(key);
  }
}

if (self === top) {
  document.addEventListener("molis-work:plugins-changed", (event) => {
    const project = document.body.dataset.projectId || "home";
    try {
      for (const install of (event as CustomEvent<{ gone?: string[] }>).detail?.gone ?? []) {
        for (const key of staleComposerDrafts(drafts(), { project, install })) localStorage.removeItem(key);
      }
    } catch { /* storage refused: nothing of it can be read either */ }
  });
  const start = () => { void sweep().catch(() => undefined); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
