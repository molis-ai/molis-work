import type { KitEntry, KitToolOrigin } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { KitPack } from "@molis-ai/molis-work-contracts/services/kit";
import { renderNowBlock, renderPickRow, renderStateRows, renderUsage } from "@molis-ai/molis-work-design-system/capability-pack";
import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, badge, button, esc, goTo, isReference, joined, KIND_GLYPH, KIND_WORD, L, mark, note, section, serverParts, sourceTitle, statusLine, type Kit } from "./common.js";
import { entryMark, reasonWord } from "./states.js";

// One entry of a pack, opened in the pack's place (README 「画面」): what it is and where it comes from, its state now and where it is
// changed, its usage with what the count covers, where it applies, and its version. Skills are not here: they are 08's block.

type Of<K extends KitEntry["kind"]> = Extract<KitEntry, { kind: K }>;

const when = (at: string) => new Date(at).toLocaleString(document.documentElement.lang || undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** The row that opens an entry; inside a pack it remembers what opened it, so 回到「包」 can put the focus back there. */
export function entryRow(entry: KitEntry, sub: string, current: boolean): string {
  return renderPickRow({ glyph: KIND_GLYPH[entry.kind], name: entry.name, sub, end: entryMark(entry), current, attrs: act("item", entry.key) });
}

export function entryHeader(entry: KitEntry): string {
  const code = entry.kind === "tool" && entry.ref.tool !== entry.name ? ` <code class="kit-code">${esc(entry.ref.tool)}</code>` : "";
  const version = entry.kind === "tool" ? "" : `<span class="kit-dot">·</span><span>${esc(entry.version.label)}</span>`;
  return `<header><span class="kit-kind">${icon(KIND_GLYPH[entry.kind])}${esc(L(KIND_WORD[entry.kind]))}</span><h3 tabindex="-1">${esc(entry.name)}${code}</h3>${entry.description ? `<p>${esc(entry.description)}</p>` : ""}
    <p class="kit-source">${icon("package")}<span>${esc(sourceTitle(entry))}</span>${version}<span class="kit-dot">·</span>${badge(L(entry.scope === "home" ? "个人空间" : "这个项目"), entry.scope === "home" ? "info" : "neutral")}</p></header>`;
}

/** Usage says only what its records can (contract §4.4): recent uses with how long they are kept, or only the last one, or none. */
export function usageBlock(entry: KitEntry, withLast = true): string {
  const usage = entry.usage;
  if (usage.kind === "not_counted") return "";
  if (usage.kind === "none") return section(L("用量"), renderUsage({ head: L("还没有使用记录") }));
  const last = withLast && usage.last_at ? L("最近一次 {at}", { at: when(usage.last_at) }) : undefined;
  if (usage.kind === "last_only") return section(L("用量"), renderUsage({ head: L("只有最近一次"), last, scope: L("这一类只记最近一次是什么时候。") }));
  const scope = "rows_per_key" in usage.kept ? L("每一条只留最近 {n} 次记录，这里不是总数。", { n: usage.kept.rows_per_key }) : L("只算近 {n} 天的记录。", { n: usage.kept.days });
  return section(L("用量"), renderUsage({ figure: usage.count, head: L("近期 {n} 次", { n: usage.count }), last, scope }));
}

export function whereBlock(entry: KitEntry, empty = "还没有地方用到它"): string {
  return entry.where.length ? `<ul class="mw-items kit-places">${entry.where.map(place => `<li class="mw-item"><span class="mw-mark" aria-hidden="true">${icon("target")}</span><span><strong>${esc(place)}</strong></span></li>`).join("")}</ul>` : note(L(empty));
}

function versionBlock(entry: KitEntry): string {
  const change = entry.version.change;
  const line = !change ? "" : change.kind === "default_updated"
    ? L("你的版本基于第 {base} 版；默认现在是第 {latest} 版。", { base: change.base_version, latest: change.default_version })
    : L("上次读清单：新增 {added}，移除 {removed}，变了 {changed}。", { added: change.added, removed: change.removed, changed: change.changed });
  return section(L("版本与升级"), `<p class="kit-line">${icon("history")}<span>${esc(entry.version.label)}</span></p>${line ? `<p class="kit-line">${esc(line)}</p>` : ""}`);
}

const manage = (entry: KitEntry, label?: string) => entry.manage ? goTo(label ?? L("在「{x}」里管理", { x: entry.manage.label }), entry.manage.href) : "";
/** When an entry cannot be used now: the owner's word for why, and its detail. */
const unavailable = (entry: KitEntry) => entry.availability.available ? "" : statusLine(entryMark(entry), entry.availability.detail ?? reasonWord(entry));

function promptDetail(kit: Kit, entry: Of<"prompt">, pack: KitPack): string {
  const row = pack.roles.find(candidate => candidate.prompts.includes(entry.key)), role = row && kit.byKey.get(row.role);
  const owner = role ? `<p class="kit-line">${icon("user")}<span>${esc(isReference(pack, role) ? L("没有归属角色，默认归「{r}」", { r: role.name }) : L("属于角色「{r}」", { r: role.name }))}</span></p>` : "";
  const change = entry.version.change;
  const words = change?.kind === "default_updated" ? L("用的是你的版本，基于第 {base} 版；默认已更新到第 {latest} 版。", { base: change.base_version, latest: change.default_version })
    : L(entry.prompt.edited ? "用的是你的版本。" : "用的是默认版。");
  const now = renderNowBlock({ status: owner + (unavailable(entry) || statusLine(entryMark(entry), words)), note: L("这里不显示正文。改写、对比和恢复默认都在「提示词」里，从下一轮生效。"),
    actions: manage(entry, L("在提示词里改")) });
  return `${entryHeader(entry)}${section(L("现在"), now)}${usageBlock(entry)}${section(L("用在哪"), whereBlock(entry))}${versionBlock(entry)}`;
}

function roleDetail(kit: Kit, entry: Of<"role">, pack: KitPack): string {
  const prompts = (pack.roles.find(row => row.role === entry.key)?.prompts ?? []).map(key => kit.byKey.get(key)).filter((prompt): prompt is KitEntry => Boolean(prompt));
  const tools = entry.role.host_tools.map(name => kit.catalog.entries.find(candidate => candidate.kind === "tool" && candidate.ref.tool === name));
  const now = renderNowBlock({ status: unavailable(entry) || statusLine(entryMark(entry), L("在这些地方生效")), note: entry.where.length ? undefined : L("现在没有地方用它"), actions: manage(entry) });
  const chips = entry.role.host_tools.length ? `<p class="kit-chips">${entry.role.host_tools.map((name, index) => {
    const tool = tools[index];
    return tool ? button(tool.name, { icon: KIND_GLYPH.tool, attrs: act("item", tool.key) }) : badge(name);
  }).join("")}</p>${note(L("只是说明，不是授权：真正能用什么，由角色的工具名单和动作授权决定。"))}` : note(L("没有声明工具"));
  const list = prompts.length ? `<ul class="mw-items">${prompts.map(prompt => entryRow(prompt, promptSub(prompt), false)).join("")}</ul>` : note(L("没有自己的提示词"));
  return `${entryHeader(entry)}${section(L("现在"), now + (entry.where.length ? whereBlock(entry) : ""))}${section(L("它的提示词") + " " + prompts.length, list)}${section(L("声明能用的工具"), chips)}${usageBlock(entry)}${versionBlock(entry)}`;
}

const ORIGIN: Record<KitToolOrigin, string> = {
  runtime: "Molis Work 自带的工具", gateway: "Molis Work 自带的工具：经平台调用动作", business: "Molis Work 自带的工具：读写这个项目的记录",
  subagent: "Molis Work 自带的工具：交给子代理", "plan-step": "Molis Work 自带的工具：记下这一轮的步骤", builder: "Molis Work 自带的工具：插件创作台用",
};

function toolDetail(kit: Kit, entry: Of<"tool">): string {
  const packs = (entry.in_packs ?? [entry.pack]).map(id => kit.catalog.packs.find(pack => pack.pack_id === id)).filter((pack): pack is KitPack => Boolean(pack));
  const roles = kit.catalog.entries.filter((role): role is Of<"role"> => role.kind === "role" && role.role.host_tools.includes(entry.ref.tool));
  const now = renderNowBlock({ status: statusLine(entryMark(entry), L(ORIGIN[entry.tool.origin])), note: L("工具不能在这里开关。谁能用它，由角色的工具名单和动作授权决定。") });
  const inPacks = `<p class="kit-chips">${packs.map(pack => button(pack.name, { icon: "package", attrs: act("pack", pack.pack_id) })).join("")}</p>`;
  const opened = roles.length ? `<p class="kit-chips">${roles.map(role => button(role.name, { icon: KIND_GLYPH.role, attrs: act("item", role.key) })).join("")}</p>` : note(L("还没有角色开放它"));
  return `${entryHeader(entry)}${section(L("现在"), now)}${section(L("在这些能力包里") + " " + packs.length, inPacks)}${section(L("开放给这些角色"), opened)}${usageBlock(entry)}${versionBlock(entry)}`;
}

/** The three 「开」 of MCP, each its own row with its own state and where it is changed (contract §4.3). */
function mcpDetail(kit: Kit, entry: Of<"mcp">, pack: KitPack): string {
  const ref = entry.ref, state = entry.mcp, rows = [];
  const library = goTo(L("能力库"), "/capabilities/library", "ghost");
  if (ref.part === "outbound") {
    const clients = state.granted_to ?? [];
    rows.push({ name: L("服务器"), meaning: L("服务器有没有在跑、连不连得上"), mark: mark(L("随 Molis Work 一起运行"), "idle", "ready") });
    rows.push({ name: L("给外部客户端"), meaning: L("哪些外部 AI 工具能连它"), go: manage(entry, L("对外接入")),
      mark: clients.length ? mark(L("开给 {n} 个：{list}", { n: clients.length, list: joined(clients.map(client => client.title)) }), "idle", "ready") : mark(L("还没开给谁"), "quiet", "idle") });
  } else if (ref.part === "server") {
    const parts = serverParts(kit, pack, ref.server_id), open = parts.filter(part => part.kind === "mcp" && part.mcp.action_available).length;
    rows.push({ name: L("服务器"), meaning: L("服务器有没有在跑、连不连得上"), mark: entryMark(entry), go: manage(entry) });
    rows.push({ name: L("给外部客户端"), meaning: L("哪些外部 AI 工具能连它"), mark: mark(L("不适用：这是接进来的服务器"), "quiet", "idle") });
    rows.push({ name: L("工具可用"), meaning: L("它的工具里，有几个登记成动作、能被调用"), go: library,
      mark: open === parts.length ? mark(L("{total} 个都已登记", { total: parts.length }), parts.length ? "idle" : "quiet", parts.length ? "ready" : "idle")
        : mark(L("{total} 个里开放 {open} 个", { total: parts.length, open }), open ? "idle" : "hold", open ? "ready" : "unavailable") });
  } else rows.push({ name: L("工具可用"), meaning: L("登记成动作、能被调用"), mark: entryMark(entry), go: library });
  const now = renderStateRows(rows) + note(L("列目录只读已存的清单，不会去连服务器。"));
  return `${entryHeader(entry)}${section(L("开没开：分开看"), now)}${usageBlock(entry)}${entry.where.length ? section(L("用在哪"), whereBlock(entry)) : ""}${versionBlock(entry)}`;
}

/** The line under a prompt's name in a list: its owner, or that it has no role of its own. */
export function promptSub(entry: KitEntry, reference = false): string {
  if (reference) return `${sourceTitle(entry)} · ${L("没有归属角色，默认归个人助理")}`;
  const change = entry.version.change;
  return change?.kind === "default_updated" ? L("你的版本基于第 {base} 版；默认现在是第 {latest} 版", { base: change.base_version, latest: change.default_version }) : `${entry.version.label} · ${sourceTitle(entry)}`;
}

/** The line under an MCP row's name: whose it is and how many of its tools can be called. */
export function mcpSub(kit: Kit, pack: KitPack, entry: Of<"mcp">): string {
  if (entry.ref.part === "outbound") {
    const clients = entry.mcp.granted_to ?? [];
    return clients.length ? L("开给 {n} 个：{list}", { n: clients.length, list: joined(clients.map(client => client.title)) }) : L("还没开给谁");
  }
  if (entry.ref.part !== "server") return sourceTitle(entry);
  const parts = serverParts(kit, pack, entry.ref.server_id), open = parts.filter(part => part.kind === "mcp" && part.mcp.action_available).length;
  return `${sourceTitle(entry)} · ${open === parts.length ? L("{total} 个都已登记", { total: parts.length }) : L("{total} 个里开放 {open} 个", { total: parts.length, open })}`;
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
  return `<section class="kit-outer" aria-label="${esc(L("能力包另记的"))}"><h4>${esc(L("能力包另记的"))}</h4>${usageBlock(entry, false)}${entry.where.length ? whereBlock(entry) : ""}${versionBlock(entry)}</section>`;
}

