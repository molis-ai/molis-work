import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { announceAppearance, prepareAppearance, readDocumentAppearance, setAppearanceScope, withDocumentDevice, type AppearanceProjection } from "../appearance-view.js";
import type { FrameScope, Translate } from "./types.js";

function projectedAppearance(): AppearanceProjection | undefined {
  const current = readDocumentAppearance();
  return current ? { snapshot: current.snapshot, stylesheet: current.stylesheet } : undefined;
}

/** The trusted parent supplies the initial and current appearance over the existing port. */
export function frameEnvironment(port: MessagePort, scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement) {
  let sentRevision: string | undefined;
  const visible = () => {
    if (frame.hidden) return false;
    for (let node: Element | null = root; node; node = node.ownerDocument.defaultView?.frameElement ?? null) {
      if (!node.checkVisibility({ visibilityProperty: true })) return false;
    }
    return scope.visible;
  };
  const publish = (shown: boolean) => {
    if (!shown) { sentRevision = undefined; return; }
    const projected = projectedAppearance();
    if (!projected || projected.snapshot.revision === sentRevision) return;
    sentRevision = projected.snapshot.revision;
    port.postMessage({ type: "environment", snapshot: projected.snapshot, skin_href: projected.stylesheet });
  };
  scope.listen(window, "molis-work:ui-environment-changed", () => publish(visible()));

  return {
    initial: projectedAppearance(),
    visible,
    reset() { sentRevision = undefined; },
    publishState(shown: boolean) {
      const theme = Object.fromEntries(["theme", "resolvedTheme", "density", "terminalTheme", "resolvedTerminalTheme"]
        .map(key => [key, document.documentElement.dataset[key] ?? ""]));
      port.postMessage({ type: "state", visible: shown, theme });
      publish(shown);
    },
    observeState(state: () => void) {
      scope.observe(new MutationObserver(state), document.documentElement, { attributes: true,
        attributeFilter: ["data-theme", "data-resolved-theme", "data-density", "data-terminal-theme", "data-resolved-terminal-theme"] });
      scope.observe(new MutationObserver(state), document.body, { subtree: true, attributes: true, attributeFilter: ["data-exclusive"] });
      scope.observe(new MutationObserver(state), frame, { attributes: true, attributeFilter: ["hidden"] });
    },
  };
}

/** An opaque child reads the parent's bound projection. It keeps its own last successfully rendered scope. */
export function frameAppearance(origin: string, initial: AppearanceProjection | undefined, scope: FrameScope, _translate: Translate) {
  let desired = initial, displayed = initial;
  let verified = initial?.stylesheet ? "" : initial?.snapshot.revision;
  let preparing: string | undefined, generation = 0;
  let notice: HTMLElement | undefined;
  const update = (next: AppearanceProjection | undefined) => {
    desired = next;
    if (!next) { generation += 1; preparing = undefined; return; }
    const revision = next.snapshot.revision;
    if (preparing === revision) return;
    const turn = ++generation;
    preparing = undefined;
    if (verified === revision) { notice?.remove(); return; }
    preparing = revision;
    const projection = { snapshot: next.snapshot, stylesheet: next.stylesheet ? new URL(next.stylesheet, origin).href : null };
    void prepareAppearance(projection).then(() => {
      if (turn !== generation || !scope.alive) return;
      const snapshot = withDocumentDevice(next.snapshot);
      setAppearanceScope(document.documentElement, snapshot);
      if (displayed) announceAppearance(snapshot, displayed.snapshot);
      displayed = { ...next, snapshot };
      preparing = undefined; verified = revision;
      notice?.remove();
    }, () => {
      if (turn !== generation || !scope.alive) return;
      preparing = undefined;
      if (notice?.isConnected) return;
      notice = document.createElement("div");
      notice.className = "mw-toast appearance-notice is-visible";
      const message = document.createElement("span");
      message.role = "status";
      message.textContent = uiText.text("common.appearance.window-couldnt-load-new-appearance-keeping-current-look");
      const retry = document.createElement("button");
      retry.type = "button"; retry.className = "mw-toast__action"; retry.textContent = uiText.text("common.appearance.try-again");
      retry.addEventListener("click", () => update(desired));
      notice.append(message, retry);
      document.body.append(notice);
    });
  };
  scope.own(() => { generation += 1; notice?.remove(); });
  return update;
}
