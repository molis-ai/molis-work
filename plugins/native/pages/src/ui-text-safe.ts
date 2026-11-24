import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

interface SafeUiTextProvider {
  locale?(): string | null;
  ownerOfPrefix?(prefix: string): string | null;
}

/**
 * Read a Pages or shared `common.*` UI word when a UI text context is mounted for that key's prefix,
 * falling back cleanly during offline / headless exports where no Host text context is installed.
 */
export function readPagesText(key: string | undefined, fallback: string, args?: Record<string, string | number>): string {
  if (!key) return fallback;
  const prefix = key.split(".")[0];
  const provider = Reflect.get(globalThis, Symbol.for("molis.work.ui-text.v1")) as SafeUiTextProvider | undefined;
  if (!provider?.locale?.() || !prefix || !provider.ownerOfPrefix?.(prefix)) return fallback;
  try {
    return uiText.text(key, args);
  } catch {
    return fallback;
  }
}
