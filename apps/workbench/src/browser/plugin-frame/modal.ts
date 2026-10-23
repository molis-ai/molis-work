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
 * rest of one document: Tab cannot walk out of the dialog into the workbench behind it. Only what it set inert is let go,
 * when the dialog closes, the frame is hidden or the page goes.
 */
export function pageModal(scope: FrameScope, frame: HTMLIFrameElement): (open: unknown) => void {
  let aside: HTMLElement[] = [];
  const release = () => { for (const element of aside) element.inert = false; aside = []; };
  scope.own(release);
  scope.whenVisible(() => release);
  return (open) => {
    release();
    if (open !== true || !scope.visible) return;
    for (let node: HTMLElement | null = frame; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children ?? []) {
        if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert) { sibling.inert = true; aside.push(sibling); }
      }
    }
  };
}
