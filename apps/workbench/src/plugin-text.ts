import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import { refuseSharedTextPrefix, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";

/** A language reader whose owner came from the resource registry or the redeemed Manifest. */
export interface PluginTextReader {
  readonly owner: string;
  readonly default: string;
  pack(locale: string): UiLocalePack | null;
}

interface Registration { readonly reader: PluginTextReader; readonly t: boolean }

const platform = new Map<string, PluginTextReader>();
const activated = new WeakMap<object, Registration>();
// This index rejects ambiguous in-process `t` prefixes. It cannot locate or read a plugin's words.
const prefixes = new Map<string, { readonly owner: string; count: number }>();

function reservePrefix(owner: string): () => void {
  const prefix = textKeyPrefix(owner), prior = prefixes.get(prefix);
  refuseSharedTextPrefix(prior?.owner ?? null, owner);
  const entry = prior ?? { owner, count: 0 };
  entry.count += 1;
  prefixes.set(prefix, entry);
  return () => { if (--entry.count === 0) prefixes.delete(prefix); };
}

/** Platform resource owners are the only readers shared by all activations and Homes. */
export function registerPlatformText(reader: PluginTextReader): void {
  reservePrefix(reader.owner);
  platform.set(reader.owner, reader);
}

/** Keep one reader per live activation, selected by object identity rather than by a plugin or install id. */
export function registerPluginText(reader: PluginTextReader, options: { readonly activation: object; readonly t: boolean }): () => void {
  if (activated.has(options.activation)) throw new Error("这个插件实例已经登记语言文件");
  const release = options.t ? reservePrefix(reader.owner) : undefined;
  const entry = { reader, t: options.t };
  activated.set(options.activation, entry);
  return () => {
    if (activated.get(options.activation) !== entry) return;
    activated.delete(options.activation);
    release?.();
  };
}

/** The exact reader of the supplied activation, for an already checked page, view or invocation. */
export function pluginTextReader(activation: object): PluginTextReader | null {
  return activated.get(activation)?.reader ?? null;
}

export function pluginTextForOwner(owner: string, activation?: object): PluginTextReader | null {
  const scoped = activation && pluginTextReader(activation);
  return scoped?.owner === owner ? scoped : platform.get(owner) ?? null;
}

export function pluginTextOwnerOfPrefix(prefix: string, activation?: object): string | null {
  const scoped = activation && activated.get(activation);
  if (scoped && scoped.t && textKeyPrefix(scoped.reader.owner) === prefix) return scoped.reader.owner;
  const owner = prefixes.get(prefix)?.owner;
  return owner && platform.has(owner) ? owner : null;
}

type CatalogTextScope = <T>(manifest: PluginManifest, draw: () => T) => T;
let catalogTextScope: CatalogTextScope | undefined;

/** The host binds static, registered catalog contributions to their own packaged source. */
export function installCatalogTextScope(scope: CatalogTextScope): void {
  if (catalogTextScope && catalogTextScope !== scope) throw new Error("Workbench catalog text scope already installed");
  catalogTextScope = scope;
}

export function drawCatalogText<T>(manifest: PluginManifest, draw: () => T): T {
  return catalogTextScope ? catalogTextScope(manifest, draw) : draw();
}
