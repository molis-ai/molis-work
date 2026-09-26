import type { SandboxEffects, SandboxIdentity, SandboxJson, SandboxNetworkRequest, SandboxNetworkResponse, SandboxOperationContract, SandboxSdkMethod } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { assertJson, SandboxError } from './schema.js';
import { BoundedQueue, RateBudget } from './queue.js';

export interface SandboxServiceContext { readonly identity: Readonly<SandboxIdentity>; readonly signal: AbortSignal; readonly operationId: string }
export interface SandboxServices {
  /** Must serialize by identity and atomically commit only if callback succeeds and signal remains active. */
  storage?: { transaction<T>(context: SandboxServiceContext, mutate: (entries: Map<string, SandboxJson>) => T): Promise<T> };
  artifacts?: { get(context: SandboxServiceContext, reference: { artifact_id: string; version: number }): Promise<SandboxJson>; put(context: SandboxServiceContext, value: SandboxJson): Promise<SandboxJson> };
  capability?: { call(context: SandboxServiceContext, id: string, input: SandboxJson): Promise<SandboxJson> };
  events?: { publish(context: SandboxServiceContext, id: string, payload: SandboxJson): Promise<void> };
  network?: { request(context: SandboxServiceContext, request: SandboxNetworkRequest, authorization: { domains: string[]; secretRefs: string[] }): Promise<SandboxNetworkResponse> };
  resource?: { read(context: SandboxServiceContext, name: string): Promise<string> };
}
export interface BrokerLimits { sdkQueue: number; sdkPerMinute: number; eventsPerMinute: number; serviceTimeoutMs: number; storageBytes: number; messageBytes: number }

export class SandboxBroker {
  private readonly queue: BoundedQueue;
  private readonly calls: RateBudget;
  private readonly events: RateBudget;
  constructor(private readonly identity: Readonly<SandboxIdentity>, private readonly grants: SandboxEffects, private readonly services: SandboxServices, private readonly limits: BrokerLimits) {
    this.queue = new BoundedQueue(limits.sdkQueue); this.calls = new RateBudget(limits.sdkPerMinute); this.events = new RateBudget(limits.eventsPerMinute);
  }
  stop(error: SandboxError): void { this.queue.close(error); }
  invoke(operation: SandboxOperationContract, signal: AbortSignal, method: SandboxSdkMethod, args: SandboxJson[]): Promise<SandboxJson> {
    try { this.calls.consume(); assertJson(args); } catch (error) { return Promise.reject(error); }
    return this.queue.submit(async () => {
      signal.throwIfAborted();
      const timeout = AbortSignal.timeout(this.limits.serviceTimeoutMs);
      const serviceSignal = AbortSignal.any([signal, timeout]);
      const context: SandboxServiceContext = { identity: this.identity, signal: serviceSignal, operationId: operation.id };
      const work = this.dispatch(context, operation.effects, method, args);
      const result = await new Promise<SandboxJson>((resolve, reject) => {
        const abort = () => reject(new SandboxError('SERVICE_TIMEOUT', 'Host service cancelled or timed out'));
        serviceSignal.addEventListener('abort', abort, { once: true });
        work.then(resolve, reject).finally(() => serviceSignal.removeEventListener('abort', abort)).catch(() => {});
      });
      serviceSignal.throwIfAborted(); assertJson(result);
      if (Buffer.byteLength(JSON.stringify(result)) > this.limits.messageBytes / 2) throw new SandboxError('RESPONSE_TOO_LARGE', 'Host service response exceeds channel limit');
      return result;
    });
  }
  private async dispatch(context: SandboxServiceContext, effects: SandboxEffects, method: SandboxSdkMethod, args: SandboxJson[]): Promise<SandboxJson> {
    const permit = (key: keyof SandboxEffects, value: string) => {
      if (!(effects[key] as string[] | undefined)?.includes(value) || !(this.grants[key] as string[] | undefined)?.includes(value)) throw new SandboxError('NOT_AUTHORIZED', `Undeclared or unapproved ${key}: ${value}`);
    };
    const count = (n: number) => { if (args.length !== n) throw new SandboxError('INVALID_REQUEST', 'Invalid SDK argument count'); };
    const string = (index: number, max = 256) => {
      const value = args[index];
      if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new SandboxError('INVALID_REQUEST', 'Invalid SDK string');
      return value;
    };
    const missing = (): never => { throw new SandboxError('SERVICE_UNAVAILABLE', 'Host service is not connected'); };
    if (method.startsWith('storage.')) {
      const write = method === 'storage.set' || method === 'storage.delete';
      permit('storage', write ? 'write' : 'read');
      if (!['storage.get', 'storage.set', 'storage.delete', 'storage.list'].includes(method)) throw new SandboxError('INVALID_REQUEST', 'Unknown storage method');
      count(method === 'storage.set' ? 2 : 1);
      const key = string(0);
      if (method !== 'storage.list' && !key) throw new SandboxError('INVALID_REQUEST', 'Empty storage key');
      if (!this.services.storage) missing();
      return this.services.storage!.transaction(context, entries => {
        context.signal.throwIfAborted();
        if (method === 'storage.get') return entries.get(key) ?? null;
        if (method === 'storage.list') return [...entries].filter(([k]) => k.startsWith(key)).map(([k, value]) => ({ key: k, value }));
        if (method === 'storage.set') {
          // Calculate before mutation: over-quota writes cannot partially alter the store.
          const next = new Map(entries); next.set(key, args[1]!);
          if (Buffer.byteLength(JSON.stringify([...next])) > this.limits.storageBytes) throw new SandboxError('STORAGE_QUOTA', 'Private storage quota exceeded');
          entries.set(key, structuredClone(args[1]!));
        } else entries.delete(key);
        return null;
      });
    }
    switch (method) {
      case 'artifacts.get': {
        count(1); permit('artifacts', 'read');
        const ref = args[0];
        if (!ref || typeof ref !== 'object' || Array.isArray(ref) || Object.keys(ref).some(key => !['artifact_id', 'version'].includes(key)) || typeof ref.artifact_id !== 'string' || !ref.artifact_id || ref.artifact_id.length > 256 || !Number.isSafeInteger(ref.version) || (ref.version as number) < 1) throw new SandboxError('INVALID_REQUEST', 'Artifact reads require an exact artifact_id and positive version');
        return this.services.artifacts ? this.services.artifacts.get(context, ref as { artifact_id: string; version: number }) : missing();
      }
      case 'artifacts.put': count(1); permit('artifacts', 'write'); return this.services.artifacts ? this.services.artifacts.put(context, args[0]!) : missing();
      case 'capability.call': count(2); permit('capabilities', string(0)); return this.services.capability ? this.services.capability.call(context, string(0), args[1]!) : missing();
      case 'events.publish': count(2); permit('events', string(0)); this.events.consume(); if (!this.services.events) missing(); await this.services.events!.publish(context, string(0), args[1]!); return null;
      case 'resource.read': count(1); permit('resources', string(0)); if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(string(0))) throw new SandboxError('INVALID_REQUEST', 'Resource must be a logical name'); return this.services.resource ? this.services.resource.read(context, string(0)) : missing();
      case 'network.request': {
        count(1);
        const request = args[0] as unknown as SandboxNetworkRequest;
        if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.url !== 'string') throw new SandboxError('INVALID_REQUEST', 'Invalid network request');
        let domain: string;
        try { domain = new URL(request.url).hostname; } catch { throw new SandboxError('INVALID_REQUEST', 'Invalid URL'); }
        permit('networkDomains', domain);
        if (request.secretRefs !== undefined && (!Array.isArray(request.secretRefs) || request.secretRefs.some(r => typeof r !== 'string'))) throw new SandboxError('INVALID_REQUEST', 'Invalid secret references');
        for (const ref of request.secretRefs ?? []) permit('secretRefs', ref);
        return this.services.network ? this.services.network.request(context, request, { domains: [domain], secretRefs: request.secretRefs ?? [] }) as unknown as Promise<SandboxJson> : missing();
      }
      default: throw new SandboxError('INVALID_REQUEST', 'Unknown SDK method');
    }
  }
}
