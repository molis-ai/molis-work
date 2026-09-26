import { functionsActionProvider, publishedFunctionProvider, publishedFunctionAction, functionContextActions, type FunctionsActionPorts } from "@molis-ai/molis-work-module-functions";
import { sceneConfigurationActions, retainActionAuthority, ActionError, type ActionRegistryPort, type ActionCallContext, type ActionClient, type ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { AGENT_MCP_DESTINATION_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import { actionSceneCompatibilityReason } from "@molis-ai/molis-work-kernel";
import { functionsCredentialConfigured, withFunctionsService, withFunctionsServiceAsync, type FunctionsHostOptions } from "./functions-host.js";
import { liveHostFunctionAuthoringCatalog } from "./behavior-catalog.js";

type FunctionContext = (caller: ActionCallContext) => { actions: ActionClient; scenes: ActionSceneClient; boardId?: string };

/** Ephemeral registrations reflect the existing function store; this is not a second function catalog. */
export class SystemFunctionsActions {
  private readonly registrations = new Map<string, { hash: string; dispose(): void }>();
  private readonly ports: FunctionsActionPorts;
  private readonly removeManagement: () => void;

  constructor(private readonly registry: ActionRegistryPort, home: string, options: FunctionsHostOptions, context: FunctionContext) {
    this.ports = {
      read: operation => withFunctionsService(home, operation, options),
      run: operation => withFunctionsServiceAsync(home, operation, options),
      credentialAvailable: () => functionsCredentialConfigured(home, options),
      validateRecommendations: async (record, caller) => {
        const references = Object.values(record.action_map ?? {});
        if (!references.length) return;
        const directory = await context(caller).actions.discover(caller);
        for (const reference of references) {
          const action = directory.find(view => view.capability_id === reference.capability_id && view.version === reference.version && view.provider.provider_id === reference.provider_id);
          if (!action || !action.action.audiences.some(audience => audience === "agent" || audience === "mcp")) throw new ActionError("actions.recommendation_missing", "原推荐能力或版本不可访问，映射已保留");
          if (!action.availability.available) throw new ActionError(action.availability.code, action.availability.reason);
          if (record.subject_kinds.length && action.action.subject_kinds.length && !record.subject_kinds.some(kind => action.action.subject_kinds.includes(kind))) {
            throw new ActionError("actions.recommendation_incompatible", "原推荐能力不适用于所选对象类型，映射已保留");
          }
          await caller.validate_authority?.(reference);
        }
        caller.signal?.throwIfAborted();
      },
      validatePublication: async (record, caller) => {
        await this.ports.validateRecommendations?.(record, caller);
        if (!record.scene_id || record.scene_id === AGENT_MCP_DESTINATION_ID) return;
        const { actions, scenes } = context(caller);
        const [directory, consumers] = await Promise.all([actions.discover(caller), scenes.discoverScenes(caller)]);
        const matches = consumers.filter(scene => scene.definition.scene_id === record.scene_id
          && (!record.scene_version || scene.definition.version === record.scene_version)
          && (!record.scene_provider_id || scene.provider.provider_id === record.scene_provider_id));
        if (matches.length > 1) throw new ActionError("actions.scene_ambiguous", "此用途有多个版本，请选择具体场景版本和提供方");
        const matched = matches[0];
        if (!matched) throw new ActionError("actions.scene_missing", "原消费场景版本或提供方不存在或不可访问，草稿已保留");
        const purpose = liveHostFunctionAuthoringCatalog(directory, matches).destinations.find(row => row.destination_id === record.scene_id
          && row.scene_version === matched.definition.version && row.provider_id === matched.provider.provider_id);
        if (!purpose) throw new ActionError("actions.scene_missing", "原消费场景不存在或当前调用者无权使用，草稿已保留");
        if (purpose.availability?.available === false) throw new ActionError(purpose.availability.code, purpose.availability.reason);
        const intent = { scene_id: matched.definition.scene_id, version: matched.definition.version, provider_id: matched.provider.provider_id };
        const definition = publishedFunctionAction({ ...record, scene_version: intent.version, scene_provider_id: intent.provider_id, status: "published", version: 1 });
        const reason = actionSceneCompatibilityReason(matched.definition,
          { ...definition, provider: { provider_id: "system.functions", kind: "system", title: "判断规则" }, availability: { available: true } }, undefined, directory, matched.provider);
        if (reason) throw new ActionError("actions.scene_incompatible", reason);
        return intent;
      },
    };
    const management = functionsActionProvider(this.ports);
    this.removeManagement = registry.registerProvider({ ...management,
      definitions: [...management.definitions, ...Object.values(functionContextActions)],
      handlers: [...management.handlers,
        { ...functionContextActions.targets, handle: async (caller, input) => {
          const record = this.ports.read(service => service.get((input as { id: string }).id));
          if (record.status !== "published") return { targets: [] };
          const { actions, scenes } = context(caller);
          const nested = retainActionAuthority(caller, { ...functionContextActions.targets, provider_id: "system.functions" });
          const [directory, consumers] = await Promise.all([actions.discover(nested), scenes.discoverScenes(nested)]);
          const targets = await Promise.all(consumers.filter(scene => scene.definition.configuration_permissions).map(async scene => {
            const query = sceneConfigurationActions(scene.definition).targets;
            const view = directory.find(view => view.capability_id === query.capability_id && view.version === query.version && view.provider.provider_id === scene.provider.provider_id);
            if (!view?.availability.available) return [];
            const result = await actions.invoke(nested, { ...query, provider_id: scene.provider.provider_id },
              { judgment: { capability_id: publishedFunctionAction(record).capability_id, version: record.version!, provider_id: "system.functions" } }) as { targets: import("@molis-ai/molis-work-contracts/platform/actions").ActionSceneTarget[] };
            return result.targets;
          }));
          return { targets: targets.flat() };
        } },
        { ...functionContextActions.configure, handle: async (caller, input) => {
          const args = input as { id: string; scene_id: string; scene_version: number; provider_id: string; binding_id: string; expected_revision: string | null; enabled: boolean };
          const record = this.ports.read(service => service.get(args.id));
          if (record.status !== "published") throw new ActionError("actions.binding_invalid", "请先发布判断规则");
          const { actions, scenes } = context(caller);
          const nested = retainActionAuthority(caller, { ...functionContextActions.configure, provider_id: "system.functions" });
          const scene = (await scenes.discoverScenes(nested)).find(scene => scene.definition.scene_id === args.scene_id && scene.definition.version === args.scene_version
            && scene.provider.provider_id === args.provider_id && scene.definition.configuration_permissions);
          if (!scene) throw new ActionError("actions.binding_missing", "原配置位置已不存在或不可访问");
          const configuration = sceneConfigurationActions(scene.definition);
          await actions.invoke(nested, { ...(args.enabled ? configuration.enable : configuration.disable), provider_id: args.provider_id },
            { binding_id: args.binding_id, expected_revision: args.expected_revision, judgment: { capability_id: publishedFunctionAction(record).capability_id, version: record.version!, provider_id: "system.functions" } });
          return { ok: true };
        } },
        { ...functionContextActions.catalog, handle: async caller => {
          const { actions, scenes } = context(caller);
          const [directory, consumers] = await Promise.all([actions.discover(caller), scenes.discoverScenes(caller)]);
          return { catalog: liveHostFunctionAuthoringCatalog(directory, consumers) };
        } },
        { ...functionContextActions.usages, handle: async (caller, input) => {
          const record = this.ports.read(service => service.get((input as { id: string }).id));
          if (record.status !== "published") return { usages: [] };
          const { scenes, boardId } = context(caller);
          const [actual, consumers] = await Promise.all([
            scenes.usages(caller, { ...publishedFunctionAction(record), provider_id: "system.functions" }), scenes.discoverScenes(caller),
          ]);
          const legacy = this.ports.read(service => service.listSceneBindings(record.function_key));
          return { usages: [...actual, ...legacy.filter(use => (use.board_id ?? null) === (boardId ?? null)
            && !consumers.some(scene => scene.definition.scene_id === use.scene_id))] };
        } },
      ],
    });
  }

  refresh(): void {
    const published = this.ports.read(service => service.list()).filter(record => record.status === "published" && record.version != null);
    const current = new Set(published.map(record => `${record.function_key}@${record.version}`));
    for (const [key, registration] of this.registrations) {
      if (!current.has(key)) { registration.dispose(); this.registrations.delete(key); }
    }
    for (const record of published) {
      const key = `${record.function_key}@${record.version}`;
      // The model configuration hash excludes scene mappings and subject types.
      // Registration must also follow changes to the actual public contract.
      const hash = JSON.stringify([record.config_hash, publishedFunctionAction(record)]);
      const existing = this.registrations.get(key);
      if (existing?.hash === hash) continue;
      existing?.dispose();
      this.registrations.delete(key);
      const dispose = this.registry.registerProvider(publishedFunctionProvider(record, this.ports));
      this.registrations.set(key, { hash, dispose });
    }
  }

  dispose(): void {
    for (const registration of this.registrations.values()) registration.dispose();
    this.registrations.clear();
    this.removeManagement();
  }
}
