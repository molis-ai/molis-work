/// <reference lib="dom" />

/** The page and the component board use the same transition and the same direct path. */
export function createLookFade(): (commit: () => void) => boolean {
  let running: ViewTransition | undefined;
  return commit => {
    const fades = typeof document.startViewTransition === "function" && !document.hidden
      && !document.documentElement.hasAttribute("data-craft-still") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    running?.skipTransition();
    if (fades) running = document.startViewTransition(commit);
    else commit();
    return fades;
  };
}

export const LOOK_FADE_CLIENT_SCRIPT = `globalThis.molisWorkLookFade=(${createLookFade.toString()})();`;
