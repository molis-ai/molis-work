import type { InstructionPrompt } from '@molis-ai/molis-work-contracts/platform/model-prompts';
import type { PluginDefinition, PluginHostServices, PluginPrivateStorage, PluginStartContext } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxBackgroundLane } from './background.js';
import type { SandboxServices } from './broker.js';
import { sandboxDatabase } from './database.js';
import { sandboxModel } from './model.js';
import { sandboxOwnerFiles } from './owner-files.js';
import { SandboxError } from './schema.js';

// Which of the Host's services one sandboxed activation's broker may reach (PG-017, specs/repository-anti-corruption/slices/pg017-sandbox-services.md).
// Running in a sandbox is an install trust, not a second set of permissions: the services are the ones the Host built for the activation from
// its Manifest and the person's grants, forwarded one by one over the channel, and the broker still asks the operation's declared and approved
// effects before each call. What the sandbox is not given yet is a refusal with a code at the start (`assertSandboxDeclarations`), not a silent absence.

const ENTRIES = 'sandbox:entries';

/** The sandbox's storage transactions over the installation's private store: serialized and atomically committed. */
export function storageTransactions(storage: PluginPrivateStorage): NonNullable<SandboxServices['storage']> {
  if (!storage.compareAndSet) throw new Error('插件存储不支持原子写入');
  let chain: Promise<unknown> = Promise.resolve();
  return {
    transaction(context, mutate) {
      const run = async () => {
        await context.beforeEffect?.();
        context.signal.throwIfAborted();
        const raw = storage.get(ENTRIES);
        const working = new Map<string, SandboxJson>(raw ? JSON.parse(raw) as Array<[string, SandboxJson]> : []);
        const before = JSON.stringify([...working]);
        const result = mutate(working);
        await context.beforeEffect?.();
        context.signal.throwIfAborted();
        const after = JSON.stringify([...working]);
        if (after !== before && !storage.compareAndSet!(ENTRIES, raw, after)) throw new Error('数据被同时修改，请重试');
        return result;
      };
      const next = chain.then(run, run);
      chain = next.then(() => undefined, () => undefined);
      return next;
    },
  };
}

type HostServices = NonNullable<PluginStartContext['services']>;
/** What the Host built for the activation that the sandbox can be given. */
export type SandboxHostServices = Pick<HostServices, 'storage' | 'project_statements' | 'database_statements' | 'interaction' | 'connections' | 'materials' | 'ownerFiles' | 'model' | 'background'>;
/** Services the caller builds itself (the platform capabilities the person approved, the network adapter): the broker still checks each call against the grants. */
export type SandboxHostExtras = Pick<SandboxServices, 'capability' | 'network'> & {
  /** The instructions the package registered (`PluginDefinition.instructions`): the only prompts a model request may name (V-20). */
  instructions?: readonly InstructionPrompt[];
  /** The lane the activation's background runs go to (a second process of the same package, owned by whoever started the first), PG-017 P3. Without it `background.start` is unavailable. */
  backgroundLane?: SandboxBackgroundLane;
};

/**
 * The `SandboxServices` of one activation: its private storage, and each of its other services the Host built. A service the Host did
 * not build for this activation (its Manifest declared no tables in the project's library, for one) is absent here and the broker answers
 * a call for it with `sandbox.service_unavailable`.
 */
export function sandboxServicesFor(host: SandboxHostServices | undefined, extras: SandboxHostExtras = {}): SandboxServices {
  const storage = host?.storage;
  if (!storage) throw new Error('插件存储尚未装配');
  return {
    storage: storageTransactions(storage),
    ...(host.project_statements ? { projectDatabase: sandboxDatabase(host.project_statements) } : {}),
    ...(host.database_statements ? { homeDatabase: sandboxDatabase(host.database_statements) } : {}),
    ...(extras.capability ? { capability: extras.capability } : {}),
    ...(extras.network ? { network: extras.network } : {}),
    // The activation's drawing of questions, cards and next steps, reached through the broker like every other service.
    ...(host.interaction ? { interaction: host.interaction } : {}),
    // Requests through the person's bound account: the Host's client, which checks the slot, the grant and the call's action itself.
    ...(host.connections ? { connections: host.connections } : {}),
    // The readers the Host built for the activation from its Manifest's `materials:*` permissions; the broker has methods for the reads of bytes only.
    ...(host.materials ? { materials: host.materials } : {}),
    // The plugin's own declared files: the Host's client reduced to the four members the channel can carry (no location, no writer callback).
    ...(host.ownerFiles ? { ownerFiles: sandboxOwnerFiles(host.ownerFiles) } : {}),
    // The Host's text model for the package, which names the instructions it registered and never carries a prompt of its own (S-66).
    ...(host.model ? { model: sandboxModel(host.model, extras.instructions ?? []) } : {}),
    // The Host's background client for accepting a run, reduced to `start`, and the lane the run happens in (S-67).
    ...(host.background && extras.backgroundLane ? { background: { client: { start: (work, options) => host.background!.start(work, options) }, lane: extras.backgroundLane } } : {}),
  };
}

/** What a definition says it needs of the Host: its Manifest, and the bodies that ride on the definition rather than the Manifest. */
export type SandboxDeclarations = Pick<PluginDefinition, 'manifest' | 'instructions' | 'methods' | 'agent_prompts' | 'agent_skills'>;

/**
 * What the sandbox does with each member of the Host's services (`PluginHostServices`), so none is left without a decision: `given` is forwarded
 * by `sandboxServicesFor` (as itself, or through the caller's own adapter for `capabilities`); `refused` has a row in `NOT_GIVEN`, and a package
 * that declares what the Host builds it from does not start; `entry` is built only for a Host entry (a start-list declaration), which a sandboxed
 * package does not have (PG-022, PG-102, PG-103, PG-104 move those declarations into the Manifest, and each then becomes `given` or `refused`);
 * `replaced` is another service in its place; `drawn` is something the Host does for the package and needs no service for.
 * The type makes a member added to the contract without a line here fail to compile.
 */
export type SandboxServiceFate = 'given' | 'refused' | 'entry' | 'replaced' | 'drawn';
export const SANDBOX_SERVICE_FATE: { readonly [Service in keyof PluginHostServices]-?: SandboxServiceFate } = Object.freeze({
  storage: 'given', project_statements: 'given', database_statements: 'given', interaction: 'given', capabilities: 'given', connections: 'given', materials: 'given', ownerFiles: 'given',
  project_database: 'replaced', ui: 'drawn',
  database: 'entry', files: 'entry', terminal: 'entry', imageGeneration: 'entry',
  model: 'given', background: 'given', agents: 'refused', scheduler: 'refused', directory: 'refused',
  notifications: 'refused', localTools: 'refused', attention: 'refused', contextLedger: 'refused', installations: 'refused', actions: 'refused', scenes: 'refused', judgments: 'refused', artifacts: 'refused', processItems: 'refused', events: 'refused', inputs: 'refused', outputs: 'refused',
});

export interface NotGiven {
  /** What the person who installs the package reads in the refusal. */
  readonly service: string;
  /** The Host services (`PluginHostServices`) this row stands for; none for a body that rides on the definition. */
  readonly services: ReadonlyArray<keyof PluginHostServices>;
  /** Why it is not given, in the words the person who installs the package reads. */
  readonly reason: string;
  declared(definition: SandboxDeclarations, held: readonly string[]): boolean;
}

/** The Manifest's declarations of project artifacts, process items, ports and events: the services built from them are not given. */
function declaresCoordination(definition: SandboxDeclarations, held: readonly string[]): boolean {
  const { artifacts, process_items, ports, events } = definition.manifest;
  return !!(artifacts.produces.length || artifacts.consumes.length || process_items?.produces.length || process_items?.consumes.length
    || ports?.inputs.length || ports?.outputs.length || events?.publishes.length || events?.subscribes.length)
    || asksFor(definition, held, ['artifact:read', 'artifact:write']);
}

/** A declared permission counts when the package cannot work without it, or when the person approved it. */
function asksFor(definition: SandboxDeclarations, held: readonly string[], permissions: readonly string[]): boolean {
  return definition.manifest.permissions.some(item => permissions.includes(item.permission) && (item.required || held.includes(item.permission)));
}

/**
 * Services a sandboxed plugin can declare and the sandbox does not give, with the slice of PG-017 that gives it. A row is deleted from
 * here in the same change that gives its service, so what stays in the list is exactly what a package asking for it is refused for.
 */
export const SANDBOX_NOT_GIVEN: readonly NotGiven[] = [
  { service: 'model_configuration', services: [], reason: 'Model settings (model_configuration in the Manifest) are not given to sandboxed plugins yet (PG-017 BL-490/491).',
    declared: definition => definition.manifest.model_configuration !== undefined },
  { service: 'materials', services: [], reason: 'Reading a page from the network (materials:fetch) is not given to sandboxed plugins yet (PG-017 BL-492).',
    declared: (definition, held) => asksFor(definition, held, ['materials:fetch']) },
  { service: 'background', services: [], reason: 'Background jobs kept for as long as the plugin runs (background.jobs in the Manifest) are not given to sandboxed plugins until the definition can bind them to operations of the package (PG-017 BL-377); a run a command starts (background_job on an action) is.',
    declared: definition => !!definition.manifest.background?.jobs.length },
  { service: 'agent', services: [], reason: 'Roles, prompts, skills and methods that reach other Agents are not given to sandboxed plugins until a package install can show the person what it adds (PG-017 BL-493, PG-001).',
    declared: definition => !!(definition.methods?.length || definition.manifest.methods?.length || definition.agent_prompts?.length || definition.agent_skills?.length || definition.manifest.agent) },
  { service: 'directory', services: ['directory'], reason: 'A person-authorized directory (directory:read) is not given to sandboxed plugins: it hands the plugin a folder of the person\'s, and has no form without paths yet (PG-017 BL-494).',
    declared: (definition, held) => asksFor(definition, held, ['directory:read']) },
  { service: 'localTools', services: ['localTools'], reason: 'Looking for command-line tools on this machine (local_tools in the Manifest, local-tools:read) is only given to plugins the Host runs itself: it answers with the paths of files outside the sandbox (PG-112, S-79).',
    declared: (definition, held) => definition.manifest.local_tools !== undefined || asksFor(definition, held, ['local-tools:read']) },
  { service: 'scheduler', services: ['scheduler'], reason: 'Wakeups (schedule:read, schedule:write) are not given to sandboxed plugins yet (PG-017 BL-494).',
    declared: (definition, held) => asksFor(definition, held, ['schedule:read', 'schedule:write']) },
  { service: 'agents', services: ['agents'], reason: 'Running an Agent (agent:run) is not given to sandboxed plugins yet (PG-017 BL-494).',
    declared: (definition, held) => asksFor(definition, held, ['agent:run']) },
  { service: 'notifications', services: ['notifications'], reason: 'Delivering notifications (notifications:write) is not given to sandboxed plugins yet (PG-017 BL-494).',
    declared: (definition, held) => asksFor(definition, held, ['notifications:write']) },
  { service: 'attention', services: ['attention'], reason: 'Reading and writing the project\'s Inbox entries (attention:read, attention:write) is not given to sandboxed plugins yet (BL-505).',
    declared: (definition, held) => asksFor(definition, held, ['attention:read', 'attention:write']) },
  { service: 'contextLedger', services: ['contextLedger'], reason: 'Reading and writing the project\'s reference edges (context-ledger:read, context-ledger:write) is not given to sandboxed plugins yet (BL-505).',
    declared: (definition, held) => asksFor(definition, held, ['context-ledger:read', 'context-ledger:write']) },
  { service: 'installations', services: ['installations'], reason: 'Reading the installed plugins (plugins:read) is not given to sandboxed plugins yet (PG-017 BL-494).',
    declared: (definition, held) => asksFor(definition, held, ['plugins:read']) },
  { service: 'actions', services: ['actions'], reason: 'Calling the actions of others (actions:delegate) is not given to sandboxed plugins: a sandboxed package is reached as the actions it declares and calls nothing back (PG-017 BL-494).',
    declared: (definition, held) => asksFor(definition, held, ['actions:delegate']) },
  { service: 'scenes', services: ['scenes'], reason: 'Binding and running the plugin\'s own consumption scenes (scenes:use) is not given to sandboxed plugins: it asks the Host\'s judgment functions as the caller of a running action, which a sandboxed package does not have (PG-032 P1).',
    declared: (definition, held) => asksFor(definition, held, ['scenes:use']) },
  { service: 'judgments', services: ['judgments'], reason: 'Reading and recording the judgment ledger of the plugin\'s own scenes (judgments:read, judgments:write) is not given to sandboxed plugins: the ledger is the Home\'s Functions library, outside a sandboxed package\'s project data (PG-032 P2).',
    declared: (definition, held) => asksFor(definition, held, ['judgments:read', 'judgments:write']) },
  { service: 'artifacts', services: ['artifacts', 'processItems', 'events', 'inputs', 'outputs'], reason: 'Project artifacts, process items, ports and events (artifacts, process_items, ports, events in the Manifest) are not given to sandboxed plugins yet (PG-017 BL-494).',
    declared: declaresCoordination },
];

/**
 * Refuses, with `sandbox.service_not_given`, a sandboxed definition whose Manifest or bodies ask for a service the sandbox is not given,
 * before anything is built for it. Package authors then learn it when the installation starts, instead of from a call that fails
 * the first time the plugin reaches for the service.
 */
export function assertSandboxDeclarations(definition: SandboxDeclarations, held: readonly string[]): void {
  for (const row of SANDBOX_NOT_GIVEN) {
    if (row.declared(definition, held)) {
      throw new SandboxError('sandbox.service_not_given', `Sandboxed plugin ${definition.manifest.plugin_id} asks for ${row.service}: ${row.reason}`);
    }
  }
}
