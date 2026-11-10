import { readFileSync } from "node:fs";
import { CHARACTER_IMPORT_RUNTIMES } from "@molis-ai/molis-work-contracts/modules/characters";
import { externalTool } from "@molis-ai/molis-work-contracts/platform/external-tools";
import { ANCHORED_MENU_CLIENT_SCRIPT, SKILL_PACK_BOARD_EN } from "@molis-ai/molis-work-design-system";
import { icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * 「能力包」 in settings (specs/capability-pack, decided scheme A in docs/design/capability-pack): the toolbar is drawn here, the
 * rest by the page's own program (`src/browser/kit/`), which reads `kit.catalog.list` through `/api/kit/*` as the person.
 */
export function renderKitSettings({ L, projectId, lang }: { L(text: string): string; projectId: string | null; lang: string }): string {
  const options = (pairs: [string, string][]) => pairs.map(([value, label]) => `<option value="${value}">${L(label)}</option>`).join("");
  return `<section class="settings-document kit-settings" data-kit-settings data-sk-retracted="${lang === "en" ? SKILL_PACK_BOARD_EN["已撤销"] : "已撤销"}" data-project="${projectId ?? ""}" aria-labelledby="kit-heading">
  <template data-sk-import-sources>${CHARACTER_IMPORT_RUNTIMES.map(id => `<option value="${id}">${externalTool(id).display_name}</option>`).join("")}</template>
  <header class="settings-page-heading"><h1 id="kit-heading">${L("能力包")}</h1><p>${L("一个能力包把做一类事要用的放在一起：技能、MCP、工具，以及搭配的角色和角色的提示词。技能在这里开关；其余的在这里看，改去它自己的页面。")}</p></header>
  <div class="kit-toolbar">
    <span class="kit-search">${icon("search")}<input class="mw-input" data-slot="input" type="search" data-kit-search placeholder="${L("找能力包，或包里的技能、角色、提示词")}" aria-label="${L("找能力包")}"></span>
    <select class="mw-select" data-slot="select" data-kit-kind aria-label="${L("按类别看")}">${options([["all", "全部类别"], ["role", "只看角色"], ["prompt", "只看提示词"], ["skill", "只看技能"], ["mcp", "只看 MCP"], ["tool", "只看工具"]])}</select>
    <select class="mw-select" data-slot="select" data-kit-group aria-label="${L("按状态看")}">${options([["all", "全部状态"], ["on", "在用"], ["na", "有要处理的"], ["off", "停用或已卸载"]])}</select>
    <span class="kit-spacer"></span>
    <span class="kit-io">${renderButton({ label: L("导入文件"), variant: "secondary", icon: "upload", attrs: { "data-kit-act": "import" } })}${renderButton({ label: L("从本机导入"), variant: "ghost", icon: "download", attrs: { "data-kit-act": "import-local" } })}<input type="file" accept=".json,application/json" data-kit-file hidden></span>
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
export const KIT_SETTINGS_LOADER_SCRIPT = readFileSync(new URL("./kit-loader.js", import.meta.url), "utf8").trim();
