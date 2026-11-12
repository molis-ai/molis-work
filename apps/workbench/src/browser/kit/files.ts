import type { KitEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import type { PromptOverridesFile } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { KitPack, KitPackFile, PluginPackageExport } from "@molis-ai/molis-work-contracts/services/kit";
import { renderMenuGroup, renderMenuItem, type NowMenu } from "@molis-ai/molis-work-design-system/capability-pack";
import { renderDiff, type DiffView } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { icon, renderAlert, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, badge, button, esc, goTo, itemsOf, KIND_GLYPH, KIND_WORD, readText, note, post, section, sourceTitle, type Kit } from "./common.js";

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
    ? [renderMenuItem({ label: readText("workbench.kit.references-only"), description: readText("workbench.kit.roles-reference-only"), iconName: "link", id: "kit-export-refs", attrs: act("export", "references") })]
    : [
      renderMenuItem({ label: readText("workbench.kit.whole-kit"), description: readText(pack.export.package ? "workbench.kit.export-content-package" : "workbench.kit.export-data-only"),
        iconName: "package", id: "kit-export-whole", attrs: act("export", "whole") }),
      ...(edits ? [renderMenuItem({ label: readText("workbench.kit.export-edits", { n: edits }), description: readText("workbench.kit.export-edits-description"), iconName: "text", id: "kit-export-prompts", attrs: act("export", "prompts") })] : []),
      renderMenuItem({ label: readText("workbench.kit.references-only"), description: readText("workbench.kit.reference-data"), iconName: "link", id: "kit-export-refs", attrs: act("export", "references") }),
    ];
  return { id: "kit-export-menu", label: readText("workbench.kit.export-kit"), icon: "download", items: renderMenuGroup({ label: readText("workbench.kit.export-kit-title", { p: pack.name }), items: items.join("") }) };
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
  try { file = JSON.parse(await chosen.text()) as KitPackFile; } catch { throw new Error(readText("workbench.kit.invalid-file")); }
  if (file?.format !== "molis.kit-pack" || !Array.isArray(file.references)) throw new Error(readText("workbench.kit.invalid-file"));
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

const DIFF_WORDS = { insert: "workbench.settings-web-service.add", delete: "common.control.delete", same: "workbench.kit.diff-same", reveal: "workbench.kit.diff-reveal", identical: "workbench.kit.diff-identical", coarse: "workbench.kit.diff-coarse", partial: "workbench.kit.diff-partial",
  mismatch: "workbench.kit.diff-mismatch", created: "workbench.kit.diff-created", removed: "workbench.kit.diff-removed", comment_before: "workbench.kit.diff-comment-line", comment_after: "workbench.kit.diff-comment-line" };
const diff = (view: DiffView) => renderDiff({ view, sides: false, fold_context: 3, labels: DIFF_WORDS,
  primitives: { escape: esc, icon: name => icon(name as Parameters<typeof icon>[0]), text: (text, values) => readText(String(text), values as Record<string, string | number>) } });

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const here = (kit: Kit, ref: KitPackFile["references"][number]) => kit.catalog.entries.some(entry => entry.kind === ref.kind
  && ((entry.kind === "skill" ? same(entry.skill.ref, ref.ref) : "ref" in entry && same(entry.ref, ref.ref)) || entry.name === ref.name));

/** The import panel: the file, its references, the prompt edits to pick, the carried package; then what was done. */
export function importPanel(kit: Kit, project: string, importing: Importing): string {
  const { file } = importing;
  const head = (title: string) => `<header class="kit-import__head"><h2 id="kit-import-title" tabindex="-1">${esc(title)}</h2>`;
  if (importing.done !== undefined) {
    const n = importing.done, applied = (n === 0 ? readText("workbench.kit.no-edits-applied") : readText("workbench.kit.import-edits-applied", { n }));
    const body = file.package ? readText("workbench.kit.applied-with-package", { applied, package: readText("workbench.kit.waiting-review", { p: file.pack.name }) }) : applied;
    return `<section class="kit-import" aria-labelledby="kit-import-title">${head(readText("workbench.kit.import-done"))}</header>${renderAlert({ title: file.pack.name, body, tone: "success", state: "done", role: "status" })}
      <footer class="kit-import__foot">${file.package ? button(readText("workbench.kit.open-review"), { icon: "arrow", attrs: act("import-package") }) : ""}${button(readText("workbench.computer-record.completed"), { variant: "primary", size: "md", attrs: act("import-close") })}</footer></section>`;
  }
  const refs = file.references.map(ref => {
    const found = here(kit, ref), categories = ref.needs?.connector_categories ?? [];
    const state = found ? renderStatusMark({ label: readText("workbench.kit.reference-present"), tone: "idle", state: "ready" }) : renderStatusMark({ label: readText("workbench.kit.reference-missing"), tone: "hold", state: "unavailable" });
    const fix = !found && categories.length ? goTo(readText("workbench.catalog-skill-packs.connect"), "/capabilities/connections" + (project ? "?project=" + encodeURIComponent(project) : "")) : "";
    return `<li class="mw-item"><span class="mw-mark" aria-hidden="true">${icon(KIND_GLYPH[ref.kind])}</span><span><strong>${esc(ref.name)}</strong><small>${esc(readText(KIND_WORD[ref.kind]))} · ${esc(ref.source_title)}</small></span><span class="mw-item__end">${state}${fix}</span></li>`;
  }).join("");
  const rows = (importing.preview?.rows ?? []).map(row => {
    const status = row.status === "applicable" ? badge(readText("workbench.kit.same-default", { base: row.base_version, here: row.default_version ?? row.base_version }), "success")
      : row.status === "same" ? badge(readText("workbench.kit.same-content"))
      : row.status === "prompt_missing" ? badge(readText("workbench.kit.prompt-unavailable"), "warning")
      : badge(readText("workbench.kit.base-mismatch", { base: row.base_version, here: row.default_version ?? "?" }), "warning");
    const pick = row.status === "applicable" ? `<label class="mw-check-row"><input type="checkbox" data-kit-pick="${esc(row.row_id)}"${importing.picked.has(row.row_id) ? " checked" : ""}><span>${esc(readText("workbench.kit.apply-prompt", { n: row.title }))}</span></label>` : "";
    const more = row.status === "applicable" ? `<details class="mw-collapsible" data-slot="collapsible"><summary>${esc(readText("workbench.kit.show-prompt-diff"))}</summary><div class="mw-collapsible__body">${diff(row.diff)}</div></details>` : "";
    return `<li class="kit-card${row.status === "applicable" ? "" : " is-muted"}"><div class="kit-card__head"><span class="mw-mark" aria-hidden="true">${icon("text")}</span><span><strong>${esc(row.title)}</strong><small>${esc(row.owner_id)}</small></span></div>${status}${pick}${more}</li>`;
  }).join("");
  const count = importing.picked.size;
  return `<section class="kit-import" aria-labelledby="kit-import-title">${head(readText("workbench.kit.import-title"))}
      <p class="kit-file">${icon("package")}<span><strong>${esc(readText("workbench.kit.file-kit", { p: file.pack.name }))}</strong><small>${esc(importing.name)}</small></span></p></header>
    ${section(readText("workbench.kit.reference-count", { n: file.references.length }), note(readText("workbench.kit.reference-disclaimer")) + (refs ? `<ul class="mw-items">${refs}</ul>` : note(readText("workbench.kit.no-references"))))}
    ${rows ? section(readText("workbench.kit.edit-count", { n: importing.preview!.rows.length }), note(readText("workbench.kit.import-edit-explanation")) + `<ul class="kit-cards">${rows}</ul>`) : ""}
    ${file.package ? section(readText("workbench.kit.content-package"), `<p class="kit-line">${icon("package")}<span>${esc(`${file.package.plugin_id} · ${file.package.version}`)}</span></p>${note(readText("workbench.kit.review-content-package"))}`) : ""}
    <footer class="kit-import__foot">${button(readText("common.control.cancel"), { variant: "ghost", size: "md", attrs: act("import-close") })}${importing.preview
      ? button(count === 0 ? readText("workbench.kit.pick-edits") : readText("workbench.kit.import-apply-edits", { n: count }), { variant: "primary", size: "md", disabled: !count, attrs: act("import-apply") })
      : button(readText(file.package ? "workbench.kit.continue-install" : "workbench.computer-record.completed"), { variant: "primary", size: "md", attrs: act(file.package ? "import-package" : "import-close") })}</footer></section>`;
}
