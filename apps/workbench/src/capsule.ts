import { THEME_BOOTSTRAP_SCRIPT, TYPEFACE_STYLES } from "@molis-ai/molis-work-design-system";
import { renderLanguageHead } from "./language-resource.js";
import { renderRuntimePanel, RUNTIME_PANEL_CAPSULE_STYLES, RUNTIME_PANEL_CLIENT_SCRIPT } from "./runtime-panel.js";
import type { WebProjectNavigation } from "./settings-navigation.js";
import type { WorkbenchRendererPorts } from "./renderer.js";

export interface CapsuleRendererPorts {
  locale: Pick<WorkbenchRendererPorts["locale"], "readText" | "htmlLang">;
  renderDesktopShell(projects: WebProjectNavigation[], environment: {
    translate(message: string): string; htmlLang: string; languageHead: string; themeBootstrapScript: string;
    runtimePanel: { html: string; styles: string };
  }): string;
}

export function createCapsuleWorkbench(ports: CapsuleRendererPorts) {
  const { readText, htmlLang } = ports.locale;

  function renderCapsuleShell(projects: WebProjectNavigation[]): string {
    const html = ports.renderDesktopShell(projects, {
      translate: readText, htmlLang: htmlLang(),
      languageHead: renderLanguageHead(htmlLang()),
      themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
      // The 「运行」 section (resident-runtime-design §4); the desktop reads and decides for it, so it needs no page session here.
      runtimePanel: { html: renderRuntimePanel("capsule"), styles: RUNTIME_PANEL_CAPSULE_STYLES },
    });
    // Replacer functions: a bundle (or style sheet) can hold `$&`, `$'` or `` $` `` (a minified name `$`), which a replacement string would expand.
    return html.replace("</style>", () => `${TYPEFACE_STYLES}</style>`).replace("</body>", () => `<script>${RUNTIME_PANEL_CLIENT_SCRIPT}</script></body>`);
  }
  return { renderCapsuleShell };
}
