/**
 * Secrets a person saves for one generated plugin's network requests. The plugin only names a secret (its
 * `secretRefs`); the value lives in the Home's sealed secret store, and the host puts it in the header the person
 * chose when the plugin sends a request. A plugin never reads a value, and one plugin cannot use another's.
 */
import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import { createFileSecretStore, runWithMolisWorkHome, type SecretStore } from '@molis-ai/molis-work-storage';

const INDEX = 'plugin-builder:secrets:';
/** Headers a secret may not go in: the host owns them. */
const RESERVED = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'keep-alive', 'te', 'trailer', 'cookie', 'expect', 'proxy-authorization', 'proxy-connection']);
const NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/, HEADER = /^[a-zA-Z0-9!#$%&'*+.^_`|~-]{1,64}$/;

export interface PluginSecrets {
  /** The secrets saved for a plugin: name and header, never the value. */
  list(pluginId: string): Array<{ name: string; header: string }>;
  save(pluginId: string, input: { name: string; header: string; value: string }): void;
  remove(pluginId: string, name?: string): void;
  resolve(pluginId: string, name: string): Promise<{ header: string; value: string } | null>;
}

export function pluginSecrets(home: string | undefined, projectId: string, storage: PluginPrivateStorage, store?: SecretStore): PluginSecrets {
  let sealed = store;
  const secrets = () => { if (sealed) return sealed; if (!home) throw new Error('这个创作台没有可用的密钥存储'); return sealed = runWithMolisWorkHome(home, () => createFileSecretStore()); };
  const reference = (pluginId: string, name: string) => 'plugin-builder-secret:' + projectId + ':' + pluginId + ':' + name;
  const index = (pluginId: string): Record<string, string> => { const raw = storage.get(INDEX + pluginId); return raw ? JSON.parse(raw) as Record<string, string> : {}; };
  return {
    list: pluginId => Object.entries(index(pluginId)).map(([name, header]) => ({ name, header })),
    save(pluginId, input) {
      if (!NAME.test(input.name)) throw new Error('密钥名称只能用字母、数字、点、下划线和连字符');
      if (!HEADER.test(input.header) || RESERVED.has(input.header.toLowerCase())) throw new Error('这个请求头不能用来放密钥：' + input.header);
      if (!input.value || input.value.length > 8192 || /[\r\n]/.test(input.value)) throw new Error('密钥内容不能为空、不能换行，也不能超过 8KB');
      secrets().put(reference(pluginId, input.name), input.value);
      storage.set(INDEX + pluginId, JSON.stringify({ ...index(pluginId), [input.name]: input.header }));
    },
    remove(pluginId, name) {
      const saved = index(pluginId);
      for (const item of name ? [name] : Object.keys(saved)) { if (!(item in saved)) continue; secrets().delete(reference(pluginId, item)); delete saved[item]; }
      if (Object.keys(saved).length) storage.set(INDEX + pluginId, JSON.stringify(saved)); else storage.delete(INDEX + pluginId);
    },
    async resolve(pluginId, name) {
      const header = index(pluginId)[name];
      if (!header) return null;
      const value = secrets().get(reference(pluginId, name));
      return value ? { header, value } : null;
    },
  };
}
