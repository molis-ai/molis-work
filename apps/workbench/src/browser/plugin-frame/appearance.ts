import { announceAppearance, prepareAppearance, setAppearanceScope, withDocumentDevice, type AppearanceProjection } from "../appearance-view.js";
import type { FrameScope, Translate } from "./types.js";

/** An opaque child reads the parent's bound projection. It keeps its own last successfully rendered scope. */
export function frameAppearance(origin: string, initial: AppearanceProjection | undefined, scope: FrameScope, translate: Translate) {
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
      message.textContent = translate("此窗口未能加载新外观，保留了可用的样式。");
      const retry = document.createElement("button");
      retry.type = "button"; retry.className = "mw-toast__action"; retry.textContent = translate("再试一次");
      retry.addEventListener("click", () => update(desired));
      notice.append(message, retry);
      document.body.append(notice);
    });
  };
  scope.own(() => { generation += 1; notice?.remove(); });
  return update;
}
