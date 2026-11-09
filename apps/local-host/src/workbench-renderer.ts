import { installHostUiText } from "./ui-text-provider.js";
import { createWorkbenchRenderer, type WorkbenchRenderer, type WorkbenchRendererPorts } from "@molis-ai/molis-work-app-workbench";
import { L, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref, clientI18nScript } from "./web-locale.js";

/** Bind Workbench to this Host's request scope; Desktop supplies its own optional-shell behavior. */
export function createLocalHostWorkbenchRenderer(desktop: WorkbenchRendererPorts["desktop"], accountRegistration=false, appearance?: WorkbenchRendererPorts["appearance"]): WorkbenchRenderer {
  installHostUiText();
  return createWorkbenchRenderer({
    locale: { L, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref, clientI18nScript },
    desktop, accountRegistration, appearance,
  });
}
