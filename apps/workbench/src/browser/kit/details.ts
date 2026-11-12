import type { KitEntry, KitToolOrigin } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { renderNowBlock, renderPickRow, renderStateRows, renderUsage } from "@molis-ai/molis-work-design-system/capability-pack";
import { dateArg, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, badge, button, esc, goTo, isReference, joined, KIND_GLYPH, KIND_WORD, readText, mark, note, section, serverParts, sourceTitle, statusLine, type Kit } from "./common.js";
import { entryMark, reasonWord } from "./states.js";

// One entry of a pack, opened in the pack's place (README 「画面」): what it is and where it comes from, its state now and where it is
// changed, its usage with what the count covers, where it applies, and its version. Skills are not here: they are 08's block.

type Of<K extends KitEntry["kind"]> = Extract<KitEntry, { kind: K }>;

/** The row that opens an entry; inside a pack it remembers what opened it, so 回到「包」 can put the focus back there. */
export function entryRow(entry: KitEntry, sub: string, current: boolean): string {
  return renderPickRow({ glyph: KIND_GLYPH[entry.kind], name: entry.name, sub, end: entryMark(entry), current, attrs: act("item", entry.key) });
}

export function entryHeader(entry: KitEntry): string {
  const code = entry.kind === "tool" && entry.ref.tool !== entry.name ? ` <code class="kit-code">${esc(entry.ref.tool)}</code>` : "";
  const version = entry.kind === "tool" ? "" : `<span class="kit-dot">·</span><span>${esc(entry.version.label)}</span>`;
  return `<header><span class="kit-kind">${icon(KIND_GLYPH[entry.kind])}${esc(readText(KIND_WORD[entry.kind]))}</span><h3 tabindex="-1">${esc(entry.name)}${code}</h3>${entry.description ? `<p>${esc(entry.description)}</p>` : ""}
    <p class="kit-source">${icon("package")}<span>${esc(sourceTitle(entry))}</span>${version}<span class="kit-dot">·</span>${badge(readText(entry.scope === "home" ? "workbench.account-entitlements.personal-space" : "workbench.kit.project"), entry.scope === "home" ? "info" : "neutral")}</p></header>`;
}

/** Usage says only what its records can (contract §4.4): recent uses with how long they are kept, or only the last one, or none. */
export function usageBlock(entry: KitEntry, withLast = true): string {
  const usage = entry.usage;
  if (usage.kind === "not_counted") return "";
  if (usage.kind === "none") return section(readText("workbench.assistant-side-context.usage"), renderUsage({ head: readText("workbench.kit.unused-records") }));
  const last = withLast && usage.last_at ? readText("workbench.kit.last-used", { at: dateArg(usage.last_at, "datetime") }) : undefined;
  if (usage.kind === "last_only") return section(readText("workbench.assistant-side-context.usage"), renderUsage({ head: readText("workbench.kit.last-use"), last, scope: readText("workbench.kit.last-use-only") }));
  const scope = "rows_per_key" in usage.kept ? readText("workbench.kit.recent-records", { n: usage.kept.rows_per_key }) : readText("workbench.kit.recent-days", { n: usage.kept.days });
  return section(readText("workbench.assistant-side-context.usage"), renderUsage({ figure: usage.count, head: readText("workbench.kit.recent-uses", { n: usage.count }), last, scope }));
}

export function whereBlock(entry: KitEntry, empty = "workbench.kit.unused"): string {
  return entry.where.length ? `<ul class="mw-items kit-places">${entry.where.map(place => `<li class="mw-item"><span class="mw-mark" aria-hidden="true">${icon("target")}</span><span><strong>${esc(place)}</strong></span></li>`).join("")}</ul>` : note(readText(empty));
}

function versionBlock(entry: KitEntry): string {
  const change = entry.version.change;
  const line = !change ? "" : change.kind === "default_updated"
    ? readText("workbench.kit.default-updated-detail", { base: change.base_version, latest: change.default_version })
    : readText("workbench.kit.inventory-changes", { added: change.added, removed: change.removed, changed: change.changed });
  return section(readText("workbench.kit.version-and-upgrades"), `<p class="kit-line">${icon("history")}<span>${esc(entry.version.label)}</span></p>${line ? `<p class="kit-line">${esc(line)}</p>` : ""}`);
}

const manage = (entry: KitEntry, label?: string) => entry.manage ? goTo(label ?? readText("workbench.kit.manage-in", { x: entry.manage.label }), entry.manage.href) : "";
/** When an entry cannot be used now: the owner's word for why, and its detail. */
const unavailable = (entry: KitEntry) => entry.availability.available ? "" : statusLine(entryMark(entry), entry.availability.detail ?? reasonWord(entry));

function promptDetail(kit: Kit, entry: Of<"prompt">, pack: KitPack): string {
  const row = pack.roles.find(candidate => candidate.prompts.includes(entry.key)), role = row && kit.byKey.get(row.role);
  const owner = role ? `<p class="kit-line">${icon("user")}<span>${esc(isReference(pack, role) ? readText("workbench.kit.assigned-to-assistant", { r: role.name }) : readText("workbench.kit.belongs-to-role", { r: role.name }))}</span></p>` : "";
  const change = entry.version.change;
  const words = change?.kind === "default_updated" ? readText("workbench.kit.edited-with-new-default", { base: change.base_version, latest: change.default_version })
    : readText(entry.prompt.edited ? "workbench.kit.uses-edit" : "workbench.kit.uses-default");
  const now = renderNowBlock({ status: owner + (unavailable(entry) || statusLine(entryMark(entry), words)), note: readText("workbench.kit.prompts-edit-elsewhere"),
    actions: manage(entry, readText("workbench.kit.edit-prompts")) });
  return `${entryHeader(entry)}${section(readText("workbench.kit.now"), now)}${usageBlock(entry)}${section(readText("workbench.kit.where-used"), whereBlock(entry))}${versionBlock(entry)}`;
}

function roleDetail(kit: Kit, entry: Of<"role">, pack: KitPack): string {
  const prompts = (pack.roles.find(row => row.role === entry.key)?.prompts ?? []).map(key => kit.byKey.get(key)).filter((prompt): prompt is KitEntry => Boolean(prompt));
  const tools = entry.role.host_tools.map(name => kit.catalog.entries.find(candidate => candidate.kind === "tool" && candidate.ref.tool === name));
  const now = renderNowBlock({ status: unavailable(entry) || statusLine(entryMark(entry), readText("workbench.kit.applies-here")), note: entry.where.length ? undefined : readText("workbench.kit.unused-now"), actions: manage(entry) });
  const chips = entry.role.host_tools.length ? `<p class="kit-chips">${entry.role.host_tools.map((name, index) => {
    const tool = tools[index];
    return tool ? button(tool.name, { icon: KIND_GLYPH.tool, attrs: act("item", tool.key) }) : badge(name);
  }).join("")}</p>${note(readText("workbench.kit.tools-informational"))}` : note(readText("workbench.settings-skills.no-declared-tools"));
  const list = prompts.length ? `<ul class="mw-items">${prompts.map(prompt => entryRow(prompt, promptSub(prompt), false)).join("")}</ul>` : note(readText("workbench.kit.no-own-prompts"));
  return `${entryHeader(entry)}${section(readText("workbench.kit.now"), now + (entry.where.length ? whereBlock(entry) : ""))}${section(readText("workbench.kit.its-prompts") + " " + prompts.length, list)}${section(readText("workbench.kit.declared-tools"), chips)}${usageBlock(entry)}${versionBlock(entry)}`;
}

const ORIGIN: Record<KitToolOrigin, string> = {
  runtime: "workbench.kit.origin-runtime", gateway: "workbench.kit.origin-gateway", business: "workbench.kit.origin-business",
  subagent: "workbench.kit.origin-subagent", "plan-step": "workbench.kit.origin-plan-step", builder: "workbench.kit.origin-builder",
};

function toolDetail(kit: Kit, entry: Of<"tool">): string {
  const packs = (entry.in_packs ?? [entry.pack]).map(id => kit.catalog.packs.find(pack => pack.pack_id === id)).filter((pack): pack is KitPack => Boolean(pack));
  const roles = kit.catalog.entries.filter((role): role is Of<"role"> => role.kind === "role" && role.role.host_tools.includes(entry.ref.tool));
  const now = renderNowBlock({ status: statusLine(entryMark(entry), readText(ORIGIN[entry.tool.origin])), note: readText("workbench.kit.tools-cannot-be-switched") });
  const inPacks = `<p class="kit-chips">${packs.map(pack => button(pack.name, { icon: "package", attrs: act("pack", pack.pack_id) })).join("")}</p>`;
  const opened = roles.length ? `<p class="kit-chips">${roles.map(role => button(role.name, { icon: KIND_GLYPH.role, attrs: act("item", role.key) })).join("")}</p>` : note(readText("workbench.kit.no-allowing-role"));
  return `${entryHeader(entry)}${section(readText("workbench.kit.now"), now)}${section(readText("workbench.kit.tool-packs") + " " + packs.length, inPacks)}${section(readText("workbench.kit.tool-roles"), opened)}${usageBlock(entry)}${versionBlock(entry)}`;
}

/** The three 「开」 of MCP, each its own row with its own state and where it is changed (contract §4.3). */
function mcpDetail(kit: Kit, entry: Of<"mcp">, pack: KitPack): string {
  const ref = entry.ref, state = entry.mcp, rows = [];
  const library = goTo(readText("workbench.capabilities.capability-library"), "/capabilities/library", "ghost");
  if (ref.part === "outbound") {
    const clients = state.granted_to ?? [];
    rows.push({ name: readText("workbench.kit.server"), meaning: readText("workbench.kit.server-reachability"), mark: mark(readText("workbench.kit.runs-with-host"), "idle", "ready") });
    rows.push({ name: readText("workbench.kit.external-clients"), meaning: readText("workbench.kit.which-external-clients"), go: manage(entry, readText("workbench.capabilities.external-access")),
      mark: clients.length ? mark(readText("workbench.kit.allowed-clients", { n: clients.length, list: joined(clients.map(client => client.title)) }), "idle", "ready") : mark(readText("workbench.kit.nobody-granted"), "quiet", "idle") });
  } else if (ref.part === "server") {
    const parts = serverParts(kit, pack, ref.server_id), open = parts.filter(part => part.kind === "mcp" && part.mcp.action_available).length;
    rows.push({ name: readText("workbench.kit.server"), meaning: readText("workbench.kit.server-reachability"), mark: entryMark(entry), go: manage(entry) });
    rows.push({ name: readText("workbench.kit.external-clients"), meaning: readText("workbench.kit.which-external-clients"), mark: mark(readText("workbench.kit.inbound-only"), "quiet", "idle") });
    rows.push({ name: readText("workbench.kit.tools-available"), meaning: readText("workbench.kit.tools-registered-description"), go: library,
      mark: open === parts.length ? mark(readText("workbench.kit.all-registered", { total: parts.length }), parts.length ? "idle" : "quiet", parts.length ? "ready" : "idle")
        : mark(readText("workbench.kit.tools-open", { total: parts.length, open }), open ? "idle" : "hold", open ? "ready" : "unavailable") });
  } else rows.push({ name: readText("workbench.kit.tools-available"), meaning: readText("workbench.kit.registered-and-callable"), mark: entryMark(entry), go: library });
  const now = renderStateRows(rows) + note(readText("workbench.kit.inventory-read-only"));
  return `${entryHeader(entry)}${section(readText("workbench.kit.server-parts"), now)}${usageBlock(entry)}${entry.where.length ? section(readText("workbench.kit.where-used"), whereBlock(entry)) : ""}${versionBlock(entry)}`;
}

/** The line under a prompt's name in a list: its owner, or that it has no role of its own. */
export function promptSub(entry: KitEntry, reference = false): string {
  if (reference) return `${sourceTitle(entry)} · ${readText("workbench.kit.unassigned")}`;
  const change = entry.version.change;
  return change?.kind === "default_updated" ? readText("workbench.kit.default-updated-row", { base: change.base_version, latest: change.default_version }) : `${entry.version.label} · ${sourceTitle(entry)}`;
}

/** The line under an MCP row's name: whose it is and how many of its tools can be called. */
export function mcpSub(kit: Kit, pack: KitPack, entry: Of<"mcp">): string {
  if (entry.ref.part === "outbound") {
    const clients = entry.mcp.granted_to ?? [];
    return clients.length ? readText("workbench.kit.allowed-clients", { n: clients.length, list: joined(clients.map(client => client.title)) }) : readText("workbench.kit.nobody-granted");
  }
  if (entry.ref.part !== "server") return sourceTitle(entry);
  const parts = serverParts(kit, pack, entry.ref.server_id), open = parts.filter(part => part.kind === "mcp" && part.mcp.action_available).length;
  return `${sourceTitle(entry)} · ${open === parts.length ? readText("workbench.kit.all-registered", { total: parts.length }) : readText("workbench.kit.tools-open", { total: parts.length, open })}`;
}

export function entryDetail(kit: Kit, entry: KitEntry, pack: KitPack): string {
  if (entry.kind === "prompt") return promptDetail(kit, entry, pack);
  if (entry.kind === "role") return roleDetail(kit, entry, pack);
  if (entry.kind === "tool") return toolDetail(kit, entry);
  if (entry.kind === "mcp") return mcpDetail(kit, entry, pack);
  return "";
}

/** What the kit keeps of a Skill beside 08's block: its usage counted, where it applies, its version. */
export function skillOuter(entry: KitEntry): string {
  return `<section class="kit-outer" aria-label="${esc(readText("workbench.kit.extras"))}"><h4>${esc(readText("workbench.kit.extras"))}</h4>${usageBlock(entry, false)}${entry.where.length ? whereBlock(entry) : ""}${versionBlock(entry)}</section>`;
}
