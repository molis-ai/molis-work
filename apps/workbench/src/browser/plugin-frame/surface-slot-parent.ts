import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceDisplayCorrection, SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "../../surface-home-display.js";
import type { FramedSurfaceControl } from "../project-home-render.js";
import type * as SurfaceRenderer from "../project-home.js";
import type { FramedArea, PageFramedAreas } from "./framed-area.js";
import type { FrameBox, FrameHost, FrameScope, SurfaceSlotDown, SurfaceSlotUp } from "./types.js";
import { positionMenuKey } from "../project-position-menu.js";

type Rendered = { render: string; display: SurfaceHomeDisplay; controls: FramedSurfaceControl[] };
type Activated = { preparation?: string; label?: string; consequence?: string[]; choices?: FramedSurfaceControl[]; description?: string;
  result?: { kind?: string; row?: SurfaceHomeRowDisplay; label?: string; receipt?: { title: string } } };
type Entry = { id: number; slot_id: string; subjects: unknown; box: FrameBox | null; slot?: string; area?: FramedArea;
  read?: AbortController; operation?: AbortController; render?: Rendered; ready?: boolean; press?: string; preparation?: string;
  corrections: Map<string, SurfaceDisplayCorrection>; correcting?: SurfaceDisplayCorrection; correctionNote?: string; recovery?: SurfaceDisplayCorrection["subject"];
  peek?: SurfaceHomeRowDisplay; choices?: FramedSurfaceControl[]; description?: string; note?: string; placing?: string; unsettled?: Set<string> };

const renderers = () => {
  type WindowWithRenderer = Window & { molisWorkHomeView?: typeof SurfaceRenderer };
  return (window as WindowWithRenderer).molisWorkHomeView ?? (window.parent as WindowWithRenderer).molisWorkHomeView;
};

const visibleArea = (entry: Entry, document: Document) => !document.hidden && entry.box !== null
  && entry.area && !entry.area.holder.hidden && !entry.area.holder.inert;

const placementControl = ({ owner, subject, label }: FramedSurfaceControl) => JSON.stringify([owner, subject.kind, subject.id, label]);

function drawSurfaceSlot(entry: Entry, say: FrameHost["translate"], confirmation?: { label: string; consequence: readonly string[] }) {
  const { area, render } = entry, sdk = renderers();
  if (!area || !sdk) return;
  const labels = (entry.choices ?? render?.controls ?? []).filter(control => control.kind !== "placement" || !entry.unsettled?.has(placementControl(control)))
    .map(control => ({ ...control, label: say(control.label) }));
  const content = render && (entry.peek ? sdk.renderHomePeek(render.display, entry.peek, new Map(),
    labels.filter(control => control.kind === "open" && control.subject.kind === entry.peek!.subject.kind && control.subject.id === entry.peek!.subject.id))
    : sdk.renderPositionGroup(render.display, 0, new Map(), labels, { controls: entry.corrections, recovery: render.display.object_restore_available ? entry.recovery : undefined }).html);
  const button = (kind: string, label: string, primary = false) => '<button class="mw-btn mw-btn--' + (primary ? "primary" : "secondary") +
    '" type="button" data-framed-control="' + kind + '">' + escapeHtml(say(label)) + "</button>";
  const template = area.surface.ownerDocument.createElement("template");
  template.innerHTML = '<div class="surface-slot-body"><div data-framed-area-head class="surface-slot-edge"></div><div data-framed-scroll>' +
    (entry.description ? '<p>' + escapeHtml(entry.description) + '</p>' : '') + (content || "") + '</div><div data-framed-area-foot class="surface-slot-edge">' +
    (entry.correcting ? '<span>' + escapeHtml(sdk.surfaceCorrectionWord("confirm-reset")) + ' · ' + escapeHtml(sdk.surfaceCorrectionWord("scope.plugin-slot")) + '</span>'
      + button("correction-cancel", "取消") + button("correction-confirm", "确认", true)
      : confirmation ? '<span>' + escapeHtml(say(confirmation.label)) + '</span>' +
      confirmation.consequence.map(word => '<small>' + escapeHtml(sdk.presentationWord(word)) + '</small>').join("") + button("cancel", "取消") + button("confirm", "确认", true)
      : (entry.peek || entry.choices ? button("back", "返回") : "") +
        (entry.correctionNote ? '<span role="status">' + escapeHtml(sdk.surfaceCorrectionWord(entry.correctionNote)) + '</span>'
          : entry.note || entry.choices?.length === 0 ? '<span role="status">' + escapeHtml(say(entry.note ?? "暂无可用操作")) + '</span>' : "")) + '</div></div>';
  for (const button of template.content.querySelectorAll<HTMLElement>("[data-presentation-action]")) {
    const index = labels.findIndex(control => control.key === button.dataset.presentationAction);
    const control = labels[index];
    if (control) button.dataset.framedControl = JSON.stringify([control.subject.kind, control.subject.id, control.kind, control.label]);
    else if (entry.corrections.has(button.dataset.presentationAction ?? "")) button.dataset.framedControl = button.dataset.presentationAction!;
  }
  area.redraw(template.innerHTML, true);
}

/** One sibling area per declared mount. Only the size and the fixed reservation result cross back into the child. */
export function pageSurfaceSlots(port: MessagePort, scope: FrameScope, areas: PageFramedAreas, pageId: string,
  route: (path: string) => string, host: FrameHost, root: HTMLElement) {
  const entries = new Map<number, Entry>();
  let last = 0, reservation = 0;
  const send = (message: SurfaceSlotDown) => port.postMessage(message);
  const api = <Result>(body: Record<string, unknown>, signal?: AbortSignal) => molisWorkRequest<Result>(route("/api/contextual/surface-slot"),
    { method: "POST", headers: { "x-molis-context-page": pageId }, body, signal });
  const current = (entry: Entry) => scope.alive && entries.get(entry.id) === entry;
  const shown = (entry: Entry) => current(entry) && scope.visible && visibleArea(entry, root.ownerDocument);
  const forget = (entry: Entry) => {
    entry.read?.abort(); entry.operation?.abort(); entry.render = undefined; entry.placing = undefined; entry.peek = undefined; entry.choices = undefined;
    entry.preparation = undefined; entry.note = undefined; entry.description = undefined;
    entry.corrections.clear(); entry.correcting = undefined; entry.correctionNote = undefined; entry.recovery = undefined;
    entry.area?.redraw(""); entry.press = undefined;
  };
  const close = (entry: Entry) => {
    entries.delete(entry.id); forget(entry); entry.area?.close();
    if (entry.slot) void api({ intent: "close", slot: entry.slot }).catch(() => { /* The page closing releases its slots. */ });
  };
  const draw = (entry: Entry, confirmation?: Parameters<typeof drawSurfaceSlot>[2]) => drawSurfaceSlot(entry, host.translate, confirmation);
  async function read(entry: Entry) {
    if (!entry.slot || !shown(entry) || entry.operation) return;
    entry.read?.abort(); const request = entry.read = new AbortController();
    if (entry.peek || entry.choices || entry.preparation) entry.area?.redraw("");
    entry.render = undefined; entry.press = undefined; entry.choices = undefined; entry.description = undefined; entry.preparation = undefined; entry.peek = undefined; entry.correcting = undefined;
    entry.corrections.clear();
    try {
      const result = await api<Rendered>({ intent: "read", slot: entry.slot, ...(entry.recovery ? { recovery: entry.recovery } : {}) }, request.signal);
      if (!shown(entry) || entry.read !== request || request.signal.aborted) return;
      entry.render = result;
      if (!result.display.display.rows.length && !result.display.object_restore_available && Array.isArray(entry.subjects) && entry.subjects.length) entry.note = "暂时读不到";
      else if (entry.note === "暂时读不到") entry.note = undefined;
      draw(entry);
    } catch {
      if (entry.read === request && !request.signal.aborted && current(entry)) { entry.render = undefined; entry.note = "暂时读不到"; draw(entry); }
    } finally { if (entry.read === request) entry.read = undefined; }
  }
  async function click(entry: Entry, event: MouseEvent) {
    const area = entry.area, render = entry.render;
    const hit = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-framed-control]") : null;
    if (!area || !hit || !entry.slot || !render || entry.operation || !shown(entry) || (event.detail > 0 && entry.press !== render.render)) return;
    if (area.gate(event, hit)) return;
    const id = hit.dataset.presentationAction ?? hit.dataset.framedControl!;
    if (id === "back") { entry.placing = undefined; entry.peek = undefined; entry.choices = undefined; entry.description = undefined; draw(entry); return; }
    if (entry.preparation && id !== "confirm" && id !== "cancel") return;
    if (id === "correction-cancel") { entry.correcting = undefined; draw(entry); return; }
    if (entry.correcting && id !== "correction-confirm") return;
    const correction = id === "correction-confirm" ? entry.correcting : entry.corrections.get(id);
    if (correction && !correction.subject && id !== "correction-confirm") {
      entry.correcting = correction; draw(entry);
      area.surface.querySelector<HTMLElement>('[data-framed-control="correction-cancel"]')?.focus(); return;
    }
    entry.correcting = undefined;
    const preparation = entry.preparation;
    const placement = render.controls.find(control => control.key === id && control.kind === "placement");
    if (placement) entry.placing = placementControl(placement);
    const finishing = id === "confirm" ? entry.placing : undefined;
    const request = correction ? { intent: "correct", slot: entry.slot, render: render.render, correct: correction } : id === "confirm" || id === "cancel"
      ? { intent: id, slot: entry.slot, preparation, ...(id === "confirm" ? { render: render.render } : {}) }
      : { intent: "activate", slot: entry.slot, render: render.render, control: id };
    if ((id === "confirm" || id === "cancel") && !preparation) return;
    const navigate = host.positionNavigationFrom?.(root);
    const operation = entry.operation = new AbortController();
    if (finishing) (entry.unsettled ??= new Set()).add(finishing);
    hit.setAttribute("aria-busy", "true");
    try {
      const result = await api<Activated>(request, operation.signal);
      if (!shown(entry) || entry.render !== render) return;
      if (finishing) entry.unsettled?.delete(finishing);
      if (correction) {
        if (correction.correction === "remove") entry.recovery = correction.subject;
        else if (correction.correction === "reset") entry.recovery = undefined;
        entry.correctionNote = "saved"; host.positionChanged?.(); return;
      }
      entry.preparation = result.preparation;
      if (result.preparation) {
        draw(entry, { label: result.label ?? "", consequence: result.consequence ?? [] });
        area.surface.querySelector<HTMLElement>('[data-framed-control="cancel"]')?.focus();
      } else if (result.choices) { entry.choices = result.choices; entry.description = result.description; draw(entry); }
      else if (result.result?.kind === "stage") navigate?.(result.result);
      else if (result.result?.kind === "peek") { entry.peek = result.result.row; draw(entry); }
      else {
        if (id === "confirm") { entry.choices = undefined; entry.description = undefined; }
        entry.note = id === "confirm" ? result.result?.receipt?.title ?? "已完成" : undefined; draw(entry);
        if (id === "confirm") host.positionChanged?.();
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (finishing && code && code !== "actions.outcome_unknown" && code !== "actions.cancelled") entry.unsettled?.delete(finishing);
      if (current(entry) && entry.render === render) {
        entry.preparation = undefined;
        entry.choices = undefined; entry.description = undefined;
        if (correction) entry.correctionNote = "failed";
        else entry.note = id === "confirm" ? "到原处核对执行结果" : "这个对象已变化，请重新读取";
        draw(entry);
      }
    } finally {
      if (entry.operation === operation) entry.operation = undefined;
      hit.removeAttribute("aria-busy");
      if (id === "confirm" || id === "cancel") entry.placing = undefined;
      if ((id === "confirm" || correction) && shown(entry)) void read(entry);
    }
  }
  async function reserve(entry: Entry) {
    let held: string | undefined;
    try {
      const result = await api<{ slot: string; heights: { narrow: number; wide: number } }>({ intent: "reserve", mount_id: ++reservation, slot_id: entry.slot_id, subjects: entry.subjects });
      held = result.slot;
      if (!current(entry)) return;
      const area = entry.area = areas.open({ heights: result.heights,
        onHeight: height => { if (entry.ready && current(entry)) send({ type: "surface-slot-size", id: entry.id, height }); },
        onShown: visible => { if (visible) void read(entry); else forget(entry); },
      }) ?? undefined;
      if (!area) throw new Error("Surface slot unavailable");
      entry.slot = held; held = undefined;
      if (!entry.ready) { entry.ready = true; send({ type: "surface-slot-ready", id: entry.id }); }
      area.surface.addEventListener("pointerdown", event => { if (event.isTrusted) entry.press = entry.render?.render; }, true);
      area.surface.addEventListener("click", event => { void click(entry, event); });
      area.surface.addEventListener("keydown", positionMenuKey);
      area.layout(entry.box);
    } catch {
      if (current(entry) && !entry.ready) { send({ type: "surface-slot-ready", id: entry.id, error: "unavailable" }); close(entry); }
    } finally {
      if (held) void api({ intent: "close", slot: held }).catch(() => { /* The original page can already be closed. */ });
    }
  }
  scope.own(() => { for (const entry of entries.values()) close(entry); });
  scope.listen(root.ownerDocument, "molis-work:plugins-changed", () => {
    for (const entry of entries.values()) { forget(entry); void read(entry); }
  });
  scope.listen(root, "molis-work:select-item", event => {
    if ((event as CustomEvent<{ invalidate?: boolean }>).detail?.invalidate)
      for (const entry of entries.values()) void read(entry);
  });
  return (message: SurfaceSlotUp) => {
    if (message.type === "surface-slot-open") {
      if (!Number.isSafeInteger(message.id) || message.id <= last || entries.size >= 4 || !scope.alive) {
        send({ type: "surface-slot-ready", id: message.id, error: "unavailable" }); return;
      }
      last = message.id;
      const entry: Entry = { id: message.id, slot_id: message.slot_id, subjects: message.subjects, box: null, corrections: new Map() };
      entries.set(entry.id, entry); void reserve(entry); return;
    }
    const entry = entries.get(message.id);
    if (!entry) return;
    if (message.type === "surface-slot-close") { close(entry); return; }
    entry.box = message.box; entry.area?.layout(entry.box);
    if (!entry.box) forget(entry);
  };
}
