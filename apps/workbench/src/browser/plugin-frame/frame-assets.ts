import type { UiFrameAssetReference } from "@molis-ai/molis-work-contracts/platform/ui";
import { readOwnPageDocument } from "./view.js";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";

export interface FrameAsset {
  kind: string; id: string; title: string; caption: string; itemRef: string; entryId: string;
  reading: { reason: string; relation: string; next: string; status: string };
  reference: UiFrameAssetReference;
  source: HTMLElement;
}
type PaneMessages = { from(event: { origin: string; data: { type: string }; source: Window }): HTMLIFrameElement | null };
type DragSource = { root: HTMLElement; current(reference: UiFrameAssetReference): boolean };
const sources = new Map<string, DragSource>();
let panes: PaneMessages | undefined;
const route = (path: string) => (document.body.dataset.routePrefix ?? "") + path;
const key = (ref: UiFrameAssetReference) => ref.kind + "\0" + ref.id;
const reference = (value: unknown): value is UiFrameAssetReference => Boolean(value && typeof value === "object"
  && "kind" in value && typeof value.kind === "string" && value.kind.length <= 100
  && "id" in value && typeof value.id === "string" && value.id.length > 0 && value.id.length <= 1000);

/** Only the original Frame display fields leave inert owner HTML; no owner DOM, URL, handler or business state is adopted. */
function project(html: string, source: HTMLElement): FrameAsset[] {
  const template = document.createElement("template"); template.innerHTML = html;
  return [...template.content.querySelectorAll<HTMLElement>("[data-frame-asset][data-frame-subject-kind]")].flatMap(row => {
    const d = row.dataset, ref = { kind: d.frameSubjectKind ?? "", id: d.frameAssetId ?? "" };
    if (!reference(ref) || !["feed", "inbox", "artifact"].includes(d.frameAsset ?? "")) return [];
    return [{ kind: d.frameAsset!, id: d.frameAssetId!, title: d.frameAssetTitle || row.querySelector("strong")?.textContent || "", caption: d.frameAssetCaption || "",
      itemRef: d.feedItemId || (d.inboxSubjectType === "feed" ? d.inboxSubjectId : "") || "", entryId: d.feedEntryId || d.inboxEntryId || "",
      reading: { reason: d.frameReadingReason || "", relation: d.frameReadingRelation || "", next: d.frameReadingNext || "", status: d.frameReadingStatus || "" }, reference: ref, source }];
  });
}

/** A cold picker gets a temporary page for the exact rendered producer, independently of visibility or client mount. */
async function load(root: HTMLElement, signal?: AbortSignal): Promise<FrameAsset[]> {
  if (!root.isConnected || !root.dataset.pluginProducer) throw new Error("View unavailable");
  const producer = root.dataset.pluginProducer;
  const grant = await molisWorkRequest<{ page_id: string }>(route("/api/host/plugin-pages"), { signal, body: {
    plugin_id: root.dataset.pluginOwner, producer,
    mount: { contribution_id: root.dataset.pluginContribution, surface: root.dataset.pluginSurface, target_slot_id: root.dataset.pluginSlot },
  } });
  try {
    const html = await readOwnPageDocument(root, route, root.dataset.pluginOwner!, grant.page_id, undefined, signal);
    if (root.dataset.pluginProducer !== producer) throw new Error("View unavailable");
    return project(html, root);
  } finally {
    void molisWorkRequest(route("/api/host/plugin-pages/" + encodeURIComponent(grant.page_id)), { method: "DELETE", body: {}, keepalive: true }).catch(() => { /* Leaving the document revokes its temporary page too. */ });
  }
}

export const frameAssets = {
  configure(value?: PaneMessages) { panes = value; },
  fromPane(source: Window) { return panes?.from({ origin: location.origin, data: { type: "frame-asset-source" }, source }) ?? null; },
  async list(signal?: AbortSignal): Promise<FrameAsset[]> {
    const items = new Map<string, FrameAsset>();
    for (const root of document.querySelectorAll<HTMLElement>("[data-plugin-producer]")) {
      const payload: unknown = JSON.parse(root.querySelector("script[data-plugin-document]")?.textContent ?? "null");
      if (typeof payload !== "string" || !project(payload, root).length) continue;
      try { for (const asset of await load(root, signal)) items.set(key(asset.reference), asset); }
      catch { /* Withdrawn or unreadable owners contribute no candidates, including their old payload. */ }
    }
    return [...items.values()];
  },
  async resolve(asset: FrameAsset, signal?: AbortSignal): Promise<FrameAsset | undefined> {
    return (await load(asset.source, signal)).find(current => key(current.reference) === key(asset.reference));
  },
  async localDrag(value: { handle: string; reference: UiFrameAssetReference }, signal?: AbortSignal): Promise<FrameAsset | undefined> {
    const source = sources.get(value.handle);
    if (!source?.current(value.reference)) return;
    const asset = (await load(source.root, signal)).find(item => key(item.reference) === key(value.reference));
    return source.current(value.reference) ? asset : undefined;
  },
  async drag(value: unknown, signal?: AbortSignal): Promise<FrameAsset | undefined> {
    if (!value || typeof value !== "object" || !("handle" in value) || typeof value.handle !== "string"
      || !("reference" in value) || !reference(value.reference)) return;
    const payload = { handle: value.handle, reference: value.reference }, windows: Window[] = [window];
    // The same S-30 owner check used by pane messages selects trusted shell documents, never an opaque child.
    let outer: Window = window;
    if (parent !== window && parent.molisPluginFrames?.assets.fromPane(window)) outer = parent;
    if (outer !== window) windows.push(outer);
    for (const frame of outer.document.querySelectorAll<HTMLIFrameElement>("iframe[data-pane-owner]")) {
      if (frame.contentWindow && outer.molisPluginFrames?.assets.fromPane(frame.contentWindow) === frame) windows.push(frame.contentWindow);
    }
    for (const owner of new Set(windows)) {
      if (owner.document.body.dataset.routePrefix !== document.body.dataset.routePrefix) continue;
      const found = await owner.molisPluginFrames?.assets.localDrag(payload, signal);
      if (found) return found;
    }
  },
};

/** Each visible producer has one short drag handle; it is neither a page credential nor write authority. */
export function pageFrameAssets(port: MessagePort, scope: FrameScope, root: HTMLElement, frame: HTMLIFrameElement) {
  let handle = "", producer = "", payload = "";
  let rows = new Map<string, FrameAsset>();
  const controls = new Map<string, HTMLElement>();
  const clear = () => { sources.delete(handle); handle = ""; for (const node of controls.values()) node.remove(); controls.clear(); };
  const visible = () => {
    if (!scope.alive || !scope.visible || !root.isConnected || frame.hidden) return false;
    for (let node: Element | null = frame; node; node = node.ownerDocument.defaultView?.frameElement ?? null)
      if (!node.checkVisibility({ visibilityProperty: true })) return false;
    return true;
  };
  const documentPayload = () => root.querySelector("script[data-plugin-document]")?.textContent ?? "";
  const current = () => visible() && producer === root.dataset.pluginProducer && payload === documentPayload();
  const publish = () => port.postMessage({ type: "frame-asset-source", handle } satisfies FrameDown);
  const renew = () => {
    if (handle && current()) return;
    clear();
    producer = root.dataset.pluginProducer ?? ""; payload = documentPayload(); rows = new Map();
    const html: unknown = payload ? JSON.parse(payload) : null;
    if (visible() && producer && typeof html === "string") {
      rows = new Map(project(html, root).map(asset => [key(asset.reference), asset]));
      handle = crypto.randomUUID(); const active = handle;
      sources.set(active, { root, current: ref => handle === active && current() && rows.has(key(ref)) });
    }
    publish();
  };
  scope.observe(new MutationObserver(renew), root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["data-plugin-producer"] });
  scope.observe(new MutationObserver(renew), frame, { attributes: true, attributeFilter: ["hidden"] });
  for (let owner = window.frameElement; owner; owner = owner.ownerDocument.defaultView?.frameElement ?? null)
    scope.observe(new MutationObserver(renew), owner, { attributes: true, attributeFilter: ["hidden"] });
  scope.whenVisible(() => { renew(); return () => { clear(); publish(); }; });
  scope.own(clear);
  return (message: Extract<FrameUp, { type: "frame-asset-layout" }>) => {
    // The first empty layout asks for the current handle after the child's listeners are ready.
    if (message.handle === "") { publish(); return; }
    if (message.handle !== handle || !current() || !Array.isArray(message.slots) || message.slots.length > rows.size) return;
    const kept = new Set<string>(), owner = frame.getBoundingClientRect(), bounds = root.getBoundingClientRect();
    for (const slot of message.slots) {
      if (!slot || !reference(slot.reference)) continue;
      const id = key(slot.reference), asset = rows.get(id), box = slot.box;
      if (!asset || kept.has(id) || !box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)
        || box.width < 20 || box.height < 20 || box.width > 32 || box.height > 32 || box.x < 0 || box.y < 0
        || box.x + box.width > owner.width || box.y + box.height > owner.height) continue;
      kept.add(id);
      let node = controls.get(id);
      if (!node) {
        node = document.createElement("span"); node.dataset.hostFrameDrag = asset.reference.id; node.draggable = true;
        node.title = asset.title; node.setAttribute("aria-label", asset.title); node.textContent = "⠿";
        node.style.cssText = "position:absolute;display:grid;place-items:center;width:20px;height:20px;z-index:1;cursor:grab;user-select:none;border-radius:4px;background:var(--surface);color:var(--muted);font-size:18px;line-height:1;pointer-events:auto";
        const active = handle, ref = asset.reference;
        node.addEventListener("dragstart", event => {
          if (!event.isTrusted || handle !== active || !current() || !event.dataTransfer) { event.preventDefault(); return; }
          event.dataTransfer.setData("application/x-molis-work-asset", JSON.stringify({ handle: active, reference: ref }));
          event.dataTransfer.effectAllowed = "copy";
        });
        node.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
        root.append(node); controls.set(id, node);
      }
      Object.assign(node.style, { left: owner.left - bounds.left + box.x + (box.width - 20) / 2 + "px", top: owner.top - bounds.top + box.y + (box.height - 20) / 2 + "px" });
    }
    for (const [id, node] of controls) if (!kept.has(id)) { node.remove(); controls.delete(id); }
  };
}

/** A child proposes only small empty slots. The Host owns their references, labels and native dragstart. */
export function childFrameAssets(port: MessagePort, scope: FrameScope, root: HTMLElement): void {
  let handle = "", scheduled = 0, last = "";
  const layout = () => {
    const slots = [...root.querySelectorAll<HTMLElement>("[data-frame-drag-slot]")].flatMap(slot => {
      const row = slot.closest<HTMLElement>("[data-frame-asset][data-frame-subject-kind]"); if (!row) return [];
      const rect = slot.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const shown = !document.body.hidden && slot.checkVisibility() && Boolean(hit && slot.contains(hit));
      return [{ reference: { kind: row.dataset.frameSubjectKind!, id: row.dataset.frameAssetId! }, box: shown ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null }];
    });
    const value = JSON.stringify({ handle, slots });
    if (last !== value) { last = value; port.postMessage({ type: "frame-asset-layout", handle, slots } satisfies FrameUp); }
    scheduled = requestAnimationFrame(layout);
  };
  scope.listen(port, "message", event => {
    const message = (event as MessageEvent<FrameDown>).data;
    if (message.type === "frame-asset-source" && message.handle !== handle) { handle = message.handle; last = ""; }
  });
  scope.whenVisible(() => { last = ""; layout(); return () => { cancelAnimationFrame(scheduled); handle = ""; last = ""; }; });
}
