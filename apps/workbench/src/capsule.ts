import { BASELINE_SKIN, THEME_BOOTSTRAP_SCRIPT, TYPEFACE_STYLES, renderSkinScope } from "@molis-ai/molis-work-design-system";
import { appearanceHead, type WorkbenchAppearancePorts } from "./appearance-document.js";
import { renderLanguageHead } from "./language-resource.js";
import type { WebProjectNavigation } from "./settings-navigation.js";
import type { WorkbenchRendererPorts } from "./renderer.js";

export interface CapsuleRendererPorts {
  locale: Pick<WorkbenchRendererPorts["locale"], "readText" | "htmlLang">;
  /** The Home's formal appearance projection: the same owner every workbench page reads, never a second appearance read of its own. */
  appearance?: WorkbenchAppearancePorts;
  renderDesktopShell(projects: WebProjectNavigation[], environment: {
    translate(message: string): string; htmlLang: string; languageHead: string; themeBootstrapScript: string;
    appearanceHead: string; baselineStyles: string;
  }): string;
}

/**
 * The Soft Workbench baseline the capsule's layout starts from: the same design-system skin scope the workbench foundation renders.
 * A selected skin overrides it through the appearance sheet's more specific `html[data-ui-skin=…]` scopes, and the selected font
 * scheme through `html[data-ui-font=…]`; the capsule keeps no palette or font stack of its own.
 */
const CAPSULE_BASELINE_STYLES = renderSkinScope(BASELINE_SKIN, true);

export function createCapsuleWorkbench(ports: CapsuleRendererPorts) {
  const { readText, htmlLang } = ports.locale;

  function renderCapsuleShell(projects: WebProjectNavigation[]): string {
    // The device still decides light or dark (theme bootstrap); the Home's selection decides skin, font scheme and mono face.
    const current = ports.appearance?.current();
    const html = ports.renderDesktopShell(projects, {
      translate: readText, htmlLang: htmlLang(), languageHead: renderLanguageHead(htmlLang()),
      themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
      appearanceHead: appearanceHead(current),
      baselineStyles: CAPSULE_BASELINE_STYLES,
    });
    return html.replace("</style>", `${TYPEFACE_STYLES}</style>`);
  }
  return { renderCapsuleShell };
}
