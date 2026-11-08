import type { UiLocalePack, UiMessage } from "@molis-ai/molis-work-contracts/platform/ui";
import { refuseSharedTextPrefix, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";

// The words of every text owner this process has, for the Host's text context (specs/font-and-skin-system/a-section-contract.md §5.2, §8.3). One table
// per owner, never merged into one. Who registers: a plugin's session when it opens (and takes them back when it is released), the Host for the platform's
// own owners. What reads it: `apps/local-host/src/ui-text-provider.ts`, which is the provider `t` and `say` find on the global.

/** One owner's languages: the running side of `pluginLocaleReader` (plugin-runtime), or a platform owner's language directory. */
export interface PluginTextReader {
  /** The owner of the words: a plugin_id from its Manifest, or a platform owner's name from the resource registry. Never from a language file. */
  readonly owner: string;
  readonly default: string;
  /** The language's pack, or `null` when the owner has none or its file cannot be used. */
  pack(locale: string): UiLocalePack | null;
}

export interface PluginTextOptions {
  /**
   * Whether this owner's code runs in this process and so may call `t`, which finds an owner by the first segment of a key. Only those enter that
   * index, where two owners of one last segment are refused (`ui.text_owner_conflict`, the SDK's `refuseSharedTextPrefix`). `say` finds every owner by its full name, so a sandboxed
   * plugin or a content pack, whose `t` runs elsewhere, is registered without it and never stops another owner from loading.
   */
  readonly t: boolean;
}

interface Registration { readonly reader: PluginTextReader; readonly t: boolean }

/** Per owner, oldest first. Two projects can run two versions of one plugin: the newest answers, a key it lacks falls to the older one. */
const registered = new Map<string, Registration[]>();

function indexedOwner(prefix: string): string | null {
  for (const [owner, list] of registered) if (textKeyPrefix(owner) === prefix && list.some((entry) => entry.t)) return owner;
  return null;
}

/**
 * Registers one owner's words and answers how to take them back. Every registration is its own: a plugin with a session in two projects is
 * registered twice, and its words leave when both sessions are released. Taking back twice does nothing.
 */
export function registerPluginText(reader: PluginTextReader, options: PluginTextOptions): () => void {
  if (options.t) refuseSharedTextPrefix(indexedOwner(textKeyPrefix(reader.owner)), reader.owner);
  const entry: Registration = { reader, t: options.t };
  registered.set(reader.owner, [...(registered.get(reader.owner) ?? []), entry]);
  return () => {
    const list = (registered.get(reader.owner) ?? []).filter((item) => item !== entry);
    if (list.length > 0) registered.set(reader.owner, list);
    else registered.delete(reader.owner);
  };
}

/** For `t`: the owner whose keys start with this segment, among the owners that can call `t` in this process. */
export function pluginTextOwnerOfPrefix(prefix: string): string | null {
  return indexedOwner(prefix);
}

/** One word of one owner in one language, the newest registration first. */
export function pluginTextMessage(owner: string, key: string, locale: string): UiMessage | null {
  const list = registered.get(owner) ?? [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const messages = list[index]!.reader.pack(locale)?.messages;
    if (messages !== undefined && Object.hasOwn(messages, key)) return messages[key]!;
  }
  return null;
}

/** The owner's default language, from its newest registration; `null` for an owner this process does not have. */
export function pluginTextDefault(owner: string): string | null {
  return registered.get(owner)?.at(-1)?.reader.default ?? null;
}

/** One language of an owner as its newest registration has it: what the component board hands its own page. */
export function pluginTextPack(owner: string, locale: string): UiLocalePack | null {
  return registered.get(owner)?.at(-1)?.reader.pack(locale) ?? null;
}

/** Whether this process has words of this owner now: a session released, an upgrade's old version gone. */
export function hasPluginText(owner: string): boolean {
  return registered.has(owner);
}
