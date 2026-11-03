import type { FrameScope, FrameUp } from "./types.js";

/** Says when a modal dialog opens or closes in the child (VUX-29): its frame alone cannot set aside the page around it. */
export function childModal(port: MessagePort, scope: FrameScope): void {
  let open = false;
  const report = () => {
    const now = document.querySelector("dialog:modal") !== null;
    if (now !== open) { open = now; port.postMessage({ type: "modal", open } satisfies FrameUp); }
  };
  scope.observe(new MutationObserver(report), document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
}

/**
 * While the child shows a modal dialog, everything outside its frame's line of ancestors is inert, as showModal() leaves the
 * rest of one document: Tab cannot walk out of the dialog into the workbench behind it. The workbench around the frame is also
 * covered with the backdrop colour of a dialog (`--scrim`), with a hole where the frame is (its dialog dims its own page), so it
 * looks as unavailable as it is. Only what it set inert and laid over is let go, when the dialog closes, the frame is hidden or
 * the page goes.
 */
export function pageModal(scope: FrameScope, frame: HTMLIFrameElement): (open: unknown) => void {
  let aside: HTMLElement[] = [], cover: HTMLElement | null = null;
  const release = () => { for (const element of aside) element.inert = false; aside = []; cover?.remove(); cover = null; };
  scope.own(release);
  scope.whenVisible(() => release);
  /** A popover is in the top layer, so no stacking order of the workbench can put anything above it; it follows the frame's box. */
  const lay = () => {
    const shade = cover = Object.assign(document.createElement("div"), { className: "mw-modal-cover", popover: "manual" });
    document.body.append(shade); shade.showPopover();
    let box = "";
    const follow = () => {
      if (cover !== shade) return;
      const { left, top, right, bottom } = frame.getBoundingClientRect(), now = `M0 0h1e5v1e5H0zM${left} ${top}H${right}V${bottom}H${left}z`;
      if (now !== box) shade.style.clipPath = `path(evenodd,"${box = now}")`;
      scope.frame(follow);
    };
    follow();
  };
  return (open) => {
    release();
    if (open !== true || !scope.visible) return;
    for (let node: HTMLElement | null = frame; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) { sibling.inert = true; aside.push(sibling); }
      }
    }
    lay();
  };
}
