import { ActionError, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createExecutionLifetime, isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/**
 * What the Home gathers across projects (PG-043, S-49): the queries plugins declare `home_aggregate`, asked by their `output_type`,
 * one call per open project, each the person's own call in that project with that project's grants. Nothing about any plugin is known here.
 */

/** One provider's answer in one project. Answers are never merged: each keeps the project and the provider it came from. */
export interface HomeAggregateAnswer<Output> {
  readonly project_id: string;
  readonly source: Required<ActionReference>;
  /** The plugin behind the provider, when a plugin answered: where the Home opens what the answer names. */
  readonly plugin_id: string | null;
  readonly output: Output;
}

/** An answer that could not be read, by its code only: what a provider says in its error stays out (S-12). */
export interface HomeAggregateIssue {
  readonly project_id: string;
  /** Null when the project itself could not be read. */
  readonly source: Required<ActionReference> | null;
  readonly code: string;
}

export interface HomeAggregateResult<Output> { readonly answers: HomeAggregateAnswer<Output>[]; readonly issues: HomeAggregateIssue[] }

export interface HomeAggregatePorts {
  /** The projects open now; one already closing is not among them. */
  openProjects(): readonly LocalHostProjectReference[];
  /** Runs `work` while the project is kept open, or nothing once it is no longer open: the Home never opens a project to read it. */
  whileOpen<T>(reference: LocalHostProjectReference, work: () => Promise<T>): Promise<T | undefined>;
  client(reference: LocalHostProjectReference): ActionClient;
  /** The person's context in that project; the grants in it are that project's installations' own. */
  context(reference: LocalHostProjectReference, signal?: AbortSignal): Promise<ActionCallContext>;
  /** The project's plugin manifest: what "turned off" is read against, so a listed plugin that cannot answer is not taken for one that is not installed. A Host with no catalog rejects (`host.catalog_unavailable`), which the aggregate records as that project's issue. */
  projectPlugins(reference: LocalHostProjectReference): Promise<readonly string[]>;
}

const codeOf = (error: unknown) => error instanceof ActionError ? error.code : "actions.execution_failed";
// A project that began closing while it was read is passed over like one already closed.
const closing = (error: unknown) => codeOf(error) === "host.project_closing";
const same = (a: ActionReference, b: Required<ActionReference>) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;

/** One slow provider cannot keep the Home waiting or hold another project's answer behind it. */
async function beforeDeadline<T>(signal: AbortSignal | undefined, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const lifetime = createExecutionLifetime({ signal, timeout: { milliseconds: 2_000, reason: new ActionError("actions.timeout", "首页读取超时，请重试") } });
  try { lifetime.assertActive(); return await lifetime.wait(work(lifetime.signal)); }
  finally { lifetime.dispose(); }
}

export async function collectHomeAggregate<Output>(ports: HomeAggregatePorts, outputType: string, input: unknown, signal?: AbortSignal): Promise<HomeAggregateResult<Output>> {
  signal?.throwIfAborted();
  const projects = await Promise.all(ports.openProjects().map(async reference => {
    const project_id = reference.project_id;
    try {
      // The manifest lives in the catalog, which a project's own open window may hold: read it before entering.
      const plugins = await ports.projectPlugins(reference);
      return await ports.whileOpen(reference, async (): Promise<HomeAggregateResult<Output>> => {
        const client = ports.client(reference);
        const { caller, views } = await beforeDeadline(signal, async discoverySignal => {
          // Queries and all their nested calls remain read-only; discovery has its own bound too.
          const caller: ActionCallContext = { ...await ports.context(reference, discoverySignal), query_only: true, signal: discoverySignal };
          discoverySignal.throwIfAborted();
          return { caller, views: await client.discover(caller) };
        });
        const results = await Promise.all(views.map(async (view: typeof views[number]): Promise<HomeAggregateResult<Output>> => {
          const empty = { answers: [], issues: [] };
          if (view.action.output_type !== outputType || !isHomeAggregateQuery(view)) return empty;
          const source = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
          if (caller.allowed_actions && !caller.allowed_actions.some(allowed => same(allowed, source))) return empty;
          if (!view.availability.available) {
            const pluginId = view.provider.plugin_id;
            // Not in this project's plugin manifest is not installed here, so it has nothing to report; listed but unavailable (turned
            // off, or refused by policy) is what the person needs to see. A platform provider has no plugin and keeps the old rule.
            const listed = pluginId === undefined
              ? view.availability.code !== "actions.plugin_disabled"
              : plugins.includes(pluginId);
            return listed ? { answers: [], issues: [{ project_id, source, code: view.availability.code }] } : empty;
          }
          try {
            const output = await beforeDeadline(signal, providerSignal => client.invoke({ ...caller, signal: providerSignal }, source, input)) as Output;
            return { answers: [{ project_id, source, plugin_id: view.provider.plugin_id ?? null, output }], issues: [] };
          } catch (error) {
            signal?.throwIfAborted();
            return { answers: [], issues: closing(error) ? [] : [{ project_id, source, code: codeOf(error) }] };
          }
        }));
        return { answers: results.flatMap(result => result.answers), issues: results.flatMap(result => result.issues) };
      }) ?? { answers: [], issues: [] };
    } catch (error) {
      signal?.throwIfAborted();
      return { answers: [], issues: closing(error) ? [] : [{ project_id, source: null, code: codeOf(error) }] };
    }
  }));
  return { answers: projects.flatMap(result => result.answers), issues: projects.flatMap(result => result.issues) };
}

/** The ports over this Host: its open projects, and the local person's own context in each, as the Web uses it. */
export function homeAggregatePorts(host: MolisWorkLocalHost): HomeAggregatePorts {
  const open = (projectId: string) => host.projects().some(row => row.project_id === projectId && row.state !== "closing");
  return {
    openProjects: () => host.projects().filter(row => row.state !== "closing"),
    // Checked and entered in the same turn: once inside, the project stays open until the work ends, and a close begun meanwhile refuses new calls.
    whileOpen: (reference, work) => open(reference.project_id) ? host.withProject(reference, work) : Promise.resolve(undefined),
    client: reference => host.actionClient(reference),
    context: (reference, signal) => localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS, signal),
    projectPlugins: reference => host.projectPluginIds(reference.project_id),
  };
}
