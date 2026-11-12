/// <reference lib="dom" />

/** Apply the new look immediately and fade the previous page colour over the live page. */
export function createLookFade(): (commit: () => void) => boolean {
  let cancelFade: (() => void) | undefined;
  return commit => {
    cancelFade?.();
    const root = document.documentElement;
    const fades = typeof root.animate === "function" && !document.hidden
      && !root.hasAttribute("data-craft-still") && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paper = fades ? getComputedStyle(root).getPropertyValue("--page").trim() : "";
    commit();
    if (!paper || !document.body) return false;

    const tokens = getComputedStyle(root);
    const time = tokens.getPropertyValue("--dur-move").trim();
    const duration = parseFloat(time) * (time.endsWith("ms") ? 1 : 1000);
    const easing = tokens.getPropertyValue("--ease-quint").trim();
    if (!(duration > 0) || !easing) return false;
    const layer = document.createElement("div");
    layer.inert = true;
    layer.setAttribute("aria-hidden", "true");
    Object.assign(layer.style, { position: "fixed", inset: "0", zIndex: "100", pointerEvents: "none", backgroundColor: paper });
    const animation = layer.animate([{ opacity: 0.22 }, { opacity: 0 }], { id: "mw-look-fade", duration, easing, fill: "both" });
    document.body.append(layer);
    const cleanup = () => {
      layer.remove();
      if (cancelFade === cancel) cancelFade = undefined;
    };
    const cancel = () => { animation.cancel(); cleanup(); };
    cancelFade = cancel;
    void animation.finished.then(cleanup, cleanup);
    return true;
  };
}
