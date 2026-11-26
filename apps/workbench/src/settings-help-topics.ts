import type { UiHelpDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { PLATFORM_PROJECT_SETTINGS_REGISTRY, PLATFORM_SETTINGS_REGISTRY, platformSettingsHelp, settingsSectionPage } from "./platform-settings-registry.js";
import { renderHelpButton, renderHelpDeclarationScript, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

const SETTINGS_HELP_IDS: ReadonlySet<string> = new Set([...PLATFORM_SETTINGS_REGISTRY.map(section => platformSettingsHelp(settingsSectionPage(section))),
  ...PLATFORM_PROJECT_SETTINGS_REGISTRY.map(section => section.id), "judgment-rules"]);

/** Builds a live-translatable Scheme A declaration for a global or project settings section (VUX-55, VUX-58). */
export function settingsHelpDeclaration(sectionId: string): UiHelpDeclaration | null {
  if (!SETTINGS_HELP_IDS.has(sectionId)) return null;
  const prefix = `workbench.settings-help.${sectionId}`;
  const topicId = `settings-${sectionId}`;
  return {
    default_topic: topicId,
    topics: [{
      id: topicId,
      title: { key: `${prefix}.title` },
      sections: [
        { id: "what", heading: { key: "workbench.settings-help.heading-what" }, body: { key: `${prefix}.what` } },
        { id: "how", heading: { key: "workbench.settings-help.heading-how" }, body: { key: `${prefix}.how` } },
        { id: "scope", heading: { key: "workbench.settings-help.heading-scope" }, body: { key: `${prefix}.scope` } },
      ],
    }],
  };
}

/** Builds a live-translatable Scheme A declaration for a platform work surface (Project Home, Artifacts, Sessions). */
export function workbenchSurfaceHelpDeclaration(surface: "home" | "artifacts" | "sessions"): UiHelpDeclaration {
  const prefix = `workbench.surface-help.${surface}`;
  const topicId = `workbench-${surface}`;
  return {
    default_topic: topicId,
    topics: [{
      id: topicId,
      title: { key: `${prefix}.title` },
      sections: [
        { id: "what", heading: { key: "workbench.settings-help.heading-what" }, body: { key: `${prefix}.what` } },
        { id: "how", heading: { key: "workbench.settings-help.heading-how" }, body: { key: `${prefix}.how` } },
        { id: "scope", heading: { key: "workbench.settings-help.heading-scope" }, body: { key: `${prefix}.scope` } },
      ],
    }],
  };
}

/**
 * Attaches the uniform Scheme A 「帮助」 trigger and live-translatable declaration script to a settings
 * document (both standalone and embedded inside the workbench), so in-place language switches update the
 * help card without reloading (VUX-55, VUX-58).
 */
export function withSettingsHelp(sectionId: string, html: string): string {
  if (!html) return html;
  const declaration = settingsHelpDeclaration(sectionId);
  if (!declaration) return html;
  const button = renderHelpButton({
    topic: declaration.default_topic,
    label: uiText.text("common.help.title"),
    className: "mw-settings-help-btn",
  });
  let decorated = html;
  if (!html.includes("data-mw-help-trigger")) {
    if (/<div class="settings-heading-title">/u.test(html)) {
      decorated = html.replace(/(<div class="settings-heading-title">[\s\S]*?)(<\/div>)/u, `$1${button}$2`);
    } else if (/<header class="(?:settings-heading|settings-page-heading|guidance-page-header)[^"]*"[^>]*>[\s\S]*?<h1\b[^>]*>[\s\S]*?<\/h1>/u.test(html)) {
      decorated = html.replace(/(<header class="(?:settings-heading|settings-page-heading|guidance-page-header)[^"]*"[^>]*>)([\s\S]*?)(<h1\b[^>]*>[\s\S]*?<\/h1>)/u, `$1$2<div class="settings-heading-title">$3${button}</div>`);
    } else if (/<header\b[^>]*>[\s\S]*?<\/header>/u.test(html)) {
      decorated = html.replace(/(<header\b[^>]*>[\s\S]*?)(<\/header>)/u, `$1${button}$2`);
    } else {
      decorated = `<div class="mw-settings-help-bar">${button}</div>${html}`;
    }
  }
  const dataScript = renderHelpDeclarationScript(declaration);
  const lastClose = decorated.lastIndexOf("</section>");
  return lastClose >= 0
    ? `${decorated.slice(0, lastClose)}${dataScript}${decorated.slice(lastClose)}`
    : `${decorated}${dataScript}`;
}
