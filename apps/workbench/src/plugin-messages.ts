import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { messageDeclarationProblems } from "@molis-ai/molis-work-plugin-sdk";

/** One word in both page languages. */
export type PluginMessage = { readonly zh: string; readonly en: string };

/**
 * The words of the installed Plugins, read from their Manifests (`ui.messages` by stable key, and for a Plugin of the Host's
 * own build `ui.translations`, English for words still keyed by their Chinese text). Built-in and third-party Plugins come
 * through the same `register`; the page's catalog is whatever is registered when it is drawn, so a Plugin that is not
 * installed adds nothing to it. A key one Plugin has registered is refused to another, and a Manifest whose words do not pass
 * the shared declaration check registers none.
 */
export interface PluginMessageStore {
  /** Registers a Plugin's words, replacing the ones it registered before. Returns what refused it; empty when it did. */
  register(manifest: Pick<PluginManifest, "plugin_id" | "ui">, options: { readonly host: boolean }): string[];
  unregister(pluginId: string): void;
  /** Every registered stable-key word. */
  messages(): Readonly<Record<string, PluginMessage>>;
  /** English for words keyed by their Chinese text, in the order the Plugins were registered. */
  translations(): Readonly<Record<string, string>>;
}

interface Entry { readonly messages: Readonly<Record<string, PluginMessage>>; readonly translations: Readonly<Record<string, string>> }

export function createPluginMessageStore(): PluginMessageStore {
  const entries = new Map<string, Entry>();
  let merged: { messages: Record<string, PluginMessage>; translations: Record<string, string> } | null = null;
  const read = () => merged ??= {
    messages: Object.assign({}, ...[...entries.values()].map(entry => entry.messages)),
    translations: Object.assign({}, ...[...entries.values()].map(entry => entry.translations)),
  };
  return {
    register(manifest, { host }) {
      const problems = messageDeclarationProblems(manifest);
      const messages = manifest.ui.messages ?? {};
      for (const [pluginId, other] of entries) {
        if (pluginId === manifest.plugin_id) continue;
        for (const key of Object.keys(messages)) if (key in other.messages) problems.push(`文字键 ${key} 已由 ${pluginId} 声明`);
      }
      if (problems.length > 0) return problems;
      entries.delete(manifest.plugin_id);
      entries.set(manifest.plugin_id, { messages, translations: host ? manifest.ui.translations ?? {} : {} });
      merged = null;
      return [];
    },
    unregister(pluginId) { if (entries.delete(pluginId)) merged = null; },
    messages: () => read().messages,
    translations: () => read().translations,
  };
}
