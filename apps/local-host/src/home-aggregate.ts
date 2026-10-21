import { ActionError, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { isHomeAggregateQuery } from "@molis-ai/molis-work-plugin-sdk";
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
}

const codeOf = (error: unknown) => error instanceof ActionError ? error.code : "actions.execution_failed";
// A project that began closing while it was read is passed over like one already closed.
const closing = (error: unknown) => codeOf(error) === "host.project_closing";
const same = (a: ActionReference, b: Required<ActionReference>) => a.capability_id === b.capability_id && a.version === b.version && a.provider_id === b.provider_id;

export async function collectHomeAggregate<Output>(ports: HomeAggregatePorts, outputType: string, input: unknown, signal?: AbortSignal): Promise<HomeAggregateResult<Output>> {
  const answers: HomeAggregateAnswer<Output>[] = [], issues: HomeAggregateIssue[] = [];
  for (const reference of ports.openProjects()) {
    signal?.throwIfAborted();
    const project_id = reference.project_id;
    try {
      await ports.whileOpen(reference, async () => {
        // Read-only on top: whatever the query calls in turn, the Kernel refuses a command or a metered query (`query_only`).
        const caller: ActionCallContext = { ...await ports.context(reference, signal), query_only: true };
        const client = ports.client(reference);
        for (const view of await client.discover(caller)) {
          if (view.action.output_type !== outputType || !isHomeAggregateQuery(view)) continue;
          const source = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
          // Not granted in this project, or the plugin is off here: it is not called, and there is nothing to report.
          if (caller.allowed_actions && !caller.allowed_actions.some(allowed => same(allowed, source))) continue;
          if (!view.availability.available) {
            if (view.availability.code !== "actions.plugin_disabled") issues.push({ project_id, source, code: view.availability.code });
            continue;
          }
          try {
            answers.push({ project_id, source, plugin_id: view.provider.plugin_id ?? null, output: await client.invoke(caller, source, input) as Output });
          } catch (error) {
            signal?.throwIfAborted();
            if (!closing(error)) issues.push({ project_id, source, code: codeOf(error) });
          }
        }
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (!closing(error)) issues.push({ project_id, source: null, code: codeOf(error) });
    }
  }
  return { answers, issues };
}

/** The ports over this Host: its open projects, and the local person's own context in each, as the Web uses it. */
export function homeAggregatePorts(host: MolisWorkLocalHost): HomeAggregatePorts {
  const open = (projectId: string) => host.status().projects.some(row => row.project_id === projectId && row.state !== "closing");
  return {
    openProjects: () => host.status().projects.filter(row => row.state !== "closing"),
    // Checked and entered in the same turn: once inside, the project stays open until the work ends, and a close begun meanwhile refuses new calls.
    whileOpen: (reference, work) => open(reference.project_id) ? host.withProject(reference, work) : Promise.resolve(undefined),
    client: reference => host.actionClient(reference),
    context: (reference, signal) => localWebActionContext(host, reference, LOCAL_OWNER_PERMISSIONS, signal),
  };
}
