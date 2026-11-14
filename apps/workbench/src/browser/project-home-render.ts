import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceGroup, SurfaceHomeEnable, SurfaceHomeStart, SurfaceItem, SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { escapeHtml as e, icon, PLUGIN_ICON_NAMES, renderBadge, renderButton, renderPresentationForm, renderStatusMark, say,
  type PresentationFormValues } from "@molis-ai/molis-work-plugin-sdk/ui";
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

const home = (key: string, count?: number): string => say.text({ owner: "workbench", key: "workbench.home." + key,
  ...(count === undefined ? {} : { args: [{ name: "count", kind: "number", number: count }] }) });
const common = (key: string): string => say.text({ owner: "workbench", key: "common.presentation." + key });
const note = (text: OwnedTextRef | undefined) => text ? `<p>${say(text)}</p>` : "";
const controlKey = (owner: string, suffix: string) => owner + ":" + suffix;
export const homeButton = (key: string, label: string, primary = false) =>
  renderButton({ label, variant: primary ? "primary" : "secondary", attrs: { "data-home-control": key } });
export const homeWord = (key: string) => home(key);
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

function rowHtml(row: SurfaceHomeRowDisplay, item: SurfaceItem, group: SurfaceGroup, data: SurfaceHomeDisplay, controls: Map<string, HomeControl>, mixed: boolean,
  framed?: readonly FramedSurfaceControl[], fix?: CorrectionRender) {
  const key = subjectKey(row.owner, row.subject);
  const actions = framed?.filter(action => subjectKey(action.owner, action.subject) === key) ?? item.actions.flatMap(action => {
    const ref = action.ref;
    if (ref !== "open" && ref !== "peek" && ref !== "place" && ref !== "hand_off" || isPlacementControl(ref) && row.read.state !== "ok") return [];
    const id = controlKey(key, action.ref);
    controls.set(id, objectControl(row, ref));
    return [{ key: id, label: ref === "open" ? home("open") : common(ref), primary: ref === "open" && group.kind === "attention" }];
  });
  const read = "values" in row.read && !mixed ? { ...row.read, values: Object.fromEntries(Object.entries(row.read.values ?? {}).filter(([key]) =>
    row.declaration.fields.find(field => field.key === key)?.role !== "held_in")) } : row.read;
  const corrections = read.state === "ok" && !row.fallback ? objectCorrections(data, group, item, fix?.controls) : [];
  return `<div class="home-row" data-home-row="${e(key)}" data-home-subject-kind="${e(row.subject.kind)}" data-home-subject-id="${e(row.subject.id)}"${actions.some(action => action.key.endsWith(":peek")) && (read.state === "ok" || read.state === "stale") ? ` data-home-row-peek="${e(controlKey(key, "peek"))}"` : ""}>
    ${renderPresentationForm(row.declaration, item.form, { locale: null, ownerDisplay: ownerOf(data, row.owner), read, actions: item.form === "row" ? [...actions, ...corrections] : actions,
      notices: item.notices?.map(({ reason }) => ({ reason })) })}
    ${item.form === "row" ? "" : correctionMenu(corrections, "surface-correction-menu")}
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

function pluginCard(data: SurfaceHomeDisplay, group: SurfaceGroup, rows: ReturnType<typeof rowList>, controls: Map<string, HomeControl>) {
  const owner = group.owner_plugin_id!;
  const display = ownerOf(data, owner), card = group.plugin_card;
  const button = (key: string, target?: CardTarget, primary = false) => {
    if (!target) return "";
    const id = controlKey(owner, key);
    controls.set(id, { owner_plugin_id: owner, target });
    const label = home(key.split(":", 1)[0]!);
    const warn = "action" in target ? target.action.consequence?.map(common).join(" · ") : "";
    return homeButton(id, label, primary) + (warn ? `<small>${e(warn)}</small>` : "");
  };
  const glyph = display.icon && PLUGIN_ICON_NAMES.includes(display.icon) ? display.icon : "package";
  const state = group.state === "disabled" ? renderStatusMark({ state: "disabled", label: home("disabled") })
    : group.state === "stale" && group.read_at ? renderStatusMark({ state: "stale", label: say.text({
      owner: "workbench", key: "common.presentation.stale", args: [{ name: "at", kind: "date", at: group.read_at, style: "relative" }],
    }) }) : group.state === "unreadable" || rows.unreadable ? renderStatusMark({ state: "disconnected", label: common("unreadable") }) : "";
  const actions = button("open", card?.open) + button("enable", card?.enable, true) + (card?.start ?? []).map((target, index) => button("start:" + index, target, true)).join("")
    + (group.state === "unreadable" || rows.unreadable ? homeButton("refresh", home("retry")) : "");
  return `<article class="mw-card home-plugin-card" data-home-card="${e(owner)}" data-home-group="${e(owner)}" data-home-state="${e(group.state)}"
    style="--presentation-hue:var(--hue-${display.hue});--presentation-soft:var(--hue-${display.hue}-soft)">
    <header class="home-plugin-card__band"><span class="mw-presentation__owner" aria-hidden="true">${icon(glyph)}</span><h3>${e(display.name)}</h3></header>
    <div class="home-plugin-card__body">${state}${note(card?.summary)}<div class="home-rows">${rows.html}</div>${note(group.hidden_above?.label)}
      ${note(card?.note)}${actions ? `<div class="home-plugin-card__actions">${actions}</div>` : ""}</div></article>`;
}

export function renderHome(data: SurfaceHomeDisplay, controls: Map<string, HomeControl>, fix?: CorrectionRender) {
  controls.clear();
  fix?.controls.clear();
  const byKey = new Map(data.display.rows.map(row => [subjectKey(row.owner, row.subject), row]));
  const cards: string[] = [], groups: string[] = [];
  for (const group of data.groups) {
    const rows = rowList(data, group, controls, byKey, undefined, fix);
    if (group.kind === "plugin" && group.owner_plugin_id) { cards.push(pluginCard(data, group, rows, controls)); continue; }
    if (group.kind !== "attention" && group.kind !== "continue") continue;
    const attention = group.kind === "attention", unreadable = group.state === "unreadable" || rows.unreadable;
    const excluded = group.excluded?.reduce((count, entry) => count + (entry.count ?? 0), 0) ?? 0;
    const title = attention ? home("attention", rows.count) : home("continue");
    const lead = unreadable ? `<p>${e(home("attention-unreadable"))}</p>`
      : attention && !rows.count ? `<p>${e(home("attention-empty"))}</p>` : "";
    groups.push(`<section data-home-group="${group.kind}"><h2>${e(attention && unreadable && !rows.count ? home("attention-unreadable") : title)}</h2>
      ${unreadable && !rows.count ? "" : lead}<div class="home-rows">${rows.html}</div>${excluded ? `<p>${e(home("excluded", excluded))}</p>` : ""}</section>`);
  }
  if (cards.length) groups.push(`<section data-home-group="plugins"><h2>${e(home("plugins"))}</h2><div class="home-plugin-cards">${cards.join("")}</div></section>`);
  if (!data.display.rows.length) groups.splice(cards.length ? groups.length - 1 : groups.length, 0,
    `<section class="mw-empty" data-home-group="start"><h2>${e(home("start-here"))}</h2>${cards.length ? "" : `<p>${e(home("empty"))}</p>`}
      ${homeButton("market", home("add"))}</section>`);
  return correctionHeader(data, 0, fix) + groups.join("");
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
