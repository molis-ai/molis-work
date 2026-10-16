import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AgentHost } from "./index.js";

/** The actual runtime's Host storage keeps this invocation across its own waits; no authority is inferred from input. */
export function withAgentEffect<T>(host: AgentHost, invocation: HostCapabilityInvocation, operation: () => Promise<T>): Promise<T> {
  const control = { beforeEffect: () => invocation.beforeEffect(), assert_current: () => requireSynchronous(invocation.assertAuthorityCurrent(), "最终授权检查必须同步完成") };
  const call = host.descriptors().reduce((next, descriptor) => {
    const adapter = host.adapter(descriptor.runtime_id);
    return adapter.withEffect ? () => adapter.withEffect!(control, next) : next;
  }, operation);
  return call();
}
