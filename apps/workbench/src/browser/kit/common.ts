import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { KitEntry, KitKind } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitCatalog, KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { escapeHtml, renderBadge, renderButton, renderStatusMark, type AttrValue, type MwTone, type MwStatusTone, type PluginIconName, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

type Translate = (text: string, values?: Record<string, string | number>) => string;
/** 08's Skill parts (apps/workbench/src/settings-skills.ts), in the page before this program. */
export interface SkillUi {
  detail(box: HTMLElement, skill: unknown, project: string, hooks: { notice: HTMLElement; redraw(): void }): HTMLElement;
  importPanel(panel: HTMLElement, project: string, reload: () => Promise<void>): void;
}
const page = globalThis as typeof globalThis & { L?: Translate; molisWorkRequest: UiRequest; molisSkillUI?: SkillUi };

/** The page's translator (apps/workbench i18n.ts writes `globalThis.L`); the Chinese text itself when there is none. */
export const L: Translate = (text, values) => page.L ? page.L(text, values) : Object.entries(values ?? {}).reduce((out, [key, value]) => out.split("{" + key + "}").join(String(value)), text);
export const esc = escapeHtml;
export const skillUi = (): SkillUi | undefined => page.molisSkillUI;
export const english = () => document.documentElement.lang.startsWith("en");
/** Lists and pauses in the page's own language: English punctuation in English (docs/design/capability-pack/README.md). */
export const joined = (items: readonly string[]) => items.join(english() ? ", " : "、");
export const colon = () => english() ? ": " : "：";
/** 08's word for a Skill whose publisher was revoked, as the page wrote it (「已撤销」 means something else in the shared English). */
export const retracted = () => document.querySelector<HTMLElement>("[data-sk-retracted]")?.dataset.skRetracted ?? "已撤销";

/** One of the page's actions (apps/local-host/src/kit-settings-http.ts), as the person, in the page's project or personal space. */
export function post<T>(project: string, path: string, body: object = {}): Promise<T> {
  return page.molisWorkRequest((project ? "/projects/" + encodeURIComponent(project) : "") + "/api/kit/" + path, { body }) as Promise<T>;
}

export const KINDS: readonly KitKind[] = ["role", "prompt", "skill", "mcp", "tool"];
export const KIND_GLYPH: Record<KitKind, PluginIconName> = { role: "user", prompt: "text", skill: "book", mcp: "network", tool: "wand" };
export const KIND_WORD: Record<KitKind, string> = { role: "角色", prompt: "提示词", skill: "技能", mcp: "MCP", tool: "工具" };

export const act = (name: string, value?: string): Record<string, AttrValue> => value === undefined ? { "data-kit-act": name } : { "data-kit-act": name, "data-kit-v": value };
export const button = (label: string, options: { variant?: "primary" | "secondary" | "ghost" | "link"; icon?: PluginIconName; attrs?: Record<string, AttrValue>; size?: "sm" | "md"; disabled?: boolean } = {}) =>
  renderButton({ label, variant: options.variant ?? "secondary", size: options.size ?? "sm", icon: options.icon, attrs: options.attrs, disabled: options.disabled });
/** A link styled as a button: the way to the page that owns the thing. */
export const goTo = (label: string, href: string, variant: "secondary" | "ghost" | "primary" = "secondary") =>
  `<a class="mw-btn mw-btn--${variant} mw-btn--sm" data-slot="button" href="${esc(href)}"><span data-slot="button-label">${esc(label)}</span></a>`;
export const mark = (label: string, tone: MwStatusTone, state: StateRingState) => renderStatusMark({ label, tone, state });
export const badge = (label: string, tone: MwTone = "neutral") => renderBadge({ label, tone });
export const statusLine = (markHtml: string, text: string) => `<p class="mw-status-line">${markHtml}<span>${esc(text)}</span></p>`;
export const section = (title: string, body: string, className = "") => `<section class="kit-sec${className ? " " + className : ""}"><h4>${esc(title)}</h4>${body}</section>`;
export const note = (text: string) => `<p class="kit-note">${esc(text)}</p>`;

/** What the page knows after one `kit.catalog.list`: the answer, each entry by key, and the derived facts every view uses. */
export interface Kit { catalog: KitCatalog; byKey: Map<string, KitEntry> }
export const kitOf = (catalog: KitCatalog): Kit => ({ catalog, byKey: new Map(catalog.entries.map(entry => [entry.key, entry])) });
export const entriesOf = (kit: Kit, keys: readonly string[]) => keys.map(key => kit.byKey.get(key)).filter((entry): entry is KitEntry => Boolean(entry));

/** A pack's role row that only refers to Molis Work's own personal assistant (its prompts with no role hang there, §4.2). */
export const isReference = (pack: KitPack, role: KitEntry | undefined) => !role || role.pack !== pack.pack_id;
/** MCP rows: a server, Molis Work's own server, or an action not tied to one; a server's tools are counted inside it. */
export const mcpRows = (kit: Kit, pack: KitPack) => entriesOf(kit, pack.mcp).filter(entry => entry.kind === "mcp" && !("server_id" in entry.ref && entry.ref.part !== "server"));
export const serverParts = (kit: Kit, pack: KitPack, serverId: string) =>
  entriesOf(kit, pack.mcp).filter(entry => entry.kind === "mcp" && entry.ref.part === "tool" && entry.ref.server_id === serverId);

export function countOf(kit: Kit, pack: KitPack, kind: KitKind): number {
  if (kind === "role") return pack.roles.filter(row => !isReference(pack, kit.byKey.get(row.role))).length;
  if (kind === "prompt") return pack.roles.reduce((sum, row) => sum + row.prompts.length, 0);
  if (kind === "mcp") return mcpRows(kit, pack).length;
  return (kind === "skill" ? pack.skills : pack.tools).length;
}
/** Every entry a pack holds, in reading order: each role and its prompts, Skills, MCP, tools. */
export function itemsOf(kit: Kit, pack: KitPack): KitEntry[] {
  return [...pack.roles.flatMap(row => [row.role, ...row.prompts]), ...pack.skills, ...pack.mcp, ...pack.tools].map(key => kit.byKey.get(key)).filter((entry): entry is KitEntry => Boolean(entry));
}

/** Where an entry comes from, in the person's words: never an internal package name (README rule 6). */
export function sourceTitle(entry: KitEntry): string {
  const source = entry.source;
  if (source.kind === "runtime") return L("Molis Work 自带");
  if (source.kind === "mcp_server") return source.label;
  return source.title;
}
