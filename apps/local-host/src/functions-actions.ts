import { functionsActionProvider, publishedFunctionProvider, type FunctionsActionPorts } from "@molis-ai/molis-work-module-functions";
import type { ActionRegistryPort } from "@molis-ai/molis-work-contracts/platform/actions";
import { functionsCredentialConfigured, withFunctionsService, withFunctionsServiceAsync, type FunctionsHostOptions } from "./functions-host.js";

/** Ephemeral registrations reflect the existing function store; this is not a second function catalog. */
export class SystemFunctionsActions {
  private readonly registrations = new Map<string, { hash: string; dispose(): void }>();
  private readonly ports: FunctionsActionPorts;
  private readonly removeManagement: () => void;

  constructor(private readonly registry: ActionRegistryPort, home: string, options: FunctionsHostOptions = {}) {
    this.ports = {
      read: operation => withFunctionsService(home, operation, options),
      run: operation => withFunctionsServiceAsync(home, operation, options),
      credentialAvailable: () => functionsCredentialConfigured(home, options),
    };
    this.removeManagement = registry.registerProvider(functionsActionProvider(this.ports));
  }

  refresh(): void {
    const published = this.ports.read(service => service.list()).filter(record => record.status === "published" && record.version != null);
    const current = new Set(published.map(record => `${record.function_key}@${record.version}`));
    for (const [key, registration] of this.registrations) {
      if (!current.has(key)) { registration.dispose(); this.registrations.delete(key); }
    }
    for (const record of published) {
      const key = `${record.function_key}@${record.version}`;
      const existing = this.registrations.get(key);
      if (existing?.hash === record.config_hash) continue;
      existing?.dispose();
      this.registrations.delete(key);
      const dispose = this.registry.registerProvider(publishedFunctionProvider(record, this.ports));
      this.registrations.set(key, { hash: record.config_hash, dispose });
    }
  }

  dispose(): void {
    for (const registration of this.registrations.values()) registration.dispose();
    this.registrations.clear();
    this.removeManagement();
  }
}
