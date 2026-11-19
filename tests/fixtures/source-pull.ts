import { createSourcePullPort, type SourcePullPortOptions } from "@molis-ai/molis-work-app-local-host";
import type { PluginSourcePullClient, SourcePullMaterial, SourcePullOptions, SourcePullRequest, SourcePullResult } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";

export type TestSourcePullClient = Required<Pick<PluginSourcePullClient, "plan" | "pull" | "forget">>;

/** Direct service fixtures use the actual Host plan and transport; Runtime authority is covered by the Runtime suites. */
export function createTestSourcePull(options: SourcePullPortOptions): TestSourcePullClient {
  const port = createSourcePullPort(options);
  return {
    plan: async request => port.plan(request),
    pull: (request, options) => {
      const signal = options.signal ?? new AbortController().signal;
      return port.pull(request, { signal, hold: options.hold, current: () => signal.throwIfAborted(), beforeEffect: async () => signal.throwIfAborted() });
    },
    forget: async ids => ({ records_deleted: port.forget(ids) }),
  };
}

/** A provider result for isolated Feed business tests. Its plan is real; no evidence body or network request is simulated as real I/O. */
export async function completedSourcePull(client: TestSourcePullClient, request: SourcePullRequest, options: SourcePullOptions,
  materials: readonly SourcePullMaterial[] = []): Promise<SourcePullResult> {
  if (materials.length) await options.hold(materials.map(material => material.content_ref));
  return { operation_id: request.operation_id, ...(await client.plan(request)), outcome: "completed", requirement_met: true,
    materials, receipts: [], budget: {}, warnings: [], http_receipt: null };
}
