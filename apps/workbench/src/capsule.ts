import { THEME_BOOTSTRAP_SCRIPT, TYPEFACE_STYLES } from "@molis-ai/molis-work-design-system";
import type { WebProjectNavigation } from "./settings-navigation.js";
import type { WorkbenchRendererPorts } from "./renderer.js";

export interface CapsuleRendererPorts {
  locale: Pick<WorkbenchRendererPorts["locale"], "L" | "htmlLang" | "clientI18nScript">;
  renderDesktopShell(projects: WebProjectNavigation[], environment: {
    translate(message: string): string; htmlLang: string; clientI18nScript: string; themeBootstrapScript: string;
  }): string;
}

export function createCapsuleWorkbench(ports: CapsuleRendererPorts) {
  const { L, htmlLang, clientI18nScript } = ports.locale;

  function renderCapsuleShell(projects: WebProjectNavigation[]): string {
    const html = ports.renderDesktopShell(projects, {
      translate: L, htmlLang: htmlLang(), clientI18nScript: clientI18nScript(),
      themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    });
    return html.replace("</style>", `${TYPEFACE_STYLES}</style>`);
  }
  return { renderCapsuleShell };
}
