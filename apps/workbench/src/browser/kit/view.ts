import type { KitEntry, KitKind } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { renderCells, renderDetailTrail, renderIconCounts, renderItemGroup, renderNowBlock } from "@molis-ai/molis-work-design-system/capability-pack";
import { icon, renderAlert, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, button, countOf, entriesOf, esc, goTo, isReference, itemsOf, joined, KIND_GLYPH, KINDS, L, mcpRows, note, section, statusLine, type Kit } from "./common.js";
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

const TRUST: Record<string, string> = { host: "随应用提供", pinned: "已信任发布者", home_local: "这台电脑" };
const KIND_COUNT: Record<KitKind, [string, string]> = {
  role: ["1 个角色", "{n} 个角色"], prompt: ["1 个提示词", "{n} 个提示词"], skill: ["1 个技能", "{n} 个技能"], mcp: ["1 个 MCP", "{n} 个 MCP"], tool: ["1 个工具", "{n} 个工具"],
};
const KIND_HAVE: Record<KitKind, string> = {
  role: "{n} 个能力包里有角色", prompt: "{n} 个能力包里有提示词", skill: "{n} 个能力包里有技能", mcp: "{n} 个能力包里有 MCP", tool: "{n} 个能力包里有工具",
};
const countName = (kind: KitKind, n: number) => n === 1 ? L(KIND_COUNT[kind][0]) : L(KIND_COUNT[kind][1], { n });

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
  const sourceLine = (pack: KitPack) => [pack.version?.label, pack.source?.publisher_label, pack.source ? L(TRUST[pack.source.trust] || "已信任发布者") : L(pack.kind === "builtin" ? "Molis Work 自带" : "你写的角色")]
    .filter(Boolean).join(" · ");

  function packRow(pack: KitPack): string {
    const state = packState(kit, pack), match = hitOf(pack);
    const sub = match.hit ? `<small>${esc(L("包含：{x}", { x: match.hit.name }))}</small>`
      : pack.state.kind === "uninstalled" || !KINDS.some(kind => countOf(kit, pack, kind)) ? `<small>${esc(sourceLine(pack))}</small>` : counts(pack);
    return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick"${pack.pack_id === view.pack ? ' aria-current="true"' : ""} data-kit-act="pack" data-kit-v="${esc(pack.pack_id)}" title="${esc(sourceLine(pack))}"><span class="mw-mark" aria-hidden="true">${icon("package")}</span><span><strong>${esc(pack.name)}</strong>${sub}</span><span class="mw-item__end">${state.mark}</span></button></li>`;
  }

  function packNow(pack: KitPack): string {
    const state = packState(kit, pack);
    const actions = pack.state.kind === "uninstalled" ? goTo(L("重新添加{owner}", { owner: pack.name }), pluginsHref)
      : pack.state.kind === "disabled" ? goTo(L("启用插件"), pluginsHref, "primary")
      : pack.kind === "plugin" ? goTo(L("在插件设置里管理"), pluginsHref, "ghost")
      : pack.manage ? goTo(L("在「{x}」里管理", { x: pack.manage.label }), pack.manage.href, "ghost") : "";
    return renderNowBlock({ status: statusLine(state.mark, state.body), actions, menu: exportMenu(kit, pack) });
  }

  function packContents(pack: KitPack): string {
    const shows = (kind: KitKind) => view.kind === "all" || view.kind === kind || (kind === "role" && view.kind === "prompt");
    const rows = pack.roles.filter(row => view.kind === "role" ? !isReference(pack, kit.byKey.get(row.role)) : view.kind === "prompt" ? row.prompts.length > 0 : true);
    const groups = rows.map(row => {
      const role = kit.byKey.get(row.role);
      if (!role) return "";
      const reference = isReference(pack, role);
      const where = reference ? L("Molis Work 自带的个人助理，这里只是引用") : role.where.length ? L("生效：{x}", { x: joined(role.where) }) : L("现在没有地方用它");
      return renderItemGroup({ glyph: "user", name: role.name, description: role.description, where, end: entryMark(role), label: L("它的提示词"),
        children: entriesOf(kit, row.prompts).map(prompt => entryRow(prompt, promptSub(prompt, reference), prompt.key === view.item)), empty: L("没有自己的提示词"),
        current: role.key === view.item, attrs: act("item", role.key) });
    }).join("");
    const skills = entriesOf(kit, pack.skills), mcp = mcpRows(kit, pack), tools = entriesOf(kit, pack.tools);
    const list = (entries: KitEntry[], sub: (entry: KitEntry) => string, none: string) => entries.length ? `<ul class="mw-items">${entries.map(entry => entryRow(entry, sub(entry), entry.key === view.item)).join("")}</ul>` : `<p class="kit-inline-empty">${esc(L(none))}</p>`;
    const cells = tools.length ? renderCells(tools.map(tool => ({ name: tool.name, code: tool.kind === "tool" && tool.ref.tool !== tool.name ? tool.ref.tool : undefined, tag: entryMark(tool), current: tool.key === view.item, attrs: act("item", tool.key) })))
      + note(L(pack.kind === "builtin" ? "全部 Agent 工具都放在这里。插件的包里列的，是它的角色用得到的那几个。" : "工具是系统的，几个包可以声明同一个。谁真正能用，由角色的工具名单决定，不在这里开关。")) : `<p class="kit-inline-empty">${esc(L("没有声明要用的工具。"))}</p>`;
    const upgraded = pack.upgraded && view.kind === "all" ? section(L("上次升级"), `<p class="kit-line">${icon("history")}<span>${esc(L("{from} → {to}，{at}", { from: pack.upgraded.from, to: pack.upgraded.to, at: new Date(pack.upgraded.at).toLocaleDateString(document.documentElement.lang || undefined) }))}</span></p>`) : "";
    return [
      shows("role") ? section(`${L("角色和它的提示词")} ${rows.length}`, rows.length ? `<ul class="mw-item-groups">${groups}</ul>` : `<p class="kit-inline-empty">${esc(L("没有搭配角色：包里的技能给哪个角色都能用。"))}</p>`) : "",
      shows("skill") ? section(`${L("技能")} ${skills.length}`, list(skills, entry => entry.description, "这个包没有技能。")) : "",
      shows("mcp") ? section(`MCP ${mcp.length}`, list(mcp, entry => entry.kind === "mcp" ? mcpSub(kit, pack, entry) : "", "这个包没有 MCP 服务器。")) : "",
      shows("tool") ? section(`${L("工具")} ${tools.length}`, cells) : "",
      upgraded,
    ].join("");
  }

  function packDetail(pack: KitPack): string {
    const back = renderButton({ label: L("全部能力包"), variant: "ghost", size: "sm", icon: "chevron-left", className: "mw-list-detail__back", attrs: act("unsel") });
    const source = sourceLine(pack);
    const head = `<header class="kit-packhead"><h3 tabindex="-1">${esc(pack.name)}</h3>${pack.description ? `<p>${esc(pack.description)}</p>` : ""}${source !== pack.name ? `<p class="kit-source">${esc(source)}</p>` : ""}</header>`;
    return back + head + packNow(pack) + (pack.state.kind === "uninstalled" ? "" : packContents(pack));
  }

  function itemDetail(pack: KitPack, entry: KitEntry): string {
    const role = entry.kind === "prompt" ? kit.byKey.get(pack.roles.find(row => row.prompts.includes(entry.key))?.role ?? "") : undefined;
    const trail = renderDetailTrail({ up: L("回到「{p}」", { p: pack.name }), path: [pack.name, ...(role ? [role.name] : []), entry.name], label: L("所在位置"), attrs: act("up") });
    return trail + (entry.kind === "skill" ? skillOuter(entry) : entryDetail(kit, entry, pack));
  }

  function summary(packs: readonly KitPack[]): string {
    const all = kit.catalog.packs, attention = all.filter(pack => packState(kit, pack).group === "na").length;
    const head = view.kind !== "all" ? L(KIND_HAVE[view.kind], { n: all.filter(kindOf).length })
      : attention ? L("{n} 个能力包　·　{na} 个有要处理的", { n: all.length, na: attention }) : L("{n} 个能力包", { n: all.length });
    const only = attention && view.group !== "na" ? button(L("只看要处理的"), { variant: "link", attrs: act("only-na") }) : "";
    return `<p class="kit-summary" role="status">${esc(head)}${packs.length ? only : ""}</p>`;
  }

  function onlyBuiltin(): string {
    if (kit.catalog.packs.some(pack => pack.kind === "plugin")) return "";
    return renderAlert({ title: L("还没有装别的能力包"), body: L("下面是 Molis Work 自带的。可以装一个能力包，或者把本机 Agent 里已有的技能导进来。"), tone: "info", role: null,
      actions: [{ label: L("从本机导入"), variant: "secondary", icon: "download", attrs: act("import-local") }, { label: L("安装能力包"), variant: "primary", attrs: act("install") }] });
  }

  return { shown, packRow, packDetail, itemDetail, summary, onlyBuiltin };
}
