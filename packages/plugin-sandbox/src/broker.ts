import type { PluginBackgroundExecution, PluginInteractionClient, PluginMaterialsClient } from '@molis-ai/molis-work-contracts/platform/plugin';
import { PLUGIN_CONNECTION_RECORD_KEY_MAX, type PluginConnectionMethod, type PluginConnectionsClient } from '@molis-ai/molis-work-contracts/platform/plugin-connections';
import type { SandboxEffects, SandboxIdentity, SandboxJson, SandboxNetworkRequest, SandboxNetworkResponse, SandboxOperationContract, SandboxSdkMethod } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { BACKGROUND_EXECUTIONS, type SandboxBackground } from './background.js';
import { assertJson, SandboxError } from './schema.js';
import { sandboxStatement, sandboxStatements, type SandboxDatabaseService } from './database.js';
import { documentBatchJson, extractionJson, materialLocalUrl, materialRequest, materialSource, materialUploads, originalPart, originalRecordKey, plainJson } from './materials.js';
import { availabilityJson, choicesJson, modelCall, modelResultJson, modelSelection, type SandboxModel } from './model.js';
import { applyOwnerFileChanges, ownerFileChanges, ownerFileInfo, ownerFileList, ownerFilePath, ownerFileRead, type SandboxOwnerFiles } from './owner-files.js';
import { BoundedQueue, RateBudget } from './queue.js';
import { createExecutionLifetime } from '@molis-ai/molis-work-plugin-sdk';
import { randomUUID } from 'node:crypto';

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
  /** The activation's `services.ownerFiles` without its `rootPath`: the plugin's own declared files by relative path (S-64). */
  ownerFiles?: SandboxOwnerFiles;
  /** The activation's `services.model` without its `configuration`, with the instructions the package registered (S-66, PG-017 P1). */
  model?: SandboxModel;
  /** The activation's `services.background` reduced to `start`, and the lane its runs go to (PG-017 P3): the executions are the broker's, so they end with it. */
  background?: SandboxBackground;
}
interface DispatchGuards {
  permit(key: keyof SandboxEffects, value: string): void;
  count(n: number): void;
  string(index: number, max?: number): string;
  missing(): never;
}
interface BrokerLimits { sdkQueue: number; sdkPerMinute: number; eventsPerMinute: number; serviceTimeoutMs: number; storageBytes: number; messageBytes: number }

export class SandboxBroker {
  private readonly queue: BoundedQueue;
  private readonly calls: RateBudget;
  private readonly events: RateBudget;
  /** The executions this broker accepted and that have not ended: the only ones its package can cancel. */
  private readonly executions = new Map<string, { target: string; execution: PluginBackgroundExecution<SandboxJson> }>();
  private accepting = 0;
  private stopped = false;
  constructor(private readonly identity: Readonly<SandboxIdentity>, private readonly grants: SandboxEffects, private readonly services: SandboxServices, private readonly limits: BrokerLimits) {
    this.queue = new BoundedQueue(limits.sdkQueue); this.calls = new RateBudget(limits.sdkPerMinute); this.events = new RateBudget(limits.eventsPerMinute);
  }
  stop(error: SandboxError): void {
    this.stopped = true; this.queue.close(error);
    for (const { execution } of this.executions.values()) execution.cancel();
    this.executions.clear();
  }
  /** `connections`: the call's own (S-94), which takes the activation's place for this call; the Host's proxy alone supplies it. */
  invoke(operation: SandboxOperationContract, signal: AbortSignal, method: SandboxSdkMethod, args: SandboxJson[], guard?: () => Promise<void>, serviceTimeoutMs = this.limits.serviceTimeoutMs,
    connections: PluginConnectionsClient | undefined = this.services.connections): Promise<SandboxJson> {
    try { this.calls.consume(); assertJson(args); } catch (error) { return Promise.reject(error); }
    return this.queue.submit(async () => {
      signal.throwIfAborted();
      const lifetime = createExecutionLifetime({ signal, timeout: { milliseconds: serviceTimeoutMs, reason: new SandboxError('sandbox.service_timeout', 'Host service cancelled or timed out; its result may be unknown', 'unknown') } });
      const beforeEffect = async () => { lifetime.assertActive(); await guard?.(); lifetime.assertActive(); };
      const context: SandboxServiceContext = { identity: this.identity, signal: lifetime.signal, operationId: operation.id, beforeEffect };
      try {
        await lifetime.wait(beforeEffect());
        const result = await lifetime.wait(this.dispatch(context, operation, method, args, connections));
        await lifetime.wait(beforeEffect()); assertJson(result);
        if (Buffer.byteLength(JSON.stringify(result)) > this.limits.messageBytes / 2) throw new SandboxError('sandbox.response_too_large', 'Host service response exceeds channel limit');
        return result;
      } finally { lifetime.dispose(); }
    });
  }
  /** The checks every SDK method makes before it reaches a service: the declared effect that the person also approved, the argument count and one string. */
  private guards(operation: SandboxOperationContract, args: SandboxJson[]): DispatchGuards {
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
    return { permit, count, string, missing };
  }
  private async dispatchMaterials(context: SandboxServiceContext, method: SandboxSdkMethod, args: SandboxJson[], { permit, count, missing }: DispatchGuards): Promise<SandboxJson> {
    // `read` reads bytes the plugin sent. `fetch_local` and `original` are effects of their own (S-65): the first hands the Host an address as
    // data and takes back extracted text, the second names the Host's saved file by the plugin's own key and takes it back in parts; neither
    // gives the plugin a socket, an address that was resolved, or a path. A network page (`materials:fetch`) has no method here. The Host's
    // client checks the Manifest's permission, the grant and the running action each time, and the Host's readers the address and the file.
    const materials = this.services.materials;
    if (method === 'materials.readLocalPage') {
      permit('materials', 'fetch_local'); count(1);
      const url = materialLocalUrl(args[0]);
      return materials?.readLocalPage ? extractionJson(await materials.readLocalPage(url, { signal: context.signal })) : missing();
    }
    if (method === 'materials.claimOriginal' || method === 'materials.releaseOriginal') {
      permit('materials', 'original'); count(1);
      const key = originalRecordKey(args[0]);
      const call = method === 'materials.claimOriginal' ? materials?.claimOriginal : materials?.releaseOriginal;
      if (!call) return missing();
      await call.call(materials, key);
      return null;
    }
    if (method === 'materials.readOriginalRange') {
      permit('materials', 'original'); count(4);
      const key = originalRecordKey(args[0]), { offset, length, revision } = originalPart(args[1], args[2], args[3]);
      if (!materials?.readOriginalRange) return missing();
      const part = await materials.readOriginalRange(key, { offset, length, ...(revision !== undefined ? { revision } : {}), signal: context.signal });
      return { data_base64: Buffer.from(part.bytes).toString('base64'), byte_length: part.bytes.byteLength, size: part.size, revision: part.revision };
    }
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
  private async dispatchOwnerFiles(context: SandboxServiceContext, operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], { permit, count, missing }: DispatchGuards): Promise<SandboxJson> {
    // By relative path and in bounded JSON: the Host's client checks the Manifest's permissions, the grant, the running action and its original
    // caller, and its port that the path is inside a declared entry with no link or special node on the way; the folder's location and the
    // writer callback have no method here, and a query reads only.
    if (method !== 'ownerFiles.stat' && method !== 'ownerFiles.list' && method !== 'ownerFiles.read' && method !== 'ownerFiles.write') throw new SandboxError('sandbox.invalid_request', 'Unknown owner files method');
    count(1);
    const files = this.services.ownerFiles;
    if (method === 'ownerFiles.write') {
      permit('ownerFiles', 'write');
      if (operation.kind === 'query') throw new SandboxError('sandbox.not_authorized', 'A query cannot write files');
      const steps = ownerFileChanges(args[0]);
      if (!files) return missing();
      await context.beforeEffect?.();
      await files.write(writer => applyOwnerFileChanges(writer, steps));
      return null;
    }
    permit('ownerFiles', 'read');
    const path = ownerFilePath(args[0]);
    if (!files) return missing();
    return plainJson(method === 'ownerFiles.stat' ? ownerFileInfo(files, path) : method === 'ownerFiles.list' ? ownerFileList(files, path) : ownerFileRead(files, path));
  
  }
  private async dispatchModel(context: SandboxServiceContext, operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], { permit, count, missing }: DispatchGuards): Promise<SandboxJson> {
    // The Host's client asks the Manifest's `model:*` permissions, the grant, the running instance, that the call is inside the plugin's own concurrent
    // action that declares `model:invoke`, and the original caller's `beforeEffect()` before the model is asked and again before the answer is handed
    // over. Here: the declared and approved effect, a command for anything that spends the model, and a request that names an instruction the package
    // registered instead of carrying text.
    const model = this.services.model;
    if (method === 'model.choices') { permit('model', 'read'); count(0); return model ? choicesJson(model.client.choices()) : missing(); }
    if (method === 'model.availability') {
      permit('model', 'read'); count(1);
      const selection = modelSelection(args[0]);
      return model ? availabilityJson(model.client.availability(selection)) : missing();
    }
    if (method !== 'model.complete') throw new SandboxError('sandbox.invalid_request', 'Unknown model method');
    permit('model', 'invoke'); count(1);
    if (operation.kind === 'query') throw new SandboxError('sandbox.not_authorized', 'A query cannot send a model request');
    const call = modelCall(args[0], model?.instructions ?? []);
    if (!model) return missing();
    const result = await model.client.complete(call.prompt, { ...call.request, signal: context.signal });
    result.validateResult();
    return modelResultJson(result);
  }
  private async dispatchBackground(operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], { permit, count, string, missing }: DispatchGuards): Promise<SandboxJson> {
    // The Host's client asks the Manifest's `background_job` metadata on the plugin's own concurrent action, the running instance and the original
    // caller's authority (before the Host accepts, and again at each `beforeEffect` of the run). Here: only a command starts or cancels work, the
    // operation that runs is one the contract names and the person approved, its input is checked before anything is accepted, and the number of
    // runs the package can have outstanding is bounded.
    if (operation.kind === 'query') throw new SandboxError('sandbox.not_authorized', 'A query cannot start background work');
    if (method === 'background.cancel') {
      count(1); const id = string(0, 64);
      if (!operation.effects.background?.some(target => this.grants.background?.includes(target))) throw new SandboxError('sandbox.not_authorized', 'Undeclared or unapproved background work');
      const accepted = this.executions.get(id);
      if (!accepted) return false;
      permit('background', accepted.target);
      accepted.execution.cancel();
      return true;
    }
    if (method !== 'background.start') throw new SandboxError('sandbox.invalid_request', 'Unknown background method');
    count(2); const target = string(0, 128), input = args[1]!; permit('background', target);
    const background = this.services.background;
    if (!background) return missing();
    background.lane.check(target, input);
    if (this.executions.size + this.accepting >= BACKGROUND_EXECUTIONS) throw new SandboxError('sandbox.queue_full', 'Too many background executions are still running');
    this.accepting += 1;
    let execution: PluginBackgroundExecution<SandboxJson>;
    try { execution = await background.client.start(control => background.lane.run(target, input, { signal: control.signal, beforeEffect: control.beforeEffect })); }
    finally { this.accepting -= 1; }
    if (this.stopped) {
      execution.cancel();
      void execution.result.catch(() => undefined);
      throw new SandboxError('sandbox.stopped', 'Sandbox stopped while accepting background work');
    }
    const id = randomUUID();
    this.executions.set(id, { target, execution });
    void execution.result.then(() => undefined, () => undefined).then(() => { this.executions.delete(id); });
    return id;
  }
  private async dispatchConnectionRecord(operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], { permit, count, string, missing }: DispatchGuards, connections: PluginConnectionsClient | undefined): Promise<SandboxJson> {
    // A record key names one of the plugin's records on a `per_record` slot; the Host's client checks its form, the slot and the call.
    count(2);
    const slot = string(0, 64);
    permit('connections', slot);
    const record = args[1] === null && method === 'connections.describe' ? undefined : string(1, PLUGIN_CONNECTION_RECORD_KEY_MAX);
    if (method === 'connections.release' && operation.kind === 'query') throw new SandboxError('sandbox.not_authorized', 'A query cannot release a connection');
    if (!connections) return missing();
    if (method === 'connections.release') { await connections.release(slot, record!); return null; }
    // Rebuilt from the three fields as plain JSON.
    const { bound, display_name, state } = await connections.describe(slot, record);
    return { bound, ...(display_name === undefined ? {} : { display_name }), ...(state === undefined ? {} : { state }) };
  }
  private async dispatch(context: SandboxServiceContext, operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[], connections: PluginConnectionsClient | undefined): Promise<SandboxJson> {
    const guards = this.guards(operation, args), { permit, count, string, missing } = guards;
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
      if (!connections) return missing();
      // Only the four fields cross: the answer is rebuilt as plain JSON, so nothing the Host's client carries besides them reaches the plugin.
      const { status, headers, body, authenticated } = await connections.request(slot, { ...request, signal: context.signal });
      return { status, headers: { ...headers }, body, authenticated };
    }
    if (method === 'connections.describe' || method === 'connections.release') return this.dispatchConnectionRecord(operation, method, args, guards, connections);
    if (method.startsWith('materials.')) return this.dispatchMaterials(context, method, args, guards);
    if (method.startsWith('ownerFiles.')) return this.dispatchOwnerFiles(context, operation, method, args, guards);
    if (method.startsWith('model.')) return this.dispatchModel(context, operation, method, args, guards);
    if (method.startsWith('background.')) return this.dispatchBackground(operation, method, args, guards);
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
