/**
 * Return trips (specs/draft-and-return/spec.md §2): where the person went into the settings from, what the settings had to make true,
 * and what goes back. The one writer is the outer document's `settings-return` owner (settings-return.ts, bundled with these
 * functions); the frame host (plugin-frame/returns.ts) uses `placeOf` and `returnGo` from the same source. Everything here is plain
 * functions over small structural types, with no DOM library, so the unit tests import them through the package entry.
 */
import { UI_RETURN_CARRY_LIMITS as CARRY } from "@molis-ai/molis-work-contracts/platform/ui";

export const RETURN_TRIP_RULES = {
  keys: { trips: "molis-work:return-trips", window: "molis-work:return-window", handoff: "molis-work:return-window-handoff" },
  openMs: 24 * 60 * 60 * 1000, settledMs: 60 * 60 * 1000, perProject: 8, handoffMs: 10 * 1000,
  surface: /^[a-z][a-z0-9-]{0,100}$/u, step: new RegExp(`^[A-Za-z0-9._:-]{1,${CARRY.step}}$`, "u"), id: /^[A-Za-z0-9-]{1,64}$/u,
  service: /^[a-z0-9][a-z0-9._-]{0,127}$/u, slot: /^[a-z][a-z0-9-]{0,63}$/u, record: /^[A-Za-z0-9._:-]{1,200}$/u,
  draftKey: CARRY.draft_key, objectId: CARRY.object_id, objectKind: CARRY.object_kind, text: 300, cover: 2000,
} as const;

/** A string the pattern matches (the patterns are anchored and have no global flag, so `test` keeps no state). */
const fits = (value: unknown, pattern: RegExp): value is string => typeof value === "string" && pattern.test(value);

export type ReturnPlace = { pane: string; surface: string };
export type ReturnFrom =
  | { kind: "page"; mount: string; scope: string; plugin: string; surface: string; place: ReturnPlace | null }
  | { kind: "assistant"; work_id: string }
  | { kind: "under-cover"; place?: ReturnPlace | null };
export type ReturnNeed = { kind: "model" } | { kind: "connection"; service_id: string; slot?: { slot_id: string; record_key?: string } }
  | { kind: "setup"; authorization_id: string } | { kind: "none" };
export type ReturnCarry = { draft_key?: string; step?: string; object?: { kind: string; id: string } };
export type ReturnStatus = "ready" | "not_ready";
/** `met_at_open` is null until the need is read back once after the trip opened (a save before that is not taken as already met). */
export interface ReturnTrip {
  v: /* @version format.workbench.return-trip */ 1; id: string; window: string; project: string; from: ReturnFrom; claim: boolean; need: ReturnNeed; met_at_open: boolean | null;
  carry?: ReturnCarry; cover: string; opened_at: number; expires_at: number; outcome?: { status: ReturnStatus; at: number };
}
export type ReturnClaimAnswer = { status: ReturnStatus; carry: ReturnCarry } | { open: string } | null;
export interface ReturnStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/**
 * A plain object of exactly the shape `"name name? …"`: every key is one of the names, and each name without `?` is there. A pane
 * document's objects come from another realm, so the test is the object's tag, never its prototype.
 */
export function returnRecord(value: unknown, shape: string): Record<string, unknown> | null {
  // The tag alone rules out null, arrays, functions and every primitive, from any realm.
  if (Object.prototype.toString.call(value) !== "[object Object]") return null;
  const names = shape.split(" "), keys = Object.keys(value as object);
  return keys.every(key => names.includes(key) || names.includes(key + "?")) && names.every(name => name.endsWith("?") || keys.includes(name))
    ? value as Record<string, unknown> : null;
}

/** The `kind` of an object (what to check it as), before its shape is checked. */
const kindOf = (value: unknown): unknown => value && typeof value === "object" ? (value as { kind?: unknown }).kind : undefined;

/** Non-empty text of at most `max` characters (code points, as the contract counts them) with no control characters. */
export function returnText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

/** The carry exactly as `UiReturnCarry` has it (missing is empty); a name more, a value too long or of other characters, is null. */
export function returnCarry(value: unknown): ReturnCarry | null {
  if (value === undefined) return {};
  const carry = returnRecord(value, "draft_key? step? object?");
  if (!carry) return null;
  const out: ReturnCarry = {};
  if (carry.draft_key !== undefined) { if (!returnText(carry.draft_key, RETURN_TRIP_RULES.draftKey)) return null; out.draft_key = carry.draft_key; }
  if (carry.step !== undefined) { if (!fits(carry.step, RETURN_TRIP_RULES.step)) return null; out.step = carry.step; }
  if (carry.object !== undefined) {
    const object = returnRecord(carry.object, "kind id");
    if (!object || !returnText(object.kind, RETURN_TRIP_RULES.objectKind) || !returnText(object.id, RETURN_TRIP_RULES.objectId)) return null;
    out.object = { kind: object.kind, id: object.id };
  }
  return out;
}

/** A page's `return-go` over its port: an id, the need (a text model only) and the carry. Any other name refuses the whole message. */
export function returnGo(message: unknown): { id: number; need: { kind: "model" }; carry: ReturnCarry } | null {
  const go = returnRecord(message, "type id need carry?");
  if (!go || go.type !== "return-go" || !Number.isSafeInteger(go.id) || (go.id as number) <= 0) return null;
  const need = returnRecord(go.need, "kind"), carry = returnCarry(go.carry);
  return need?.kind === "model" && carry ? { id: go.id as number, need: { kind: "model" }, carry } : null;
}

/** A place as the shell computed it: a pane id and the surface the page is on. */
export function returnPlace(value: unknown): ReturnPlace | null | undefined {
  if (value === null) return null;
  const place = returnRecord(value, "pane surface");
  return place && returnText(place.pane, 100) && fits(place.surface, RETURN_TRIP_RULES.surface)
    ? { pane: place.pane, surface: place.surface } : undefined;
}

/** Where a trip came from, as the shell wrote it. */
export function returnFrom(value: unknown): ReturnFrom | null {
  const kind = kindOf(value);
  if (kind === "page") {
    const from = returnRecord(value, "kind mount scope plugin surface place");
    const place = returnPlace(from?.place);
    if (!from || place === undefined || !fits(from.mount, RETURN_TRIP_RULES.id)
      || !returnText(from.scope, RETURN_TRIP_RULES.text) || !returnText(from.plugin, RETURN_TRIP_RULES.text)
      || !fits(from.surface, RETURN_TRIP_RULES.surface) || place && place.surface !== from.surface) return null;
    return { kind, mount: from.mount, scope: from.scope, plugin: from.plugin, surface: from.surface, place };
  }
  if (kind === "assistant") {
    const from = returnRecord(value, "kind work_id");
    return from && returnText(from.work_id, 200) ? { kind, work_id: from.work_id } : null;
  }
  if (kind === "under-cover") {
    const from = returnRecord(value, "kind place?");
    const place = from?.place === undefined ? null : returnPlace(from.place);
    return from && place !== undefined ? { kind, place } : null;
  }
  return null;
}

/** What the settings had to make true, from the closed set (§2.1). */
export function returnNeed(value: unknown): ReturnNeed | null {
  const kind = kindOf(value);
  if (kind === "model" || kind === "none") return returnRecord(value, "kind?") ? { kind } : null;
  if (kind === "setup") {
    const need = returnRecord(value, "kind authorization_id");
    return need && fits(need.authorization_id, RETURN_TRIP_RULES.record) ? { kind, authorization_id: need.authorization_id } : null;
  }
  if (kind !== "connection") return null;
  const need = returnRecord(value, "kind service_id slot?");
  if (!need || !fits(need.service_id, RETURN_TRIP_RULES.service)) return null;
  if (need.slot === undefined) return { kind, service_id: need.service_id };
  const slot = returnRecord(need.slot, "slot_id record_key?");
  if (!slot || !fits(slot.slot_id, RETURN_TRIP_RULES.slot)
    || slot.record_key !== undefined && (!fits(slot.record_key, RETURN_TRIP_RULES.record))) return null;
  return { kind, service_id: need.service_id, slot: { slot_id: slot.slot_id, ...(slot.record_key === undefined ? {} : { record_key: slot.record_key as string }) } };
}

/** A stored trip exactly in its version-1 shape; anything else (another version, a name more, an address) is dropped whole. */
export function returnTrip(value: unknown): ReturnTrip | null {
  const trip = returnRecord(value, "v id window project from claim need met_at_open carry? cover opened_at expires_at outcome?");
  if (!trip || trip.v !== /* @version format.workbench.return-trip */ 1) return null;
  const from = returnFrom(trip.from), need = returnNeed(trip.need), carry = returnCarry(trip.carry);
  const outcome = trip.outcome === undefined ? undefined : returnRecord(trip.outcome, "status at");
  const id = RETURN_TRIP_RULES.id;
  if (!from || !need || !carry || outcome === null || outcome && (outcome.status !== "ready" && outcome.status !== "not_ready" || !Number.isFinite(outcome.at))
    || !fits(trip.id, id) || !fits(trip.window, id) || !returnText(trip.project, 200)
    || typeof trip.claim !== "boolean" || typeof trip.met_at_open !== "boolean" && trip.met_at_open !== null || typeof trip.cover !== "string" || trip.cover.length > RETURN_TRIP_RULES.cover
    || !Number.isFinite(trip.opened_at) || !Number.isFinite(trip.expires_at) || trip.claim && from.kind !== "page") return null;
  // Every name is checked above; what came from another document (the source, the need, the carry) is the checked copy.
  const out = { ...trip, from, need, carry } as ReturnTrip;
  if (!Object.keys(carry).length) delete out.carry;
  return out;
}

export interface ReturnPlaceRoot {
  closest(selector: string): { getAttribute(name: string): string | null } | null;
  readonly ownerDocument: { readonly defaultView: { readonly frameElement: { getAttribute(name: string): string | null } | null } | null } | null;
}

/**
 * The pane a page is in (§2.3), computed each time it is asked: the pane frame around this document first (a pane document holds
 * `[data-tab-pane]` elements of its own, with random ids), then the pane element around the page in the outer document. A page in
 * neither (the side panel's frame) has no place.
 */
export function placeOf(root: ReturnPlaceRoot, surface: string): ReturnPlace | null {
  let frame: { getAttribute(name: string): string | null } | null = null;
  try { frame = root.ownerDocument?.defaultView?.frameElement ?? null; } catch { return null; }
  const pane = frame ? frame.getAttribute("data-pane-owner") : root.closest("[data-tab-pane]")?.getAttribute("data-tab-pane") ?? null;
  return pane && returnText(pane, 100) && RETURN_TRIP_RULES.surface.test(surface) ? { pane, surface } : null;
}

/** Two places are the same place (both none, or the same pane and surface). */
export function samePlace(a: ReturnPlace | null | undefined, b: ReturnPlace | null | undefined): boolean {
  return !a || !b ? !a && !b : a.pane === b.pane && a.surface === b.surface;
}

/** The workbench's own object link for a surface (and an object on it); null when either does not pass (§2.3). */
export function returnLink(prefix: string, surface: string, objectId?: string): string | null {
  if (!RETURN_TRIP_RULES.surface.test(surface) || objectId !== undefined && !returnText(objectId, RETURN_TRIP_RULES.objectId)) return null;
  return prefix + "/?openPlugin=" + encodeURIComponent(surface) + (objectId === undefined ? "" : "&openItem=" + encodeURIComponent(objectId));
}

/** What an ordinary settings link asks for, from its address alone (§2.3): never `setup`, which only the platform gives. */
export function needOfAddress(href: string, origin: string, prefix: string): ReturnNeed {
  let url: URL;
  try { url = new URL(href, origin); } catch { return { kind: "none" }; }
  if (url.origin !== origin) return { kind: "none" };
  const path = (prefix && url.pathname.startsWith(prefix + "/") ? url.pathname.slice(prefix.length) : url.pathname).replace(/\/+$/u, "");
  if (path === "/settings/models") return { kind: "model" };
  const service = url.searchParams.get("connector") ?? "";
  if ((path === "/settings/connectors" || path === "/capabilities/connections") && RETURN_TRIP_RULES.service.test(service)) return { kind: "connection", service_id: service };
  return { kind: "none" };
}

/**
 * A pane frame's `workbench-open-settings` as the outer document passes it on (§2.3, S-return-trip-source). The source is put on
 * `pane`, the pane the frame is (its `dataset`), never the one the message names; a source that is not a page's is a trip from
 * under the cover. The need may be a model or a connection with its slot, never `setup` (only the platform asks for that, in the
 * outer document). Every other name the message holds is left behind.
 */
export function returnRelay(data: unknown, pane: string, surface: string): { href: string; from: Record<string, unknown>; return_id?: string; need?: ReturnNeed; carry?: unknown } {
  const asked = (data && typeof data === "object" ? data : {}) as Record<string, unknown>, from = asked.from as Record<string, unknown> | null | undefined;
  const place = !pane ? null : from && typeof from.place === "object" && from.place ? { ...from.place, pane } : surface ? { pane, surface } : null;
  const need = returnNeed(asked.need);
  return { href: typeof asked.href === "string" ? asked.href : "",
    from: from && typeof from === "object" && from.kind === "page" ? { ...from, place } : { kind: "under-cover", place },
    ...(typeof asked.return_id === "string" ? { return_id: asked.return_id } : {}),
    ...(need?.kind === "model" || need?.kind === "connection" ? { need } : {}),
    ...(asked.carry && typeof asked.carry === "object" ? { carry: asked.carry } : {}) };
}

/** A sign-in landing page: the boot address's `settingsPath` names the answer of an authorization (§2.2, a new window number at once). */
export function returnLanding(search: string, origin: string): boolean {
  const boot = new URLSearchParams(search);
  if (!boot.has("settingsPath")) return false;
  try { const asked = new URL(boot.get("settingsPath") || "/", origin).searchParams; return ["connected", "connection_error", "setup"].some(key => asked.has(key)); }
  catch { return false; }
}

/**
 * This window's number at start (§2.2). The handoff a document leaves on `pagehide` is read and removed: when it names this window
 * and is fresh, this is the same tab reloaded and keeps its number; otherwise (a new tab, a copied or opener-opened one, a restored
 * one, a sign-in landing page) the window gets a new number and every trip in the copied storage is removed.
 */
export function startReturnWindow(storage: ReturnStorage, now: number, landing: boolean, newId: () => string): string {
  const keys = RETURN_TRIP_RULES.keys;
  let handoff: unknown = null, id: string | null = null;
  try { handoff = JSON.parse(storage.getItem(keys.handoff) || "null"); } catch { handoff = null; }
  try { storage.removeItem(keys.handoff); id = storage.getItem(keys.window); } catch { return newId(); }
  const left = returnRecord(handoff, "id at");
  const fresh = left && typeof left.at === "number" && now - left.at >= 0 && now - left.at <= RETURN_TRIP_RULES.handoffMs;
  if (!landing && id && fresh && left?.id === id && RETURN_TRIP_RULES.id.test(id)) return id;
  const next = newId();
  try { storage.setItem(keys.window, next); storage.removeItem(keys.trips); } catch { /* No storage: the window keeps no trips. */ }
  return next;
}

/** The mark a document leaves when it is hidden, so the document after it (a reload) knows it is the same tab. */
export function leaveReturnWindow(storage: ReturnStorage, id: string, now: number): void {
  try { storage.setItem(RETURN_TRIP_RULES.keys.handoff, JSON.stringify({ id, at: now })); } catch { /* No storage, no trips to keep. */ }
}

/** Every project's stored entries; nothing readable is none. */
function readAll(storage: ReturnStorage): Record<string, unknown> {
  try { const all: unknown = JSON.parse(storage.getItem(RETURN_TRIP_RULES.keys.trips) || "null"); return Object.prototype.toString.call(all) === "[object Object]" ? all as Record<string, unknown> : {}; }
  catch { return {}; }
}

/** The trips of this window in this project, read from storage each time (another document of the tab may have changed them). */
export function readReturnTrips(storage: ReturnStorage, window: string, project: string): ReturnTrip[] {
  const list = readAll(storage)[project];
  return Array.isArray(list) ? list.map(returnTrip).filter((trip): trip is ReturnTrip => Boolean(trip && trip.window === window && trip.project === project)) : [];
}

/** Writes this window's trips of a project; other windows' trips and other projects' entries are left as they are, an entry of no trip's shape is dropped. */
export function writeReturnTrips(storage: ReturnStorage, window: string, project: string, trips: ReturnTrip[]): void {
  const all = readAll(storage);
  const others = Array.isArray(all[project]) ? (all[project] as unknown[]).filter(entry => { const trip = returnTrip(entry); return trip !== null && trip.window !== window; }) : [];
  const next = [...others, ...trips];
  if (next.length) all[project] = next; else delete all[project];
  try { if (Object.keys(all).length) storage.setItem(RETURN_TRIP_RULES.keys.trips, JSON.stringify(all)); else storage.removeItem(RETURN_TRIP_RULES.keys.trips); }
  catch { /* No storage: the trip lasts as long as this document. */ }
}

/** The key two trips share when they come from the same place (a second trip from there replaces the first). */
export function returnSource(from: ReturnFrom): string {
  if (from.kind === "page") return ["page", from.scope, from.surface, from.place?.pane ?? ""].join("\n");
  if (from.kind === "assistant") return "assistant\n" + from.work_id;
  return "under-cover\n" + (from.place?.pane ?? "") + "\n" + (from.place?.surface ?? "");
}

/** A claim's origin matches the trip's source (installation scope, surface and place); an empty place matches only a trip with none. */
export function returnMatches(trip: ReturnTrip, origin: unknown): boolean {
  const asked = returnRecord(origin, "scope surface place");
  const place = returnPlace(asked?.place);
  return Boolean(asked && place !== undefined && trip.claim && trip.from.kind === "page" && trip.from.scope === asked.scope
    && trip.from.surface === asked.surface && samePlace(trip.from.place, place));
}

/**
 * A trip `host.returns.go` opened, the only kind `arrived()` may get: `go` asks for a text model alone (`returnGo`), while the
 * in-place connection card's trip asks for its connection and is handed back only by its id, to the card that waits on it.
 */
const byGo = (trip: ReturnTrip) => trip.claim && trip.need.kind === "model";

export interface ReturnOwnerEnv {
  storage: ReturnStorage; window: string; project: string;
  now(): number; newId(): string;
  setTimer(run: () => void, ms: number): unknown; clearTimer(handle: unknown): void;
  /** Reads the need back from its owner; true when it is met. A read that fails is not met. */
  read(need: ReturnNeed): Promise<boolean>;
  /** The layout's answer for a place (`molis-work:layout-holds`); undefined when nobody answered. */
  holds(place: ReturnPlace): boolean | undefined;
  /** Announces `molis-work:return-settled`, synchronously: a frame host waiting on the trip claims it inside the dispatch. */
  settled(id: string, status: ReturnStatus | "ended"): void;
  /** The trips changed; the return bar repaints. */
  changed(): void;
}

/**
 * The one writer of the return trips (§2.2–§2.5). Every operation reads the trips from storage, so a document that came back from
 * the back/forward cache, or another document of the same tab, never acts on a stale copy; each trip has its expiry timer.
 */
export function createReturnOwner(env: ReturnOwnerEnv) {
  const timers = new Map<string, unknown>();
  const list = () => readReturnTrips(env.storage, env.window, env.project);
  const find = (id: string) => list().find(trip => trip.id === id) ?? null;
  const arm = (trips: ReturnTrip[]) => {
    for (const handle of timers.values()) env.clearTimer(handle);
    timers.clear();
    for (const trip of trips) timers.set(trip.id, env.setTimer(() => {
      const current = find(trip.id);
      if (current && current.expires_at <= env.now()) drop(trip.id, true); else arm(list());
    }, Math.max(0, trip.expires_at - env.now())));
  };
  const write = (trips: ReturnTrip[]) => { writeReturnTrips(env.storage, env.window, env.project, trips); arm(trips); env.changed(); };
  const update = (id: string, change: (trip: ReturnTrip) => ReturnTrip) => {
    const trips = list(), at = trips.findIndex(trip => trip.id === id);
    if (at < 0) return null;
    const next = change(trips[at] as ReturnTrip);
    trips[at] = next;
    write(trips);
    return next;
  };
  /** Removes a trip; one a page could still be waiting on is announced as ended, so its wait answers null. */
  const drop = (id: string, announce: boolean) => {
    const trips = list(), trip = trips.find(entry => entry.id === id);
    if (!trip) return null;
    write(trips.filter(entry => entry.id !== id));
    if (announce && trip.claim) env.settled(id, "ended");
    return trip;
  };
  const met = (need: ReturnNeed) => need.kind === "none" ? Promise.resolve(false) : env.read(need).then(Boolean, () => false);
  /** Opens a trip, replacing one from the same place; the ninth of a project pushes out the oldest. */
  const open = (input: { id?: string; from: unknown; need: unknown; carry?: unknown; claim: boolean; cover: string }): ReturnTrip | null => {
    const now = env.now();
    const trip = returnTrip({ v: /* @version format.workbench.return-trip */ 1, id: input.id ?? env.newId(), window: env.window, project: env.project, from: input.from, claim: input.claim,
      need: input.need, met_at_open: null, ...(input.carry === undefined ? {} : { carry: input.carry }), cover: input.cover, opened_at: now, expires_at: now + RETURN_TRIP_RULES.openMs });
    if (!trip) return null;
    const source = returnSource(trip.from), before = list();
    const kept = before.filter(entry => entry.id !== trip.id && returnSource(entry.from) !== source);
    const gone = before.filter(entry => !kept.includes(entry));
    kept.push(trip);
    if (kept.length > RETURN_TRIP_RULES.perProject) gone.push(...kept.splice(0, kept.length - RETURN_TRIP_RULES.perProject));
    write(kept);
    for (const entry of gone) if (entry.claim) env.settled(entry.id, "ended");
    void met(trip.need).then(yes => { if (find(trip.id)?.met_at_open === null) update(trip.id, entry => ({ ...entry, met_at_open: yes })); });
    return trip;
  };
  /**
   * Settles a trip. One opened by an ordinary link goes at once; one a page opened is announced, and when no page claimed it inside the
   * announcement it stays for `arrived()` only while the layout still holds its place (the person did not leave it, §2.4).
   */
  const settle = (id: string, status: ReturnStatus) => {
    const trip = find(id);
    if (!trip || trip.outcome) return null;
    if (!trip.claim) return drop(id, false);
    const now = env.now();
    update(id, entry => ({ ...entry, outcome: { status, at: now }, expires_at: now + RETURN_TRIP_RULES.settledMs }));
    env.settled(id, status);
    const place = trip.from.kind === "page" ? trip.from.place : null;
    if (find(id) && (!byGo(trip) || (place ? env.holds(place) : false) === false)) drop(id, true);
    return trip;
  };
  /** Reads the need once and settles by what the owner says: `ready` only when it is met. */
  const check = async (id: string): Promise<ReturnStatus | null> => {
    const trip = find(id);
    if (!trip || trip.outcome) return null;
    const status: ReturnStatus = await met(trip.need) ? "ready" : "not_ready";
    return settle(id, status) ? status : null;
  };
  /** `molis-work:return-claim`: hands a settled trip to the page it came from, once, and removes it (§2.6 ⑤). */
  const claim = (detail: unknown): ReturnClaimAnswer => {
    const ask = returnRecord(detail, "return_id? origin? drop? answer?");
    if (!ask) return null;
    const trips = list(), named = typeof ask.return_id === "string";
    const matching = (named ? trips.filter(trip => trip.id === ask.return_id) : trips.filter(trip => byGo(trip) && trip.from.kind === "page" && trip.from.place))
      .filter(trip => returnMatches(trip, ask.origin));
    if (ask.drop === true) { if (named && matching[0]) drop(matching[0].id, false); return null; }
    const done = matching.find(trip => trip.outcome);
    if (done?.outcome) { drop(done.id, false); return { status: done.outcome.status, carry: done.carry ?? {} }; }
    const waiting = matching.find(trip => !trip.outcome);
    return waiting ? { open: waiting.id } : null;
  };
  /**
   * After a reload or a start: a trip whose settings are open again stays with its bar; any other open one is read once and settled
   * (kept for `arrived()` when met, removed when not). Then each settled trip is announced once more, for a frame host that asked
   * before the reads were done.
   */
  const boot = async (cover: string | null) => {
    arm(list());
    await Promise.all(list().filter(trip => !trip.outcome && trip.cover.split(" ")[0] !== cover)
      .map(async trip => { if (await met(trip.need)) settle(trip.id, "ready"); else drop(trip.id, true); }));
    for (const trip of list()) if (trip.outcome) env.settled(trip.id, trip.outcome.status);
  };
  /** The open trip the settings shown now belong to: the latest one opened onto this kind of cover. */
  const current = (cover: string | null) => list().filter(trip => !trip.outcome && Boolean(cover) && trip.cover.split(" ")[0] === cover).at(-1) ?? null;
  return { open, settle, check, claim, boot, current, find, list, met, drop, reload: () => arm(list()) };
}
