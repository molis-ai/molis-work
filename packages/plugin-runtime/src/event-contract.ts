import {
  eventTypeKey,
  type PluginDefinition,
  type PluginEventType,
} from "@molis-ai/molis-work-contracts/platform/plugin";

export class PluginEventContractError extends Error {
  constructor(
    readonly code: "plugin_event_type_missing" | "plugin_event_type_undeclared",
    message: string,
  ) {
    super(message);
    this.name = "PluginEventContractError";
  }
}

export interface PluginEventSubscription {
  event_type_id: string;
  type_version: number;
  from_plugin_ids: ReadonlySet<string>;
}

/** What a registered Plugin may publish and what it listens to, resolved once at registration. */
export interface PluginEventContract {
  plugin_id: string;
  publishes: ReadonlyMap<string, PluginEventType>;
  subscribes: readonly PluginEventSubscription[];
}

/**
 * A declared event type must come with a validator, and a contributed validator
 * must be declared. Neither side can drift: the Host stores only payloads the
 * author's own validator accepted.
 */
export function buildEventContract(definition: PluginDefinition): PluginEventContract {
  const manifest = definition.manifest;
  const validators = new Map<string, PluginEventType>();
  for (const type of definition.event_types ?? []) {
    validators.set(eventTypeKey(type.event_type_id, type.type_version), type);
  }

  const publishes = new Map<string, PluginEventType>();
  for (const declared of manifest.events?.publishes ?? []) {
    const key = eventTypeKey(declared.event_type_id, declared.type_version);
    const validator = validators.get(key);
    if (!validator) {
      throw new PluginEventContractError(
        "plugin_event_type_missing",
        `发布事件 ${key} 没有对应的类型校验器`,
      );
    }
    publishes.set(key, validator);
  }
  for (const key of validators.keys()) {
    if (!publishes.has(key)) {
      throw new PluginEventContractError(
        "plugin_event_type_undeclared",
        `事件类型 ${key} 没有在 Manifest 的 publishes 里声明`,
      );
    }
  }

  const subscribes = (manifest.events?.subscribes ?? []).map((item) => ({
    event_type_id: item.event_type_id,
    type_version: item.type_version,
    from_plugin_ids: new Set(item.from_plugin_ids),
  }));

  return { plugin_id: manifest.plugin_id, publishes, subscribes };
}
