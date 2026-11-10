import { pluginErrors, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConnectionLink, PluginConnectionWord } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import type { ConnectorMethodOption } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { PluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { directoryPackProblems, localeMessageArguments, pluginLocaleReader, tryOwnedTextRef, UI_TEXT_UNAVAILABLE, type PluginLocaleRead } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginTextReader } from "@molis-ai/molis-work-ui-host";
import { directoryWordResolver, workbenchPlatformText } from "./ui-text-provider.js";
import { WORKBENCH_LANGUAGES } from "./web-locale.js";

export type ConnectorGuide = Pick<ConnectorMethodOption, "kind" | "support"> & {
  readonly note: PluginConnectionWord;
  readonly connected_note?: PluginConnectionWord;
  readonly links: readonly PluginConnectionLink[];
};
export type ConnectorWordReader = (word: PluginConnectionWord) => string;
export const literalConnectorWord: ConnectorWordReader = word => typeof word === "string" ? word : "literal" in word ? word.literal : UI_TEXT_UNAVAILABLE;

export interface ConnectorTextSource {
  readonly reader: PluginLocaleReader | null;
  readonly guides?: Readonly<Record<string, readonly ConnectorGuide[]>>;
  current?(): boolean;
}

export interface BuiltinConnectorText {
  readonly readLocale: PluginLocaleRead;
  readonly guides: Readonly<Record<string, readonly ConnectorGuide[]>>;
}

export function builtinConnectorText(manifest: PluginManifest, source?: BuiltinConnectorText): ConnectorTextSource | undefined {
  return source ? { reader: pluginLocaleReader(manifest, source.readLocale), guides: source.guides } : undefined;
}

/** Project the declaration's actual words while keeping every machine value, URL and setting in the source declaration. */
export function connectorWords(owner: string, reader: PluginTextReader | null, current?: () => boolean): ConnectorWordReader {
  const resolve = directoryWordResolver(reader);
  return word => {
    if (typeof word === "string") return word;
    const ref = tryOwnedTextRef(word, owner);
    return ref === null ? UI_TEXT_UNAVAILABLE : "literal" in ref ? ref.literal
      : current?.() === false ? UI_TEXT_UNAVAILABLE : resolve(ref, UI_TEXT_UNAVAILABLE);
  };
}

export const platformConnectorWords = connectorWords("workbench", workbenchPlatformText);
export const connectorLinks = (links: readonly PluginConnectionLink[], word: ConnectorWordReader) => links.map(({ label, url }) => ({ label: word(label), url }));

/** Built-ins add guide words alongside their actual declaration. Installed data has already passed the same file validator. */
export function assertConnectorText(manifest: PluginManifest, source?: ConnectorTextSource): void {
  const reader = source?.reader, declared = manifest.ui.locales;
  if (declared && (!reader || reader.owner !== manifest.plugin_id || reader.default !== declared.default
    || reader.available.length !== declared.available.length || declared.available.some(locale => !reader.pack(locale)))) {
    throw pluginErrors.declaration_invalid(`集成 ${manifest.plugin_id} 的语言文件与声明不符`);
  }
  const common = WORKBENCH_LANGUAGES.languages.flatMap(({ tag }) => workbenchPlatformText.pack(tag) ?? []);
  const shared = common.flatMap(pack => directoryPackProblems(manifest, pack, "locales/" + pack.locale + ".json", workbenchPlatformText.default));
  if (shared.length) throw pluginErrors.declaration_invalid(shared.map(item => item.reason).join("；"));
  for (const [service, methods] of Object.entries(source?.guides ?? {})) {
    if (!manifest.connection_services?.some(item => item.service_id === service)) throw pluginErrors.declaration_invalid(`集成没有声明连接服务 ${service}`);
    for (const method of methods) for (const word of [method.note, method.connected_note, ...method.links.map(link => link.label)]) {
      if (word === undefined || typeof word === "string") continue;
      const ref = tryOwnedTextRef(word, manifest.plugin_id);
      if (ref && "literal" in ref) continue;
      const shared = ref?.key.startsWith("common.") ? workbenchPlatformText : null;
      const packs = shared ? common : (reader?.available ?? []).map(locale => reader?.pack(locale));
      const exact = shared ?? reader;
      const baseline = exact?.pack(exact.default);
      const value = ref && baseline?.messages[ref.key];
      if (!ref || ref.args !== undefined || ref.fallback !== undefined || typeof value !== "string" || packs.some(pack => {
        const message = pack?.messages[ref.key]; return message !== undefined && (typeof message !== "string" || localeMessageArguments(message).length > 0);
      })) throw pluginErrors.declaration_invalid(`连接服务 ${service} 的指南文字没有可用的无参默认词`);
    }
  }
}
