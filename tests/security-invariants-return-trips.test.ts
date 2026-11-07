// Security invariants S-return-trip-source, S-return-trip-destination and S-return-trip-delivery (docs/system/security-invariants/,
// specs/draft-and-return/spec.md §5): the checks and the one writer of the return trips, run on a small in-memory storage. The shell's
// wiring (the frame host, the pane relay, the settings cover) is in tests/settings-return-trips.e2e.test.ts. Public entries only
// (tests may not reach into package sources: pnpm health:check).
import assert from "node:assert/strict";
import test from "node:test";
import {
  RETURN_TRIP_RULES, createReturnOwner, needOfAddress, placeOf, readReturnTrips, returnGo, returnLanding, returnLink, returnRelay, returnTrip, startReturnWindow,
  type ReturnOwnerEnv, type ReturnPlaceRoot, type ReturnStorage, type ReturnTrip,
} from "@molis-ai/molis-work-app-workbench";
import { UI_RETURN_CARRY_LIMITS } from "@molis-ai/molis-work-contracts/platform/ui";

const KEYS = RETURN_TRIP_RULES.keys;
const SCOPE = "install-a:project-1", OTHER_SCOPE = "install-b:project-1";

function memory(): ReturnStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => { map.set(key, value); }, removeItem: key => { map.delete(key); } };
}

/** An owner on a storage, a clock, timers that run when told, and a layout that answers as set. */
function owner(options: { storage?: ReturnType<typeof memory>; window?: string; met?: boolean; holds?: boolean | undefined } = {}) {
  const storage = options.storage ?? memory(), timers = new Map<number, { run: () => void; at: number }>(), settled: Array<[string, string]> = [];
  let now = 1_000_000, sequence = 0, met = options.met ?? true, holds = "holds" in options ? options.holds : true;
  const reads: unknown[] = [];
  const env: ReturnOwnerEnv = {
    storage, window: options.window ?? "window-1", project: "project-1", now: () => now, newId: () => "trip-" + ++sequence,
    setTimer: (run, ms) => { const id = ++sequence; timers.set(id, { run, at: now + ms }); return id; }, clearTimer: handle => { timers.delete(handle as number); },
    read: async need => { reads.push(need); return met; }, holds: () => holds, settled: (id, status) => { settled.push([id, status]); }, changed: () => undefined,
  };
  const trips = createReturnOwner(env);
  return { trips, storage, settled, reads, env,
    set met(value: boolean) { met = value; }, set holds(value: boolean | undefined) { holds = value; },
    advance(ms: number) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } } };
}

const place = { pane: "pane-1", surface: "coding" };
const pageFrom = (extra: Partial<{ scope: string; surface: string; place: typeof place | null }> = {}) =>
  ({ kind: "page", mount: "mount-1", scope: SCOPE, plugin: "io.molis.work.coding", surface: "coding", place, ...extra });
const origin = (extra: Partial<{ scope: string; surface: string; place: typeof place | null }> = {}) => ({ scope: SCOPE, surface: "coding", place, ...extra });
const goTrip = (o: ReturnType<typeof owner>, id = "go-1", extra: Parameters<typeof pageFrom>[0] = {}) =>
  o.trips.open({ id, from: pageFrom(extra), need: { kind: "model" }, carry: { draft_key: "composer:1", step: "send:k1" }, claim: true, cover: "settings models" });
const flush = () => new Promise(resolve => setImmediate(resolve));

test("S-return-trip-source a page's return-go carries only the need and its carry", () => {
  // ① A name more (where it is, its installation, its project, an address) refuses the whole message.
  for (const extra of [{ from: { kind: "page" } }, { project: "p" }, { scope: SCOPE }, { surface: "coding" }, { pane: "pane-1" }, { href: "/settings/models" }])
    assert.equal(returnGo({ type: "return-go", id: 1, need: { kind: "model" }, ...extra }), null, JSON.stringify(extra));
  assert.deepEqual(returnGo({ type: "return-go", id: 1, need: { kind: "model" } }), { id: 1, need: { kind: "model" }, carry: {} });
  assert.deepEqual(returnGo({ type: "return-go", id: 2, need: { kind: "model" }, carry: { draft_key: "d", step: "send:a.b-c_1", object: { kind: "flow", id: "f 1" } } })?.carry,
    { draft_key: "d", step: "send:a.b-c_1", object: { kind: "flow", id: "f 1" } });
  // ② A carry over its limits or of other characters, or a need outside the closed set, refuses it too.
  const refused = [
    { carry: { step: "s".repeat(129) } }, { carry: { step: "a/b" } }, { carry: { step: "<b>" } }, { carry: { draft_key: "d".repeat(257) } },
    { carry: { object: { kind: "flow", id: "i".repeat(257) } } }, { carry: { object: { kind: "flow", id: "a\u0000b" } } }, { carry: { object: { kind: "flow" } } },
    { carry: { other: 1 } }, { need: { kind: "connection" } }, { need: { kind: "model", service_id: "x" } }, { need: { kind: "setup", authorization_id: "a" } },
  ];
  for (const change of refused) assert.equal(returnGo({ type: "return-go", id: 1, need: { kind: "model" }, ...change }), null, JSON.stringify(change));
  assert.equal(returnGo({ type: "return-go", id: 0, need: { kind: "model" } }), null);
  // The limits are the contract's own, counted in characters (code points), and a value given is never empty.
  assert.deepEqual([RETURN_TRIP_RULES.draftKey, RETURN_TRIP_RULES.objectId, RETURN_TRIP_RULES.objectKind],
    [UI_RETURN_CARRY_LIMITS.draft_key, UI_RETURN_CARRY_LIMITS.object_id, UI_RETURN_CARRY_LIMITS.object_kind]);
  const carried = (carry: unknown) => returnGo({ type: "return-go", id: 1, need: { kind: "model" }, carry })?.carry ?? null;
  assert.ok(carried({ step: "s".repeat(UI_RETURN_CARRY_LIMITS.step) }));
  assert.ok(carried({ draft_key: "草".repeat(256), object: { kind: "𝒌".repeat(64), id: "😀".repeat(256) } }), "256 characters, whatever their UTF-16 length");
  for (const carry of [{ draft_key: "😀".repeat(257) }, { object: { kind: "k".repeat(65), id: "i" } }, { draft_key: "" }, { step: "" }, { object: { kind: "", id: "i" } }])
    assert.equal(carried(carry), null, JSON.stringify(carry).slice(0, 60));
});

test("S-return-trip-source ④ a pane's request is put on the pane its frame is, never the one it names", () => {
  const asked = { type: "workbench-open-settings", paneId: "pane-9", href: "/settings/models", return_id: "r-1", carry: { step: "send" },
    from: { kind: "page", mount: "m", scope: SCOPE, plugin: "io.molis.work.coding", surface: "coding", place: { pane: "pane-9", surface: "coding" } } };
  const relayed = returnRelay(asked, "pane-1", "coding");
  assert.deepEqual(relayed.from.place, { pane: "pane-1", surface: "coding" }, "the place is the frame's pane");
  assert.deepEqual(Object.keys(relayed).sort(), ["carry", "from", "href", "return_id"], "nothing else the message holds is passed on");
  // A request that names no page's source is a trip from under the cover, still on the frame's pane.
  assert.deepEqual(returnRelay({ href: "/settings/models", from: { kind: "assistant", work_id: "w" } }, "pane-1", "coding").from, { kind: "under-cover", place: { pane: "pane-1", surface: "coding" } });
  // A frame that is no pane's puts no place at all.
  assert.equal(returnRelay(asked, "", "coding").from.place, null);
  // The need is a model or a connection with its slot; `setup` is the platform's alone and never comes through a pane.
  assert.deepEqual(returnRelay({ ...asked, need: { kind: "model" } }, "pane-1", "coding").need, { kind: "model" });
  assert.deepEqual(returnRelay({ ...asked, need: { kind: "connection", service_id: "github", slot: { slot_id: "repo", record_key: "r-1" } } }, "pane-1", "coding").need,
    { kind: "connection", service_id: "github", slot: { slot_id: "repo", record_key: "r-1" } });
  for (const need of [{ kind: "setup", authorization_id: "a-1" }, { kind: "connection", service_id: "../x" }, { kind: "model", href: "/x" }])
    assert.equal(returnRelay({ ...asked, need }, "pane-1", "coding").need, undefined, JSON.stringify(need));
});

test("S-return-trip-source the place is the pane the page is in, computed from the trusted DOM", () => {
  const root = (pane: string | null, frame: Record<string, string> | null | "throws"): ReturnPlaceRoot => ({
    closest: () => pane === null ? null : { getAttribute: (name: string) => name === "data-tab-pane" ? pane : null },
    ownerDocument: { get defaultView() { return { get frameElement() { if (frame === "throws") throw new Error("cross-origin"); return frame ? { getAttribute: (name: string) => frame[name] ?? null } : null; } }; } },
  });
  // Single pane: the page hangs in the outer document under its pane element.
  assert.deepEqual(placeOf(root("pane-1", null), "coding"), { pane: "pane-1", surface: "coding" });
  // Split: the page is in a pane frame's document, whose own [data-tab-pane] has a random id; the frame's pane wins.
  assert.deepEqual(placeOf(root("random-7f3a", { "data-pane-owner": "pane-1" }), "coding"), { pane: "pane-1", surface: "coding" });
  // The side panel's frame and a page held in the pool have no place.
  assert.equal(placeOf(root("random-7f3a", {}), "coding"), null);
  assert.equal(placeOf(root(null, null), "coding"), null);
  assert.equal(placeOf(root("pane-1", "throws"), "coding"), null);
  assert.equal(placeOf(root("pane-1", null), "../x"), null);
});

test("S-return-trip-destination the way back is the workbench's own object link, or nothing", () => {
  // ⑥ A surface that is not a surface name opens nothing, and a trip from it is dropped whole.
  for (const surface of ["../x", "https://evil.example", "Coding", "", "a".repeat(102)]) {
    assert.equal(returnLink("/projects/p", surface), null, surface);
    assert.equal(returnTrip({ v: 1, id: "t", window: "w", project: "p", from: { kind: "under-cover", place: { pane: "a", surface } }, claim: false,
      need: { kind: "none" }, met_at_open: true, cover: "settings models", opened_at: 1, expires_at: 2 }), null, surface);
  }
  // ⑦ An object id is encoded: the link has one openPlugin and one openItem whatever the id holds.
  const link = returnLink("/projects/p", "workflows", "a?x=1#y&openPlugin=evil");
  assert.ok(link);
  const url = new URL(link, "http://127.0.0.1");
  assert.deepEqual(url.searchParams.getAll("openPlugin"), ["workflows"]);
  assert.deepEqual(url.searchParams.getAll("openItem"), ["a?x=1#y&openPlugin=evil"]);
  assert.equal(url.hash, "");
  assert.equal(returnLink("/projects/p", "workflows", "i".repeat(257)), null);
  assert.equal(returnLink("/projects/p", "workflows", "a\nb"), null);
  // ⑧ A stored trip with an address, another version or a missing field is dropped whole.
  const good = { v: 1, id: "t", window: "w", project: "p", from: pageFrom(), claim: true, need: { kind: "model" }, met_at_open: false, cover: "settings models", opened_at: 1, expires_at: 2 };
  assert.ok(returnTrip(good));
  for (const bad of [{ ...good, href: "https://evil.example" }, { ...good, url: "javascript:alert(1)" }, { ...good, v: 2 }, { ...good, from: { ...pageFrom(), href: "/x" } },
    Object.fromEntries(Object.entries(good).filter(([key]) => key !== "cover")), { ...good, claim: true, from: { kind: "under-cover", place: null } }])
    assert.equal(returnTrip(bad), null, JSON.stringify(bad));
  // The next write of the trips drops an entry of no trip's shape from storage, and keeps another window's trip as it is.
  const kept = owner();
  const other = { ...good, id: "t-other", window: "window-2", project: "project-1", expires_at: 9_000_000 };
  kept.storage.setItem(KEYS.trips, JSON.stringify({ "project-1": [{ ...good, project: "project-1", window: "window-1", href: "https://evil.example" }, other] }));
  goTrip(kept);
  assert.deepEqual(JSON.parse(kept.storage.getItem(KEYS.trips)!)["project-1"].map((trip: ReturnTrip) => trip.id), ["t-other", "go-1"]);
  // An ordinary link's need comes from its address alone and is never the platform's `setup`.
  assert.deepEqual(needOfAddress("/settings/models", "http://h", ""), { kind: "model" });
  assert.deepEqual(needOfAddress("/projects/p/settings/models", "http://h", "/projects/p"), { kind: "model" });
  assert.deepEqual(needOfAddress("/settings/connectors?connector=github", "http://h", ""), { kind: "connection", service_id: "github" });
  assert.deepEqual(needOfAddress("/capabilities/connections?setup=abc", "http://h", ""), { kind: "none" });
  assert.deepEqual(needOfAddress("https://evil.example/settings/models", "http://h", ""), { kind: "none" });
  assert.deepEqual(needOfAddress("/settings", "http://h", ""), { kind: "none" });
});

test("S-return-trip-delivery a trip is handed to its own place once and only from a page's go", async () => {
  const o = owner();
  goTrip(o);
  // ⑪ Another installation, surface or place gets nothing, and the trip stays.
  assert.equal(o.trips.claim({ return_id: "go-1", origin: origin({ scope: OTHER_SCOPE }) }), null);
  assert.equal(o.trips.claim({ return_id: "go-1", origin: origin({ surface: "cognia" }) }), null);
  assert.equal(o.trips.claim({ return_id: "go-1", origin: origin({ place: { pane: "pane-2", surface: "coding" } }) }), null);
  // Open: the page waits (DRT-06's waiting branch).
  assert.deepEqual(o.trips.claim({ return_id: "go-1", origin: origin() }), { open: "go-1" });
  assert.deepEqual(o.trips.claim({ origin: origin() }), { open: "go-1" });
  await flush();
  assert.equal(await o.trips.check("go-1"), "ready");
  assert.deepEqual(o.settled, [["go-1", "ready"]]);
  // ⑩ The first claim gets the outcome and the carry; the second gets nothing.
  assert.deepEqual(o.trips.claim({ return_id: "go-1", origin: origin() }), { status: "ready", carry: { draft_key: "composer:1", step: "send:k1" } });
  assert.equal(o.trips.claim({ return_id: "go-1", origin: origin() }), null);
  // ⑬ After a drop there is nothing to claim; an ordinary link's trip goes when it settles and is handed to no page.
  goTrip(o, "go-2");
  assert.equal(o.trips.claim({ return_id: "go-2", origin: origin(), drop: true }), null);
  assert.equal(await o.trips.check("go-2"), null);
  assert.equal(o.trips.claim({ origin: origin() }), null);
  const link = o.trips.open({ from: { kind: "under-cover", place }, need: { kind: "model" }, claim: false, cover: "settings models" });
  assert.ok(link);
  assert.equal(await o.trips.check(link.id), "ready");
  assert.equal(o.trips.claim({ return_id: link.id, origin: origin() }), null);
  assert.equal(o.trips.list().length, 0);
  // A claim may only come from a page: an ordinary link's trip cannot be made a claimed one.
  assert.equal(o.trips.open({ id: "x", from: { kind: "under-cover", place }, need: { kind: "model" }, claim: true, cover: "settings models" }), null);
});

test("S-return-trip-delivery ready only after the owner read the need back", async () => {
  const o = owner({ met: false });
  goTrip(o);
  await flush();
  // ⑲ Saved is not met: the trip settles not ready, never ready.
  assert.equal(await o.trips.check("go-1"), "not_ready");
  assert.deepEqual(o.trips.claim({ return_id: "go-1", origin: origin() }), { status: "not_ready", carry: { draft_key: "composer:1", step: "send:k1" } });
  // A met need at open is remembered, so the settings do not close on their own; until the first read it is not known.
  const later = owner({ met: true });
  goTrip(later);
  assert.equal(later.trips.find("go-1")?.met_at_open, null);
  await flush();
  assert.equal(later.trips.find("go-1")?.met_at_open, true);
  const unmet = owner({ met: false });
  goTrip(unmet);
  await flush();
  assert.equal(unmet.trips.find("go-1")?.met_at_open, false);
  // ⑳ The trip holds names, never content: no draft text, key or address query.
  assert.doesNotMatch(unmet.storage.map.get(KEYS.trips) ?? "", /sk-|api_key|token|https?:|\?/u);
});

test("S-return-trip-delivery a window's trips are its own", async () => {
  const storage = memory();
  // ⑭ No mark, or one older than ten seconds, or a landing page: a new number and no trips.
  storage.setItem(KEYS.window, "window-1");
  storage.setItem(KEYS.trips, JSON.stringify({ "project-1": [] }));
  assert.equal(startReturnWindow(storage, 50_000, false, () => "window-2"), "window-2");
  assert.equal(storage.getItem(KEYS.trips), null);
  storage.setItem(KEYS.handoff, JSON.stringify({ id: "window-2", at: 50_000 }));
  storage.setItem(KEYS.trips, "{}");
  assert.equal(startReturnWindow(storage, 50_000 + RETURN_TRIP_RULES.handoffMs + 1, false, () => "window-3"), "window-3");
  // A reload within ten seconds keeps the number and the trips; the mark is used once.
  const o = owner({ storage, window: "window-3" });
  goTrip(o);
  storage.setItem(KEYS.handoff, JSON.stringify({ id: "window-3", at: 70_000 }));
  assert.equal(startReturnWindow(storage, 75_000, false, () => "window-4"), "window-3");
  assert.equal(storage.getItem(KEYS.handoff), null);
  assert.equal(readReturnTrips(storage, "window-3", "project-1").length, 1);
  // A copied tab has the storage but no fresh mark: it renumbers and drops the copy.
  const copy = memory();
  for (const [key, value] of storage.map) copy.setItem(key, value);
  assert.equal(startReturnWindow(copy, 75_100, false, () => "window-copy"), "window-copy");
  assert.equal(readReturnTrips(copy, "window-3", "project-1").length, 0);
  // ⑯ A sign-in landing page renumbers even with a fresh mark: a boot address whose settings path answers an authorization.
  storage.setItem(KEYS.handoff, JSON.stringify({ id: "window-3", at: 80_000 }));
  assert.equal(startReturnWindow(storage, 80_001, true, () => "window-landing"), "window-landing");
  const at = (path: string) => "?settingsPath=" + encodeURIComponent(path);
  for (const path of ["/settings/connectors?connected=github", "/capabilities/connections?connection_error=denied", "/settings/connectors?setup=a-1"])
    assert.equal(returnLanding(at(path), "http://h"), true, path);
  for (const search of [at("/settings/models"), at("/settings/connectors?connector=github"), "?connected=github", ""])
    assert.equal(returnLanding(search, "http://h"), false, search);
  // ⑫ An owner of another window does nothing with them.
  const mine = memory(), first = owner({ storage: mine, window: "window-a" }), second = owner({ storage: mine, window: "window-b" });
  goTrip(first);
  await flush();
  assert.equal(second.trips.list().length, 0);
  assert.equal(second.trips.claim({ return_id: "go-1", origin: origin() }), null);
  assert.equal(await second.trips.check("go-1"), null);
  second.trips.open({ from: pageFrom({ place: { pane: "pane-9", surface: "coding" } }), need: { kind: "model" }, claim: false, cover: "settings models" });
  assert.equal(first.trips.list().length, 1, "writing its own trips leaves the other window's");
});

test("S-return-trip-delivery a page the person left gets nothing, a rebuilt one waits", async () => {
  // ⑮ Unclaimed at settling: kept for arrived() while the layout holds the place, removed when it does not, kept when nobody answers.
  for (const [holds, kept] of [[true, true], [false, false], [undefined, true]] as const) {
    const o = owner({ holds });
    goTrip(o);
    await flush();
    await o.trips.check("go-1");
    assert.equal(o.trips.list().length, kept ? 1 : 0, String(holds));
    if (!kept) assert.deepEqual(o.settled.at(-1), ["go-1", "ended"]);
    assert.deepEqual(o.trips.claim({ origin: origin() }), kept ? { status: "ready", carry: { draft_key: "composer:1", step: "send:k1" } } : null);
  }
  // A page with no place (the side panel) is never kept for a later mount.
  const side = owner();
  goTrip(side, "go-1", { place: null });
  await flush();
  await side.trips.check("go-1");
  assert.equal(side.trips.list().length, 0);
  // The in-place connection card's trip is handed only by its id: arrived() never gets it, and unclaimed at settling it goes.
  const card = owner();
  card.trips.open({ id: "card-1", from: pageFrom(), need: { kind: "connection", service_id: "github" }, claim: true, cover: "settings connectors" });
  assert.equal(card.trips.claim({ origin: origin() }), null);
  await flush();
  await card.trips.check("card-1");
  assert.equal(card.trips.list().length, 0);
  assert.deepEqual(card.settled, [["card-1", "ready"], ["card-1", "ended"]]);
  // Single pane and split give the same place, so the same trip is found (the place is the pane, not the frame).
  const split = owner();
  goTrip(split, "go-1", { place: { pane: "pane-1", surface: "coding" } });
  assert.deepEqual(split.trips.claim({ origin: origin({ place: { pane: "pane-1", surface: "coding" } }) }), { open: "go-1" });
});

test("S-return-trip-delivery trips end on time and at start", async () => {
  // An open trip ends after a day, a settled one after an hour; ended is announced so a wait answers null.
  const o = owner({ holds: true });
  goTrip(o);
  o.advance(RETURN_TRIP_RULES.openMs + 1);
  assert.equal(o.trips.list().length, 0);
  assert.deepEqual(o.settled, [["go-1", "ended"]]);
  goTrip(o, "go-2");
  await flush();
  await o.trips.check("go-2");
  o.advance(RETURN_TRIP_RULES.settledMs + 1);
  assert.equal(o.trips.list().length, 0);
  // A second trip from the same place replaces the first; a ninth pushes out the oldest.
  const many = owner();
  goTrip(many, "a");
  goTrip(many, "b");
  assert.deepEqual(many.trips.list().map(trip => trip.id), ["b"]);
  for (let index = 0; index < RETURN_TRIP_RULES.perProject; index++) goTrip(many, "p" + index, { place: { pane: "pane-" + index, surface: "coding" } });
  assert.equal(many.trips.list().length, RETURN_TRIP_RULES.perProject);
  assert.ok(!many.trips.list().some(trip => trip.id === "b"));
  // At start: an open trip whose settings are not open again is read once; met is kept for arrived(), unmet is removed; each settled
  // trip is announced again.
  const storage = memory(), before = owner({ storage, window: "w" });
  goTrip(before, "kept");
  goTrip(before, "shown", { place: { pane: "pane-2", surface: "coding" } });
  const trips = readReturnTrips(storage, "w", "project-1").map(trip => trip.id === "shown" ? { ...trip, cover: "project-settings general" } as ReturnTrip : trip);
  storage.setItem(KEYS.trips, JSON.stringify({ "project-1": trips }));
  const after = owner({ storage, window: "w", met: true });
  await after.trips.boot("project-settings");
  assert.deepEqual(after.trips.list().map(trip => [trip.id, trip.outcome?.status ?? "open"]), [["kept", "ready"], ["shown", "open"]]);
  assert.ok(after.settled.filter(([id]) => id === "kept").length >= 2, "settled, then announced again after the reads");
  const unmet = owner({ storage: (() => { const fresh = memory(); fresh.setItem(KEYS.trips, JSON.stringify({ "project-1": trips })); return fresh; })(), window: "w", met: false });
  await unmet.trips.boot(null);
  assert.equal(unmet.trips.list().length, 0);
});
