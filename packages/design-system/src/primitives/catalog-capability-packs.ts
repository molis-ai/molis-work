// The board's specimens of the AI kit parts (capability-pack.ts holds the parts: their rules and renderers, shared with the
// 「能力包」 settings page). Only the board's own layout of the specimens is added here.
import { escapeHtml, icon, renderAttrs, renderBadge, renderButton, renderStatusMark, type AttrValue, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMenuGroup, renderMenuItem } from "./overlay.js";
import { section, specimen } from "./catalog-parts.js";
import type { Say } from "./catalog-composer.js";
import { statusLine } from "./catalog-skill-packs.js";
import {
  CAPABILITY_PACK_STYLES, renderCells, renderDetailTrail, renderIconCounts, renderItemGroup, renderNowBlock, renderPickRow, renderStateRows, renderUsage, type NowMenu,
} from "./capability-pack.js";

export const CAPABILITY_PACK_BOARD_STYLES = CAPABILITY_PACK_STYLES + `
  .mw-catalog :is([data-primitive="now-block"], [data-primitive="item-group"], [data-primitive="cell-grid"], [data-primitive="detail-trail"], [data-primitive="icon-counts"], [data-primitive="state-rows"], [data-primitive="usage-figure"]) .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  .mw-catalog :is([data-primitive="now-block"], [data-primitive="item-group"], [data-primitive="cell-grid"], [data-primitive="detail-trail"], [data-primitive="icon-counts"], [data-primitive="state-rows"], [data-primitive="usage-figure"]) .mw-catalog__row { display: grid; gap: 10px; min-width: 0; }
  .mw-catalog [data-primitive="icon-counts"] .mw-items { width: 100%; }
  .mw-catalog :is([data-primitive="sticky-detail"], [data-primitive="state-rows"]) .mw-catalog__specimens { grid-template-columns: minmax(0, 1fr); }
  .mw-catalog [data-primitive="sticky-detail"] .mw-catalog__row { display: block; }
  .mw-catalog [data-sticky-frame] { height: var(--settings-view-h); overflow: auto; padding: 12px; border-radius: var(--sk-r-item, 8px); box-shadow: inset 0 0 0 1px var(--line); }
  .mw-catalog [data-sticky-frame] > p { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
`;

/* ---------- the board's specimens (made up; nothing is read from a Home). Fixed text is read from the board and Workbench packs. ---------- */

const hold = (word: string) => renderStatusMark({ label: word, tone: "hold", state: "unavailable" });
const inUse = (word: string) => renderStatusMark({ label: word, tone: "idle", state: "ready" });
const go = (say: Say, label: string) => renderButton({ label: say(label), variant: "ghost", size: "sm", icon: "arrow" });

/** The board draws this menu three times; each copy names its items after its own id, so no described item's id repeats. */
function exportMenu(say: Say, id: string, withPrompts = true): NowMenu {
  const items = [
    renderMenuItem({ label: say("workbench.kit.whole-kit"), description: say("workbench.catalog-kit.the-content-package-as-signed-plus-your"), iconName: "package", id: `${id}-pack` }),
    ...(withPrompts ? [renderMenuItem({ label: say("workbench.kit.export-edits", { n: 1 }), description: say("workbench.kit.export-edits-description"), iconName: "text", id: `${id}-prompts` })] : []),
    renderMenuItem({ label: say("workbench.catalog-kit.role-tool-and-mcp-references"), description: say("workbench.kit.reference-data"), iconName: "link", id: `${id}-refs` }),
  ].join("");
  return { id, label: say("workbench.kit.export-kit"), icon: "download", items: renderMenuGroup({ label: say("workbench.kit.export-kit-title", { p: say("workbench.catalog-kit.writing-tools") }), items }) };
}

export function nowBlockSection(say: Say): string {
  const manage = renderButton({ label: say("workbench.kit.manage-plugin"), variant: "ghost", size: "sm", icon: "arrow" });
  return section("now-block", say("workbench.catalog-kit.state-and-next-steps"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-kit.needs-a-look-each-item-named-the"), renderNowBlock({ status: statusLine(hold(say("workbench.catalog-kit.sample-1-needs-a-look")), say("workbench.catalog-kit.schedule-meetings-unavailable-for-now")), actions: manage, menu: exportMenu(say, "now-export-a") }))}
    ${specimen(say("workbench.catalog-kit.in-use-one-sentence"), renderNowBlock({ status: statusLine(inUse(say("workbench.appearance-picker.use")), say("workbench.kit.all-available")), actions: manage, menu: exportMenu(say, "now-export-b", false) }))}
    ${specimen(say("workbench.catalog-kit.plugin-off-the-way-on-is-turning"), renderNowBlock({ status: statusLine(renderStatusMark({ label: say("workbench.characters.disabled"), tone: "quiet", state: "paused" }), say("workbench.kit.disabled-description")),
      actions: renderButton({ label: say("workbench.home-plugin-page.enable-plugin"), variant: "primary", size: "sm" }) }))}
    ${specimen(say("workbench.catalog-kit.an-entrys-now-a-note-under-it"), renderNowBlock({ status: statusLine(renderStatusMark({ label: say("workbench.settings-prompts.default-updated"), tone: "attention", state: "stale" }), say("workbench.catalog-kit.using-your-version-based-on-version-3")),
      note: say("workbench.kit.prompts-edit-elsewhere"),
      actions: renderButton({ label: say("workbench.catalog-kit.compare-with-new-default"), variant: "secondary", size: "sm", icon: "arrow" }) + renderButton({ label: say("workbench.kit.edit-prompts"), variant: "secondary", size: "sm", icon: "arrow" }) }))}
  </div>`);
}

function promptRow(say: Say, name: string, sub: string, word: string, current = false): string {
  return renderPickRow({ glyph: "text", name: say(name), sub: say(sub), end: word === "workbench.settings-prompts.default-updated" ? renderStatusMark({ label: say(word), tone: "attention", state: "stale" }) : inUse(say(word)), current });
}

export function itemGroupSection(say: Say): string {
  const editor = renderItemGroup({ glyph: "user", name: say("workbench.catalog-kit.writing-editor"), description: say("workbench.catalog-kit.edits-drafts-trims-length-evens-the-tone"), where: say("workbench.catalog-kit.applies-in-assistant-pages"), end: inUse(say("workbench.appearance-picker.use")), label: say("workbench.kit.its-prompts"),
    children: [promptRow(say, "workbench.catalog-kit.writing-editors-brief", "workbench.catalog-kit.writing-tools-default-version-2", "workbench.settings-prompts.default", true), promptRow(say, "workbench.catalog-kit.tone-rules", "workbench.catalog-kit.your-version-is-based-on-version-3", "workbench.settings-prompts.default-updated")], empty: say("workbench.kit.no-own-prompts") });
  const reference = renderItemGroup({ glyph: "user", name: say("workbench.catalog-kit.personal-assistant"), description: say("workbench.catalog-kit.the-assistant-you-talk-to-every-day"), where: say("workbench.kit.assistant-reference"), end: inUse(say("workbench.appearance-picker.use")), label: say("workbench.kit.its-prompts"),
    children: [promptRow(say, "workbench.catalog-kit.outline-rules", "workbench.catalog-kit.writing-tools-no-role-of-its-own", "workbench.settings-prompts.default")], empty: say("workbench.kit.no-own-prompts") });
  const none = renderItemGroup({ glyph: "user", name: say("workbench.catalog-kit.reviewer"), description: say("workbench.catalog-kit.checks-changes-without-writing"), where: say("workbench.kit.unused-now"), end: renderStatusMark({ label: say("workbench.characters.disabled"), tone: "quiet", state: "paused" }), label: say("workbench.kit.its-prompts"),
    children: [], empty: say("workbench.kit.no-own-prompts") });
  return section("item-group", say("workbench.catalog-kit.item-group"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-kit.the-parent-row-can-be-chosen-its"), `<ul class="mw-item-groups">${editor}</ul>`)}
    ${specimen(say("workbench.catalog-kit.a-reference-row-and-one-with-no"), `<ul class="mw-item-groups">${reference}${none}</ul>`)}
  </div>`);
}

function tools(say: Say, current = ""): string {
  const writes = (word: string) => renderBadge({ label: say(word), tone: word === "workbench.kit.writes" ? "warning" : "neutral" });
  return renderCells([
    { name: say("workbench.catalog-kit.read-a-file"), code: "read_file", tag: writes("workbench.characters.execution-read-only") }, { name: say("workbench.catalog-kit.write-file"), code: "write_file", tag: writes("workbench.kit.writes") },
    { name: say("workbench.catalog-kit.run-command"), code: "run_command", tag: writes("workbench.kit.writes") }, { name: say("workbench.catalog-kit.search-the-web"), code: "web_search", tag: writes("workbench.characters.execution-read-only") },
    { name: say("workbench.catalog-kit.hand-the-change-to-a-sub-agent"), code: "delegate_to_subagent", tag: writes("workbench.characters.execution-read-only") },
  ].map((cell) => ({ ...cell, current: cell.code === current })));
}

export function cellGridSection(say: Say): string {
  return section("cell-grid", say("workbench.catalog-kit.compact-cells"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-kit.the-whole-cell-is-a-button-name"), tools(say, "run_command"))}
    ${specimen(say("workbench.catalog-kit.two-columns-where-narrow-a-long-name"), `<div style="width: min(340px, 100%)">${tools(say)}</div>`)}
  </div>`);
}

export function detailTrailSection(say: Say): string {
  const head = (title: string, body: string) => `<header><h3 tabindex="-1">${escapeHtml(say(title))}</h3><p>${escapeHtml(say(body))}</p></header>`;
  return section("detail-trail", say("workbench.catalog-kit.third-level-trail"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-kit.kit-role-this-entry"), `<div class="mw-list-detail__detail">${renderDetailTrail({ up: say("workbench.kit.back-to-kit", { p: say("workbench.catalog-kit.writing-tools") }), path: [say("workbench.catalog-kit.writing-tools"), say("workbench.catalog-kit.writing-editor"), say("workbench.catalog-kit.writing-editors-brief")], label: say("workbench.kit.location") })}${head("workbench.catalog-kit.writing-editors-brief", "workbench.catalog-kit.what-the-writing-editor-reads-before-every")}</div>`)}
    ${specimen(say("workbench.catalog-kit.a-long-path-wraps-instead-of-being"), `<div class="mw-list-detail__detail">${renderDetailTrail({ up: say("workbench.kit.back-to-kit", { p: say("workbench.catalog-kit.imported-here-claude-code") }), path: [say("workbench.catalog-kit.imported-here-claude-code"), say("workbench.catalog-kit.turn-a-meeting-recording-into-minutes-with")], label: say("workbench.kit.location") })}${head("workbench.catalog-kit.turn-a-meeting-recording-into-minutes-with", "workbench.catalog-skill-packs.after-a-meeting-turns-the-transcript-into-minutes")}</div>`)}
  </div>`);
}

/** The counts of one pack, in the order the pack's sections come. */
function packCounts(say: Say, counts: Readonly<Record<"role" | "prompt" | "skill" | "mcp" | "tool", number | "—">>): string {
  const glyph: Record<string, PluginIconName> = { role: "user", prompt: "text", skill: "book", mcp: "network", tool: "wand" };
  const whole: Record<string, string> = { role: "workbench.catalog-kit.n-n-role-roles", prompt: "workbench.catalog-kit.n-n-prompt-prompts", skill: "workbench.catalog-kit.n-n-skill-skills", mcp: "workbench.kit.mcp-count", tool: "workbench.catalog-kit.n-n-tool-tools" };
  return renderIconCounts(Object.entries(counts).filter(([, n]) => n !== 0).map(([kind, n]) => ({ glyph: glyph[kind]!, value: String(n),
    name: n === "—" ? say("workbench.catalog-kit.mcp-couldnt-be-read") : say(whole[kind]!, { n }) })));
}

function packRow(say: Say, name: string, counts: Parameters<typeof packCounts>[1], end: string, current = false, attrs?: Record<string, AttrValue>): string {
  return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick"${current ? ' aria-current="true"' : ""}${renderAttrs(attrs)}><span class="mw-mark" aria-hidden="true">${icon("package")}</span><span><strong>${
    escapeHtml(name)}</strong>${packCounts(say, counts)}</span><span class="mw-item__end">${end}</span></button></li>`;
}

export function iconCountsSection(say: Say): string {
  return section("icon-counts", say("workbench.catalog-kit.icon-counts"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-kit.in-a-list-row-one-glyph-one"), `<ul class="mw-items">${packRow(say, say("workbench.catalog-kit.writing-tools"), { role: 2, prompt: 3, skill: 3, mcp: 0, tool: 3 }, hold(say("workbench.catalog-kit.sample-1-needs-a-look")))}${
      packRow(say, "Coding", { role: 2, prompt: 2, skill: 0, mcp: "—", tool: 6 }, hold(say("workbench.kit.incomplete")))}${packRow(say, "Feed", { role: 0, prompt: 2, skill: 0, mcp: 0, tool: 1 }, inUse(say("workbench.appearance-picker.use")))}</ul>`)}
    ${specimen(say("workbench.catalog-kit.on-its-own-what-couldnt-be-read"), packCounts(say, { role: 2, prompt: 2, skill: 0, mcp: "—", tool: 6 }))}
  </div>`);
}

function mcpRows(say: Say, broken = false): string {
  return renderStateRows([
    { name: say("workbench.kit.server"), meaning: say("workbench.kit.server-reachability"), mark: broken ? hold(say("workbench.kit.disconnected")) : inUse(say("workbench.catalog-kit.on")), fact: broken ? undefined : say("workbench.kit.runs-with-host"), go: broken ? go(say, "workbench.catalog-kit.reconnect") : undefined },
    { name: say("workbench.kit.external-clients"), meaning: say("workbench.kit.which-external-clients"), mark: inUse(say("workbench.kit.allowed-clients", { n: 2, list: "Claude Code、Codex" })), go: go(say, "workbench.capabilities.external-access") },
    { name: say("workbench.kit.tools-available"), meaning: say("workbench.kit.tools-registered-description"), mark: inUse(say("workbench.kit.tools-open", { total: 14, open: 12 })), go: go(say, "workbench.capabilities.capability-library") },
  ]);
}

export function stateRowsSection(say: Say): string {
  return section("state-rows", say("workbench.catalog-kit.state-rows"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-kit.three-on-s-one-row-each"), mcpRows(say))}
    ${specimen(say("workbench.catalog-kit.narrow-the-way-there-moves-to-the"), `<div style="width: min(300px, 100%)">${mcpRows(say, true)}</div>`)}
  </div>`);
}

export function usageSection(say: Say): string {
  return section("usage-figure", say("workbench.catalog-kit.usage"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-kit.recent-uses-the-number-the-last-use"), renderUsage({ figure: 12, head: say("workbench.catalog-kit.n-recent-n-use-uses", { n: 12 }), last: say("workbench.catalog-kit.last-used-yesterday-17-40-assistant"), scope: say("workbench.catalog-kit.each-prompt-keeps-its-last-200-uses") }))}
    ${specimen(say("workbench.catalog-kit.last-use-only-no-number"), renderUsage({ head: say("workbench.kit.last-use"), last: say("workbench.catalog-kit.last-used-3-days-ago-coding"), scope: say("workbench.catalog-kit.for-tools-only-the-time-of-the") }))}
    ${specimen(say("workbench.kit.unused-records"), renderUsage({ head: say("workbench.kit.unused-records") }))}
  </div>`);
}

/* 8 · The composed specimen: the pack list beside one pack; an entry opens in place under the third-level trail. */
function detailOf(key: string, title: string, body: string, inner: string, shown: boolean, back: string): string {
  return `<section class="mw-list-detail__detail" data-list-panel="${key}" aria-labelledby="${key}-title"${shown ? "" : " hidden"}>${back}<header><h3 id="${key}-title" tabindex="-1">${
    escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></header>${inner}</section>`;
}

const sec = (title: string, body: string) => `<section class="mw-list-detail__group"><h4>${escapeHtml(title)}</h4>${body}</section>`;

export function stickyDetailSection(say: Say): string {
  const id = "sticky";
  const back = renderButton({ label: say("workbench.kit.all-kits"), variant: "ghost", size: "sm", icon: "chevron-left", className: "mw-list-detail__back", attrs: { "data-list-back": "" } });
  const open = (item: string) => ({ "data-list-open": `${id}-${item}` });
  const roles = `<ul class="mw-item-groups">${renderItemGroup({ glyph: "user", name: say("workbench.catalog-kit.writing-editor"), description: say("workbench.catalog-kit.edits-drafts-trims-length-evens-the-tone"), where: say("workbench.catalog-kit.applies-in-assistant-pages"), end: inUse(say("workbench.appearance-picker.use")), label: say("workbench.kit.its-prompts"),
    attrs: open("editor"), children: [renderPickRow({ glyph: "text", name: say("workbench.catalog-kit.writing-editors-brief"), sub: say("workbench.catalog-kit.writing-tools-default-version-2"), end: inUse(say("workbench.settings-prompts.default")), attrs: open("brief") })], empty: say("workbench.kit.no-own-prompts") })}</ul>`;
  const skills = `<ul class="mw-items">${["workbench.catalog-skill-packs.write-the-weekly-review", "workbench.catalog-kit.meeting-notes", "workbench.catalog-kit.schedule-meetings"].map((name, index) => renderPickRow({ glyph: "book", name: say(name), sub: say("workbench.catalog-kit.writing-tools-2-0"),
    end: index === 2 ? hold(say("workbench.catalog-skill-packs.unavailable-for-now")) : renderStatusMark({ label: say("workbench.catalog-skill-packs.automatic"), tone: "idle", state: "ready" }), attrs: open(index === 2 ? "schedule" : `skill-${index}`) })).join("")}</ul>`;
  const toolCells = renderCells([{ name: say("workbench.catalog-kit.read-a-file"), code: "read_file", tag: renderBadge({ label: say("workbench.characters.execution-read-only"), tone: "neutral" }), attrs: open("read") },
    { name: say("workbench.catalog-kit.write-file"), code: "write_file", tag: renderBadge({ label: say("workbench.kit.writes"), tone: "warning" }), attrs: open("write") },
    { name: say("workbench.catalog-kit.search-the-web"), code: "web_search", tag: renderBadge({ label: say("workbench.characters.execution-read-only"), tone: "neutral" }), attrs: open("search") }]);
  const writing = renderNowBlock({ status: statusLine(hold(say("workbench.catalog-kit.sample-1-needs-a-look")), say("workbench.catalog-kit.schedule-meetings-unavailable-for-now")), actions: renderButton({ label: say("workbench.kit.manage-plugin"), variant: "ghost", size: "sm", icon: "arrow" }), menu: exportMenu(say, `${id}-export`) });
  const packBody = `${writing}${sec(say("workbench.kit.roles-and-prompts"), roles)}${sec(say("workbench.settings-skills.skills"), skills)}${sec(say("workbench.context-toolbar.tools"), toolCells)}${sec(say("workbench.kit.last-upgrade"), `<p class="mw-list-detail__used">${escapeHtml(say("workbench.catalog-kit.sample-1-4-2-0-added-schedule-meetings"))}</p>`)}`;
  const trail = (name: string, middle?: string) => renderDetailTrail({ up: say("workbench.kit.back-to-kit", { p: say("workbench.catalog-kit.writing-tools") }), path: [say("workbench.catalog-kit.writing-tools"), ...(middle ? [say(middle)] : []), say(name)], label: say("workbench.kit.location") });
  const item = (key: string, name: string, about: string, inner: string, middle?: string) =>
    detailOf(`${id}-${key}`, say(name), say(about), inner, false, trail(name, middle)).replace(`data-list-panel="${id}-${key}"`, `data-list-panel="${id}-${key}" data-list-item`);
  const usage = renderUsage({ figure: 12, head: say("workbench.catalog-kit.n-recent-n-use-uses-2", { n: 12 }), last: say("workbench.catalog-kit.last-used-yesterday-17-40-assistant"), scope: say("workbench.catalog-kit.each-prompt-keeps-its-last-200-uses") });
  const items = [
    item("brief", "workbench.catalog-kit.writing-editors-brief", "workbench.catalog-kit.what-the-writing-editor-reads-before-every", `${renderNowBlock({ status: statusLine(inUse(say("workbench.settings-prompts.default")), say("workbench.catalog-kit.using-the-default-version-2")), note: say("workbench.kit.prompts-edit-elsewhere"), actions: go(say, "workbench.kit.edit-prompts") })}${sec(say("workbench.assistant-side-context.usage"), usage)}`, "workbench.catalog-kit.writing-editor"),
    item("editor", "workbench.catalog-kit.writing-editor", "workbench.catalog-kit.edits-drafts-trims-length-evens-the-tone", `${renderNowBlock({ status: statusLine(inUse(say("workbench.appearance-picker.use")), say("workbench.kit.applies-here")), actions: go(say, "workbench.catalog-kit.go-to-roles") })}${sec(say("workbench.assistant-side-context.usage"), usage)}`),
    item("schedule", "workbench.catalog-kit.schedule-meetings", "workbench.catalog-skill-packs.suggests-meeting-times-from-everyone-s-free-time", `${renderNowBlock({ status: statusLine(hold(say("workbench.catalog-skill-packs.unavailable-for-now")), say("workbench.settings-skills.connect-the-required-service-first")), actions: go(say, "workbench.settings-skills.manage-connections") })}`),
    ...["read", "write", "search"].map((tool) => item(tool, ({ read: "workbench.catalog-kit.read-a-file", write: "workbench.catalog-kit.write-file", search: "workbench.catalog-kit.search-the-web" } as Record<string, string>)[tool]!, "workbench.kit.origin-runtime",
      `${renderNowBlock({ status: statusLine(renderBadge({ label: say(tool === "write" ? "workbench.kit.writes" : "workbench.characters.execution-read-only"), tone: tool === "write" ? "warning" : "neutral" }), say("workbench.kit.tools-cannot-be-switched")) })}${sec(say("workbench.assistant-side-context.usage"), renderUsage({ head: say("workbench.kit.last-use"), last: say("workbench.catalog-kit.last-used-3-days-ago-coding"), scope: say("workbench.catalog-kit.for-tools-only-the-time-of-the") }))}`)),
    ...[0, 1].map((index) => item(`skill-${index}`, ["workbench.catalog-skill-packs.write-the-weekly-review", "workbench.catalog-kit.meeting-notes"][index]!, "workbench.catalog-kit.a-skill-in-writing-tools", sec(say("workbench.assistant-side-context.usage"), usage))),
  ].join("");
  // The list is longer than the frame, so scrolling it shows the detail staying in view.
  const more: ReadonlyArray<readonly [string, string, string, Parameters<typeof packCounts>[1], "on" | "off"]> = [
    ["coding", "Coding", "workbench.catalog-kit.the-roles-mcp-and-tools-used-while", { role: 2, prompt: 2, skill: 0, mcp: 1, tool: 6 }, "on"],
    ["feed", "Feed", "workbench.catalog-kit.message-summaries-and-sorting", { role: 0, prompt: 2, skill: 0, mcp: 0, tool: 1 }, "on"],
    ["builtin", say("workbench.kit.builtin"), "workbench.catalog-kit.the-personal-assistant-every-agent-tool-and", { role: 1, prompt: 1, skill: 1, mcp: 1, tool: 12 }, "on"],
    ["roles", say("workbench.catalog-kit.your-roles"), "workbench.catalog-kit.roles-you-wrote-yourself", { role: 2, prompt: 0, skill: 0, mcp: 0, tool: 4 }, "on"],
    ["goals", "Goals", "workbench.catalog-kit.planning-and-splitting-goals", { role: 1, prompt: 3, skill: 0, mcp: 0, tool: 2 }, "on"],
    ["legal", say("workbench.catalog-skill-packs.legal-review"), "workbench.catalog-kit.reviews-contracts-compares-versions", { role: 1, prompt: 1, skill: 2, mcp: 0, tool: 1 }, "off"],
    ["local", say("workbench.catalog-kit.imported-here-claude-code"), "workbench.catalog-kit.skills-brought-in-from-local-agents", { role: 0, prompt: 0, skill: 4, mcp: 0, tool: 0 }, "on"],
  ];
  const offMark = () => renderStatusMark({ label: say("workbench.characters.disabled"), tone: "quiet", state: "paused" });
  const others = more.map(([key, name, about, , state]) => detailOf(`${id}-${key}`, name, say(about), renderNowBlock({ status: state === "off"
    ? statusLine(offMark(), say("workbench.kit.disabled-description")) : statusLine(inUse(say("workbench.appearance-picker.use")), say("workbench.kit.all-available")),
    actions: state === "off" ? renderButton({ label: say("workbench.home-plugin-page.enable-plugin"), variant: "primary", size: "sm" }) : "" }), false, back)).join("");
  const list = `<ul class="mw-items">${packRow(say, say("workbench.catalog-kit.writing-tools"), { role: 1, prompt: 1, skill: 3, mcp: 0, tool: 3 }, hold(say("workbench.catalog-kit.sample-1-needs-a-look")), true, { "data-list-pick": `${id}-writing` })}${
    more.map(([key, name, , counts, state]) => packRow(say, name, counts, state === "off" ? offMark() : inUse(say("workbench.appearance-picker.use")), false, { "data-list-pick": `${id}-${key}` })).join("")}</ul>`;
  const split = `<div class="mw-list-detail" data-list-detail data-sticky-detail><div class="mw-list-detail__body"><div class="mw-list-detail__list" role="region" aria-label="${escapeHtml(say("workbench.catalog-kit.ai-kit-list"))}">${list}</div>${
    detailOf(`${id}-writing`, say("workbench.catalog-kit.writing-tools"), say("workbench.catalog-kit.everything-for-drafting-editing-and-scheduling-together"), packBody, true, back)}${others}${items}</div></div>`;
  return section("sticky-detail", say("workbench.catalog-kit.sticky-detail"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-kit.only-where-a-page-asks-the-detail"), `<div data-sticky-frame style="--settings-view-h: 400px"><p>${escapeHtml(say("workbench.catalog-kit.this-frame-stands-in-for-the-settings"))}</p>${split}</div>`)}
  </div>`);
}
