import type { AttentionState, FormKind, OwnedPresentationObject, PresentationField, PresentationValueItem } from "@molis-ai/molis-work-contracts/platform/presentation";
import { type OwnedTextRef, type TextDateStyle, UI_VIEW_HUES, type UiViewHue } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceConsequence } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { PLATFORM_TEXT_OWNER } from "../message-declarations.js";
import { presentationFormFields } from "../presentation.js";
import { renderButton } from "./button.js";
import { renderProgress, renderStatusMark, type MwStatusTone } from "./feedback.js";
import { escapeHtml } from "./html.js";
import { icon, PLUGIN_ICON_NAMES, type PluginIconName } from "./icon.js";
import { formatDate, formatNumber } from "./message-format.js";
import { renderMenu, renderMenuItem, renderPreviewCard } from "./overlay.js";
import { stateRingFamily, type StateRingState } from "./state-ring-states.js";
import { ownerFormatLocale, say } from "./text.js";
import { tryOwnedTextRef } from "./text-ref.js";

interface PresentationControl {
  /** A key local to this rendering position, carrying no authority to execute. */
  readonly key: string;
  readonly label: string;
  readonly primary?: boolean;
  readonly consequence?: readonly SurfaceConsequence[];
}

export interface PresentationFormValues {
  readonly locale: string | null;
  readonly ownerDisplay: { readonly name: string; readonly icon?: PluginIconName; readonly hue?: UiViewHue };
  readonly read: Pick<PresentationValueItem, "state" | "values" | "read_at"> | { readonly state: "unreadable" };
  readonly actions?: readonly PresentationControl[];
  readonly notices?: readonly { readonly reason: OwnedTextRef; readonly next?: PresentationControl }[];
}

type ReadUnavailable = "unreadable" | "forbidden" | "deleted";
type Words = (key: string) => string;

const platformWord = (key: string): OwnedTextRef => ({ owner: PLATFORM_TEXT_OWNER, key: `common.presentation.${key}` });
const unavailableWord: OwnedTextRef = { owner: PLATFORM_TEXT_OWNER, key: "common.text.unavailable" };
/** The same canonical plugin id picks the same semantic hue in every install. */
export function presentationOwnerHue(pluginId: string): UiViewHue {
  let hash = 0;
  for (const char of pluginId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return UI_VIEW_HUES[hash % UI_VIEW_HUES.length]!;
}

const unavailableRing: Readonly<Record<ReadUnavailable, StateRingState>> = { forbidden: "blocked", deleted: "trashed", unreadable: "disconnected" };
const attentionWords: Readonly<Partial<Record<AttentionState, { word: string; tone: MwStatusTone }>>> = {
  needs_decision: { word: "needs-decision", tone: "attention" },
  needs_acceptance: { word: "needs-acceptance", tone: "attention" },
  failed: { word: "failed", tone: "blocked" },
  partial: { word: "partial", tone: "hold" },
  stale: { word: "state.stale", tone: "hold" },
};

function ownerTile(owner: PresentationFormValues["ownerDisplay"], labelled: boolean): string {
  const glyph = owner.icon && PLUGIN_ICON_NAMES.includes(owner.icon) ? owner.icon : "package";
  return `<span class="mw-presentation__owner"${labelled ? ` role="img" aria-label="${escapeHtml(owner.name)}"` : ' aria-hidden="true"'}>${icon(glyph)}</span>`;
}

function formStart(form: FormKind, state: PresentationFormValues["read"]["state"], hue: UiViewHue | undefined): string {
  const color = hue && UI_VIEW_HUES.includes(hue) ? hue : "gray";
  return `<div class="mw-presentation mw-presentation--${escapeHtml(form)}" data-presentation-read="${escapeHtml(state)}" style="--presentation-hue:var(--hue-${color});--presentation-soft:var(--hue-${color}-soft)">`;
}

function unavailable(form: FormKind, read: ReadUnavailable, values: PresentationFormValues): string {
  const label = say.text(platformWord(read), { locale: values.locale });
  const owner = values.ownerDisplay;
  return `${formStart(form, read, owner.hue)}<div class="mw-presentation__unavailable">${ownerTile(owner, false)}<span>${escapeHtml(owner.name)}</span>${renderStatusMark({ label, state: unavailableRing[read] })}</div></div>`;
}

function isReadTime(at: string | undefined): at is string {
  if (typeof at !== "string") return false;
  let valid = true;
  formatDate(at, "datetime", undefined, { problem: () => { valid = false; } });
  return valid;
}

function staleMark(at: string, locale: string | null): string {
  const word: OwnedTextRef = {
    ...platformWord("stale"),
    args: [{ name: "at", kind: "date", at, style: "relative" }],
  };
  return `<time class="mw-presentation__stale" datetime="${escapeHtml(at)}">${renderStatusMark({ state: "stale", tone: "hold", label: say.text(word, { locale }) })}</time>`;
}

interface DisplayContext {
  readonly locale: string | null;
  readonly word: Words;
  readonly owned: (ref: unknown) => string;
}

function statusMark(object: OwnedPresentationObject, raw: unknown, text: DisplayContext): string {
  const mapping = typeof raw === "string" && object.status && Object.hasOwn(object.status.map, raw)
    ? object.status.map[raw]
    : undefined;
  const attention = mapping?.attention ? attentionWords[mapping.attention] : undefined;
  const ring = mapping?.ring;
  const family = ring ? stateRingFamily(ring) : undefined;
  const label = attention ? text.word(attention.word) : family ? text.word(family === "running" || family === "done" ? family : `state.${family}`)
    : typeof raw === "string" ? raw : isRecord(raw) ? text.owned(raw) : "";
  return label ? renderStatusMark({ label, state: ring, tone: attention?.tone }) : "";
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
function scalar(value: unknown, locale: string | null): string {
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  return typeof value === "number" && Number.isFinite(value) ? formatNumber(value, locale ?? undefined) : "";
}

function fieldContent(field: PresentationField, value: unknown, label: string, text: DisplayContext): string {
  switch (field.role) {
    case "activity":
      return escapeHtml(text.owned(value));
    case "judgment":
      return isRecord(value) ? `<strong>${escapeHtml(text.owned(value.label))}</strong>${value.reason === undefined ? "" : ` <span>${escapeHtml(text.owned(value.reason))}</span>`}` : "";
    case "held_in":
      return value === "project" || value === "personal" ? escapeHtml(text.word(`held-${value}`)) : "";
    case "progress": {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return escapeHtml(scalar(value, text.locale));
      const percent = formatNumber(value / 100, text.locale ?? undefined, "percent");
      return `<span>${escapeHtml(percent)}</span>${renderProgress({ value, label: label || percent })}`;
    }
    case "due_at":
    case "happened_at":
    case "updated_at": {
      if (typeof value !== "string") return "";
      const style: TextDateStyle = field.role === "due_at" ? "date" : "datetime";
      return `<time${isReadTime(value) ? ` datetime="${escapeHtml(value)}"` : ""}>${escapeHtml(formatDate(value, style, text.locale ?? undefined))}</time>`;
    }
    case "children": {
      if (!Array.isArray(value)) return escapeHtml(scalar(value, text.locale));
      const items = value.map(item => scalar(item, text.locale)).filter(Boolean);
      return items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
    }
    case "media":
      return typeof value === "string" && value ? `${icon("file")} ${escapeHtml(value)}` : "";
    default:
      return escapeHtml(scalar(value, text.locale));
  }
}

function renderField(field: PresentationField, value: unknown, text: DisplayContext): string {
  if (value === null || value === undefined) return "";
  const label = field.label ? text.owned(field.label) : "";
  const content = fieldContent(field, value, label, text);
  return content ? `<div class="mw-presentation__field" data-presentation-role="${escapeHtml(field.role)}">${label ? `<small>${escapeHtml(label)}</small>` : ""}${content}</div>` : "";
}

function renderControl(control: PresentationControl, word: Words): string {
  const consequences = control.consequence?.map(word) ?? [];
  const button = renderButton({
    label: control.label,
    variant: control.primary ? "primary" : "secondary",
    attrs: { "data-presentation-action": control.key, "aria-description": consequences.length ? consequences.join("\n") : undefined },
  });
  const warnings = consequences.map(label => `<small class="mw-presentation__consequence">${escapeHtml(label)}</small>`).join("");
  return `<div class="mw-presentation__control">${button}${warnings}</div>`;
}

function renderControls(form: FormKind, actions: readonly PresentationControl[], word: Words): string {
  if (!actions.length) return "";
  if (form !== "row") return `<div class="mw-presentation__controls">${actions.map(control => renderControl(control, word)).join("")}</div>`;
  const primary = actions.find(action => action.primary) ?? actions[0]!;
  const more = actions.filter(action => action !== primary);
  const menu = more.length ? `<details class="mw-presentation__more"><summary aria-haspopup="menu" aria-label="${escapeHtml(word("more"))}" class="mw-btn mw-btn--ghost mw-btn--icon mw-btn--icon-only">${icon("more")}</summary>${renderMenu({
    items: more.map(control => renderMenuItem({
      label: control.label,
      description: control.consequence?.map(word).join("\n"),
      attrs: { "data-presentation-action": control.key },
    })).join(""),
  })}</details>` : "";
  return `<div class="mw-presentation__controls">${renderControl(primary, word)}${menu}</div>`;
}

/**
 * Draw one declared form from a current display projection (SSC-14). A missing form has no markup; its platform fallback belongs to the caller.
 * Blocked reads are handled before any object field or control is read. The caller owns overlay placement and any actual action binding.
 */
export function renderPresentationForm(object: OwnedPresentationObject, form: FormKind, values: PresentationFormValues): string {
  const read = values.read;
  if (read.state !== "ok" && read.state !== "stale") {
    return unavailable(form, read.state === "forbidden" || read.state === "deleted" ? read.state : "unreadable", values);
  }
  const at = read.state === "stale" ? read.read_at : undefined;
  if (read.state === "stale" && !isReadTime(at)) return unavailable(form, "unreadable", values);
  const selected = presentationFormFields(object, form);
  if (!selected) return "";

  const locale = ownerFormatLocale(object.owner, values.locale);
  const word = (key: string) => say.text(platformWord(key), { locale });
  const text: DisplayContext = { locale, word, owned: ref => say.text(tryOwnedTextRef(ref, object.owner) ?? unavailableWord, { locale }) };
  const shown = read.values ?? {};
  const value = (key: string) => Object.hasOwn(shown, key) ? shown[key] : undefined;
  const fields = selected.fields.flatMap(key => object.fields.find(field => field.key === key) ?? []);
  const titleField = fields.find(field => field.role === "title");
  const title = titleField ? scalar(value(titleField.key), locale) : "";
  const isExpanded = selected.form === "card" || selected.form === "peek";
  const summaryField = isExpanded ? fields.find(field => field.role === "summary") : undefined;
  const bandTimeField = selected.form === "card"
    ? fields.find(field => (field.role === "updated_at" || field.role === "happened_at") && value(field.key) !== undefined)
    : undefined;
  const summaryValue = summaryField ? value(summaryField.key) : undefined;
  const summary = isRecord(summaryValue) ? text.owned(summaryValue) : scalar(summaryValue, locale);
  const body = fields.filter(field => field !== titleField && field !== summaryField && field !== bandTimeField && field.role !== "status")
    .map(field => renderField(field, value(field.key), text)).join("");
  const statusField = object.status?.field ?? fields.find(field => field.role === "status")?.key;
  const status = statusField ? statusMark(object, value(statusField), text) : "";
  const owner = values.ownerDisplay;
  const controls = renderControls(selected.form, values.actions ?? [], word);
  const notices = values.notices?.map(notice => `<div class="mw-presentation__notice"><p>${say(notice.reason, { locale })}</p>${notice.next ? renderControl(notice.next, word) : ""}</div>`).join("") ?? "";
  const stale = at ? staleMark(at, locale) : "";
  const start = formStart(selected.form, read.state, owner.hue);

  if (selected.form === "chip") return `${start}<span class="mw-tag mw-presentation__tag">${ownerTile(owner, true)}<strong>${escapeHtml(title)}</strong>${status}</span>${body}${stale}${controls}${notices}</div>`;
  if (selected.form === "row") return `${start}<div class="mw-item"><span>${ownerTile(owner, true)}</span><span class="mw-presentation__row-title" tabindex="0"><strong>${escapeHtml(title)}</strong></span><div class="mw-item__end">${status}${controls}</div>${body ? `<div class="mw-presentation__fields">${body}</div>` : ""}</div>${stale}${notices}</div>`;
  const bandTime = bandTimeField ? renderField(bandTimeField, value(bandTimeField.key), text) : "";
  return `${start}<header class="mw-presentation__band">${ownerTile(owner, false)}<span>${escapeHtml(owner.name)}</span>${bandTime}${status}</header>${stale}${renderPreviewCard({ title, body: summary })}<div class="mw-presentation__fields">${body}</div>${controls}${notices}</div>`;
}
