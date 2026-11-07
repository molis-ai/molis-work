import {
  RETURN_TRIP_RULES, createReturnOwner, leaveReturnWindow, needOfAddress, placeOf, readReturnTrips, returnCarry, returnFrom, returnLink,
  returnMatches, returnNeed, returnPlace, returnRecord, returnSource, returnText, returnTrip, samePlace, startReturnWindow, writeReturnTrips,
} from "../../browser/return-trips.js";

/**
 * The `settings-return` owner (specs/draft-and-return/spec.md §2.2): this window's return trips, in the outer document only. It is set
 * up first in the client (bootstrap.ts), before any frame mounts, so a frame host's claim is answered from the start.
 *
 * Notes on the script below, kept here because the script is served as it stands:
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
export const SETTINGS_RETURN_FACTORY_SCRIPT = `(host) => {
  const RETURN_TRIP_RULES = ${JSON.stringify(RETURN_TRIP_RULES)};
  ${returnRecord}
  ${returnText}
  ${returnCarry}
  ${returnPlace}
  ${returnFrom}
  ${returnNeed}
  ${returnTrip}
  ${placeOf}
  ${samePlace}
  ${returnLink}
  ${needOfAddress}
  ${startReturnWindow}
  ${leaveReturnWindow}
  ${readReturnTrips}
  ${writeReturnTrips}
  ${returnSource}
  ${returnMatches}
  ${createReturnOwner}
  const L = host.translate, project = host.projectId || "";
  const ended = (id) => { if (typeof id === "string" && id.length <= 64) document.dispatchEvent(new CustomEvent("molis-work:return-settled", { detail: { return_id: id, status: "ended" } })); };
  const idle = { open(detail) { ended(detail?.return_id); }, refuse: ended, link() {}, saved: async () => {}, paint() {} };
  if (!project || window.top !== window) return idle;
  let storage = null;
  try { storage = sessionStorage; } catch { storage = null; }
  if (!storage) return idle;
  const boot = new URLSearchParams(location.search);
  let asked = new URLSearchParams();
  try { asked = new URL(boot.get("settingsPath") || "/", location.origin).searchParams; } catch { asked = new URLSearchParams(); }
  const landing = boot.has("settingsPath") && ["connected", "connection_error", "setup"].some((key) => asked.has(key));
  const windowId = startReturnWindow(storage, Date.now(), landing, () => crypto.randomUUID());
  const workspace = () => host.tabWorkspace?.() || null;
  const coverKind = () => workspace()?.exclusive?.() || null;
  const read = async (need) => {
    if (need.kind === "model") return ((await molisWorkRequest("/api/settings/models", { fallback: L("请稍后重试") })).health || []).some((entry) => entry?.status === "ready");
    if (need.kind === "connection") return ((await molisWorkRequest("/api/settings/connectors/connections?service_id=" + encodeURIComponent(need.service_id), { fallback: L("请稍后重试") })).connections || []).some((row) => row?.state === "connected");
    if (need.kind === "setup") return (await molisWorkRequest("/api/settings/connectors/authorizations/" + encodeURIComponent(need.authorization_id), { fallback: L("请稍后重试") }))?.status === "connected";
    return false;
  };
  const holds = (place) => {
    const detail = { pane: place.pane, surface: place.surface };
    document.dispatchEvent(new CustomEvent("molis-work:layout-holds", { detail }));
    return typeof detail.answer === "boolean" ? detail.answer : undefined;
  };
  const ready = new Set();
  const owner = createReturnOwner({ storage, window: windowId, project, now: () => Date.now(), newId: () => crypto.randomUUID(),
    setTimer: (run, ms) => setTimeout(run, ms), clearTimer: (handle) => clearTimeout(handle), read, holds,
    settled: (id, status) => { ready.delete(id); document.dispatchEvent(new CustomEvent("molis-work:return-settled", { detail: { return_id: id, status } })); },
    changed: () => paint() });
  const nameOf = (trip) => trip.from.kind === "assistant" ? L("助理") : trip.from.place ? workspace()?.pluginTitle?.(trip.from.place.surface) || L("原来的页面") : L("原来的页面");
  const sectionOf = (trip) => trip.cover.split(" ")[1] || "";
  const shownSection = () => (workspace()?.coverPlace?.(coverKind()) || "").split(" ")[0];
  let closing = false;
  const closeSettings = () => {
    closing = true;
    try { if (!workspace()?.closeCover?.()) { host.setDirectory?.("root", true, false); workspace()?.setExclusive?.(null); } }
    finally { closing = false; }
  };
  /** Where the person lands: here (the place is in front once the cover is off), moved (the surface's own open), or gone. */
  const travel = (trip) => {
    if (coverKind()) closeSettings();
    if (trip.from.kind === "assistant") { document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { work_id: trip.from.work_id } })); return "here"; }
    const place = trip.from.place;
    if (!place) return "here";
    const tabs = workspace();
    if (tabs?.shownPlugin?.() === place.surface && tabs?.state?.()?.focusedPaneId === place.pane) return "here";
    const object = trip.carry?.object?.id;
    if (!returnLink(host.prefix || "", place.surface, object) || holds(place) === false && !object) return "gone";
    if (object) tabs?.openItem?.(place.surface, object); else tabs?.openPlugin?.(place.surface);
    return "here";
  };
  const back = async (trip, met) => {
    if (!trip || trip.outcome) return;
    const status = met === true || await owner.met(trip.need) ? "ready" : "not_ready";
    const landed = travel(trip);
    owner.settle(trip.id, status);
    if (landed === "gone") host.showToast?.(L("原来的页面已经关了，配好的设置都在。"));
    else if (status === "ready" && trip.need.kind === "model") host.showToast?.(L("模型已连接，回到「{name}」接着做。", { name: nameOf(trip) }));
    else if (status === "ready" && trip.need.kind !== "none") host.showToast?.(L("已经连上，回到「{name}」。", { name: nameOf(trip) }));
  };
  const paint = () => {
    const kind = coverKind(), trip = owner.current(kind);
    const surface = kind ? document.querySelector('[data-work-surface="' + CSS.escape(kind) + '"]') : null;
    document.querySelectorAll("[data-settings-return-bar]").forEach((bar) => { if (!trip || bar.parentElement !== surface) bar.remove(); });
    if (!trip || !surface) return;
    let bar = surface.querySelector(":scope > [data-settings-return-bar]");
    if (!bar) {
      bar = document.querySelector("template[data-settings-return-bar-template]")?.content.firstElementChild?.cloneNode(true);
      if (!bar) return;
      bar.dataset.settingsReturnBar = "";
      bar.querySelector("[data-return-bar-back]")?.addEventListener("click", () => void back(owner.find(bar.dataset.settingsReturnBar)));
      surface.prepend(bar);
    }
    const gone = Boolean(trip.from.place) && holds(trip.from.place) === false;
    const state = gone ? "gone" : ready.has(trip.id) ? "ready" : trip.met_at_open || trip.need.kind === "none" ? "look" : "waiting";
    bar.dataset.settingsReturnBar = trip.id;
    bar.dataset.returnBarState = state;
    bar.classList.toggle("mw-alert--success", state === "ready");
    bar.classList.toggle("mw-alert--info", state !== "ready");
    const body = state === "gone" ? L("原来的页面已经关了，配好的设置都在。") : state === "ready" ? L("已经好了，可以回去了。")
      : state === "look" ? L("看完点「回去」，回到原来的地方。") : trip.need.kind === "model" ? L("配好模型后自动回去，你写的都还在。") : L("连好后自动回去，你写的都还在。");
    const title = L("从「{name}」来", { name: nameOf(trip) }), label = state === "waiting" ? L("现在回去") : L("回去");
    const titleNode = bar.querySelector("[data-return-bar-title]"), bodyNode = bar.querySelector("[data-return-bar-body]"), button = bar.querySelector("[data-return-bar-back] [data-slot=button-label]");
    if (titleNode && titleNode.textContent !== title) titleNode.textContent = title;
    if (bodyNode && bodyNode.textContent !== body) bodyNode.textContent = body;
    if (button && button.textContent !== label) button.textContent = label;
  };
  document.addEventListener("molis-work:return-claim", (event) => {
    if (event.detail && typeof event.detail === "object") event.detail.answer = owner.claim(event.detail);
  });
  document.addEventListener("molis-work:place-changed", (event) => {
    const cover = event.detail?.cover ?? null, before = event.detail?.previous?.cover ?? null;
    if (!closing && cover !== before) for (const trip of owner.list()) if (!trip.outcome && trip.cover.split(" ")[0] === before) void owner.check(trip.id);
    paint();
  });
  addEventListener("pagehide", () => leaveReturnWindow(storage, windowId, Date.now()));
  addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    try { storage.removeItem(RETURN_TRIP_RULES.keys.handoff); } catch { return; }
    owner.reload();
    paint();
  });
  setTimeout(() => void owner.boot(coverKind()).then(paint), 0);
  const refuse = ended;
  return {
    /** The settings were opened for this request onto "<kind> <section>"; \`wasOpen\` when they were already showing. */
    open(detail, cover, wasOpen) {
      const named = typeof detail?.return_id === "string";
      if (wasOpen && !named) return;
      const from = returnFrom(detail?.from) || { kind: "under-cover", place: null };
      const need = returnNeed(detail?.need) || needOfAddress(String(detail?.href || ""), location.origin, host.prefix || "");
      const claim = named && from.kind === "page";
      if (!owner.open({ ...(named ? { id: detail.return_id } : {}), from, need, claim, ...(claim ? { carry: detail.carry } : {}), cover }) && named) refuse(detail.return_id);
      paint();
    },
    /** A trip a page asked for that could not open: its wait ends at once. */
    refuse,
    /** An ordinary settings link in this document: where it sits is where the person came from. */
    link(anchor, href, cover, wasOpen) {
      if (wasOpen) return;
      const surface = anchor.closest("[data-work-surface]")?.dataset.workSurface || "";
      owner.open({ from: { kind: "under-cover", place: placeOf(anchor, surface) }, need: needOfAddress(href, location.origin, host.prefix || ""), claim: false, cover });
      paint();
    },
    async saved(kind) {
      const trip = owner.current(coverKind());
      if (!trip || trip.need.kind !== kind || !await owner.met(trip.need)) return;
      if (!trip.met_at_open && sectionOf(trip) === shownSection() && owner.current(coverKind())?.id === trip.id) await back(trip, true);
      else { ready.add(trip.id); paint(); }
    },
    paint,
  };
}`;
