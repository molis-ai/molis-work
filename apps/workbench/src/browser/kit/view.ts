import type { KitEntry, KitKind } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { renderCells, renderDetailTrail, renderIconCounts, renderItemGroup, renderNowBlock } from "@molis-ai/molis-work-design-system/capability-pack";
import { dateArg, icon, renderAlert, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, button, countOf, entriesOf, esc, goTo, isReference, itemsOf, joined, KIND_GLYPH, KINDS, readText, mcpRows, note, section, statusLine, type Kit } from "./common.js";
import { entryDetail, entryRow, mcpSub, promptSub, skillOuter } from "./details.js";
import { exportMenu, type Importing } from "./files.js";
import { entryMark, packState, type PackGroup } from "./states.js";

// What the 「能力包」 page shows for one read of the catalog and one view: which packs are listed, a pack's row, a pack beside the
// list, an entry in the pack's place under a way back, and the line above the list. page.ts keeps the state and draws these.

export interface View {
  pack?: string;
  item?: string;
  /** The entry the person came back from, to put the focus on its row again. */
  from?: string;
  query: string;
  kind: KitKind | "all";
  group: PackGroup | "all";
  /** Narrow: the detail side is the one shown. */
  detail: boolean;
  importing?: Importing;
}

const TRUST: Record<string, string> = { host: "workbench.settings-skills.included-with-the-app", pinned: "workbench.settings-skills.trusted-publisher", home_local: "workbench.kit.this-computer" };
const KIND_COUNT: Record<KitKind, [string, string]> = {
  role: ["workbench.kit.one-role", "workbench.kit.role-count"], prompt: ["workbench.kit.one-prompt", "workbench.kit.prompt-count"], skill: ["workbench.kit.one-skill", "workbench.kit.skill-count"], mcp: ["workbench.kit.one-mcp", "workbench.kit.mcp-count"], tool: ["workbench.kit.one-tool", "workbench.kit.tool-count"],
};
const KIND_HAVE: Record<KitKind, string> = {
  role: "workbench.kit.status-with-roles", prompt: "workbench.kit.status-with-prompts", skill: "workbench.kit.status-with-skills", mcp: "workbench.kit.status-with-mcp", tool: "workbench.kit.status-with-tools",
};
const countName = (kind: KitKind, n: number) => n === 1 ? readText(KIND_COUNT[kind][0]) : readText(KIND_COUNT[kind][1], { n });

export function packViews(kit: Kit, view: View, pluginsHref: string) {
  const kindOf = (pack: KitPack) => view.kind === "all" || countOf(kit, pack, view.kind) > 0;
  function hitOf(pack: KitPack): { ok: boolean; hit?: KitEntry } {
    const query = view.query.trim().toLocaleLowerCase();
    if (!query) return { ok: true };
    if ([pack.name, pack.description, pack.source?.title ?? ""].join(" ").toLocaleLowerCase().includes(query)) return { ok: true };
    const hit = itemsOf(kit, pack).find(entry => (view.kind === "all" || entry.kind === view.kind) && [entry.name, entry.description, entry.kind === "tool" ? entry.ref.tool : ""].join(" ").toLocaleLowerCase().includes(query));
    return hit ? { ok: true, hit } : { ok: false };
  }
  const shown = () => kit.catalog.packs.filter(pack => kindOf(pack) && hitOf(pack).ok && (view.group === "all" || packState(kit, pack).group === view.group))
    .sort((a, b) => Number(a.state.kind === "uninstalled") - Number(b.state.kind === "uninstalled"));

  function counts(pack: KitPack): string {
    const kinds = KINDS.filter(kind => (view.kind === "all" || view.kind === kind) && countOf(kit, pack, kind) > 0);
    return renderIconCounts(kinds.map(kind => { const n = countOf(kit, pack, kind); return { glyph: KIND_GLYPH[kind], value: String(n), name: countName(kind, n) }; }));
  }
  const sourceLine = (pack: KitPack) => [pack.version?.label, pack.source?.publisher_label, pack.source ? readText(TRUST[pack.source.trust] || "workbench.settings-skills.trusted-publisher") : readText(pack.kind === "builtin" ? "workbench.kit.builtin" : "workbench.kit.authored-roles")]
    .filter(Boolean).join(" · ");

  function packRow(pack: KitPack): string {
    const state = packState(kit, pack), match = hitOf(pack);
    const sub = match.hit ? `<small>${esc(readText("workbench.kit.contains", { x: match.hit.name }))}</small>`
      : pack.state.kind === "uninstalled" || !KINDS.some(kind => countOf(kit, pack, kind)) ? `<small>${esc(sourceLine(pack))}</small>` : counts(pack);
    return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick"${pack.pack_id === view.pack ? ' aria-current="true"' : ""} data-kit-act="pack" data-kit-v="${esc(pack.pack_id)}" title="${esc(sourceLine(pack))}"><span class="mw-mark" aria-hidden="true">${icon("package")}</span><span><strong>${esc(pack.name)}</strong>${sub}</span><span class="mw-item__end">${state.mark}</span></button></li>`;
  }

  function packNow(pack: KitPack): string {
    const state = packState(kit, pack);
    const actions = pack.state.kind === "uninstalled" ? goTo(readText("workbench.kit.add-again", { owner: pack.name }), pluginsHref)
      : pack.state.kind === "disabled" ? goTo(readText("workbench.home-plugin-page.enable-plugin"), pluginsHref, "primary")
      : pack.kind === "plugin" ? goTo(readText("workbench.kit.manage-plugin"), pluginsHref, "ghost")
      : pack.manage ? goTo(readText("workbench.kit.manage-in", { x: pack.manage.label }), pack.manage.href, "ghost") : "";
    return renderNowBlock({ status: statusLine(state.mark, state.body), actions, menu: exportMenu(kit, pack) });
  }

  function packContents(pack: KitPack): string {
    const shows = (kind: KitKind) => view.kind === "all" || view.kind === kind || (kind === "role" && view.kind === "prompt");
    const rows = pack.roles.filter(row => view.kind === "role" ? !isReference(pack, kit.byKey.get(row.role)) : view.kind === "prompt" ? row.prompts.length > 0 : true);
    const groups = rows.map(row => {
      const role = kit.byKey.get(row.role);
      if (!role) return "";
      const reference = isReference(pack, role);
      const where = reference ? readText("workbench.kit.assistant-reference") : role.where.length ? readText("workbench.kit.applies-in", { x: joined(role.where) }) : readText("workbench.kit.unused-now");
      return renderItemGroup({ glyph: "user", name: role.name, description: role.description, where, end: entryMark(role), label: readText("workbench.kit.its-prompts"),
        children: entriesOf(kit, row.prompts).map(prompt => entryRow(prompt, promptSub(prompt, reference), prompt.key === view.item)), empty: readText("workbench.kit.no-own-prompts"),
        current: role.key === view.item, attrs: act("item", role.key) });
    }).join("");
    const skills = entriesOf(kit, pack.skills), mcp = mcpRows(kit, pack), tools = entriesOf(kit, pack.tools);
    const list = (entries: KitEntry[], sub: (entry: KitEntry) => string, none: string) => entries.length ? `<ul class="mw-items">${entries.map(entry => entryRow(entry, sub(entry), entry.key === view.item)).join("")}</ul>` : `<p class="kit-inline-empty">${esc(readText(none))}</p>`;
    const cells = tools.length ? renderCells(tools.map(tool => ({ name: tool.name, code: tool.kind === "tool" && tool.ref.tool !== tool.name ? tool.ref.tool : undefined, tag: entryMark(tool), current: tool.key === view.item, attrs: act("item", tool.key) })))
      + note(readText(pack.kind === "builtin" ? "workbench.kit.builtin-tools" : "workbench.kit.tools-shared")) : `<p class="kit-inline-empty">${esc(readText("workbench.kit.no-tools"))}</p>`;
    const upgraded = pack.upgraded && view.kind === "all" ? section(readText("workbench.kit.last-upgrade"), `<p class="kit-line">${icon("history")}<span>${esc(readText("workbench.kit.upgrade-history", { from: pack.upgraded.from, to: pack.upgraded.to, at: dateArg(pack.upgraded.at, "date") }))}</span></p>`) : "";
    return [
      shows("role") ? section(`${readText("workbench.kit.roles-and-prompts")} ${rows.length}`, rows.length ? `<ul class="mw-item-groups">${groups}</ul>` : `<p class="kit-inline-empty">${esc(readText("workbench.kit.no-own-roles"))}</p>`) : "",
      shows("skill") ? section(`${readText("workbench.settings-skills.skills")} ${skills.length}`, list(skills, entry => entry.description, "workbench.kit.no-skills")) : "",
      shows("mcp") ? section(`MCP ${mcp.length}`, list(mcp, entry => entry.kind === "mcp" ? mcpSub(kit, pack, entry) : "", "workbench.kit.no-mcp")) : "",
      shows("tool") ? section(`${readText("workbench.context-toolbar.tools")} ${tools.length}`, cells) : "",
      upgraded,
    ].join("");
  }

  function packDetail(pack: KitPack): string {
    const back = renderButton({ label: readText("workbench.kit.all-kits"), variant: "ghost", size: "sm", icon: "chevron-left", className: "mw-list-detail__back", attrs: act("unsel") });
    const source = sourceLine(pack);
    const head = `<header class="kit-packhead"><h3 tabindex="-1">${esc(pack.name)}</h3>${pack.description ? `<p>${esc(pack.description)}</p>` : ""}${source !== pack.name ? `<p class="kit-source">${esc(source)}</p>` : ""}</header>`;
    return back + head + packNow(pack) + (pack.state.kind === "uninstalled" ? "" : packContents(pack));
  }

  function itemDetail(pack: KitPack, entry: KitEntry): string {
    const role = entry.kind === "prompt" ? kit.byKey.get(pack.roles.find(row => row.prompts.includes(entry.key))?.role ?? "") : undefined;
    const trail = renderDetailTrail({ up: readText("workbench.kit.back-to-kit", { p: pack.name }), path: [pack.name, ...(role ? [role.name] : []), entry.name], label: readText("workbench.kit.location"), attrs: act("up") });
    return trail + (entry.kind === "skill" ? skillOuter(entry) : entryDetail(kit, entry, pack));
  }

  function summary(packs: readonly KitPack[]): string {
    const all = kit.catalog.packs, attention = all.filter(pack => packState(kit, pack).group === "na").length;
    const total = readText("workbench.kit.status-total", { n: all.length });
    const head = view.kind !== "all" ? readText(KIND_HAVE[view.kind], { n: all.filter(kindOf).length })
      : attention ? readText("workbench.kit.status-with-attention", { total, attention: readText("workbench.kit.status-attention", { na: attention }) }) : total;
    const only = attention && view.group !== "na" ? button(readText("workbench.kit.only-attention"), { variant: "link", attrs: act("only-na") }) : "";
    return `<p class="kit-summary" role="status">${esc(head)}${packs.length ? only : ""}</p>`;
  }

  function onlyBuiltin(): string {
    if (kit.catalog.packs.some(pack => pack.kind === "plugin")) return "";
    return renderAlert({ title: readText("workbench.kit.no-extra-kits"), body: readText("workbench.kit.builtin-introduction"), tone: "info", role: null,
      actions: [{ label: readText("workbench.characters.import-local"), variant: "secondary", icon: "download", attrs: act("import-local") }, { label: readText("workbench.kit.install"), variant: "primary", attrs: act("install") }] });
  }

  return { shown, packRow, packDetail, itemDetail, summary, onlyBuiltin };
}
