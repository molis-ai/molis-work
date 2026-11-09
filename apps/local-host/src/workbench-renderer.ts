import { installHostUiText } from "./ui-text-provider.js";
import { createWorkbenchRenderer, type WorkbenchRenderer, type WorkbenchRendererPorts } from "@molis-ai/molis-work-app-workbench";
import { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref } from "./web-locale.js";

/** Bind Workbench to this Host's request scope; Desktop supplies its own optional-shell behavior. */
export function createLocalHostWorkbenchRenderer(desktop: WorkbenchRendererPorts["desktop"], accountRegistration=false, appearance?: WorkbenchRendererPorts["appearance"]): WorkbenchRenderer {
  installHostUiText();
  return createWorkbenchRenderer({
    locale: { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref },
    desktop, accountRegistration, appearance,
  });
}
