import { randomUUID } from "node:crypto";
import type {
  HostCapabilityDefinition,
  LocalHostProjectClient,
  LocalHostProjectReference,
  LocalHostStatus,
} from "@molis-ai/molis-work-contracts/platform/app-host";
import { CapabilityRegistry, type CapabilityHandler } from "@molis-ai/molis-work-kernel";

export interface LocalHostRuntimeFactory<Runtime> {
  open(reference: LocalHostProjectReference): Runtime | Promise<Runtime>;
  close(runtime: Runtime, reference: LocalHostProjectReference): void | Promise<void>;
}

export interface LocalHostOptions<Runtime> {
  runtimeFactory: LocalHostRuntimeFactory<Runtime>;
  instanceId?: string;
  observation?: {
    before(runtime: Runtime, reference: LocalHostProjectReference, capability: HostCapabilityDefinition, input: unknown): unknown;
    after(runtime: Runtime, ticket: unknown, result: unknown, threw: boolean): void;
  };
}

export class LocalHostError extends Error {
  constructor(
    readonly code:
      | "host.closed"
      | "host.project_invalid"
      | "host.project_identity_conflict"
      | "host.project_closing",
    message: string,
  ) {
    super(message);
  }
}

interface RuntimeEntry<Runtime> {
  reference: LocalHostProjectReference;
  runtime: Promise<Runtime>;
  state: "opening" | "ready" | "closing";
  operationTail: Promise<void>;
  activeUses: number;
  idleWaiters: Array<() => void>;
}

function normalizeReference(reference: LocalHostProjectReference): LocalHostProjectReference {
  const normalized = {
    project_id: reference.project_id.trim(),
    board_id: reference.board_id.trim(),
    storage_key: reference.storage_key.trim(),
  };
  if (!normalized.project_id || !normalized.board_id || !normalized.storage_key) {
    throw new LocalHostError("host.project_invalid", "Local Host Project reference 不能为空");
  }
  return normalized;
}

/**
 * One process-local composition owner. Each storage key is opened exactly
 * once, including concurrent discovery, and all typed Capability calls are
 * serialized through that Project runtime.
 */
export class LocalHost<Runtime> {
  readonly instanceId: string;
  readonly capabilities = new CapabilityRegistry<Runtime>();
  private readonly entries = new Map<string, RuntimeEntry<Runtime>>();
  private readonly closingKeys = new Set<string>();
  private state: "running" | "closing" | "closed" = "running";

  constructor(private readonly options: LocalHostOptions<Runtime>) {
    this.instanceId = options.instanceId?.trim() || `local-host-${randomUUID()}`;
  }

  register<Input, Output>(
    definition: HostCapabilityDefinition<Input, Output>,
    handler: CapabilityHandler<Runtime, Input, Output>,
  ): () => void {
    this.assertRunning();
    return this.capabilities.register(definition, handler);
  }

  client(reference: LocalHostProjectReference): LocalHostProjectClient {
    const project = normalizeReference(reference);
    this.assertCompatibleReference(project);
    const client: LocalHostProjectClient = {
      host_instance_id: this.instanceId,
      project,
      withScope: <Result>(operation: (client: LocalHostProjectClient) => Result | Promise<Result>) =>
        this.withRuntime(project, () => operation(client)),
      invoke: <Input, Output>(
        capability: HostCapabilityDefinition<Input, Output>,
        input: Input,
      ) => this.invoke(project, capability, input),
    };
    return client;
  }

  async invoke<Input, Output>(
    reference: LocalHostProjectReference,
    capability: HostCapabilityDefinition<Input, Output>,
    input: Input,
  ): Promise<Output> {
    const entry = this.ensureEntry(reference);
    const operation = entry.operationTail.then(async () => {
      const runtime = await entry.runtime;
      let ticket: unknown;
      try { ticket = this.options.observation?.before(runtime, entry.reference, capability, input); } catch { /* auxiliary observer only */ }
      let result: Output;
      try { result = await this.capabilities.invoke<Input, Output>(runtime, capability, input); }
      catch (error) {
        try { this.options.observation?.after(runtime, ticket, error, true); } catch { /* preserve business error */ }
        throw error;
      }
      try { this.options.observation?.after(runtime, ticket, result, false); } catch { /* preserve business result */ }
      return result;
    });
    entry.operationTail = operation.then(() => undefined, () => undefined);
    return await operation;
  }

  /** Compatibility composition port while legacy callers move to capabilities. */
  async withRuntime<Result>(
    reference: LocalHostProjectReference,
    operation: (runtime: Runtime) => Result | Promise<Result>,
  ): Promise<Result> {
    const entry = this.ensureEntry(reference);
    entry.activeUses += 1;
    try {
      return await operation(await entry.runtime);
    } finally {
      entry.activeUses -= 1;
      if (entry.activeUses === 0) {
        for (const resolve of entry.idleWaiters.splice(0)) resolve();
      }
    }
  }

  status(): LocalHostStatus {
    return {
      instance_id: this.instanceId,
      state: this.state,
      projects: [...this.entries.values()]
        .map((entry) => ({ ...entry.reference, state: entry.state }))
        .sort((left, right) => left.storage_key.localeCompare(right.storage_key)),
      capabilities: this.capabilities.descriptors(),
    };
  }

  async closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    const storageKey = typeof referenceOrStorageKey === "string"
      ? referenceOrStorageKey.trim()
      : normalizeReference(referenceOrStorageKey).storage_key;
    const entry = this.entries.get(storageKey);
    if (!entry) return false;
    entry.state = "closing";
    this.closingKeys.add(storageKey);
    try {
      await entry.operationTail;
      if (entry.activeUses > 0) {
        await new Promise<void>((resolve) => { entry.idleWaiters.push(resolve); });
      }
      await this.options.runtimeFactory.close(await entry.runtime, entry.reference);
      return true;
    } finally {
      if (this.entries.get(storageKey) === entry) this.entries.delete(storageKey);
      this.closingKeys.delete(storageKey);
    }
  }

  async close(): Promise<void> {
    if (this.state === "closed") return;
    this.state = "closing";
    const keys = [...this.entries.keys()];
    await Promise.all(keys.map((key) => this.closeProject(key)));
    this.state = "closed";
  }

  private ensureEntry(reference: LocalHostProjectReference): RuntimeEntry<Runtime> {
    this.assertRunning();
    const normalized = normalizeReference(reference);
    if (this.closingKeys.has(normalized.storage_key)) {
      throw new LocalHostError("host.project_closing", "这个 Project 的 Local Host runtime 正在关闭");
    }
    const existing = this.entries.get(normalized.storage_key);
    if (existing) {
      this.assertSameIdentity(existing.reference, normalized);
      return existing;
    }
    const entry: RuntimeEntry<Runtime> = {
      reference: normalized,
      runtime: Promise.resolve().then(() => this.options.runtimeFactory.open(normalized)),
      state: "opening",
      operationTail: Promise.resolve(),
      activeUses: 0,
      idleWaiters: [],
    };
    this.entries.set(normalized.storage_key, entry);
    entry.runtime.then(
      () => { if (entry.state === "opening") entry.state = "ready"; },
      () => { if (this.entries.get(normalized.storage_key) === entry) this.entries.delete(normalized.storage_key); },
    );
    return entry;
  }

  private assertCompatibleReference(reference: LocalHostProjectReference): void {
    this.assertRunning();
    const existing = this.entries.get(reference.storage_key);
    if (existing) this.assertSameIdentity(existing.reference, reference);
  }

  private assertSameIdentity(
    current: LocalHostProjectReference,
    next: LocalHostProjectReference,
  ): void {
    if (current.project_id !== next.project_id || current.board_id !== next.board_id) {
      throw new LocalHostError(
        "host.project_identity_conflict",
        `同一 storage_key 不能映射到不同 Project: ${current.project_id} / ${next.project_id}`,
      );
    }
  }

  private assertRunning(): void {
    if (this.state !== "running") throw new LocalHostError("host.closed", "Local Host 已关闭");
  }
}
