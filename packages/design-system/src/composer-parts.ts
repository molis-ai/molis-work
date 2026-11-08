import type { AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { escapeHtml, icon, renderButton, type MwComposerAiLabels, type MwComposerLabels } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ComposerChoice } from "./composer-rules.js";
import { renderMenu, renderMenuGroup, renderMenuItem } from "./primitives/overlay.js";

/**
 * The parts the unified input's client puts in as it goes (specs/unified-input-voice/implementation-plan.md §3.6, K2), drawn with
 * the board's menu and upload rows; the board's specimens draw the same functions, so a specimen is what a page shows.
 */

const MODES: readonly [AgentSteerMode, Parameters<typeof icon>[0]][] = [["next-boundary", "message"], ["interrupt", "zap"], ["after-run", "clock"]];

/** The keys written beside a delivery: ⌘ on a Mac, Ctrl elsewhere; interrupting has none (§1 item 2). */
export function composerShortcuts(mac: boolean): Readonly<Partial<Record<AgentSteerMode, string>>> {
  return mac ? { "next-boundary": "⌘↵", "after-run": "⌘⇧↵" } : { "next-boundary": "Ctrl+↵", "after-run": "Ctrl+Shift+↵" };
}

/**
 * The ▾ menu (GLOSSARY: 补充, 打断并改向, 下一轮再做): each mode with what choosing it does, or, when the target does not take it now,
 * the reason in its place and the item not choosable. Items are named `<id>-delivery-<mode>`, so two composers on one page never
 * share an id.
 */
export function renderComposerDeliveryMenu(id: string, labels: MwComposerAiLabels, choices: Readonly<Record<AgentSteerMode, ComposerChoice>>, mac: boolean): string {
  const keys = composerShortcuts(mac);
  return renderMenu({ items: renderMenuGroup({ label: labels.deliveryGroup, items: MODES.map(([mode, iconName]) => {
    const choice = choices[mode];
    return renderMenuItem({ id: `${id}-delivery-${mode}`, label: labels.modes[mode].name, iconName, description: choice.available ? labels.modes[mode].description : choice.reason,
      disabled: !choice.available, ...(keys[mode] ? { shortcut: keys[mode] } : {}), attrs: { "data-composer-delivery": mode } });
  }).join("") }) });
}

/** One group of the ＋ menu: a registered source (its plugin's name and its own), this page's commands, or the files. */
export interface ComposerMenuSource { readonly provider: string; readonly title: string }
export interface ComposerMenuCommand { readonly slash: string; readonly label: string; readonly hint?: string }

/**
 * The ＋ menu's first view: files (when the page takes them), the registered sources grouped by the plugin that offers them, and
 * this page's `/` commands. `sources` undefined: still being read; a group then says so instead of the menu jumping later.
 */
export function renderComposerAddMenu(labels: MwComposerLabels, parts: { files: boolean; sources?: readonly ComposerMenuSource[] | "unavailable"; commands: readonly ComposerMenuCommand[] }): string {
  const files = parts.files ? renderMenuGroup({ items: renderMenuItem({ label: labels.files, iconName: "paperclip", description: labels.filesHint, attrs: { "data-composer-files": "" } }) }) : "";
  const sources = parts.sources === undefined ? line(labels.searching) : parts.sources === "unavailable" ? "" : renderMenuGroup({ items: parts.sources.map((source, index) =>
    renderMenuItem({ label: `${source.provider} · ${source.title}`, iconName: "package", attrs: { "data-composer-source": String(index) } })).join("") });
  const commands = parts.commands.length ? renderMenuGroup({ label: labels.commands, items: parts.commands.map((command, index) =>
    renderMenuItem({ label: `/${command.slash} ${command.label}`, ...(command.hint ? { description: command.hint, id: `mw-composer-command-${index}` } : {}), attrs: { "data-composer-command": String(index) } })).join("") }) : "";
  return renderMenu({ items: files + sources + commands });
}

/** A source opened in the ＋ menu: its query field and what it found (`items` undefined while it looks, a string when it failed). */
export function renderComposerPick(labels: MwComposerLabels, source: ComposerMenuSource, query: string, items: readonly { title: string; hint?: string }[] | string | undefined): string {
  const name = `${source.provider} · ${source.title}`;
  const found = items === undefined ? line(labels.searching) : typeof items === "string" ? line(items) : items.length === 0 ? line(labels.nothing)
    : items.map((item, index) => renderMenuItem({ label: item.title, ...(item.hint ? { description: item.hint, id: `mw-composer-pick-${index}` } : {}), attrs: { "data-composer-pick": String(index) } })).join("");
  return renderMenu({ items: `<div class="mw-composer__query"><input class="mw-input" type="search" data-composer-query aria-label="${escapeHtml(name)}" placeholder="${escapeHtml(name)}" value="${escapeHtml(query)}"></div>${renderMenuGroup({ label: name, items: found })}` });
}

/**
 * `@` in the text: what the system search found for the words after it (§3.3: `@` stays the system search), each with the plugin
 * it is from. `hits` undefined while it looks, a string when it failed. The words are typed in the text itself, so no query field.
 */
export function renderComposerMention(labels: MwComposerLabels, hits: readonly { title: string; plugin_title: string }[] | string | undefined): string {
  const found = hits === undefined ? line(labels.searching) : typeof hits === "string" ? line(hits) : hits.length === 0 ? line(labels.nothing)
    : hits.map((hit, index) => renderMenuItem({ label: hit.title, iconName: "package", description: hit.plugin_title, id: `mw-composer-mention-${index}`, attrs: { "data-composer-mention": String(index) } })).join("");
  return renderMenu({ items: renderMenuGroup({ items: found }) });
}

const line = (text: string) => `<p class="mw-composer__line" role="status">${escapeHtml(text)}</p>`;

/** Fills a label's `{name}` and the like (the page's own filler: the SDK's `formatMessage`). */
export type Fill = (text: string, values: Readonly<Record<string, string>>) => string;

/** One row of the attachment strip. */
export interface ComposerStripItem { readonly title: string; readonly state: "reading" | "attached" | "failed"; readonly reason?: string; readonly from?: string }

/** The attachment strip (the board's upload rows): being read, read (with where a pick came from) or refused with its reason and a remove. */
export function renderComposerStrip(labels: MwComposerLabels, items: readonly ComposerStripItem[], fill: Fill): string {
  if (!items.length) return "";
  return `<ul class="mw-uploads mw-composer__files">${items.map((item, index) => {
    const note = item.state === "reading" ? `<small>${escapeHtml(fill(labels.reading, { name: item.title }))}</small>`
      : item.state === "failed" ? `<small class="is-failed">${escapeHtml(item.reason ?? "")}</small>` : item.from ? `<small>${escapeHtml(item.from)}</small>` : "";
    const remove = fill(labels.remove, { name: item.title });
    return `<li class="mw-upload"><span class="mw-mark">${icon(item.from ? "package" : "file")}</span><span>${escapeHtml(item.title)}${note}</span>${
      renderButton({ label: remove, variant: "ghost", size: "icon", icon: "x", iconOnly: true, attrs: { title: remove, "data-composer-remove": String(index) } })}</li>`;
  }).join("")}</ul>`;
}

/** The restored-draft line: when it was written, and how to throw it away. */
export function renderComposerRestore(labels: MwComposerLabels, when: string, fill: Fill): string {
  return `<p class="mw-field__hint mw-composer__restore">${escapeHtml(fill(labels.restored, { time: when }))} · ${renderButton({ label: labels.clear, variant: "link", attrs: { "data-composer-clear": "" } })}</p>`;
}
