import type {
  ArtifactReference,
  ArtifactVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/artifacts";
import {
  PluginWiringError,
  portTypeKey,
  requiredPorts,
  type PluginInputGroupSelectionRecord,
  type PluginInputPortView,
  type PluginInputSourceCandidate,
  type PluginInputStatus,
  type PluginManifest,
  type PluginPortBindingInput,
  type PluginPortBindingRecord,
  type PluginPortOutputRecord,
  type PluginUpstreamReadyInputs,
  type PluginUpstreamUnavailableCode,
  type PluginUpstreamUnavailableReason,
  type PluginWiringApi,
  type PluginWiringRepository,
  type PluginWiringView,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { PluginHostLifecycle } from "./lifecycle.js";

/** Reads a published Artifact version. The graph never owns Artifact storage. */
export interface PluginArtifactReaderPort {
  read(reference: ArtifactReference): ArtifactVersionRecord | null;
}

export interface PluginInputFailure {
  board_id: string;
  plugin_id: string;
  code: PluginUpstreamUnavailableCode | "consumer_failed";
  message: string;
}

function bindingId(pluginId: string, port: string): string {
  return `${pluginId}:${port}`;
}

/**
 * Workspace wiring and delivery.
 *
 * A consumer receives a complete, fixed set of Artifact versions or nothing:
 * it never sees a half-applied change and never discovers sources itself.
 * Changing or losing an input revokes the old context before the consumer is
 * told, so a slow read cannot land after its authority is gone.
 */
export class PluginInputGraph implements PluginWiringApi {
  readonly #boardId: string;
  readonly #lifecycle: PluginHostLifecycle;
  readonly #repository: PluginWiringRepository;
  readonly #artifacts: PluginArtifactReaderPort;
  readonly #now: () => Date;
  readonly #failureListeners = new Set<(failure: PluginInputFailure) => void>();
  readonly #dispatched = new Map<string, string>();
  readonly #controllers = new Map<string, AbortController>();
  readonly #tails = new Map<string, Promise<void>>();
  readonly #retained = new Set<string>();

  constructor(input: {
    boardId: string;
    lifecycle: PluginHostLifecycle;
    repository: PluginWiringRepository;
    artifacts: PluginArtifactReaderPort;
    now?: () => Date;
  }) {
    this.#boardId = input.boardId;
    this.#lifecycle = input.lifecycle;
    this.#repository = input.repository;
    this.#artifacts = input.artifacts;
    this.#now = input.now ?? (() => new Date());
  }

  observeFailures(listener: (failure: PluginInputFailure) => void): () => void {
    this.#failureListeners.add(listener);
    return () => {
      this.#failureListeners.delete(listener);
    };
  }

  /** Validate a binding against both Manifests before it is ever persisted. */
  bind(input: PluginPortBindingInput): PluginPortBindingRecord {
    const target = this.#requireManifest(input.target_plugin_id);
    const source = this.#requireManifest(input.source_plugin_id);
    const inputPort = (target.ports?.inputs ?? [])
      .find((port) => port.port === input.target_port);
    if (!inputPort) {
      throw new PluginWiringError(
        "port_unknown",
        `${input.target_plugin_id} 没有输入端口 ${input.target_port}`,
      );
    }
    const outputPort = (source.ports?.outputs ?? [])
      .find((port) => port.port === input.source_port);
    if (!outputPort) {
      throw new PluginWiringError(
        "port_unknown",
        `${input.source_plugin_id} 没有输出端口 ${input.source_port}`,
      );
    }
    const wanted = portTypeKey(inputPort.artifact_type_id, inputPort.schema_version);
    const offered = portTypeKey(outputPort.artifact_type_id, outputPort.schema_version);
    if (wanted !== offered) {
      throw new PluginWiringError(
        "port_type_mismatch",
        `端口类型不匹配：${input.target_port} 需要 ${wanted}，${input.source_port} 产出 ${offered}`,
      );
    }
    const at = this.#now().toISOString();
    const existing = this.#repository.getBinding(
      this.#boardId,
      input.target_plugin_id,
      input.target_port,
    );
    const record: PluginPortBindingRecord = {
      board_id: this.#boardId,
      target_plugin_id: input.target_plugin_id,
      target_port: input.target_port,
      source_plugin_id: input.source_plugin_id,
      source_port: input.source_port,
      origin: input.origin,
      created_at: existing?.created_at ?? at,
      updated_at: at,
    };
    this.#repository.saveBinding(record);
    return { ...record };
  }

  unbind(targetPluginId: string, targetPort: string): void {
    this.#repository.deleteBinding(this.#boardId, targetPluginId, targetPort);
  }

  selectInputGroup(pluginId: string, groupId: string): PluginInputGroupSelectionRecord {
    const manifest = this.#requireManifest(pluginId);
    const groups = manifest.ports?.input_groups ?? [];
    if (!groups.some((group) => group.group_id === groupId)) {
      throw new PluginWiringError("input_group_unknown", `${pluginId} 没有输入组 ${groupId}`);
    }
    const record: PluginInputGroupSelectionRecord = {
      board_id: this.#boardId,
      plugin_id: pluginId,
      group_id: groupId,
      updated_at: this.#now().toISOString(),
    };
    this.#repository.saveInputGroup(record);
    return { ...record };
  }

  selectedGroup(pluginId: string): string | undefined {
    return this.#repository.getInputGroup(this.#boardId, pluginId)?.group_id;
  }

  /** Record a producer's new value for one output port. */
  publish(input: {
    plugin_id: string;
    port: string;
    reference: ArtifactReference;
    scope_key?: string | null;
  }): void {
    const manifest = this.#requireManifest(input.plugin_id);
    if (!(manifest.ports?.outputs ?? []).some((port) => port.port === input.port)) {
      throw new PluginWiringError(
        "port_unknown",
        `${input.plugin_id} 没有输出端口 ${input.port}`,
      );
    }
    this.#repository.saveOutput({
      board_id: this.#boardId,
      plugin_id: input.plugin_id,
      port: input.port,
      artifact_id: input.reference.artifact_id,
      version: input.reference.version,
      invalidated_reason: null,
      scope_key: input.scope_key ?? null,
      updated_at: this.#now().toISOString(),
    });
  }

  /** Withdraw an output port's current value with a user-safe reason. */
  invalidate(pluginId: string, port: string, safeReason: string): void {
    const existing = this.#repository.getOutput(this.#boardId, pluginId, port);
    this.#repository.saveOutput({
      board_id: this.#boardId,
      plugin_id: pluginId,
      port,
      artifact_id: existing?.artifact_id ?? null,
      version: existing?.version ?? null,
      invalidated_reason: safeReason,
      scope_key: existing?.scope_key ?? null,
      updated_at: this.#now().toISOString(),
    });
  }

  /** The fixed reference currently bound to one input port, or null. */
  reference(pluginId: string, port: string): ArtifactReference | null {
    const binding = this.#repository.getBinding(this.#boardId, pluginId, port);
    if (!binding) return null;
    const output = this.#repository.getOutput(
      this.#boardId,
      binding.source_plugin_id,
      binding.source_port,
    );
    if (!output || output.artifact_id === null || output.version === null) return null;
    if (output.invalidated_reason !== null) return null;
    return { artifact_id: output.artifact_id, version: output.version };
  }

  /** The current version on one output port; 0 when it has never published. */
  currentVersion(pluginId: string, port: string): number {
    return this.#repository.getOutput(this.#boardId, pluginId, port)?.version ?? 0;
  }

  outputReference(pluginId: string, port: string): ArtifactReference | null {
    const value = this.#repository.getOutput(this.#boardId, pluginId, port);
    return value && value.invalidated_reason === null && value.artifact_id !== null && value.version !== null
      ? { artifact_id: value.artifact_id, version: value.version } : null;
  }

  /**
   * Keep a published reference readable after the producing session ends.
   * Retention is a Host fact, so it is recorded rather than left to the Plugin.
   */
  retain(pluginId: string, reference: ArtifactReference): void {
    this.#retained.add(`${pluginId}\u0000${reference.artifact_id}@${reference.version}`);
  }

  /** References this Plugin asked the Host to keep. */
  retained(pluginId: string): ArtifactReference[] {
    const prefix = `${pluginId}\u0000`;
    return [...this.#retained]
      .filter((key) => key.startsWith(prefix))
      .map((key) => {
        const [artifactId, version] = key.slice(prefix.length).split("@");
        return { artifact_id: artifactId!, version: Number(version) };
      });
  }

  status(pluginId: string): PluginInputStatus {
    return this.#resolve(pluginId).status;
  }

  view(): PluginWiringView {
    const plugins = this.#lifecycle.enabledPluginIds()
      .map((pluginId) => {
        const manifest = this.#lifecycle.manifest(pluginId);
        if (!manifest) return null;
        const inputs = manifest.ports?.inputs ?? [];
        const selected = this.selectedGroup(pluginId);
        const required = new Set(requiredPorts(manifest.ports, selected));
        const ports: PluginInputPortView[] = inputs.map((port) => {
          const binding = this.#repository.getBinding(this.#boardId, pluginId, port.port);
          const candidates = this.#candidatesFor(port.artifact_type_id, port.schema_version, pluginId);
          const optional = port.optional === true || !required.has(port.port);
          const output = binding
            ? this.#repository.getOutput(this.#boardId, binding.source_plugin_id, binding.source_port)
            : null;
          const state: PluginInputPortView["state"] = binding === null
            ? (candidates.length > 1 ? "ambiguous" : "missing")
            : output === null || output.artifact_id === null
              ? "missing"
              : output.invalidated_reason !== null
                ? "unavailable"
                : "selected";
          return {
            port: port.port,
            artifact_type_id: port.artifact_type_id,
            schema_version: port.schema_version,
            optional,
            state,
            ...(binding
              ? {
                origin: binding.origin,
                source: {
                  source_plugin_id: binding.source_plugin_id,
                  source_port: binding.source_port,
                },
              }
              : {}),
            ...(output?.invalidated_reason ? { reason: output.invalidated_reason } : {}),
            candidates,
          };
        });
        return {
          plugin_id: pluginId,
          title: manifest.name,
          enabled: true,
          ports,
          groups: (manifest.ports?.input_groups ?? [])
            .map((group) => ({ group_id: group.group_id, title: group.title })),
          ...(selected === undefined ? {} : { selected_group: selected }),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return { board_id: this.#boardId, plugins };
  }

  /** Re-evaluate one consumer and deliver or revoke as the current wiring says. */
  evaluate(pluginId: string): void {
    const generation = this.#lifecycle.generation(pluginId);
    if (generation === undefined) return;
    const resolved = this.#resolve(pluginId);
    if (!resolved.applicable) return;

    if (resolved.status.status !== "ready") {
      this.#revoke(pluginId);
      const previous = this.#dispatched.get(pluginId);
      this.#dispatched.delete(pluginId);
      if (previous === undefined) return;
      this.#enqueue(pluginId, async (consumer) => {
        await consumer.contribution.onUpstreamUnavailable?.(resolved.reason!);
      });
      return;
    }

    const signature = resolved.signature;
    if (this.#dispatched.get(pluginId) === signature) return;
    this.#revoke(pluginId);
    this.#dispatched.set(pluginId, signature);
    const controller = new AbortController();
    this.#controllers.set(pluginId, controller);
    this.#enqueue(pluginId, async (consumer) => {
      if (controller.signal.aborted) return;
      await consumer.contribution.onUpstreamReady?.(resolved.inputs, {
        signal: controller.signal,
      });
    });
  }

  /** Re-evaluate every enabled consumer. Used after wiring changes and at start. */
  evaluateAll(): void {
    for (const pluginId of this.#lifecycle.enabledPluginIds()) this.evaluate(pluginId);
  }

  async drain(): Promise<void> {
    for (let guard = 0; this.#tails.size > 0 && guard < 1000; guard += 1) {
      await Promise.all([...this.#tails.values()]);
    }
  }

  #requireManifest(pluginId: string): PluginManifest {
    const manifest = this.#lifecycle.manifest(pluginId);
    if (!manifest) {
      throw new PluginWiringError("port_binding_invalid", `插件 ${pluginId} 没有登记`);
    }
    return manifest;
  }

  #candidatesFor(
    artifactTypeId: string,
    schemaVersion: number,
    excludePluginId: string,
  ): PluginInputSourceCandidate[] {
    const wanted = portTypeKey(artifactTypeId, schemaVersion);
    const candidates: PluginInputSourceCandidate[] = [];
    for (const pluginId of this.#lifecycle.enabledPluginIds()) {
      if (pluginId === excludePluginId) continue;
      const manifest = this.#lifecycle.manifest(pluginId);
      for (const output of manifest?.ports?.outputs ?? []) {
        if (portTypeKey(output.artifact_type_id, output.schema_version) !== wanted) continue;
        const record = this.#repository.getOutput(this.#boardId, pluginId, output.port);
        candidates.push({
          source_plugin_id: pluginId,
          source_port: output.port,
          title: `${manifest?.name ?? pluginId} · ${output.port}`,
          availability: record === null || record.artifact_id === null
            ? "waiting"
            : record.invalidated_reason !== null
              ? "unavailable"
              : "ready",
        });
      }
    }
    return candidates;
  }

  #resolve(pluginId: string): {
    applicable: boolean;
    status: PluginInputStatus;
    inputs: PluginUpstreamReadyInputs;
    signature: string;
    reason?: PluginUpstreamUnavailableReason;
  } {
    const manifest = this.#lifecycle.manifest(pluginId);
    const inputs = manifest?.ports?.inputs ?? [];
    if (!manifest || inputs.length === 0) {
      return { applicable: false, status: { status: "ready", ports: [] }, inputs: {}, signature: "" };
    }
    const selected = this.selectedGroup(pluginId);
    const required = requiredPorts(manifest.ports, selected);
    if (required.length === 0) {
      return {
        applicable: true,
        status: { status: "missing", missing: [] },
        inputs: {},
        signature: "",
        reason: {
          binding_id: bindingId(pluginId, "*"),
          code: "binding_removed",
          message: "还没有选择输入组",
        },
      };
    }

    const missing: string[] = [];
    const resolved = new Map<string, { output: PluginPortOutputRecord; record: ArtifactVersionRecord }>();
    let unavailable: PluginUpstreamUnavailableReason | undefined;

    for (const port of required) {
      const binding = this.#repository.getBinding(this.#boardId, pluginId, port);
      if (!binding) {
        missing.push(port);
        continue;
      }
      const output = this.#repository.getOutput(
        this.#boardId,
        binding.source_plugin_id,
        binding.source_port,
      );
      if (!output || output.artifact_id === null || output.version === null) {
        missing.push(port);
        continue;
      }
      if (output.invalidated_reason !== null) {
        missing.push(port);
        unavailable ??= {
          binding_id: bindingId(pluginId, port),
          code: "source_invalidated",
          message: output.invalidated_reason,
        };
        continue;
      }
      const record = this.#artifacts.read({
        artifact_id: output.artifact_id,
        version: output.version,
      });
      if (!record) {
        missing.push(port);
        unavailable ??= {
          binding_id: bindingId(pluginId, port),
          code: "content_unavailable",
          message: `输入 ${port} 的内容已不可读取`,
        };
        continue;
      }
      resolved.set(port, { output, record });
    }

    if (missing.length > 0) {
      return {
        applicable: true,
        status: { status: "missing", missing },
        inputs: {},
        signature: "",
        reason: unavailable ?? {
          binding_id: bindingId(pluginId, missing[0]!),
          code: "source_unavailable",
          message: `输入 ${missing.join("、")} 还没有可用来源`,
        },
      };
    }

    // The Host only compares opaque scope keys; it never reads business fields
    // out of them. A null key places no constraint.
    const scopes = new Set(
      [...resolved.values()]
        .map((entry) => entry.output.scope_key)
        .filter((scope): scope is string => scope !== null),
    );
    if (scopes.size > 1) {
      return {
        applicable: true,
        status: {
          status: "inconsistent",
          ports: required,
          message: "输入来自不同来源作用域，已停止投递",
        },
        inputs: {},
        signature: "",
        reason: {
          binding_id: bindingId(pluginId, required[0]!),
          code: "input_inconsistent",
          message: "输入来自不同来源作用域，已停止投递",
        },
      };
    }

    const delivered: Record<string, ArtifactVersionRecord> = {};
    const signatureParts: string[] = [];
    for (const port of [...resolved.keys()].sort()) {
      const entry = resolved.get(port)!;
      delivered[port] = entry.record;
      signatureParts.push(`${port}=${entry.output.artifact_id}@${entry.output.version}`);
    }
    return {
      applicable: true,
      status: { status: "ready", ports: required },
      inputs: delivered,
      signature: signatureParts.join("|"),
    };
  }

  /** Cut the previous context before telling a consumer anything new. */
  #revoke(pluginId: string): void {
    const controller = this.#controllers.get(pluginId);
    if (controller && !controller.signal.aborted) controller.abort();
    this.#controllers.delete(pluginId);
  }

  #enqueue(
    pluginId: string,
    run: (consumer: NonNullable<Awaited<ReturnType<PluginHostLifecycle["ensureStarted"]>>>) => Promise<void>,
  ): void {
    const previous = this.#tails.get(pluginId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        const consumer = await this.#lifecycle.ensureStarted(pluginId);
        if (!consumer || !consumer.active()) {
          this.#fail(pluginId, "consumer_failed", "消费者未能就绪，输入变更未送达");
          return;
        }
        await run(consumer);
      })
      .catch(() => {
        this.#fail(pluginId, "consumer_failed", "消费者处理输入变更时失败");
      });
    this.#tails.set(pluginId, next);
    void next.then(() => {
      if (this.#tails.get(pluginId) === next) this.#tails.delete(pluginId);
    });
  }

  #fail(pluginId: string, code: PluginInputFailure["code"], message: string): void {
    const failure: PluginInputFailure = {
      board_id: this.#boardId,
      plugin_id: pluginId,
      code,
      message,
    };
    for (const listener of this.#failureListeners) listener({ ...failure });
  }
}
