import { LOCALE_TAG } from "@molis-ai/molis-work-contracts/platform/ui";

/** Only the independently registered Workbench asset can be the source of platform words. */
export function workbenchLanguageAssetTag(source: string): string | undefined {
  const tag = /^\/assets\/locale\/workbench\.([a-zA-Z-]+)\.[a-f0-9]{24}\.js$/u.exec(source)?.[1];
  return tag && LOCALE_TAG.test(tag) ? tag : undefined;
}
