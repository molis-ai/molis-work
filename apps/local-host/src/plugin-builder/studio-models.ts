import type { PluginPrivateStorage } from '@molis-ai/molis-work-contracts/platform/plugin';
import { prologueModelConfiguration } from '@molis-ai/molis-work-service-agent-host';
import { openConfiguredModels } from '../configured-models.js';
import { INSTALLED_MODEL_KEY } from '../installed-plugin-host.js';

/** The studio's model: the one the person chose (kept in the project's private storage), and the configuration and credential it names. */
export function studioModels(home: string, storage: PluginPrivateStorage) {
  const selected = (): { provider_id: string; model_id: string } | null => { const raw = storage.get(INSTALLED_MODEL_KEY); return raw ? JSON.parse(raw) : null; };
  const models = <T>(operation: (store: NonNullable<ReturnType<typeof openConfiguredModels>>['store'] | undefined) => T): T => {
    const opened = openConfiguredModels(home);
    try { return operation(opened?.store); } finally { opened?.storage.close(); }
  };
  /** Model access for one selection: its configuration and the credential it names. */
  const access = (selection: { provider_id: string; model_id: string }) => ({
    modelConfiguration: async () => models(store => prologueModelConfiguration(store?.resolveConfiguration(selection) ?? null)),
    resolveCredential: (reference: string) => models(store => {
      const provider = store?.list().find(entry => entry.credential_ref === reference);
      return provider ? store!.resolveConfiguration({ provider_id: provider.provider_id })?.api_key ?? null : null;
    }),
  });
  return { selected, models, access };
}
export type StudioModels = ReturnType<typeof studioModels>;
