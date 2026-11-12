import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { KitEntry, KitKind } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitCatalog, KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { escapeHtml, renderBadge, renderButton, renderStatusMark, type AttrValue, type MwTone, type MwStatusTone, type PluginIconName, type StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";

/** 08's Skill parts (apps/workbench/src/settings-skills.ts), in the page before this program. */
export interface SkillUi {
  detail(box: HTMLElement, skill: unknown, project: string, hooks: { notice: HTMLElement; redraw(): void }): HTMLElement;
  importPanel(panel: HTMLElement, project: string, reload: () => Promise<void>): void;
}
const page = globalThis as typeof globalThis & { molisWorkRequest: UiRequest; molisSkillUI?: SkillUi };

export const readText = globalThis.t.text;
export const esc = escapeHtml;
export const skillUi = (): SkillUi | undefined => page.molisSkillUI;
export const joined = (items: readonly string[]) => items.join(readText("common.list.separator"));
export const colon = () => readText("workbench.kit.colon");

/** One of the page's actions (apps/local-host/src/kit-settings-http.ts), as the person, in the page's project or personal space. */
export function post<T>(project: string, path: string, body: object = {}): Promise<T> {
  return page.molisWorkRequest((project ? "/projects/" + encodeURIComponent(project) : "") + "/api/kit/" + path, { body }) as Promise<T>;
}

export const KINDS: readonly KitKind[] = ["role", "prompt", "skill", "mcp", "tool"];
export const KIND_GLYPH: Record<KitKind, PluginIconName> = { role: "user", prompt: "text", skill: "book", mcp: "network", tool: "wand" };
export const KIND_WORD: Record<KitKind, string> = { role: "workbench.assistant-island.role", prompt: "workbench.settings-agent-diagnostics.prompts", skill: "workbench.settings-skills.skills", mcp: "workbench.kit.mcp", tool: "workbench.context-toolbar.tools" };

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
/** Apply only current display fields for the records this view already holds. */
export function updateKitWords(kit: Kit, catalog: KitCatalog): void {
  const latest = kitOf(catalog);
  for (const entry of kit.catalog.entries) {
    const words = latest.byKey.get(entry.key);
    if (!words || words.kind !== entry.kind || words.pack !== entry.pack) continue;
    if (entry.kind === "skill" && words.kind === "skill") {
      if (entry.skill.ref.installation_generation !== words.skill.ref.installation_generation || entry.skill.ref.version !== words.skill.ref.version) continue;
      const { name, description, when_to_use, when_not_to_use } = words.skill;
      Object.assign(entry.skill, { name, description, when_to_use, when_not_to_use });
      Object.assign(entry.skill.pack, { title: words.skill.pack.title });
    }
    Object.assign(entry, { name: words.name, description: words.description });
    Object.assign(entry.version, { label: words.version.label });
    if (entry.source.kind === words.source.kind && "title" in entry.source && "title" in words.source) Object.assign(entry.source, { title: words.source.title });
    if (entry.manage?.href === words.manage?.href && entry.manage) Object.assign(entry.manage, { label: words.manage!.label });
  }
  for (const pack of kit.catalog.packs) {
    const words = catalog.packs.find(current => current.pack_id === pack.pack_id);
    if (!words || words.kind !== pack.kind) continue;
    Object.assign(pack, { name: words.name, description: words.description });
    if (pack.source && words.source) Object.assign(pack.source, { title: words.source.title });
    if (pack.manage?.href === words.manage?.href && pack.manage) Object.assign(pack.manage, { label: words.manage!.label });
  }
}

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
  if (source.kind === "runtime") return readText("workbench.kit.builtin");
  if (source.kind === "mcp_server") return source.label;
  return source.title;
}
