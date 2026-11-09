import { createAppearanceOwner, type AppearanceOwner } from "@molis-ai/molis-work-service-appearance";
import { hostLog, repeatingFailure } from "./host-log.js";
import { resolveConfiguredHome } from "./product-home.js";
import { isWebLocale, WEB_LOCALES, type WebLocale } from "./web-locale.js";

export { UI_LOCALE_RELATIVE_PATH } from "@molis-ai/molis-work-service-appearance";

const owners = new Map<string, AppearanceOwner<WebLocale>>();
const readFailures = repeatingFailure("ui_locale", "read_failed");
const writeFailures = repeatingFailure("ui_locale", "write_failed");

/** The composition root and its transports share one owner for the canonical Home. */
export function appearanceForHome(homeDirectory: string): AppearanceOwner<WebLocale> {
  const home = resolveConfiguredHome(homeDirectory);
  const existing = owners.get(home);
  if (existing) return existing;
  const appearance = createAppearanceOwner(home, {
    locale: { defaultLocale: WEB_LOCALES[0], isSupported: isWebLocale, readFailed: readFailures.failed,
      writeFailed: writeFailures.failed, writeSucceeded: writeFailures.worked },
    listenerFailed: error => hostLog.warn("appearance", "listener_failed", error),
  });
  owners.set(home, appearance);
  return appearance;
}

/** The caller supplies the canonical Home bound at startup, even if it has since moved. */
export function closeHomeAppearance(home: string | undefined): void {
  if (!home) return;
  owners.get(home)?.close();
  owners.delete(home);
}

/** The narrow Home-language entry also used by golden replay and Host diagnostics. */
export const readUiLocale = (home: string): WebLocale | null => appearanceForHome(home).locale.read();
export const lastUsedLocale = (home: string): WebLocale => appearanceForHome(home).locale.lastUsed();
export const rememberUiLocale = (home: string, locale: unknown): void => appearanceForHome(home).locale.remember(locale);
