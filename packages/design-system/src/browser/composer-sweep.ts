import { COMPOSER_DRAFT_PREFIX } from "../composer-rules.js";

/**
 * Drafts a project or plugin no longer has (specs/unified-input-voice/implementation-plan.md §3.4, UIC-10), in the Workbench
 * document only; a framed plugin's drafts live in the same storage under its page's prefix, so they are swept here too.
 *
 * - At start: this machine's draft keys (never their text) go to the Host once, which names those whose project is no longer in
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
  return Array.from({ length: store.length }, (_, index) => store.key(index)!).filter((key) => key.includes(COMPOSER_DRAFT_PREFIX));
}

function sweep() {
  let found: string[];
  try { found = drafts(); } catch { return; /* storage refused: no drafts to sweep */ }
  const request = (globalThis as { molisWorkRequest?: Request }).molisWorkRequest;
  if (!found.length || !request) return;
  request<{ remove: string[] }>("/api/composer/drafts/sweep", { body: { keys: found } }).then((answer) => {
    for (const key of answer.remove) if (found.includes(key)) localStorage.removeItem(key);
  }).catch(() => undefined);
}

if (self === top) {
  document.addEventListener("molis-work:plugins-changed", (event) => {
    const project = document.body.dataset.projectId || "home";
    try {
      for (const install of (event as CustomEvent<{ gone?: string[] }>).detail?.gone ?? []) {
        // Each part of a key is encoded (composerDraftKey), so this head matches that installation's drafts in this project only.
        const head = COMPOSER_DRAFT_PREFIX + encodeURIComponent(project) + ":" + encodeURIComponent(install) + ":";
        for (const key of drafts()) if (key.slice(key.indexOf(COMPOSER_DRAFT_PREFIX)).startsWith(head)) localStorage.removeItem(key);
      }
    } catch { /* storage refused: nothing of it can be read either */ }
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sweep, { once: true });
  else sweep();
}
