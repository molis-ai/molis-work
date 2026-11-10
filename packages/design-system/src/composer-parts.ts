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
/** A `/` command; `at` is its place in the page's own list when the menu shows only some of them. */
export interface ComposerMenuCommand { readonly slash: string; readonly label: string; readonly hint?: string; readonly keywords?: readonly string[]; readonly icon?: Parameters<typeof icon>[0]; readonly add?: false; readonly at?: number }

/** One command as a menu row: its name first, what it does under it, and the `/word` that finds it where a shortcut stands. */
function commandItem(command: ComposerMenuCommand, at: number): string {
  return renderMenuItem({ label: command.label, ...(command.icon ? { iconName: command.icon } : {}), ...(command.hint ? { description: command.hint, id: `mw-composer-command-${at}` } : {}), shortcut: `/${command.slash}`,
    attrs: { "data-composer-command": String(at) } });
}

/**
 * The ＋ menu: what goes with the next send — files (when the page takes them), the registered sources grouped by the plugin that
 * offers them, and this page's commands that add something (not those marked `add: false`). `sources` undefined: still being
 * read; a group then says so instead of the menu jumping later.
 */
/** A source by its plugin and its own name; one named as the plugin itself (待办 · 待办) is named once. */
const sourceName = (source: ComposerMenuSource) => source.provider === source.title ? source.title : `${source.provider} · ${source.title}`;

export function renderComposerAddMenu(labels: MwComposerLabels, parts: { files: boolean; sources?: readonly ComposerMenuSource[] | "unavailable"; commands: readonly ComposerMenuCommand[] }): string {
  const files = parts.files ? renderMenuGroup({ items: renderMenuItem({ label: labels.files, iconName: "paperclip", description: labels.filesHint, attrs: { "data-composer-files": "" } }) }) : "";
  const sources = parts.sources === undefined ? line(labels.searching) : parts.sources === "unavailable" || !parts.sources.length ? "" : renderMenuGroup({ items: parts.sources.map((source, index) =>
    renderMenuItem({ label: sourceName(source), iconName: "package", attrs: { "data-composer-source": String(index) } })).join("") });
  const adding = parts.commands.map((command, at) => ({ command, at: command.at ?? at })).filter(({ command }) => command.add !== false);
  const commands = adding.length ? renderMenuGroup({ label: labels.adding ?? labels.commands, items: adding.map(({ command, at }) => commandItem(command, at)).join("") }) : "";
  return renderMenu({ items: files + sources + commands });
}

/** The `/` menu: every command the typed `/words` name, in one scrolling list (none says so). */
export function renderComposerCommands(labels: MwComposerLabels, commands: readonly (ComposerMenuCommand & { at: number })[]): string {
  return renderMenu({ items: commands.length ? renderMenuGroup({ label: labels.commands, items: commands.map((command) => commandItem(command, command.at)).join("") }) : line(labels.nothing) });
}

/** The commands a typed `/words` names: each whose name, words, hint or keywords hold them, in the page's order (an empty `/` lists all). */
export function narrowComposerCommands<Command extends ComposerMenuCommand>(commands: readonly Command[], typed: string): (Command & { at: number })[] {
  const words = typed.replace(/^[/、]/u, "").trim().toLocaleLowerCase();
  return commands.map((command, at) => ({ ...command, at }))
    .filter((command) => !words || [command.slash, command.label, command.hint ?? "", ...command.keywords ?? []].join(" ").toLocaleLowerCase().includes(words));
}

/** A source opened in the ＋ menu: its query field and what it found (`items` undefined while it looks, a string when it failed). */
export function renderComposerPick(labels: MwComposerLabels, source: ComposerMenuSource, query: string, items: readonly { title: string; hint?: string }[] | string | undefined): string {
  const name = sourceName(source);
  const found = items === undefined ? line(labels.searching) : typeof items === "string" ? line(items) : items.length === 0 ? line(labels.nothing)
    : items.map((item, index) => renderMenuItem({ label: item.title, ...(item.hint ? { description: item.hint, id: `mw-composer-pick-${index}` } : {}), attrs: { "data-composer-pick": String(index) } })).join("");
  return renderMenu({ items: `<div class="mw-composer__query"><input class="mw-input" type="search" data-composer-query aria-label="${escapeHtml(name)}" placeholder="${escapeHtml(name)}" value="${escapeHtml(query)}"></div>${renderMenuGroup({ label: name, items: found })}` });
}

/**
 * `@` in the text: what was found for the words after it — by the system search (§3.3), each with the plugin it is from, or by the
 * page's own `mentions` (Coding's files), each with where it is. `found` undefined while it looks, a string when it failed. The
 * words are typed in the text itself, so no query field.
 */
export function renderComposerMention(labels: MwComposerLabels, found: readonly { title: string; hint?: string }[] | string | undefined, iconName: Parameters<typeof icon>[0] = "package"): string {
  const rows = found === undefined ? line(labels.searching) : typeof found === "string" ? line(found) : found.length === 0 ? line(labels.nothing)
    : found.map((item, index) => renderMenuItem({ label: item.title, iconName, ...(item.hint ? { description: item.hint } : {}), id: `mw-composer-mention-${index}`, attrs: { "data-composer-mention": String(index) } })).join("");
  return renderMenu({ items: renderMenuGroup({ items: rows }) });
}

const line = (text: string) => `<p class="mw-composer__line" role="status">${escapeHtml(text)}</p>`;

/** Fills a label's `{name}` and the like (the page's own filler: the SDK's `formatMessage`). */
export type Fill = (text: string, values: Readonly<Record<string, string>>) => string;

/**
 * One row of the attachment strip: `key` names it while it lives (the row is redrawn in its own element); `retry` offers 重试 on a
 * failed row; `thumb` is a read picture's own preview (an object URL), in place of the file mark.
 */
export interface ComposerStripItem {
  readonly key: string; readonly title: string; readonly state: "reading" | "attached" | "failed"; readonly reason?: string; readonly from?: string;
  readonly retry?: boolean; readonly thumb?: string;
}

/**
 * The attachment strip (the board's upload rows): being read (`aria-busy`), read (with where a pick came from, or a picture's
 * preview) or refused with its reason, 重试 when trying again may help, and a remove (VUX-18).
 */
export function renderComposerStrip(labels: MwComposerLabels, items: readonly ComposerStripItem[], fill: Fill): string {
  if (!items.length) return "";
  return `<ul class="mw-uploads mw-composer__files">${items.map((item) => {
    const note = item.state === "reading" ? `<small>${escapeHtml(fill(labels.reading, { name: item.title }))}</small>`
      : item.state === "failed" ? `<small class="is-failed">${escapeHtml(item.reason ?? "")}</small>` : item.from ? `<small>${escapeHtml(item.from)}</small>` : "";
    const remove = fill(labels.remove, { name: item.title }), again = fill(labels.retryFile, { name: item.title });
    const mark = item.thumb ? `<img class="mw-composer__thumb" src="${escapeHtml(item.thumb)}" alt="">` : icon(item.from ? "package" : "file");
    const retry = item.state === "failed" && item.retry
      ? renderButton({ label: labels.retry, variant: "ghost", size: "sm", attrs: { "aria-label": again, title: again, "data-composer-retry": item.key } }) : "";
    return `<li class="mw-upload${item.state === "attached" ? "" : ` is-${item.state}`}" data-composer-file="${escapeHtml(item.key)}"${item.state === "reading" ? ' aria-busy="true"' : ""}><span class="mw-mark">${mark}</span><span>${escapeHtml(item.title)}${note}</span>${retry}${
      renderButton({ label: remove, variant: "ghost", size: "icon", icon: "x", iconOnly: true, attrs: { title: remove, "data-composer-remove": item.key } })}</li>`;
  }).join("")}</ul>`;
}

/** The restored-draft line: when it was written, and how to throw it away. */
export function renderComposerRestore(labels: MwComposerLabels, when: string, fill: Fill): string {
  return `<p class="mw-field__hint mw-composer__restore">${escapeHtml(fill(labels.restored, { time: when }))} · ${renderButton({ label: labels.clear, variant: "link", attrs: { "data-composer-clear": "" } })}</p>`;
}
