import type { SurfaceGroup, SurfaceHomeEnable, SurfaceHomeStart, SurfaceItem, SurfaceLede, SurfaceOutlineNode, SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { escapeHtml as e, icon, PLUGIN_ICON_NAMES, renderBadge, renderButton, renderFirstPageMargin, renderFirstPageNext, renderFirstPageSection, renderFirstPageSource,
  renderPresentationForm, renderProgressSegments, say, stateRingFamily, type FirstPageTurn, type PresentationFormValues } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "@molis-ai/molis-work-design-system";
import { correctionHeader, correctionMenu, correctionText, objectCorrections, type CorrectionRender } from "./project-correction-render.js";

type ObjectTarget = { kind: "object" | "peek" | "open_result" | "place" | "hand_off"; subject: SurfaceItem["subject"];
  installation: SurfaceHomeRowDisplay["installation"]; revision?: string };
type CardTarget = SurfaceHomeStart | SurfaceHomeEnable | NonNullable<SurfacePluginCard["open"]>;
export type HomeControl = { owner_plugin_id: string; target: CardTarget | ObjectTarget };
export type FramedSurfaceControl = { owner: string; subject: SurfaceItem["subject"]; kind: string; command?: string } & NonNullable<PresentationFormValues["actions"]>[number];
export const subjectKey = (owner: string, subject: SurfaceItem["subject"]) => JSON.stringify([owner, subject.kind, subject.id]);

// The document's text context is the one the workbench installed for this realm (`installLanguageText`); plugin owners' home words join it
// through the protected surface-text projection (surface-composition §14.6). Drawing never installs a second context, and the forms take
// their language from it (`locale: null`), not from the page.

const home = (key: string, count?: number, numbers?: Record<string, number>): string => say.text({ owner: "workbench", key: "workbench.home." + key,
  ...(count === undefined && !numbers ? {} : { args: Object.entries(numbers ?? { count: count! }).map(([name, number]) => ({ name, kind: "number" as const, number })) }) });
const common = (key: string): string => say.text({ owner: "workbench", key: "common.presentation." + key });
const controlKey = (owner: string, suffix: string) => owner + ":" + suffix;
export const homeButton = (key: string, label: string, primary = false) =>
  renderButton({ label, variant: primary ? "primary" : "secondary", attrs: { "data-home-control": key } });
export const homeWord = (key: string) => home(key);
/** The words of the bar over a plugin's page on the home; the name is the owner's display name. */
export const homeLeadWord = (key: string, name: string): string => say.text({ owner: "workbench", key: "workbench.home." + key,
  args: [{ name: "name", kind: "text", text: name }] });
export const homeLeadName = (data: SurfaceHomeDisplay) => data.lead ? ownerOf(data, data.lead.owner_plugin_id).name : "";
export const presentationWord = common;
export { correctionText as surfaceCorrectionWord };

function ownerOf(data: SurfaceHomeDisplay, owner: string): PresentationFormValues["ownerDisplay"] {
  return { ...data.display.owners[owner], name: data.display.owners[owner]?.name ?? owner, hue: data.display.owners[owner]?.hue ?? "gray" };
}

export const isPlacementControl = (kind: string) => kind === "place" || kind === "hand_off";
function objectControl(row: SurfaceHomeRowDisplay, action: "open" | "peek" | "place" | "hand_off"): HomeControl {
  return { owner_plugin_id: row.owner, target: { kind: action === "open" ? "object" : action, installation: row.installation, subject: row.subject,
    ...(isPlacementControl(action) && row.read.state === "ok" && "revision" in row.read ? { revision: row.read.revision } : {}) } };
}

/** Where a row is drawn: the first page's own row (`page`), an object of an outline with its depth and count, or a plain list. */
type RowPlace = { page?: boolean; node?: SurfaceOutlineNode };

function rowHtml(row: SurfaceHomeRowDisplay, item: SurfaceItem, group: SurfaceGroup, data: SurfaceHomeDisplay, controls: Map<string, HomeControl>, mixed: boolean,
  framed?: readonly FramedSurfaceControl[], fix?: CorrectionRender, place: RowPlace = {}) {
  const key = subjectKey(row.owner, row.subject);
  const actions = framed?.filter(action => subjectKey(action.owner, action.subject) === key) ?? item.actions.flatMap(action => {
    const ref = action.ref;
    if (ref !== "open" && ref !== "peek" && ref !== "place" && ref !== "hand_off" || isPlacementControl(ref) && row.read.state !== "ok") return [];
    const id = controlKey(key, action.ref);
    controls.set(id, objectControl(row, ref));
    // The first page keeps its one primary action for the next step; a row's own actions are all at rest.
    return [{ key: id, label: ref === "open" ? home("open") : common(ref), primary: false }];
  });
  const read = "values" in row.read && !mixed ? { ...row.read, values: Object.fromEntries(Object.entries(row.read.values ?? {}).filter(([key]) =>
    row.declaration.fields.find(field => field.key === key)?.role !== "held_in")) } : row.read;
  // A page ordered by time has no place to pin a row to.
  const corrections = read.state === "ok" && !row.fallback
    ? objectCorrections(data, group, item, fix?.controls).filter(choice => !place.page || fix?.controls.get(choice.key)?.correction !== "pin") : [];
  const peek = actions.some(action => action.key.endsWith(":peek")) && (read.state === "ok" || read.state === "stale") ? controlKey(key, "peek") : "";
  const open = actions.find(action => action.key.endsWith(":open"))?.key ?? "";
  // On the first page a row keeps placing and handing off in the same quiet menu as its corrections; a card keeps its own operations.
  const quiet = !!place.page && item.form === "row";
  const moves = quiet ? actions.filter(action => action.key.endsWith(":place") || action.key.endsWith(":hand_off")) : [];
  const progress = place.node?.progress ? renderProgressSegments({ ...place.node.progress, label: home("progress", undefined, place.node.progress) }) : "";
  return `<div class="home-row${place.page ? " mw-first-page__row" : ""}" data-home-row="${e(key)}" data-home-owner="${e(row.owner)}" data-home-subject-kind="${e(row.subject.kind)}" data-home-subject-id="${e(row.subject.id)}"${
    place.node ? ` data-first-page-depth="${place.node.depth}"` : ""}${peek ? ` data-home-row-peek="${e(peek)}"` : ""}${place.page && !peek && open ? ` data-home-row-open="${e(open)}"` : ""}>
    ${renderPresentationForm(row.declaration, item.form, { locale: null, ownerDisplay: ownerOf(data, row.owner), read,
      // A row of the first page has no button of its own: its name opens it, and what the person may change about it is one quiet menu.
      actions: quiet ? [] : item.form === "row" ? [...actions, ...corrections] : actions,
      notices: item.notices?.map(({ reason }) => ({ reason })), compactTime: place.page })}
    ${item.form === "row" && !place.page ? "" : correctionMenu([...moves, ...corrections], "surface-correction-menu")}${progress}
    ${item.merged?.length ? renderBadge({ label: home("same") + " · " + item.merged.map(merge => ownerOf(data, merge.owner_plugin_id).name).join(" · ") }) : ""}</div>`;
}

function rowList(data: SurfaceHomeDisplay, group: SurfaceGroup, controls: Map<string, HomeControl>, byKey: ReadonlyMap<string, SurfaceHomeRowDisplay>, framed?: readonly FramedSurfaceControl[], fix?: CorrectionRender) {
  const items = group.items.flatMap(item => {
    const row = byKey.get(subjectKey(item.owner_plugin_id, item.subject));
    return row ? [{ item, row }] : [];
  });
  const places = new Set(items.flatMap(({ row }) => row.declaration.fields.filter(field => field.role === "held_in")
    .map(field => "values" in row.read ? row.read.values?.[field.key] : undefined)));
  const mixed = places.has("project") && places.has("personal");
  return { html: items.map(({ item, row }) => rowHtml(row, item, group, data, controls, mixed, framed, fix)).join(""),
    count: items.filter(({ row }) => row.read.state === "ok" || row.read.state === "stale").length,
    unreadable: items.some(({ row }) => row.read.state === "unreadable") };
}

// ---- the first page (specs/screen-polish §八之二) ---------------------------------------------------------------------------------

/** What the page knows besides the composed groups: when the person was last here, when this was read, a lead page that did not open. */
export interface HomePageView { since: string | null; readAt: string; leadFailed?: string; settingsHref(section: string): string;
  /** The person asked for every row of 「自你上次来」, past the few it opens with. */
  showAll?: boolean }
/** How many rows 「自你上次来」 lists before it says how many more there are. */
const SINCE_ROWS = 6;
/** With nothing new since the last visit the page still shows the latest few, so it is never a blank column. */
const RECENT_ROWS = 4;
const NEXT_STEPS = 3;

interface Shown { item: SurfaceItem; row: SurfaceHomeRowDisplay; group: SurfaceGroup; waiting: boolean; at: string | null; turn: FirstPageTurn }

const readable = (row: SurfaceHomeRowDisplay) => row.read.state === "ok" || row.read.state === "stale";
const valueOf = (row: SurfaceHomeRowDisplay, key: string | undefined) => key && "values" in row.read ? row.read.values?.[key] : undefined;
function timeOf(row: SurfaceHomeRowDisplay): string | null {
  const field = row.declaration.fields.find(field => (field.role === "updated_at" || field.role === "happened_at") && typeof valueOf(row, field.key) === "string");
  const at = field ? valueOf(row, field.key) as string : "";
  return at && Number.isFinite(Date.parse(at)) ? at : null;
}
/** Whose turn an object's own state says it is: blocked when the owner maps it onto a ring that cannot go on. */
function turnOf(row: SurfaceHomeRowDisplay, waiting: boolean): FirstPageTurn {
  if (waiting) return "waiting";
  const raw = valueOf(row, row.declaration.status?.field), mapping = typeof raw === "string" ? row.declaration.status?.map[raw] : undefined;
  if (mapping?.attention === "failed") return "blocked";
  const family = mapping ? stateRingFamily(mapping.ring) : undefined;
  return family === "blocked" || family === "failed" ? "blocked" : "idle";
}
const after = (at: string | null, since: string | null) => Boolean(at && since && Date.parse(at) > Date.parse(since));
const dateArg = (name: string, at: string, style: "time" | "datetime") => ({ name, kind: "date" as const, at, style });
const sameDay = (at: string) => new Date(at).toDateString() === new Date().toDateString();
/** 「读于 …」 for the margin: when the page's facts were last read. */
export const homeReadAt = (at: string) => homeAt("read-at", at);
const homeAt = (key: string, at: string) => say.text({ owner: "workbench", key: "workbench.home." + key, args: [dateArg("at", at, sameDay(at) ? "time" : "datetime")] });

/** Every object on the page once, the waiting ones first and then the latest. */
function shownObjects(data: SurfaceHomeDisplay, byKey: ReadonlyMap<string, SurfaceHomeRowDisplay>): Shown[] {
  const seen = new Set<string>(), all: Shown[] = [];
  for (const group of data.groups) {
    if (group.kind !== "attention" && group.kind !== "plugin" && group.kind !== "outline") continue;
    for (const item of group.items) {
      const key = subjectKey(item.owner_plugin_id, item.subject), row = byKey.get(key);
      if (!row || seen.has(key)) continue;
      seen.add(key);
      const waiting = group.kind === "attention";
      all.push({ item, row, group, waiting, at: timeOf(row), turn: turnOf(row, waiting) });
    }
  }
  const order = new Map(all.map((entry, index) => [entry, index]));
  return all.sort((a, b) => Number(b.waiting) - Number(a.waiting) || (a.waiting ? 0 : Date.parse(b.at ?? "") || 0) - (a.waiting ? 0 : Date.parse(a.at ?? "") || 0) || order.get(a)! - order.get(b)!);
}

function sinceSection(data: SurfaceHomeDisplay, shown: readonly Shown[], view: HomePageView, controls: Map<string, HomeControl>, fix?: CorrectionRender): string {
  const attention = data.groups.find(group => group.kind === "attention");
  const places = new Set(shown.flatMap(({ row }) => row.declaration.fields.filter(field => field.role === "held_in").map(field => valueOf(row, field.key))));
  const mixed = places.has("project") && places.has("personal");
  // An object of a plugin's outline is drawn there, in its place in the tree: the page shows an object once.
  const outlined = new Set(data.groups.flatMap(group => group.kind === "outline" ? (group.outline ?? []).map(node => subjectKey(group.owner_plugin_id!, node.subject)) : []));
  const listed = shown.filter(entry => !outlined.has(subjectKey(entry.row.owner, entry.row.subject)));
  // What is stuck stays in the list until it moves again, however long ago it stopped.
  const fresh = listed.filter(entry => entry.waiting || entry.turn === "blocked" || after(entry.at, view.since));
  const since = Boolean(view.since && fresh.length);
  const pool = since ? fresh : listed, opening = since ? SINCE_ROWS : RECENT_ROWS;
  // Past the few it opens with, and past what is new: every object the page read is one press away, the earlier ones under their own word.
  const earlier = since ? listed.filter(entry => !fresh.includes(entry)) : [];
  const rows = view.showAll ? pool : pool.slice(0, opening), more = pool.length - rows.length + (view.showAll ? 0 : earlier.length);
  const excluded = attention?.excluded?.reduce((count, entry) => count + (entry.count ?? 0), 0) ?? 0;
  const unreadable = attention?.state === "unreadable";
  if (!rows.length && !excluded && !unreadable) return "";
  // The rest are one press away, in place; pressed again the list is the few it opened with.
  const fold = more > 0 ? { key: "more", label: home("since-more", more) } : view.showAll && (pool.length > opening || earlier.length) ? { key: "less", label: home("show-less") } : null;
  const list = (entries: readonly Shown[], part: "fresh" | "earlier") => `<div class="home-rows mw-first-page__rows" data-home-rows="${part}">${entries.map(({ row, item, group }) =>
    rowHtml(row, item, group, data, controls, mixed, undefined, fix, { page: true })).join("")}</div>`;
  const older = view.showAll && earlier.length ? `<p class="mw-first-page__quiet" data-home-earlier>${e(home("earlier"))}</p>${list(earlier, "earlier")}` : "";
  const quiet = (fold ? `<p class="mw-first-page__quiet"><button type="button" class="mw-first-page__link" data-home-control="${fold.key}" aria-expanded="${fold.key === "less"}">${e(fold.label)}</button></p>` : "")
    + [unreadable ? home("attention-unreadable") : "", excluded ? home("excluded", excluded) : ""].filter(Boolean).map(line => `<p class="mw-first-page__quiet">${e(line)}</p>`).join("");
  return renderFirstPageSection({ title: home(since ? "since" : "recent"), note: since ? homeAt("since-after", view.since!) : view.since ? home("recent-note") : undefined,
    attrs: { "data-home-group": "since" }, body: list(rows, "fresh") + older + quiet });
}

function outlineSections(data: SurfaceHomeDisplay, byKey: ReadonlyMap<string, SurfaceHomeRowDisplay>, controls: Map<string, HomeControl>, fix?: CorrectionRender): string {
  return data.groups.filter(group => group.kind === "outline" && group.title && group.outline?.length).map(group => {
    // The outline names its objects; each one is an item of whichever group shows it (an object is on the surface once).
    const rows = group.outline!.flatMap(node => {
      const key = subjectKey(group.owner_plugin_id!, node.subject), row = byKey.get(key);
      const found = data.groups.flatMap(from => from.items.filter(item => subjectKey(item.owner_plugin_id, item.subject) === key).map(item => ({ item, from })))[0];
      return row && found ? [rowHtml(row, found.item, found.from, data, controls, false, undefined, fix, { page: true, node })] : [];
    });
    return rows.length ? renderFirstPageSection({ title: say.text(group.title!), attrs: { "data-home-group": "outline:" + group.owner_plugin_id },
      body: `<div class="home-rows mw-first-page__rows">${rows.join("")}</div>` }) : "";
  }).join("");
}

/** At most three: what waits for the person first, then what was last worked on. The first one is the page's one ink-blue button. */
function nextSection(data: SurfaceHomeDisplay, shown: readonly Shown[], controls: Map<string, HomeControl>, primary = true): string {
  const steps = shown.filter(entry => readable(entry.row) && entry.item.actions.some(action => action.ref === "open")).slice(0, NEXT_STEPS).map((entry, index) => {
    const key = subjectKey(entry.row.owner, entry.row.subject), id = controlKey(key, "next-open");
    controls.set(id, objectControl(entry.row, "open"));
    const title = entry.row.declaration.fields.find(field => field.role === "title");
    const name = valueOf(entry.row, title?.key);
    return { title: typeof name === "string" && name ? name : ownerOf(data, entry.row.owner).name,
      why: say.text({ owner: "workbench", key: "workbench.home." + (entry.waiting ? "next-waiting" : "next-continue"), args: [{ name: "name", kind: "text", text: ownerOf(data, entry.row.owner).name }] }),
      button: { label: home("open"), variant: index === 0 && primary ? "primary" as const : "secondary" as const, attrs: { "data-home-control": id } },
      attrs: { "data-home-next": key } };
  });
  return steps.length ? renderFirstPageSection({ title: home("next"), attrs: { "data-home-group": "next" }, body: renderFirstPageNext(steps) }) : "";
}

/** The one plugin whose sentences head the page: the first, in the page's order, whose card carries a lede. */
function pageLede(data: SurfaceHomeDisplay): { owner: string; lede: SurfaceLede; open?: NonNullable<SurfacePluginCard["open"]> } | undefined {
  const group = data.groups.find(group => group.kind === "plugin" && group.state !== "disabled" && group.owner_plugin_id && group.plugin_card?.lede);
  return group && { owner: group.owner_plugin_id!, lede: group.plugin_card!.lede!, ...(group.plugin_card!.open ? { open: group.plugin_card!.open } : {}) };
}
/** The sources the sentences stand on, in the order they are first cited: the page numbers them in its margin. */
const citedSources = (lede: SurfaceLede | undefined) => [...new Set(lede?.sentences.flatMap(sentence => sentence.sources ?? []) ?? [])];
const openControl = (owner: string, target: NonNullable<SurfacePluginCard["open"]>, controls: Map<string, HomeControl>) => {
  const id = controlKey(owner, "open");
  controls.set(id, { owner_plugin_id: owner, target });
  return id;
};

/**
 * The plugin's sentences under the title, each followed by the numbers of the sources it stands on. A sentence that waits for the
 * person is underlined in amber; one that changed is washed once, while the writing is newer than the person's last visit; one whose
 * source cannot be read is said as a gap. Before anything is written: one dashed box that says so, with the button to the plugin's page.
 */
function ledeHtml(page: NonNullable<ReturnType<typeof pageLede>>, numbers: ReadonlyMap<string, number>, view: HomePageView, controls: Map<string, HomeControl>): string {
  const { lede, owner, open } = page;
  if (!lede.sentences.length) {
    if (!lede.invite) return "";
    const button = open ? renderButton({ label: say.text(lede.invite.action), variant: "primary", icon: "sparkles", attrs: { "data-home-control": openControl(owner, open, controls) } }) : "";
    return `<div class="mw-first-page__ask" data-home-lede="empty"><span>${say(lede.invite.text)}</span>${button}</div>`;
  }
  const fresh = after(lede.as_of ?? null, view.since);
  const mark = { yours: "is-yours", gap: "is-gap", changed: fresh ? "is-new" : "" } as const;
  return `<p class="mw-first-page__lede" data-home-lede="${e(owner)}">${lede.sentences.map(sentence => {
    const cls = sentence.mark ? mark[sentence.mark] : "";
    const cites = (sentence.sources ?? []).flatMap(source => numbers.has(source) ? [numbers.get(source)!] : []);
    // A sentence that closes with full-width punctuation carries its own room; any other is followed by a space.
    const gap = /[。！？；…」』）]$/u.test(sentence.text.trimEnd()) ? "" : " ";
    return `<span${cls ? ` class="${cls}"` : ""}${sentence.mark ? ` data-home-sentence="${sentence.mark}"` : ""}>${e(sentence.text)}</span>${cites.length ? `<sup>${cites.join(",")}</sup>` : ""}${gap}`;
  }).join("")}</p>`;
}

/** The facts in one line when nothing has written the page into sentences: the owners' own summaries, no model. */
function factsLine(data: SurfaceHomeDisplay): string {
  const summaries = data.groups.filter(group => group.kind === "plugin" && group.state !== "disabled" && group.plugin_card?.summary && group.items.length)
    .slice(0, 3).map(group => say.text(group.plugin_card!.summary!));
  return summaries.length ? `<p class="mw-first-page__facts" data-home-facts>${summaries.map(e).join("<span aria-hidden=\"true\">　·　</span>")}</p>` : "";
}

/** A project with nothing in it yet is said so, apart from one that could not be read, with three places to begin. */
function startSection(view: HomePageView, primary = true): string {
  const word = (key: string) => home("start." + key);
  return `<section data-home-group="start"><p class="mw-first-page__facts">${e(home("empty"))}</p>${renderFirstPageNext([
    { title: word("bring"), why: word("bring-why"), html: `<a class="mw-btn mw-btn--${primary ? "primary" : "secondary"}" href="${e(view.settingsHref("workspaces"))}" data-home-start="bring">${icon("folder")}<span>${e(word("bring-do"))}</span></a>` },
    { title: word("work"), why: word("work-why"), button: { label: word("work-do"), variant: "secondary", attrs: { "data-home-control": "write" } } },
    { title: word("plugins"), why: word("plugins-why"), button: { label: word("plugins-do"), variant: "secondary", attrs: { "data-home-control": "picker" } } },
  ], { start: true })}</section>`;
}

function marginHtml(data: SurfaceHomeDisplay, shown: readonly Shown[], view: HomePageView, controls: Map<string, HomeControl>, numbers: ReadonlyMap<string, number>, written: boolean): string {
  const link = (key: string, control: string) => ` · <button type="button" class="mw-first-page__link" data-home-control="${e(control)}">${e(home(key))}</button>`;
  let quiet = 0;
  // The sources the sentences cite come first, in their numbers; the rest follow in the page's order.
  const groups = data.groups.filter(group => group.kind === "plugin" && group.owner_plugin_id);
  const sources = [...groups.filter(group => numbers.has(group.owner_plugin_id!)).sort((a, b) => numbers.get(a.owner_plugin_id!)! - numbers.get(b.owner_plugin_id!)!),
    ...groups.filter(group => !numbers.has(group.owner_plugin_id!))].map(group => {
    const owner = group.owner_plugin_id!, display = ownerOf(data, owner), card = group.plugin_card;
    const mine = shown.filter(entry => entry.row.owner === owner);
    const unreadable = group.state === "unreadable" || mine.some(entry => entry.row.read.state === "unreadable");
    const turn: FirstPageTurn = mine.some(entry => entry.turn === "waiting") ? "waiting" : mine.some(entry => entry.turn === "blocked") ? "blocked"
      : mine.some(entry => after(entry.at, view.since)) ? "changed" : "idle";
    if (group.state !== "disabled" && !unreadable && !mine.length && !numbers.has(owner)) { quiet++; return ""; }
    const control = (suffix: string, target: HomeControl["target"] | undefined) => {
      if (!target) return undefined;
      const id = controlKey(owner, suffix);
      controls.set(id, { owner_plugin_id: owner, target });
      return id;
    };
    const open = control("open", card?.open), enable = group.state === "disabled" ? control("enable", card?.enable) : undefined;
    const word = group.state === "disabled" ? home("word.disabled") : unreadable ? home("word.unreadable") : group.state === "stale" ? home("word.stale") : home("word." + turn);
    return renderFirstPageSource({ ...(numbers.has(owner) ? { index: numbers.get(owner)! } : {}), icon: display.icon && PLUGIN_ICON_NAMES.includes(display.icon) ? display.icon : "package", name: display.name, word,
      turn: group.state === "disabled" || unreadable || group.state === "stale" ? "idle" : turn, ...(open ? { control: { "data-home-control": open } } : {}),
      after: enable ? link("enable", enable) : unreadable ? link("word.reread", "refresh") : "",
      attrs: { "data-home-card": owner, "data-home-state": unreadable ? "unreadable" : group.state } });
  }).join("");
  const add = written ? "" : `<div class="mw-first-page__add" data-home-write>${e(home("write-hint"))} <button type="button" class="mw-first-page__link" data-home-control="picker">${e(home("write-link"))}</button></div>`;
  return renderFirstPageMargin({ title: home("sources"), note: sources ? homeReadAt(view.readAt) : undefined, sources,
    rest: sources ? quiet ? home("rest", quiet) : undefined : home("no-sources"),
    foot: (sources ? add : "") + `<div class="mw-first-page__all"><button type="button" class="mw-first-page__link" data-home-control="picker">${e(home("all-plugins"))}</button></div>`,
    attrs: { "data-home-sources": "" } });
}

/**
 * The project's first page from the composed groups: what changed since the person was last here, how far each plugin's own work has
 * come, at most three next steps, and in the margin where all of it was read from. No plugin is named here and none is listed for
 * its own sake: one with nothing new is counted in a single line.
 */
export function renderHome(data: SurfaceHomeDisplay, controls: Map<string, HomeControl>, view: HomePageView, fix?: CorrectionRender) {
  controls.clear();
  fix?.controls.clear();
  const byKey = new Map(data.display.rows.map(row => [subjectKey(row.owner, row.subject), row]));
  const shown = shownObjects(data, byKey);
  const failed = view.leadFailed ? `<p class="mw-first-page__quiet" data-home-lead-failed>${e(homeLeadWord("lead-failed", view.leadFailed))} <button type="button" class="mw-first-page__link" data-home-control="lead-retry">${e(home("retry"))}</button></p>` : ""
  const lede = pageLede(data), groups = new Set(data.groups.flatMap(group => group.kind === "plugin" && group.owner_plugin_id ? [group.owner_plugin_id] : []));
  const numbers = new Map(citedSources(lede?.lede).filter(source => groups.has(source)).map((source, index) => [source, index + 1]));
  const head = lede ? ledeHtml(lede, numbers, view, controls) : "";
  // One ink-blue button on the page: the invitation to write the page up has it before any next step.
  const inviting = Boolean(lede && !lede.lede.sentences.length && head);
  const body = shown.length || lede?.lede.sentences.length || data.groups.some(group => group.kind === "plugin" && (group.state === "unreadable" || group.state === "disabled"))
    ? (head || factsLine(data)) + sinceSection(data, shown, view, controls, fix) + outlineSections(data, byKey, controls, fix) + nextSection(data, shown, controls, !inviting)
    : head + startSection(view, !inviting);
  const margin = marginHtml(data, shown, view, controls, numbers, Boolean(lede));
  // The label of the writing the sentences are from, with its version: it opens the plugin's own page, where the versions are.
  const version = lede?.lede.sentences.length && lede.open ? `<button type="button" class="mw-first-page__version" data-home-control="${e(openControl(lede.owner, lede.open, controls))}">${
    say(lede.lede.label)}${icon("chevron-down")}</button>` : "";
  return { column: failed + correctionHeader(data, 0, fix && { ...fix, quiet: true }) + body, margin, version };
}

export function renderHomePeek(data: SurfaceHomeDisplay, row: SurfaceHomeRowDisplay, controls: Map<string, HomeControl>, framed?: readonly FramedSurfaceControl[]) {
  const id = controlKey(subjectKey(row.owner, row.subject), "peek-open");
  controls.set(id, objectControl(row, "open"));
  return renderPresentationForm(row.declaration, "peek", { locale: null, ownerDisplay: ownerOf(data, row.owner), read: row.read,
    actions: framed ?? [{ key: id, label: home("open"), primary: true }] });
}

/** Other positions select their own group; the form, owner words, fields and row controls are the same as Home. */
export function renderPositionGroup(data: SurfaceHomeDisplay, index: number, controls: Map<string, HomeControl>, framed?: readonly FramedSurfaceControl[], fix?: CorrectionRender) {
  const group = data.groups[index];
  if (!group) return { html: "", count: 0 };
  fix?.controls.clear();
  const head = correctionHeader(data, index, fix);
  if (fix?.headerOnly) return { html: head, count: 0 };
  const rows = rowList(data, group, controls, new Map(data.display.rows.map(row => [subjectKey(row.owner, row.subject), row])), framed, fix);
  return { html: head + rows.html, count: rows.count, overflow: group.overflow?.count };
}
