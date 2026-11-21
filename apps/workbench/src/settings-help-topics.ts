import { renderHelpButton, renderHelpDataScript, t as uiText, type MwHelpTopicData } from "@molis-ai/molis-work-plugin-sdk/ui";

const SETTINGS_HELP_IDS = new Set([
  "appearance",
  "models",
  "runtimes",
  "assistant",
  "authorizations",
  "kit",
  "prompts",
  "memory",
  "work-records",
  "directories",
  "mcp",
  "connectors",
  "web-search",
  "projects",
  "diagnostics",
  "update",
  "running",
  "sync",
  "capabilities",
  "general",
  "workspaces",
  "guidance",
  "knowledge",
  "characters",
  "plugins",
  "grants",
  "approvals",
]);

/** Builds the Scheme A on-demand help topic for a global or project settings section (VUX-55). */
export function settingsHelpTopic(sectionId: string): MwHelpTopicData | null {
  if (!SETTINGS_HELP_IDS.has(sectionId)) return null;
  const prefix = `workbench.settings-help.${sectionId}`;
  const title = uiText.text(`${prefix}.title`);
  return {
    id: `settings-${sectionId}`,
    title,
    context: uiText.text("common.help.looking-at") + title,
    sections: [
      {
        id: "what",
        heading: uiText.text("workbench.settings-help.heading-what"),
        body: uiText.text(`${prefix}.what`),
      },
      {
        id: "how",
        heading: uiText.text("workbench.settings-help.heading-how"),
        body: uiText.text(`${prefix}.how`),
      },
      {
        id: "scope",
        heading: uiText.text("workbench.settings-help.heading-scope"),
        body: uiText.text(`${prefix}.scope`),
      },
    ],
  };
}

/**
 * Attaches the uniform Scheme A 「帮助」 trigger and topic data to a settings document (both standalone
 * and embedded inside the workbench), without adding per-plugin hardcoding.
 */
export function withSettingsHelp(sectionId: string, html: string): string {
  if (!html) return html;
  const topic = settingsHelpTopic(sectionId);
  if (!topic) return html;
  const button = renderHelpButton({
    topic: topic.id,
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
  return `${decorated}${renderHelpDataScript([topic])}`;
}
