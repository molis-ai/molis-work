import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { messageDeclarationProblems } from "@molis-ai/molis-work-plugin-sdk";

/** One word in both page languages. */
export type PluginMessage = { readonly zh: string; readonly en: string };

/**
 * The words of the installed Plugins, read from their Manifests: `ui.messages` by stable key, and `ui.translations`, English
 * for words still keyed by their Chinese text. Built-in and third-party Plugins come through the same `register`, whoever
 * published them. The page's catalog is whatever is registered when it is drawn, so a Plugin that is not installed adds
 * nothing to it. A key one Plugin has registered is refused to another, and a Manifest whose words do not pass the shared
 * declaration check registers none.
 *
 * A stable key belongs to its owner (its first segment), so the page may share them. A Chinese source text belongs to nobody:
 * the same sentence is on the Host's pages and on other Plugins', so a Plugin's `ui.translations` are kept apart
 * (`translationsFor`) and the callers apply them only to what the Plugin itself draws (its frame, its contributions).
 */
export interface PluginMessageStore {
  /** Registers a Plugin's words, replacing the ones it registered before. Returns what refused it; empty when it did. */
  register(manifest: Pick<PluginManifest, "plugin_id" | "ui">): string[];
  unregister(pluginId: string): void;
  /** Every registered stable-key word. */
  messages(): Readonly<Record<string, PluginMessage>>;
  /** English for the words a Plugin keys by their Chinese text: its own `ui.translations`, empty for a Plugin not registered. */
  translationsFor(pluginId: string): Readonly<Record<string, string>>;
  /** The Plugins that registered such words, in the order they registered, each with its own. */
  translated(): ReadonlyMap<string, Readonly<Record<string, string>>>;
}

interface Entry { readonly messages: Readonly<Record<string, PluginMessage>>; readonly translations: Readonly<Record<string, string>> }

export function createPluginMessageStore(): PluginMessageStore {
  const entries = new Map<string, Entry>();
  let merged: Record<string, PluginMessage> | null = null;
  const read = () => merged ??= Object.assign({}, ...[...entries.values()].map(entry => entry.messages));
  return {
    register(manifest) {
      const problems = messageDeclarationProblems(manifest);
      const messages = manifest.ui.messages ?? {};
      for (const [pluginId, other] of entries) {
        if (pluginId === manifest.plugin_id) continue;
        for (const key of Object.keys(messages)) if (key in other.messages) problems.push(`文字键 ${key} 已由 ${pluginId} 声明`);
      }
      if (problems.length > 0) return problems;
      entries.delete(manifest.plugin_id);
      entries.set(manifest.plugin_id, { messages, translations: manifest.ui.translations ?? {} });
      merged = null;
      return [];
    },
    unregister(pluginId) { if (entries.delete(pluginId)) merged = null; },
    messages: read,
    translationsFor: pluginId => entries.get(pluginId)?.translations ?? {},
    translated: () => new Map([...entries].filter(([, entry]) => Object.keys(entry.translations).length > 0).map(([id, entry]) => [id, entry.translations])),
  };
}
