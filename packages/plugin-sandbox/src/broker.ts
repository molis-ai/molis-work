import type { PluginInteractionClient, PluginMaterialsClient } from '@molis-ai/molis-work-contracts/platform/plugin';
import { PLUGIN_CONNECTION_RECORD_KEY_MAX, type PluginConnectionMethod, type PluginConnectionsClient } from '@molis-ai/molis-work-contracts/platform/plugin-connections';
import type { SandboxEffects, SandboxIdentity, SandboxJson, SandboxNetworkRequest, SandboxNetworkResponse, SandboxOperationContract, SandboxSdkMethod } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { assertJson, SandboxError } from './schema.js';
import { sandboxStatement, sandboxStatements, type SandboxDatabaseService } from './database.js';
import { documentBatchJson, extractionJson, materialRequest, materialSource, materialUploads } from './materials.js';
import { BoundedQueue, RateBudget } from './queue.js';
import { createExecutionLifetime } from '@molis-ai/molis-work-plugin-sdk';

export interface SandboxServiceContext {
  readonly identity: Readonly<SandboxIdentity>; readonly signal: AbortSignal; readonly operationId: string;
  /** Recheck the original Host invocation after waits and immediately before a side effect. */
  beforeEffect?(): Promise<void>;
}
export interface SandboxServices {
  /** Must serialize by identity and atomically commit only if callback succeeds and signal remains active. */
  storage?: { transaction<T>(context: SandboxServiceContext, mutate: (entries: Map<string, SandboxJson>) => T): Promise<T> };
  artifacts?: { get(context: SandboxServiceContext, reference: { artifact_id: string; version: number }): Promise<SandboxJson>; put(context: SandboxServiceContext, value: SandboxJson): Promise<SandboxJson> };
  capability?: { call(context: SandboxServiceContext, id: string, input: SandboxJson): Promise<SandboxJson> };
  events?: { publish(context: SandboxServiceContext, id: string, payload: SandboxJson): Promise<void> };
  network?: { request(context: SandboxServiceContext, request: SandboxNetworkRequest, authorization: { domains: string[]; secretRefs: string[] }): Promise<SandboxNetworkResponse> };
  resource?: { read(context: SandboxServiceContext, name: string): Promise<string> };
  /** The plugin's own tables in the project's library (`sandboxDatabase` over `services.project_database`). */
  projectDatabase?: SandboxDatabaseService;
  /** The activation's `services.interaction`: drawing only, so no effect is declared or granted for it (S-56). */
  interaction?: PluginInteractionClient;
  /** The activation's `services.connections`: requests through the account the person bound to a slot (S-57, S-60). */
  connections?: PluginConnectionsClient;
  /** The activation's `services.materials`, the readers of files the plugin already holds: the Host decides which of them exist (S-60). */
  materials?: PluginMaterialsClient;
}
interface BrokerLimits { sdkQueue: number; sdkPerMinute: number; eventsPerMinute: number; serviceTimeoutMs: number; storageBytes: number; messageBytes: number }

export class SandboxBroker {
  private readonly queue: BoundedQueue;
  private readonly calls: RateBudget;
  private readonly events: RateBudget;
  constructor(private readonly identity: Readonly<SandboxIdentity>, private readonly grants: SandboxEffects, private readonly services: SandboxServices, private readonly limits: BrokerLimits) {
    this.queue = new BoundedQueue(limits.sdkQueue); this.calls = new RateBudget(limits.sdkPerMinute); this.events = new RateBudget(limits.eventsPerMinute);
  }
  stop(error: SandboxError): void { this.queue.close(error); }
  invoke(operation: SandboxOperationContract, signal: AbortSignal, method: SandboxSdkMethod, args: SandboxJson[], guard?: () => Promise<void>, serviceTimeoutMs = this.limits.serviceTimeoutMs): Promise<SandboxJson> {
    try { this.calls.consume(); assertJson(args); } catch (error) { return Promise.reject(error); }
    return this.queue.submit(async () => {
      signal.throwIfAborted();
      const lifetime = createExecutionLifetime({ signal, timeout: { milliseconds: serviceTimeoutMs, reason: new SandboxError('sandbox.service_timeout', 'Host service cancelled or timed out; its result may be unknown', 'unknown') } });
      const beforeEffect = async () => { lifetime.assertActive(); await guard?.(); lifetime.assertActive(); };
      const context: SandboxServiceContext = { identity: this.identity, signal: lifetime.signal, operationId: operation.id, beforeEffect };
      try {
        await lifetime.wait(beforeEffect());
        const result = await lifetime.wait(this.dispatch(context, operation, method, args));
        await lifetime.wait(beforeEffect()); assertJson(result);
        if (Buffer.byteLength(JSON.stringify(result)) > this.limits.messageBytes / 2) throw new SandboxError('sandbox.response_too_large', 'Host service response exceeds channel limit');
        return result;
      } finally { lifetime.dispose(); }
    });
  }
  private async dispatch(context: SandboxServiceContext, operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[]): Promise<SandboxJson> {
    const effects = operation.effects;
    const permit = (key: keyof SandboxEffects, value: string) => {
      if (!(effects[key] as string[] | undefined)?.includes(value) || !(this.grants[key] as string[] | undefined)?.includes(value)) throw new SandboxError('sandbox.not_authorized', `Undeclared or unapproved ${key}: ${value}`);
    };
    const count = (n: number) => { if (args.length !== n) throw new SandboxError('sandbox.invalid_request', 'Invalid SDK argument count'); };
    const string = (index: number, max = 256) => {
      const value = args[index];
      if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new SandboxError('sandbox.invalid_request', 'Invalid SDK string');
      return value;
    };
    const missing = (): never => { throw new SandboxError('sandbox.service_unavailable', 'Host service is not connected'); };
    if (method.startsWith('storage.')) {
      const write = method === 'storage.set' || method === 'storage.delete';
      permit('storage', write ? 'write' : 'read');
      if (!['storage.get', 'storage.set', 'storage.delete', 'storage.list'].includes(method)) throw new SandboxError('sandbox.invalid_request', 'Unknown storage method');
      count(method === 'storage.set' ? 2 : 1);
      const key = string(0);
      if (method !== 'storage.list' && !key) throw new SandboxError('sandbox.invalid_request', 'Empty storage key');
      if (!this.services.storage) missing();
      return this.services.storage!.transaction(context, entries => {
        context.signal.throwIfAborted();
        if (method === 'storage.get') return entries.get(key) ?? null;
        if (method === 'storage.list') return [...entries].filter(([k]) => k.startsWith(key)).map(([k, value]) => ({ key: k, value }));
        if (method === 'storage.set') {
          // Calculate before mutation: over-quota writes cannot partially alter the store.
          const next = new Map(entries); next.set(key, args[1]!);
          if (Buffer.byteLength(JSON.stringify([...next])) > this.limits.storageBytes) throw new SandboxError('sandbox.storage_quota', 'Private storage quota exceeded');
          entries.set(key, structuredClone(args[1]!));
        } else entries.delete(key);
        return null;
      });
    }
    if (method.startsWith('projectDatabase.')) {
      const database = this.services.projectDatabase;
      if (method === 'projectDatabase.transaction') {
        count(1); permit('projectDatabase', 'write');
        const statements = sandboxStatements(args[0]);
        return database ? database.transaction(context, statements) : missing();
      }
      if (method !== 'projectDatabase.get' && method !== 'projectDatabase.all') throw new SandboxError('sandbox.invalid_request', 'Unknown project database method');
      count(2); permit('projectDatabase', 'read');
      const statement = sandboxStatement(args[0], args[1]);
      if (!database) return missing();
      return method === 'projectDatabase.get' ? database.get(context, statement) : database.all(context, statement);
    }
    if (method === 'connections.request') {
      // The slot is the Manifest's, the account is the person's: the plugin names neither the origin nor a credential. The Host's client
      // checks the slot, the grant, the address and the call's own action again; here the operation's declared slot and the request's shape.
      count(2);
      const slot = string(0, 64);
      permit('connections', slot);
      const request = connectionRequest(args[1]);
      if (operation.kind === 'query' && request.method !== undefined && request.method !== 'GET' && request.method !== 'HEAD') throw new SandboxError('sandbox.not_authorized', 'A query can only read through a connection');
      if (!this.services.connections) return missing();
      // Only the four fields cross: the answer is rebuilt as plain JSON, so nothing the Host's client carries besides them reaches the plugin.
      const { status, headers, body, authenticated } = await this.services.connections.request(slot, { ...request, signal: context.signal });
      return { status, headers: { ...headers }, body, authenticated };
    }
    if (method === 'connections.describe' || method === 'connections.release') {
      // A record key names one of the plugin's records on a `per_record` slot; the Host's client checks its form, the slot and the call.
      count(2);
      const slot = string(0, 64);
      permit('connections', slot);
      const record = args[1] === null && method === 'connections.describe' ? undefined : string(1, PLUGIN_CONNECTION_RECORD_KEY_MAX);
      if (method === 'connections.release' && operation.kind === 'query') throw new SandboxError('sandbox.not_authorized', 'A query cannot release a connection');
      if (!this.services.connections) return missing();
      if (method === 'connections.release') { await this.services.connections.release(slot, record!); return null; }
      // Rebuilt from the three fields as plain JSON.
      const { bound, display_name, state } = await this.services.connections.describe(slot, record);
      return { bound, ...(display_name === undefined ? {} : { display_name }), ...(state === undefined ? {} : { state }) };
    }
    if (method.startsWith('materials.')) {
      // Reading is the one effect (`materials: ['read']`), and it reads bytes the plugin sent, never a path or an address: what reaches out
      // to a network, a machine's own pages or the Host's saved originals has no method here. The Host's client checks the rest.
      const materials = this.services.materials;
      permit('materials', 'read');
      if (method === 'materials.imageTextAvailable') { count(0); return materials?.imageTextAvailable ? materials.imageTextAvailable() : missing(); }
      if (method !== 'materials.readDocuments' && method !== 'materials.extract') throw new SandboxError('sandbox.invalid_request', 'Unknown materials method');
      count(2);
      if (method === 'materials.readDocuments') {
        const files = materialUploads(args[0]), { timeoutMs } = materialRequest(args[1], ['timeoutMs']);
        return materials?.readDocuments ? documentBatchJson(await materials.readDocuments(files, { signal: context.signal, ...(timeoutMs !== undefined ? { timeoutMs } : {}) })) : missing();
      }
      const source = materialSource(args[0]), request = materialRequest(args[1]);
      return materials?.extract ? extractionJson(await materials.extract(source, { ...request, signal: context.signal })) : missing();
    }
    if (method.startsWith('interaction.')) {
      // Drawing reads only what the plugin passes and writes nothing; the Host checks each drawing's shape, the channel that it is an object.
      const object = <T>(index: number): T => {
        const value: unknown = args[index];
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SandboxError('sandbox.invalid_request', 'Interaction drawings take objects');
        return value as T;
      };
      if (method === 'interaction.nextStepsHtml') { count(1); const input = object<Parameters<PluginInteractionClient['nextStepsHtml']>[0]>(0); return this.services.interaction ? this.services.interaction.nextStepsHtml(input) : missing(); }
      if (method !== 'interaction.questionHtml' && method !== 'interaction.cardHtml') throw new SandboxError('sandbox.invalid_request', 'Unknown interaction method');
      count(2);
      const options = object<{ reask?: unknown; redo?: unknown }>(1), interaction = this.services.interaction ?? missing();
      return method === 'interaction.questionHtml'
        ? interaction.questionHtml(object<Parameters<PluginInteractionClient['questionHtml']>[0]>(0), { reask: options.reask === true })
        : interaction.cardHtml(object<Parameters<PluginInteractionClient['cardHtml']>[0]>(0), { redo: options.redo === true });
    }
    switch (method) {
      case 'artifacts.get': {
        count(1); permit('artifacts', 'read');
        const ref = args[0];
        if (!ref || typeof ref !== 'object' || Array.isArray(ref) || Object.keys(ref).some(key => !['artifact_id', 'version'].includes(key)) || typeof ref.artifact_id !== 'string' || !ref.artifact_id || ref.artifact_id.length > 256 || !Number.isSafeInteger(ref.version) || (ref.version as number) < 1) throw new SandboxError('sandbox.invalid_request', 'Artifact reads require an exact artifact_id and positive version');
        return this.services.artifacts ? this.services.artifacts.get(context, ref as { artifact_id: string; version: number }) : missing();
      }
      case 'artifacts.put': count(1); permit('artifacts', 'write'); return this.services.artifacts ? this.services.artifacts.put(context, args[0]!) : missing();
      case 'capability.call': count(2); permit('capabilities', string(0)); return this.services.capability ? this.services.capability.call(context, string(0), args[1]!) : missing();
      case 'events.publish': count(2); permit('events', string(0)); this.events.consume(); if (!this.services.events) missing(); await this.services.events!.publish(context, string(0), args[1]!); return null;
      case 'resource.read': count(1); permit('resources', string(0)); if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(string(0))) throw new SandboxError('sandbox.invalid_request', 'Resource must be a logical name'); return this.services.resource ? this.services.resource.read(context, string(0)) : missing();
      case 'network.request': {
        count(1);
        const request = args[0] as unknown as SandboxNetworkRequest;
        if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.url !== 'string') throw new SandboxError('sandbox.invalid_request', 'Invalid network request');
        let domain: string;
        try { domain = new URL(request.url).hostname; } catch { throw new SandboxError('sandbox.invalid_request', 'Invalid URL'); }
        permit('networkDomains', domain);
        if (request.secretRefs !== undefined && (!Array.isArray(request.secretRefs) || request.secretRefs.some(r => typeof r !== 'string'))) throw new SandboxError('sandbox.invalid_request', 'Invalid secret references');
        for (const ref of request.secretRefs ?? []) permit('secretRefs', ref);
        return this.services.network ? this.services.network.request(context, request, { domains: [domain], secretRefs: request.secretRefs ?? [] }) as unknown as Promise<SandboxJson> : missing();
      }
      default: throw new SandboxError('sandbox.invalid_request', 'Unknown SDK method');
    }
  }
}

const CONNECTION_FIELDS = new Set(['url', 'record_key', 'method', 'headers', 'body']);
/** The shape of a connection request across the channel: plain strings only, nothing the plugin could use to pass a signal or a credential of its own. */
function connectionRequest(value: SandboxJson | undefined): { url: string; record_key?: string; method?: PluginConnectionMethod; headers?: Record<string, string>; body?: string } {
  const invalid = (): never => { throw new SandboxError('sandbox.invalid_request', 'Invalid connection request'); };
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !CONNECTION_FIELDS.has(key))) return invalid();
  const { url, record_key, method, headers, body } = value as { [key: string]: SandboxJson };
  if (typeof url !== 'string' || (method !== undefined && typeof method !== 'string') || (body !== undefined && typeof body !== 'string')) return invalid();
  if (record_key !== undefined && (typeof record_key !== 'string' || record_key.length > PLUGIN_CONNECTION_RECORD_KEY_MAX)) return invalid();
  if (headers !== undefined && (!headers || typeof headers !== 'object' || Array.isArray(headers) || Object.values(headers).some(item => typeof item !== 'string'))) return invalid();
  return { url, ...(record_key === undefined ? {} : { record_key }), ...(method === undefined ? {} : { method: method as PluginConnectionMethod }), ...(headers === undefined ? {} : { headers: headers as Record<string, string> }), ...(body === undefined ? {} : { body }) };
}
