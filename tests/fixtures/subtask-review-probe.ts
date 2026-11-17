import { createSubtaskConversation, type SubtaskConversationSource, type SubtaskConversationOptions } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import type { MwSubtaskDetail } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AssistantPendingReview, AssistantWorkView, AssistantSubtaskBinding, AssistantScope } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentSubagentConversation } from "@molis-ai/molis-work-contracts/services/agent-host";
import { workOwner, deferred } from "./subtask-owners.js";

type DrawnReview = AssistantPendingReview & { html: string };
interface ReviewProjection {
  mount: NonNullable<SubtaskConversationOptions["mountDetail"]>;
  rememberWork(target: string, binding: string, original: AssistantWorkView): MwSubtaskDetail[];
  rememberSdk(target: string, scope: AssistantScope, conversation: AgentSubagentConversation, hasReviews: boolean): MwSubtaskDetail[];
}
export function mountReviewProbe(mode: "work" | "sdk", forms: Record<string, DrawnReview>, factories: Record<string, unknown>, work: unknown, createReviews: (ports: Record<string, unknown>) => ReviewProjection) {
  const root = document.createElement("div"); root.id = "review-probe";
  root.style.cssText = "position:fixed;inset:20px 20px auto auto;width:360px;height:650px;z-index:1000;background:var(--surface)"; document.body.append(root);
  const owner = workOwner(), calls: Array<{ path: string; body: unknown; signal?: AbortSignal }> = [], reads: string[] = [], refreshes: string[] = [];
  let gate: ReturnType<typeof deferred<void>> | undefined, selected = "a";
  const requests = globalThis.molisWorkRequest;
  const request: typeof requests = Object.assign(async <T>(path: string) => {
    if (!path.includes("/api/agent/reviews?")) return requests<T>(path);
    reads.push(path);
    const url = new URL(path, location.origin), target = url.searchParams.get("run_id")!.slice("run-".length), id = "review-" + target;
    return { reviews: [{ review_id: id }], omitted: 0, html: `<article data-agent-review-item="${id}"><textarea data-agent-review-feedback></textarea><label><input type="checkbox" data-agent-review-remember>Remember</label><button data-agent-review-approve="${id}">Approve</button><button data-agent-review-reject="${id}">Reject</button><div data-review-recovery></div></article>` } as T;
  }, requests);
  globalThis.molisWorkRequest = request;
  const reviews = createReviews({ ...factories, work, sdkPath: (target: string) => "/works/parent/sdk-subtasks/parent-run/" + target,
    async api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> { calls.push({ path, body, signal }); await gate?.promise; return { receipt: { status: "approved" } } as T; },
    refresh() { refreshes.push(selected); void handle.refresh(); } });
  const source: SubtaskConversationSource = { ...owner.source,
    async read(target, signal) {
      const original = await owner.source.read(target, signal); if (original.state !== "available") return original;
      const run = { run_id: "run-" + target, session_id: "session-" + target };
      const binding = mode === "sdk" ? run : { work_id: target, parent_work_id: "parent", run, graph_id: "original-graph", node_id: "node-" + target, executor: { kind: "assistant" } } satisfies AssistantSubtaskBinding;
      const token = JSON.stringify(binding);
      const details = mode === "work"
        ? reviews.rememberWork(target, token, { work: { work_id: target }, reviews: [forms[target]!] } as AssistantWorkView)
        : reviews.rememberSdk(target, { kind: "project", project_id: "original-project" }, { child: { child_run: run } } as AgentSubagentConversation, true);
      return { state: "available", view: { ...original.view, binding: token, details } };
    } };
  const handle = createSubtaskConversation(root, { labels: { back: "Back", close: "Close", loading: "Loading", readFailed: "Cannot read", retry: "Read again", latest: "Latest", messages: "Messages", children: "Children", unread: "Unread", working: "Working", actionFailed: "Action failed", unknown: "Unknown", check: "Check" }, source, mountDetail: reviews.mount, onBack() {}, onClose() { handle.close(); } });
  return { root, calls, reads, refreshes, handle,
    open(target: string) { selected = target; return handle.open(target); }, block() { return gate = deferred<void>(); },
    dispose() { handle.destroy(); root.remove(); globalThis.molisWorkRequest = requests; },
  };
}
