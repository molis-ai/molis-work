import { readFileSync } from "node:fs";
import { CHARACTER_IMPORT_RUNTIMES } from "@molis-ai/molis-work-contracts/modules/characters";
import { externalTool } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { ANCHORED_MENU_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { escapeHtml, icon, renderButton, t } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * 「能力包」 in settings (specs/capability-pack, decided scheme A in docs/design/capability-pack): the toolbar is drawn here, the
 * rest by the page's own program (`src/browser/kit/`), which reads `kit.catalog.list` through `/api/kit/*` as the person.
 */
export function renderKitSettings({ projectId }: { projectId: string | null }): string {
  const readText = (key: string) => escapeHtml(t.text(key));
  const options = (pairs: [string, string][]) => pairs.map(([value, label]) => `<option value="${value}">${readText(label)}</option>`).join("");
  return `<section class="settings-document kit-settings" data-kit-settings data-project="${escapeHtml(projectId ?? "")}" aria-labelledby="kit-heading">
  <template data-sk-import-sources>${CHARACTER_IMPORT_RUNTIMES.map(id => `<option value="${id}">${externalTool(id).display_name}</option>`).join("")}</template>
  <header class="settings-page-heading"><h1 id="kit-heading">${readText("workbench.kit.title")}</h1><p>${readText("workbench.kit.introduction")}</p></header>
  <div class="kit-toolbar">
    <span class="kit-search">${icon("search")}<input class="mw-input" data-slot="input" type="search" data-kit-search placeholder="${readText("workbench.kit.search-placeholder")}" aria-label="${readText("workbench.kit.search-label")}"></span>
    <select class="mw-select" data-slot="select" data-kit-kind aria-label="${readText("workbench.kit.filter-kind")}">${options([["all", "workbench.settings-memory.all-kinds"], ["role", "workbench.kit.only-roles"], ["prompt", "workbench.kit.only-prompts"], ["skill", "workbench.kit.only-skills"], ["mcp", "workbench.kit.only-mcp"], ["tool", "workbench.kit.only-tools"]])}</select>
    <select class="mw-select" data-slot="select" data-kit-group aria-label="${readText("workbench.kit.filter-state")}">${options([["all", "workbench.settings-knowledge.all-states"], ["on", "workbench.appearance-picker.use"], ["na", "workbench.kit.needs-attention"], ["off", "workbench.kit.inactive"]])}</select>
    <span class="kit-spacer"></span>
    <span class="kit-io">${renderButton({ label: t.text("workbench.kit.import-file"), variant: "secondary", icon: "upload", attrs: { "data-kit-act": "import" } })}${renderButton({ label: t.text("workbench.characters.import-local"), variant: "ghost", icon: "download", attrs: { "data-kit-act": "import-local" } })}<input type="file" accept=".json,application/json" data-kit-file hidden></span>
  </div>
  <div data-kit-notice hidden></div><div class="mw-form" data-kit-local-import hidden></div>
  <div data-kit-body></div>
</section>`;
}

/**
 * The page's program, bundled by esbuild into `dist/kit-client.js` and served once as `/assets/molis-work-kit.js` with the anchored
 * menu its export button opens. Only a page that shows 「能力包」 fetches it (the user's choice, 2026-11-10): the loader below
 * (`src/browser/kit/loader.ts`, bundled into `dist/kit-loader.js`) is all the other settings pages carry.
 */
let client: string | null = null;
export function renderMolisWorkKitClientScript(): string {
  return client ??= `${ANCHORED_MENU_CLIENT_SCRIPT}\n${readFileSync(new URL("./kit-client.js", import.meta.url), "utf8").trim()}`;
}
export const KIT_SETTINGS_LOADER_SCRIPT = readFileSync(new URL("../dist/kit-loader.js", import.meta.url), "utf8").trim();
