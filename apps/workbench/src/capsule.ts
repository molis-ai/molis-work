import { THEME_BOOTSTRAP_SCRIPT, TYPEFACE_STYLES } from "@molis-ai/molis-work-design-system";
import { renderLanguageHead } from "./language-resource.js";
import type { WebProjectNavigation } from "./settings-navigation.js";
import type { WorkbenchRendererPorts } from "./renderer.js";

export interface CapsuleRendererPorts {
  locale: Pick<WorkbenchRendererPorts["locale"], "readText" | "htmlLang">;
  renderDesktopShell(projects: WebProjectNavigation[], environment: {
    translate(message: string): string; htmlLang: string; languageHead: string; themeBootstrapScript: string;
  }): string;
}

export function createCapsuleWorkbench(ports: CapsuleRendererPorts) {
  const { readText, htmlLang } = ports.locale;

  function renderCapsuleShell(projects: WebProjectNavigation[]): string {
    const html = ports.renderDesktopShell(projects, {
      translate: readText, htmlLang: htmlLang(), languageHead: renderLanguageHead(htmlLang()),
      themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    });
    return html.replace("</style>", `${TYPEFACE_STYLES}</style>`);
  }
  return { renderCapsuleShell };
}
