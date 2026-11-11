import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { PromptOverridesFile } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { KitPack, KitPackFile, PluginPackageExport } from "@molis-ai/molis-work-contracts/services/kit";
import { renderMenuGroup, renderMenuItem, type NowMenu } from "@molis-ai/molis-work-design-system/capability-pack";
import { renderDiff, type DiffView } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { icon, renderAlert, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, badge, button, english, esc, goTo, itemsOf, KIND_GLYPH, KIND_WORD, L, note, post, section, sourceTitle, type Kit } from "./common.js";

// 「导出这个包」 and 「导入」 (contract-design §4.9, §5): a pack leaves as one file whose parts each go back their own owner's way — a
// content package as signed, to the plugin install review; the person's prompt edits, previewed and applied row by row; and
// references, checked one by one against what is here. Nothing is installed or applied without the person's own click.

/** The hand-over to the plugin settings page's install review (settings-plugins.ts reads it once when it opens). */
export const HANDED_PACKAGE_KEY = "molis-work:kit-package";

export type ExportPart = "whole" | "prompts" | "references";

/** The menu under 「导出这个包」: what this pack can carry, by its kind (README 「导出这个包」). */
export function exportMenu(kit: Kit, pack: KitPack): NowMenu | undefined {
  if (pack.state.kind === "uninstalled") return undefined;
  const edits = editedPrompts(kit, pack).length;
  const items = pack.kind === "characters"
    ? [renderMenuItem({ label: L("只导出引用"), description: L("你的角色只导出引用：名字和版本，不带写法"), iconName: "link", id: "kit-export-refs", attrs: act("export", "references") })]
    : [
      renderMenuItem({ label: L("整个包"), description: L(pack.export.package ? "内容包原样带签名，加上你的提示词改写和引用；导回时各部分走各自的路" : "你的提示词改写，加上角色、工具和 MCP 的引用；插件本身不随文件走"),
        iconName: "package", id: "kit-export-whole", attrs: act("export", "whole") }),
      ...(edits ? [renderMenuItem({ label: L("只导出你的提示词改写（{n}）", { n: edits }), description: L("存成你自己的数据文件，导回时逐条确认"), iconName: "text", id: "kit-export-prompts", attrs: act("export", "prompts") })] : []),
      renderMenuItem({ label: L("只导出引用"), description: L("只带名字和版本，不带配置、地址和凭据"), iconName: "link", id: "kit-export-refs", attrs: act("export", "references") }),
    ];
  return { id: "kit-export-menu", label: L("导出这个包"), icon: "download", items: renderMenuGroup({ label: L("导出「{p}」", { p: pack.name }), items: items.join("") }) };
}

const editedPrompts = (kit: Kit, pack: KitPack) => itemsOf(kit, pack).filter((entry): entry is Extract<KitEntry, { kind: "prompt" }> => entry.kind === "prompt" && entry.prompt.edited);

function reference(entry: KitEntry): KitPackFile["references"][number] | null {
  const common = { name: entry.name, source_title: sourceTitle(entry) };
  if (entry.kind === "skill") return { kind: "skill", ref: entry.skill.ref, ...common, ...(entry.skill.connector_categories?.length ? { needs: { connector_categories: entry.skill.connector_categories } } : {}) };
  if (entry.kind === "role" || entry.kind === "tool" || entry.kind === "mcp") return { kind: entry.kind, ref: entry.ref, ...common };
  return null;
}

/** Writes the pack's file; resolves with what it holds, for the page to say. */
export async function exportPack(project: string, kit: Kit, pack: KitPack, part: ExportPart): Promise<string> {
  const carriesPackage = part === "whole" && pack.export.package && pack.source;
  const edits = part === "references" ? [] : editedPrompts(kit, pack);
  const [carried, overrides] = await Promise.all([
    carriesPackage ? post<PluginPackageExport>(project, "package-export", { install_id: pack.source!.install_id }) : undefined,
    edits.length ? post<PromptOverridesFile>(project, "prompt-overrides/export", { keys: edits.map(entry => `${entry.ref.owner_id}/${entry.ref.prompt_id}`) }) : undefined,
  ]);
  // A carried package brings its own Skills; the rest travel as references.
  const references = part === "prompts" ? [] : itemsOf(kit, pack).filter(entry => entry.kind !== "prompt" && !(carried && entry.kind === "skill")).map(reference)
    .filter((value): value is KitPackFile["references"][number] => value !== null);
  const file: KitPackFile = { format: "molis.kit-pack", format_version: /* @version format.kit.pack */ 1, exported_at: new Date().toISOString(),
    pack: { name: pack.name, ...(pack.source ? { plugin_id: pack.source.plugin_id, version: pack.source.version } : {}) },
    ...(carried ? { package: carried } : {}), ...(overrides ? { prompt_overrides: overrides } : {}), references };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
  link.download = `${pack.name.replace(/[\\/:*?"<>|\s]+/gu, "-")}.molis-kit.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return link.download;
}

interface PreviewRow { row_id: string; owner_id: string; prompt_id: string; title: string; base_version: number; default_version: number | null; status: "applicable" | "base_mismatch" | "prompt_missing" | "same"; diff: DiffView }
export interface Importing { file: KitPackFile; name: string; preview?: { preview_id: string; rows: PreviewRow[] }; picked: Set<string>; done?: number }

export async function readKitFile(project: string, chosen: File): Promise<Importing> {
  let file: KitPackFile;
  try { file = JSON.parse(await chosen.text()) as KitPackFile; } catch { throw new Error(L("这个文件不是能力包")); }
  if (file?.format !== "molis.kit-pack" || !Array.isArray(file.references)) throw new Error(L("这个文件不是能力包"));
  const preview = file.prompt_overrides?.overrides.length ? await post<Importing["preview"]>(project, "prompt-overrides/preview", { file: file.prompt_overrides }) : undefined;
  return { file, name: chosen.name, preview, picked: new Set(preview?.rows.filter(row => row.status === "applicable").map(row => row.row_id)) };
}

export async function applyPicked(project: string, importing: Importing): Promise<void> {
  const result = await post<{ applied: unknown[] }>(project, "prompt-overrides/confirm", { preview_id: importing.preview!.preview_id, row_ids: [...importing.picked] });
  importing.done = result.applied.length;
}

/** Hands the carried package to the install review of the plugin settings page; false when this window cannot keep it. */
export function handPackage(importing: Importing): boolean {
  try { sessionStorage.setItem(HANDED_PACKAGE_KEY, importing.file.package!.content); return true; } catch { return false; }
}

const DIFF_WORDS = { insert: "新增", delete: "删除", same: "不变", reveal: "再显示 {count} 行", identical: "两边一样", coarse: "只比到段落", partial: "只显示改动的部分",
  mismatch: "两边不是同一份", created: "这里还没有这段提示词", removed: "删掉了", comment_before: "第 {number} 行", comment_after: "第 {number} 行" };
const diff = (view: DiffView) => renderDiff({ view, sides: false, fold_context: 3, labels: DIFF_WORDS,
  primitives: { escape: esc, icon: name => icon(name as Parameters<typeof icon>[0]), text: (text, values) => L(String(text), values as Record<string, string | number>) } });

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const here = (kit: Kit, ref: KitPackFile["references"][number]) => kit.catalog.entries.some(entry => entry.kind === ref.kind
  && ((entry.kind === "skill" ? same(entry.skill.ref, ref.ref) : "ref" in entry && same(entry.ref, ref.ref)) || entry.name === ref.name));

/** The import panel: the file, its references, the prompt edits to pick, the carried package; then what was done. */
export function importPanel(kit: Kit, project: string, importing: Importing): string {
  const { file } = importing;
  const head = (title: string) => `<header class="kit-import__head"><h2 id="kit-import-title" tabindex="-1">${esc(title)}</h2>`;
  if (importing.done !== undefined) {
    const n = importing.done, applied = L(n === 0 ? "没有套用提示词改写。" : n === 1 ? "1 条提示词改写已套用，从下一轮生效。" : "{n} 条提示词改写已套用，从下一轮生效。", { n });
    const body = file.package ? `${applied}${english() ? " " : ""}${L("内容包「{p}」在插件的安装确认里等你看过再装。", { p: file.pack.name })}` : applied;
    return `<section class="kit-import" aria-labelledby="kit-import-title">${head(L("导入完成"))}</header>${renderAlert({ title: file.pack.name, body, tone: "success", state: "done", role: "status" })}
      <footer class="kit-import__foot">${file.package ? button(L("去看安装确认"), { icon: "arrow", attrs: act("import-package") }) : ""}${button(L("完成"), { variant: "primary", size: "md", attrs: act("import-close") })}</footer></section>`;
  }
  const refs = file.references.map(ref => {
    const found = here(kit, ref), categories = ref.needs?.connector_categories ?? [];
    const state = found ? renderStatusMark({ label: L("这里有"), tone: "idle", state: "ready" }) : renderStatusMark({ label: L("这里没有，用不了"), tone: "hold", state: "unavailable" });
    const fix = !found && categories.length ? goTo(L("去连接"), "/capabilities/connections" + (project ? "?project=" + encodeURIComponent(project) : "")) : "";
    return `<li class="mw-item"><span class="mw-mark" aria-hidden="true">${icon(KIND_GLYPH[ref.kind])}</span><span><strong>${esc(ref.name)}</strong><small>${esc(L(KIND_WORD[ref.kind]))} · ${esc(ref.source_title)}</small></span><span class="mw-item__end">${state}${fix}</span></li>`;
  }).join("");
  const rows = (importing.preview?.rows ?? []).map(row => {
    const status = row.status === "applicable" ? badge(L("基于第 {base} 版，这里也是第 {here} 版", { base: row.base_version, here: row.default_version ?? row.base_version }), "success")
      : row.status === "same" ? badge(L("和这里现在的一样"))
      : row.status === "prompt_missing" ? badge(L("这里没有这段提示词：不套用"), "warning")
      : badge(L("基于第 {base} 版，这里已是第 {here} 版：版本对不上，不套用", { base: row.base_version, here: row.default_version ?? "?" }), "warning");
    const pick = row.status === "applicable" ? `<label class="mw-check-row"><input type="checkbox" data-kit-pick="${esc(row.row_id)}"${importing.picked.has(row.row_id) ? " checked" : ""}><span>${esc(L("套用：{n}", { n: row.title }))}</span></label>` : "";
    const more = row.status === "applicable" ? `<details class="mw-collapsible" data-slot="collapsible"><summary>${esc(L("看改了什么"))}</summary><div class="mw-collapsible__body">${diff(row.diff)}</div></details>` : "";
    return `<li class="kit-card${row.status === "applicable" ? "" : " is-muted"}"><div class="kit-card__head"><span class="mw-mark" aria-hidden="true">${icon("text")}</span><span><strong>${esc(row.title)}</strong><small>${esc(row.owner_id)}</small></span></div>${status}${pick}${more}</li>`;
  }).join("");
  const count = importing.picked.size;
  return `<section class="kit-import" aria-labelledby="kit-import-title">${head(L("导入一个能力包"))}
      <p class="kit-file">${icon("package")}<span><strong>${esc(L("文件里是能力包「{p}」", { p: file.pack.name }))}</strong><small>${esc(importing.name)}</small></span></p></header>
    ${section(L("引用（{n}）", { n: file.references.length }), note(L("角色、工具和 MCP 只带名字和版本，不带配置、地址和凭据。")) + (refs ? `<ul class="mw-items">${refs}</ul>` : note(L("没有引用"))))}
    ${rows ? section(L("提示词改写（{n}）", { n: importing.preview!.rows.length }), note(L("逐条看过再套用。套用后从下一轮生效，随时可以在「提示词」里恢复默认。装任何包都不会改提示词，只有这里你点了才会。")) + `<ul class="kit-cards">${rows}</ul>`) : ""}
    ${file.package ? section(L("内容包"), `<p class="kit-line">${icon("package")}<span>${esc(`${file.package.plugin_id} · ${file.package.version}`)}</span></p>${note(L("内容包原样带着签名，走插件的安装确认：看过它要的权限再装。"))}`) : ""}
    <footer class="kit-import__foot">${button(L("取消"), { variant: "ghost", size: "md", attrs: act("import-close") })}${importing.preview
      ? button(L(count === 0 ? "选要套用的改写" : count === 1 ? "套用 1 条改写" : "套用 {n} 条改写", { n: count }), { variant: "primary", size: "md", disabled: !count, attrs: act("import-apply") })
      : button(L(file.package ? "接着去看安装确认" : "完成"), { variant: "primary", size: "md", attrs: act(file.package ? "import-package" : "import-close") })}</footer></section>`;
}
