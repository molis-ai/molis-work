import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions } from "@molis-ai/molis-work-contracts/platform/app-host";
import { bindCall } from "@molis-ai/molis-work-kernel";

/** Bind a project call's origin and narrowing before opening the project or dispatching; caller options never become business input. */
export function projectCallCaller(projectId: string, signalFor: () => { signal?: AbortSignal }, options?: HostCapabilityCallOptions) {
  const beforeEffect = options?.before_effect, current = options?.assert_authority_current, signal = options?.signal;
  return bindCall({ actor_id: "local-host", project_id: projectId, audience: "user", permissions: [],
    ...(options?.query_only ? { query_only: true as const } : {}), ...signalFor(),
    ...(beforeEffect ? { validate_authority: () => beforeEffect() } : {}), assert_authority_current: () => {
      signal?.throwIfAborted(); requireSynchronous(current?.(), "最终授权检查必须同步完成"); signal?.throwIfAborted();
    } });
}
