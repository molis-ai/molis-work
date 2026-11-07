import type {} from "@molis-ai/molis-work-plugin-sdk";
import {
  RETURN_TRIP_RULES, createReturnOwner, leaveReturnWindow, needOfAddress, placeOf, returnFrom, returnLink, returnNeed, startReturnWindow,
  type ReturnFrom, type ReturnNeed, type ReturnPlace, type ReturnStatus, type ReturnTrip,
} from "./return-trips.js";

/**
 * The `settings-return` owner (specs/draft-and-return/spec.md §2.2): this window's return trips, in the outer document only. It is set
 * up first in the client (scripts/client/bootstrap.ts), before any frame mounts, so a frame host's claim is answered from the start.
 * Bundled into dist/settings-return-client.js, which defines the page global `molisWorkSettingsReturn` the bootstrap calls.
 *
 * - The window number (§2.2): the `pagehide` mark is read and removed at once; a new tab, a copied tab and a sign-in landing page
 *   (a boot address naming `connected`, `connection_error` or `setup`) get a new number and lose the copied trips.
 * - `open`: the settings directory calls it after it opened the settings for `molis-work:open-settings-path`. Only a request that
 *   carries the frame host's `return_id` and a page's `from` opens a trip the page claims; a link inside the settings opens none.
 * - `saved`: a settings page saved what a trip may need; the trip is read back from its owner, and when met on the page it was opened
 *   for (and not met when it opened) the person goes back. Elsewhere in the settings the bar says it is set up.
 * - `molis-work:place-changed`: the settings closed or changed into another cover, not by this owner: the trip is read and settled.
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
  paint(): void;
}

type Detail = Record<string, unknown> & { answer?: unknown };
const detailOf = (event: Event): Detail | null => {
  const detail = (event as CustomEvent<unknown>).detail;
  return detail && typeof detail === "object" ? detail as Detail : null;
};
const announceEnded = (id: unknown) => {
  if (typeof id === "string" && id.length <= 64) document.dispatchEvent(new CustomEvent("molis-work:return-settled", { detail: { return_id: id, status: "ended" } }));
};
const IDLE: SettingsReturn = { open: detail => announceEnded((detail as Detail | null)?.return_id), refuse: announceEnded, link() {}, saved: async () => {}, paint() {} };

function sessionStore(): Storage | null {
  try { return sessionStorage; } catch { return null; }
}

/** A sign-in landing page: its boot address names the answer of an authorization (§2.2, a new window number at once). */
function landingPage(): boolean {
  const boot = new URLSearchParams(location.search);
  if (!boot.has("settingsPath")) return false;
  let asked: URLSearchParams;
  try { asked = new URL(boot.get("settingsPath") || "/", location.origin).searchParams; } catch { return false; }
  return ["connected", "connection_error", "setup"].some(key => asked.has(key));
}

/**
 * A link in the Assistant's thread (§2.3, 平台界面): the work it shows and, for 继续接入, the authorization the host named on the link
 * when it drew the card (`data-return-setup`, assistant-card-view.ts). The work is the one the Assistant marks current in its list.
 * Without a current work it is an ordinary link's place (the cover closes onto the Assistant), the need kept.
 */
function assistantSource(anchor: Element): { from: ReturnFrom; need?: ReturnNeed } | null {
  if (!anchor.closest("[data-assistant-thread]")) return null;
  const island = anchor.closest("[data-assistant-island]") ?? document;
  const work = island.querySelector<HTMLElement>("[data-work-id][aria-current=\"true\"]")?.dataset.workId || "";
  const from = returnFrom({ kind: "assistant", work_id: work }) ?? { kind: "under-cover" as const, place: null };
  const setup = anchor instanceof HTMLElement ? anchor.dataset.returnSetup : undefined;
  const need = setup ? returnNeed({ kind: "setup", authorization_id: setup }) : null;
  return { from, ...(need ? { need } : {}) };
}

export function createSettingsReturn(host: SettingsReturnHost): SettingsReturn {
  const L = host.translate, project = host.projectId || "", prefix = host.prefix || "";
  if (!project || window.top !== window) return IDLE;
  const storage = sessionStore();
  if (!storage) return IDLE;
  const windowId = startReturnWindow(storage, Date.now(), landingPage(), () => crypto.randomUUID());
  const workspace = () => host.tabWorkspace() || null;
  const coverKind = () => workspace()?.exclusive?.() || null;
  const fallback = L("请稍后重试");
  const read = async (need: ReturnNeed): Promise<boolean> => {
    if (need.kind === "model") {
      const result = await molisWorkRequest<{ health?: { status?: string }[] }>("/api/settings/models", { fallback });
      return (result.health || []).some(entry => entry?.status === "ready");
    }
    if (need.kind === "connection") {
      const result = await molisWorkRequest<{ connections?: { state?: string }[] }>("/api/settings/connectors/connections?service_id=" + encodeURIComponent(need.service_id), { fallback });
      return (result.connections || []).some(row => row?.state === "connected");
    }
    if (need.kind === "setup") {
      const result = await molisWorkRequest<{ status?: string }>("/api/settings/connectors/authorizations/" + encodeURIComponent(need.authorization_id), { fallback });
      return result?.status === "connected";
    }
    return false;
  };
  const holds = (place: ReturnPlace): boolean | undefined => {
    const detail: Detail = { pane: place.pane, surface: place.surface };
    document.dispatchEvent(new CustomEvent("molis-work:layout-holds", { detail }));
    return typeof detail.answer === "boolean" ? detail.answer : undefined;
  };
  const ready = new Set<string>();
  const owner = createReturnOwner({
    storage, window: windowId, project, now: () => Date.now(), newId: () => crypto.randomUUID(),
    setTimer: (run, ms) => setTimeout(run, ms), clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>), read, holds,
    settled: (id: string, status: ReturnStatus | "ended") => {
      ready.delete(id);
      document.dispatchEvent(new CustomEvent("molis-work:return-settled", { detail: { return_id: id, status } }));
    },
    changed: () => paint(),
  });
  const placeOfTrip = (trip: ReturnTrip) => trip.from.kind === "assistant" ? null : trip.from.place ?? null;
  const nameOf = (trip: ReturnTrip) => {
    if (trip.from.kind === "assistant") return L("助理");
    const place = placeOfTrip(trip);
    return (place && workspace()?.pluginTitle?.(place.surface)) || L("原来的页面");
  };
  const sectionOf = (trip: ReturnTrip) => trip.cover.split(" ")[1] || "";
  const shownSection = () => (workspace()?.coverPlace?.(coverKind()) || "").split(" ")[0];
  let closing = false;
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
    if (landed === "gone") host.showToast?.(L("原来的页面已经关了，配好的设置都在。"));
    else if (status === "ready" && trip.need.kind === "model") host.showToast?.(L("模型已连接，回到「{name}」接着做。", { name: nameOf(trip) }));
    else if (status === "ready" && trip.need.kind !== "none") host.showToast?.(L("已经连上，回到「{name}」。", { name: nameOf(trip) }));
  };
  const barText = (trip: ReturnTrip, state: string) => {
    const body = state === "gone" ? L("原来的页面已经关了，配好的设置都在。") : state === "ready" ? L("已经好了，可以回去了。")
      : state === "look" ? L("看完点「回去」，回到原来的地方。")
      : trip.need.kind === "model" ? L("配好模型后自动回去，你写的都还在。") : L("连好后自动回去，你写的都还在。");
    return { title: L("从「{name}」来", { name: nameOf(trip) }), body, label: state === "waiting" ? L("现在回去") : L("回去") };
  };
  const setText = (node: Element | null | undefined, text: string) => { if (node && node.textContent !== text) node.textContent = text; };
  const barFor = (surface: Element) => {
    const shown = surface.querySelector<HTMLElement>(":scope > [data-settings-return-bar]");
    if (shown) return shown;
    const template = document.querySelector<HTMLTemplateElement>("template[data-settings-return-bar-template]");
    const bar = template?.content.firstElementChild?.cloneNode(true);
    if (!(bar instanceof HTMLElement)) return null;
    bar.dataset.settingsReturnBar = "";
    bar.querySelector("[data-return-bar-back]")?.addEventListener("click", () => void back(owner.find(bar.dataset.settingsReturnBar || "")));
    surface.prepend(bar);
    return bar;
  };
  function paint() {
    const kind = coverKind(), trip = owner.current(kind);
    const surface = kind ? document.querySelector(`[data-work-surface="${CSS.escape(kind)}"]`) : null;
    document.querySelectorAll("[data-settings-return-bar]").forEach(bar => { if (!trip || bar.parentElement !== surface) bar.remove(); });
    if (!trip || !surface) return;
    const bar = barFor(surface);
    if (!bar) return;
    const place = placeOfTrip(trip), gone = place !== null && holds(place) === false;
    const state = gone ? "gone" : ready.has(trip.id) ? "ready" : trip.met_at_open || trip.need.kind === "none" ? "look" : "waiting";
    bar.dataset.settingsReturnBar = trip.id;
    bar.dataset.returnBarState = state;
    bar.classList.toggle("mw-alert--success", state === "ready");
    bar.classList.toggle("mw-alert--info", state !== "ready");
    const text = barText(trip, state);
    setText(bar.querySelector("[data-return-bar-title]"), text.title);
    setText(bar.querySelector("[data-return-bar-body]"), text.body);
    setText(bar.querySelector("[data-return-bar-back] [data-slot=button-label]"), text.label);
  }
  document.addEventListener("molis-work:return-claim", event => {
    const detail = detailOf(event);
    if (detail) detail.answer = owner.claim(detail);
  });
  document.addEventListener("molis-work:place-changed", event => {
    const detail = detailOf(event), previous = detail?.previous && typeof detail.previous === "object" ? detail.previous as Detail : null;
    const cover = detail?.cover ?? null, before = previous?.cover ?? null;
    if (!closing && cover !== before) for (const trip of owner.list()) if (!trip.outcome && trip.cover.split(" ")[0] === before) void owner.check(trip.id);
    paint();
  });
  addEventListener("pagehide", () => leaveReturnWindow(storage, windowId, Date.now()));
  addEventListener("pageshow", event => {
    if (!event.persisted) return;
    try { storage.removeItem(RETURN_TRIP_RULES.keys.handoff); } catch { return; }
    owner.reload();
    paint();
  });
  setTimeout(() => void owner.boot(coverKind()).then(paint), 0);
  return {
    open(detail, cover, wasOpen) {
      const asked = detail && typeof detail === "object" ? detail as Detail : {};
      const id = typeof asked.return_id === "string" ? asked.return_id : null;
      if (wasOpen && !id) return;
      const from = returnFrom(asked.from) || { kind: "under-cover" as const, place: null };
      const need = returnNeed(asked.need) || needOfAddress(String(asked.href || ""), location.origin, prefix);
      const claim = id !== null && from.kind === "page";
      const opened = owner.open({ ...(id ? { id } : {}), from, need, claim, ...(claim ? { carry: asked.carry } : {}), cover });
      if (!opened && id) announceEnded(id);
      paint();
    },
    refuse: announceEnded,
    link(anchor, href, cover, wasOpen) {
      if (wasOpen) return;
      const assistant = assistantSource(anchor);
      const surface = anchor.closest<HTMLElement>("[data-work-surface]")?.dataset.workSurface || "";
      const from = assistant?.from ?? { kind: "under-cover" as const, place: placeOf(anchor, surface) };
      owner.open({ from, need: assistant?.need ?? needOfAddress(href, location.origin, prefix), claim: false, cover });
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
