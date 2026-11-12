import type { FrameDown, FrameScope, FrameUp, Translate } from "./types.js";

type PickUp = Extract<FrameUp, { type: "knowledge-pick" }>;
type Picked = Extract<FrameDown, { type: "knowledge-picked" }>;
type Item = Picked["items"][number];

const MAX = 30;
const shaped = (value: unknown): value is Item => {
  if (!value || typeof value !== "object") return false;
  const { ref, title } = value as { ref?: { subject?: { kind?: unknown; id?: unknown }; pin?: { mode?: unknown } }; title?: unknown };
  try {
    return typeof title === "string" && title.length <= 1000 && typeof ref?.subject?.kind === "string" && typeof ref.subject.id === "string"
      && typeof ref.pin?.mode === "string" && JSON.stringify(ref).length <= 4000;
  } catch { return false; }
};

/**
 * The project materials picker for a plugin frame (specs/batch-06-shared-tools/materials-ui-contract §3). The frame asks with the same
 * `molis-work:knowledge-pick` it would send on its own page; this trusted document asks the page's one picker under an id of its own,
 * only for a visible, current view after a real press, and ends the request when the view goes away. Before the frame hears the
 * answer, each confirmed reference is read once (its head) as this plugin page, so the frame receives only what the plugin itself
 * may read; reading it later still goes through the action's own authorization, and the picker grants nothing.
 */
export function pageMaterialsPicker(port: MessagePort, scope: FrameScope, pageId: string, route: (path: string) => string, translate: Translate, toast: (text: string) => void) {
  let open: { id: string; asked: string; stop: AbortController } | null = null, sequence = 0;
  const reply = (detail: Omit<Picked, "type">) => { if (scope.alive) port.postMessage({ type: "knowledge-picked", ...detail } satisfies FrameDown); };
  const end = () => { const was = open; open = null; was?.stop.abort(); };
  scope.own(end);
  scope.whenVisible(() => end);
  const readable = async (item: Item): Promise<boolean> => {
    const file = item.ref.subject.kind === "workspace_file" || item.ref.pin.mode !== "current";
    const [reference, input] = file
      ? [{ capability_id: "materials.read", version: /* @version action.materials.read */ 1 }, { ref: item.ref, mode: "head" }]
      : [{ capability_id: "knowledge.read", version: /* @version action.knowledge.read */ 1 }, { subject: item.ref.subject, max_lines: 1 }];
    try {
      await molisWorkRequest(route("/api/host/plugin-page-actions"), { body: { reference, input }, headers: { "x-molis-plugin-page": pageId }, scope });
      return true;
    } catch { return false; }
  };
  scope.listen(document, "molis-work:knowledge-picked", event => {
    const detail = (event as CustomEvent<{ request_id?: string; outcome?: string; items?: unknown[] }>).detail, asked = open;
    if (!asked || detail?.request_id !== asked.id) return;
    open = null;
    if (detail.outcome !== "confirmed") { reply({ request_id: asked.asked, outcome: detail.outcome === "unavailable" ? "unavailable" : "cancelled", items: [] }); return; }
    const items = (detail.items ?? []).filter(shaped);
    void (async () => {
      const allowed = (await Promise.all(items.map(async item => (await readable(item) ? item : null)))).filter((item): item is Item => item !== null);
      if (!scope.alive || !scope.visible) return;
      if (allowed.length < items.length) toast(translate("有 {count} 份资料这个插件读不到，没有加入。", { count: items.length - allowed.length }));
      reply({ request_id: asked.asked, outcome: "confirmed", items: allowed });
    })();
  });
  return (message: PickUp): void => {
    const asked = typeof message.request_id === "string" && message.request_id.length <= 200 ? message.request_id : "";
    if (!asked) return;
    end();
    const selected = Array.isArray(message.selected) ? message.selected.filter(shaped).slice(0, MAX) : [];
    const max = Number.isSafeInteger(message.max) && message.max! > 0 ? Math.min(message.max!, MAX) : MAX;
    // A frame cannot open a dialog over the page by itself: only for a press the person just made in a view they can see.
    if (!scope.visible || !navigator.userActivation.isActive || document.documentElement.dataset.knowledgePicker !== "1") {
      reply({ request_id: asked, outcome: "unavailable", items: [] });
      return;
    }
    const stop = new AbortController(), id = "frame:" + pageId + ":" + ++sequence;
    open = { id, asked, stop };
    document.dispatchEvent(new CustomEvent("molis-work:knowledge-pick", { detail: { request_id: id, selected, max, signal: stop.signal } }));
  };
}

/** The frame's side: its page asks and hears as on any page; the trusted document answers through the port. */
export function childMaterialsPicker(port: MessagePort, scope: FrameScope): void {
  document.documentElement.dataset.knowledgePicker = "1";
  scope.listen(document, "molis-work:knowledge-pick", event => {
    const detail = (event as CustomEvent<{ request_id?: unknown; selected?: unknown; max?: unknown }>).detail;
    if (typeof detail?.request_id !== "string") return;
    let selected: Item[] = [];
    try { selected = structuredClone(Array.isArray(detail.selected) ? detail.selected : []) as Item[]; } catch { selected = []; }
    port.postMessage({ type: "knowledge-pick", request_id: detail.request_id, selected, ...(typeof detail.max === "number" ? { max: detail.max } : {}) } satisfies FrameUp);
  });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "knowledge-picked") return;
    const { request_id, outcome, items } = event.data;
    document.dispatchEvent(new CustomEvent("molis-work:knowledge-picked", { detail: { request_id, outcome, items } }));
  });
}
