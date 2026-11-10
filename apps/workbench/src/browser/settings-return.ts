import type {} from "@molis-ai/molis-work-plugin-sdk";
import {
  RETURN_TRIP_RULES, createReturnOwner, leaveReturnWindow, needOfAddress, placeOf, returnFrom, returnLanding, returnLink, returnNeed, startReturnWindow,
  type ReturnNeed, type ReturnPlace, type ReturnStatus, type ReturnTrip,
} from "./return-trips.js";

const uiText = globalThis.t;

/**
 * The `settings-return` owner (specs/draft-and-return/spec.md §2.2): this window's return trips, in the outer document only. It is set
 * up first in the client (scripts/client/bootstrap.ts), before any frame mounts, so a frame host's claim is answered from the start.
 * Bundled into dist/settings-return-client.js, which defines the page global `molisWorkSettingsReturn` the bootstrap calls.
 *
 * - The window number (§2.2): the `pagehide` mark is read and removed at once; a new tab, a copied tab and a sign-in landing page
 *   (`returnLanding`) get a new number and lose the copied trips.
 * - `open`: the settings directory calls it after it opened the settings for `molis-work:open-settings-path`. Only a request that
 *   carries the frame host's `return_id` and a page's `from` opens a trip the page claims; a link inside the settings opens none.
 * - `saved`: a settings page saved what a trip may need; the trip is read back from its owner, and when met on the page it was opened
 *   for (and not met when it opened) the person goes back. Elsewhere in the settings the bar says it is set up.
 * - `molis-work:place-changed`: the settings closed or changed into another cover, not by this owner: the trip is read and settled.
 *   Only after `start`: until then the changes are the document's own start (a reload, a language switch), judged once by `boot`.
 * - Going back: close the cover (as `closeCover` steps back), then the surface's own open when the place is not the one in front, or
 *   the Assistant on the Work; then settle, so a page that claims finds itself shown.
 */

/** The parts of the tab workspace (scripts/client/tab-workspace.ts) the owner uses; every one may be missing. */
export interface SettingsReturnWorkspace {
  exclusive?(): string | null;
  coverPlace?(kind: string | null): string | null | undefined;
  pluginTitle?(surface: string): string | undefined;
  closeCover?(): boolean;
  setExclusive?(kind: string | null): void;
  shownPlugin?(): string | null | undefined;
  state?(): { focusedPaneId?: string } | null | undefined;
  openItem?(surface: string, id: string): void;
  openPlugin?(surface: string): void;
}

export interface SettingsReturnHost {
  translate(text: string, values?: Record<string, string>): string;
  projectId: string;
  prefix: string;
  tabWorkspace(): SettingsReturnWorkspace | null | undefined;
  showToast?(text: string): void;
  setDirectory?(name: string, push: boolean, focus: boolean): void;
}

export interface SettingsReturn {
  /** The settings were opened for this request onto "<kind> <section>"; `wasOpen` when they were already showing. */
  open(detail: unknown, cover: string, wasOpen: boolean): void;
  /** A trip a page asked for that could not open: its wait ends at once. */
  refuse(id: unknown): void;
  /** An ordinary settings link in this document: where it sits is where the person came from. */
  link(anchor: Element, href: string, cover: string, wasOpen: boolean): void;
  /** A settings page saved what a trip may need; `known` when its answer already says the need is met, so it is not read again. */
  saved(kind: ReturnNeed["kind"], known?: boolean): Promise<void>;
  /**
   * The document's start is done: the settings the boot address asks for (`?settings=`, `?settingsPath=`, as after switching the
   * language) are open by now, so the trips are judged against the cover as it is. The settings directory calls it once, detached
   * from this object (a timer callback), so it uses no `this`.
   */
  start(): void;
  paint(): void;
}

type Detail = Record<string, unknown> & { answer?: unknown };
const detailOf = (event: Event): Detail | null => {
  const detail = (event as CustomEvent<unknown>).detail;
  return detail && typeof detail === "object" ? detail as Detail : null;
};
const announce = (id: string, status: ReturnStatus | "ended" | "refused") => document.dispatchEvent(new CustomEvent("molis-work:return-settled", { detail: { return_id: id, status } }));
/** A trip a page asked for that did not open (no settings, no trips in this document): its `go()` is refused at once. */
const refuse = (id: unknown) => { if (typeof id === "string" && id.length <= 64) announce(id, "refused"); };
/** Said on the bar and in the toast when the place the person came from was closed. */
const GONE = "workbench.settings-return.page-came-closed-what-set-up-kept";
const IDLE: SettingsReturn = { open: detail => refuse((detail as Detail | null)?.return_id), refuse, link() {}, saved: async () => {}, start() {}, paint() {} };

function sessionStore(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}

/** Reads a need back from its owner, as the person, through the routes the settings already use (§3.4). */
async function readNeed(need: ReturnNeed, fallback: string): Promise<boolean> {
  type Read = { health?: { status?: string }[]; connections?: { state?: string }[]; status?: string };
  const path = need.kind === "model" ? "/api/settings/models" : need.kind === "connection" ? "/api/settings/connectors/connections?service_id=" + encodeURIComponent(need.service_id)
    : need.kind === "setup" ? "/api/settings/connectors/authorizations/" + encodeURIComponent(need.authorization_id) : "";
  if (!path) return false;
  const read = await molisWorkRequest<Read>(path, { fallback });
  return need.kind === "model" ? (read.health || []).some(entry => entry?.status === "ready")
    : need.kind === "connection" ? (read.connections || []).some(row => row?.state === "connected") : read?.status === "connected";
}

/** The layout's answer for a place (`molis-work:layout-holds`, tab-workspace-places.ts); undefined when nobody answered. */
function holds(place: ReturnPlace): boolean | undefined {
  const detail: Detail = { pane: place.pane, surface: place.surface };
  document.dispatchEvent(new CustomEvent("molis-work:layout-holds", { detail }));
  return typeof detail.answer === "boolean" ? detail.answer : undefined;
}

const placeOfTrip = (trip: ReturnTrip) => trip.from.kind === "assistant" ? null : trip.from.place ?? null;
type BarState = "waiting" | "look" | "ready" | "gone";
const setText = (node: Element | null | undefined, text: string) => { if (node && node.textContent !== text) node.textContent = text; };

/**
 * The return bar on the settings surface (U4): one, cloned from the surface's template, at the top of the settings' own column (it
 * scrolls with them) on the cover the trip was opened for; any other is removed. Its button calls `back` with the trip it shows.
 */
function paintReturnBar(_L: SettingsReturnHost["translate"], kind: string | null, trip: ReturnTrip | null, view: { name: string | null; ready: boolean; back(id: string): void }) {
  const cover = kind ? document.querySelector(`[data-work-surface="${CSS.escape(kind)}"]`) : null;
  const surface = cover?.querySelector("[data-settings-stage-body]") ?? cover;
  document.querySelectorAll("[data-settings-return-bar]").forEach(bar => { if (!trip || bar.parentElement !== surface) bar.remove(); });
  if (!trip || !surface) return;
  let bar = surface.querySelector<HTMLElement>(":scope > [data-settings-return-bar]");
  if (!bar) {
    const made = document.querySelector<HTMLTemplateElement>("template[data-settings-return-bar-template]")?.content.firstElementChild?.cloneNode(true);
    if (!(made instanceof HTMLElement)) return;
    bar = made;
    made.querySelector("[data-return-bar-back]")?.addEventListener("click", () => view.back(made.dataset.settingsReturnBar || ""));
    surface.prepend(made);
  }
  const place = placeOfTrip(trip);
  const state: BarState = place !== null && holds(place) === false ? "gone" : view.ready ? "ready" : trip.met_at_open || trip.need.kind === "none" ? "look" : "waiting";
  bar.dataset.settingsReturnBar = trip.id;
  bar.dataset.returnBarState = state;
  bar.classList.toggle("mw-alert--success", state === "ready");
  bar.classList.toggle("mw-alert--info", state !== "ready");
  // "What you wrote is kept" only when the page said where its draft is.
  const kept = Boolean(trip.carry?.draft_key), model = trip.need.kind === "model";
  const body = state === "gone" ? uiText.text(GONE) : state === "ready" ? uiText.text("workbench.settings-return.its-set-up-can-go-back-now")
    : state === "look" ? uiText.text("workbench.settings-return.when-youre-done-press-go-back-return-where")
    : (model ? uiText.text("workbench.settings-return.goes-back-once-model-set-up") : uiText.text("workbench.settings-return.goes-back-once-connected")) + (kept ? uiText.text("workbench.settings-return.what-wrote-kept") : "");
  setText(bar.querySelector("[data-return-bar-title]"), view.name ? uiText.text("workbench.settings-return.name", { name: view.name }) : uiText.text("workbench.settings-return.previous-page"));
  setText(bar.querySelector("[data-return-bar-body]"), body);
  setText(bar.querySelector("[data-return-bar-back] [data-slot=button-label]"), state === "waiting" ? uiText.text("workbench.settings-return.go-back-now") : state === "gone" ? uiText.text("workbench.settings-return.close-settings") : uiText.text("workbench.settings-return.go-back"));
}

/**
 * The Assistant's panel rises from the bar no higher than the return bar's foot, so its tabs never cover 回去 (DRT-10): while a
 * return bar is seen, its bottom edge is `--return-bar-bottom` on the page (the panel's height reads it), measured again as the
 * window or the settings scroll; without one the property goes.
 */
let barQueued = 0;
function seeReturnBar() {
  barQueued = 0;
  const bar = document.querySelector<HTMLElement>("[data-settings-return-bar]");
  const bottom = bar && bar.getClientRects().length ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
  if (bottom) document.body.style.setProperty("--return-bar-bottom", bottom + "px"); else document.body.style.removeProperty("--return-bar-bottom");
}
function queueReturnBar() { if (!barQueued) barQueued = requestAnimationFrame(seeReturnBar); }

export function createSettingsReturn(host: SettingsReturnHost): SettingsReturn {
  const readText = host.translate, project = host.projectId || "", prefix = host.prefix || "";
  if (!project || window.top !== window) return IDLE;
  const storage = sessionStore();
  if (!storage) return IDLE;
  const windowId = startReturnWindow(storage, Date.now(), returnLanding(location.search, location.origin), () => crypto.randomUUID());
  const workspace = () => host.tabWorkspace() || null;
  const coverKind = () => workspace()?.exclusive?.() || null;
  const fallback = uiText.text("workbench.settings-return.try-again-moment"), read = (need: ReturnNeed) => readNeed(need, fallback);
  const ready = new Set<string>();
  const owner = createReturnOwner({
    storage, window: windowId, project, now: () => Date.now(), newId: () => crypto.randomUUID(),
    setTimer: (run, ms) => setTimeout(run, ms), clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>), read, holds,
    settled: (id: string, status: ReturnStatus | "ended") => {
      ready.delete(id);
      announce(id, status);
    },
    changed: () => paint(),
  });
  /** The place's own name, or null when the workbench has none for it (the bar and the toast then say "the page you came from"). */
  const nameOf = (trip: ReturnTrip) => {
    if (trip.from.kind === "assistant") return uiText.text("workbench.settings-return.assistant");
    const place = placeOfTrip(trip);
    return (place && workspace()?.pluginTitle?.(place.surface)) || null;
  };
  const sectionOf = (trip: ReturnTrip) => trip.cover.split(" ")[1] || "";
  const shownSection = () => (workspace()?.coverPlace?.(coverKind()) || "").split(" ")[0];
  // `started`: the document's start is done (`start`); the covers its start restores and closes before that are not the person's doing.
  let closing = false, started = false;
  const closeSettings = () => {
    closing = true;
    try {
      if (!workspace()?.closeCover?.()) { host.setDirectory?.("root", true, false); workspace()?.setExclusive?.(null); }
    } finally { closing = false; }
  };
  /** Where the person lands: here (the place is in front once the cover is off, or the surface's own open moved it), or gone. */
  const travel = (trip: ReturnTrip): "here" | "gone" => {
    if (coverKind()) closeSettings();
    if (trip.from.kind === "assistant") {
      document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { work_id: trip.from.work_id } }));
      return "here";
    }
    const place = placeOfTrip(trip);
    if (!place) return "here";
    const tabs = workspace();
    if (tabs?.shownPlugin?.() === place.surface && tabs?.state?.()?.focusedPaneId === place.pane) return "here";
    const object = trip.carry?.object?.id;
    if (!returnLink(prefix, place.surface, object) || (holds(place) === false && !object)) return "gone";
    if (object) tabs?.openItem?.(place.surface, object); else tabs?.openPlugin?.(place.surface);
    return "here";
  };
  const back = async (trip: ReturnTrip | null, met?: boolean) => {
    if (!trip || trip.outcome) return;
    const status: ReturnStatus = met === true || await owner.met(trip.need) ? "ready" : "not_ready";
    const landed = travel(trip);
    owner.settle(trip.id, status);
    const name = nameOf(trip), model = trip.need.kind === "model";
    if (landed === "gone") host.showToast?.(uiText.text(GONE));
    else if (status === "ready" && trip.need.kind !== "none") host.showToast?.(model ? (name ? uiText.text("workbench.settings-return.model-connected-back-name", { name }) : uiText.text("workbench.settings-return.model-connected-can-carry"))
      : name ? uiText.text("workbench.settings-return.connected-back-name", { name }) : uiText.text("workbench.settings-return.connected"));
  };
  function paint() {
    const kind = coverKind(), trip = owner.current(kind);
    paintReturnBar(readText, kind, trip, { name: trip ? nameOf(trip) : "", ready: Boolean(trip && ready.has(trip.id)), back: id => void back(owner.find(id)) });
    queueReturnBar();
  }
  addEventListener("resize", queueReturnBar, { passive: true });
  document.addEventListener("scroll", queueReturnBar, { capture: true, passive: true });
  document.addEventListener("molis-work:return-claim", event => {
    const detail = detailOf(event);
    if (detail) detail.answer = owner.claim(detail);
  });
  document.addEventListener("molis-work:place-changed", event => {
    const detail = detailOf(event), previous = detail?.previous && typeof detail.previous === "object" ? detail.previous as Detail : null;
    const cover = detail?.cover ?? null, before = previous?.cover ?? null;
    if (started && !closing && cover !== before) for (const trip of owner.list()) if (!trip.outcome && trip.cover.split(" ")[0] === before) void owner.check(trip.id);
    paint();
  });
  addEventListener("pagehide", () => leaveReturnWindow(storage, windowId, Date.now()));
  addEventListener("pageshow", event => {
    if (!event.persisted) return;
    try { storage.removeItem(RETURN_TRIP_RULES.keys.handoff); } catch { return; }
    owner.reload();
    paint();
  });
  return {
    start() {
      if (started) return;
      started = true;
      void owner.boot(coverKind()).then(paint);
    },
    open(detail, cover, wasOpen) {
      const asked = detail && typeof detail === "object" ? detail as Detail : {};
      const id = typeof asked.return_id === "string" ? asked.return_id : null;
      if (wasOpen && !id) return;
      const from = returnFrom(asked.from) || { kind: "under-cover" as const, place: null };
      const need = returnNeed(asked.need) || needOfAddress(String(asked.href || ""), location.origin, prefix);
      const claim = id !== null && from.kind === "page";
      const opened = owner.open({ ...(id ? { id } : {}), from, need, claim, ...(claim ? { carry: asked.carry } : {}), cover });
      if (!opened && id) refuse(id);
      paint();
    },
    refuse,
    link(anchor, href, cover, wasOpen) {
      if (wasOpen) return;
      const surface = anchor.closest<HTMLElement>("[data-work-surface]")?.dataset.workSurface || "";
      owner.open({ from: { kind: "under-cover", place: placeOf(anchor, surface) }, need: needOfAddress(href, location.origin, prefix), claim: false, cover });
      paint();
    },
    async saved(kind, known) {
      const trip = owner.current(coverKind());
      if (!trip || trip.need.kind !== kind || !(known === true || await owner.met(trip.need))) return;
      if (!trip.met_at_open && sectionOf(trip) === shownSection() && owner.current(coverKind())?.id === trip.id) await back(trip, true);
      else { ready.add(trip.id); paint(); }
    },
    paint,
  };
}
