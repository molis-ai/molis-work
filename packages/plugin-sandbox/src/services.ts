import type { PluginDefinition, PluginPrivateStorage, PluginStartContext } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxServices } from './broker.js';
import { sandboxDatabase } from './database.js';
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
export type SandboxHostServices = Pick<HostServices, 'storage' | 'project_statements' | 'interaction'>;
/** Services the caller builds itself (the platform capabilities the person approved, the network adapter): the broker still checks each call against the grants. */
export type SandboxHostExtras = Pick<SandboxServices, 'capability' | 'network'>;

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
    ...(extras.capability ? { capability: extras.capability } : {}),
    ...(extras.network ? { network: extras.network } : {}),
    // The activation's drawing of questions, cards and next steps, reached through the broker like every other service.
    ...(host.interaction ? { interaction: host.interaction } : {}),
  };
}

/** What a definition says it needs of the Host: its Manifest, and the bodies that ride on the definition rather than the Manifest. */
export type SandboxDeclarations = Pick<PluginDefinition, 'manifest' | 'instructions' | 'methods' | 'agent_prompts' | 'agent_skills'>;

interface NotGiven {
  readonly service: string;
  /** Why it is not given, in the words the person who installs the package reads. */
  readonly reason: string;
  declared(definition: SandboxDeclarations, held: readonly string[]): boolean;
}

/** A declared permission counts when the package cannot work without it, or when the person approved it. */
function asksFor(definition: SandboxDeclarations, held: readonly string[], permissions: readonly string[]): boolean {
  return definition.manifest.permissions.some(item => permissions.includes(item.permission) && (item.required || held.includes(item.permission)));
}

/**
 * Services a sandboxed plugin can declare and the sandbox does not give, with the slice of PG-017 that gives it. A row is deleted from
 * here in the same change that gives its service, so what stays in the list is exactly what a package asking for it is refused for.
 */
const NOT_GIVEN: readonly NotGiven[] = [
  { service: 'model', reason: 'Model calls (model:read, model:invoke) are not given to sandboxed plugins yet (PG-017 P1).',
    declared: (definition, held) => asksFor(definition, held, ['model:read', 'model:invoke']) },
  { service: 'instructions', reason: 'Registered instructions are not given to sandboxed plugins yet (PG-017 P1, V-20).',
    declared: definition => !!definition.instructions?.length },
  { service: 'connections', reason: 'Connections (connections:use) are not given to sandboxed plugins yet (PG-017 P2).',
    declared: (definition, held) => !!definition.manifest.connections?.slots.length || asksFor(definition, held, ['connections:use']) },
  { service: 'materials', reason: 'Materials are not given to sandboxed plugins yet (PG-017 P2).',
    declared: (definition, held) => asksFor(definition, held, ['materials:read', 'materials:fetch', 'materials:fetch_local', 'materials:original']) },
  { service: 'background', reason: 'Background jobs are not given to sandboxed plugins yet (PG-017 P3).',
    declared: definition => !!definition.manifest.background?.jobs.length || !!definition.manifest.actions?.some(item => item.action.background_job) },
  { service: 'agent', reason: 'Roles, prompts, skills and methods that reach other Agents are not given to sandboxed plugins until a package install can show the person what it adds (PG-017 BL-493, PG-001).',
    declared: definition => !!(definition.methods?.length || definition.manifest.methods?.length || definition.agent_prompts?.length || definition.agent_skills?.length || definition.manifest.agent) },
];

/**
 * Refuses, with `sandbox.service_not_given`, a sandboxed definition whose Manifest or bodies ask for a service the sandbox is not given,
 * before anything is built for it. Package authors then learn it when the installation starts, instead of from a call that fails
 * the first time the plugin reaches for the service.
 */
export function assertSandboxDeclarations(definition: SandboxDeclarations, held: readonly string[]): void {
  for (const row of NOT_GIVEN) {
    if (row.declared(definition, held)) {
      throw new SandboxError('sandbox.service_not_given', `Sandboxed plugin ${definition.manifest.plugin_id} asks for ${row.service}: ${row.reason}`);
    }
  }
}
