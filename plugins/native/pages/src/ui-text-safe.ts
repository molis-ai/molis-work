import { tryUiText } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * Read a Pages or shared `common.*` UI word when a UI text context is mounted for that key's prefix,
 * falling back cleanly during offline / headless exports where no Host text context is installed.
 */
export function readPagesText(key: string | undefined, fallback: string, args?: Record<string, string | number>): string {
  if (!key) return fallback;
  return tryUiText(key, args) ?? fallback;
}
