import type { AssistantPendingReview, AssistantScope, AssistantSubtaskBinding, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentSubagentConversation } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { SubtaskConversationOptions } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import { t, type MwSubtaskDetail } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AssistantSubtaskRequest } from "./assistant-work-subtask.js";
import { pageDialogs } from "./plugin-frame/dialogs.js";
import type { HostReviewFactory } from "./plugin-frame/review-slots.js";
import type { FrameScope } from "./plugin-frame/types.js";

type DrawnReview = AssistantPendingReview & { html: string };
export interface AssistantWorkReviewMount {
  mount(root: HTMLElement, review: DrawnReview, control: { current(): boolean; decide(decision: "approve" | "reject"): Promise<unknown>; refresh(): void; error(error: unknown): void }): { destroy(): void };
  retitle(root: HTMLElement): void;
}
export interface AssistantSubtaskReviewFactories {
  mountPluginClient(root: HTMLElement): FrameScope | null;
  reviews: HostReviewFactory;
}

/** The shared float mounts the original review clients. These projections never own decisions or recovery receipts. */
export function assistantSubtaskReviews(ports: AssistantSubtaskReviewFactories & {
  api: AssistantSubtaskRequest; sdkPath(target: string): string; work: AssistantWorkReviewMount; refresh(): void;
}) {
  const works = new Map<string, { binding: AssistantSubtaskBinding; workId: string; reviews: DrawnReview[] }>();
  const children = new Map<string, { scope: AssistantScope; conversation: AgentSubagentConversation }>();
  const key = (target: string, binding: string) => JSON.stringify([target, binding]);
  const mount: NonNullable<SubtaskConversationOptions["mountDetail"]> = (root, view, detail) => {
    const record = works.get(key(view.target, view.binding)), review = record?.reviews.find(one => "review:" + one.review_id === detail.id);
    const sdk = detail.id === "sdk-reviews" ? children.get(key(view.target, view.binding)) : undefined;
    if (!review && !sdk) return;
    const lifetime = ports.mountPluginClient(root); if (!lifetime) return;
    const content = document.createElement("div"); root.replaceChildren(content);
    const error = (error: unknown) => {
      if (!lifetime.alive || !lifetime.visible) return;
      let note = root.querySelector<HTMLElement>("[data-review-load-error]");
      if (!note) { note = document.createElement("p"); note.dataset.reviewLoadError = ""; note.className = "agent-review-error"; note.setAttribute("role", "alert"); root.append(note); }
      molisWorkRequest.show(note, error);
    };
    let update: () => void;
    if (review && record) {
      content.className = "assistant-card assistant-review";
      const mounted = ports.work.mount(content, review, { current: () => lifetime.alive && lifetime.visible,
        decide: decision => ports.api("/works/" + encodeURIComponent(record.workId) + "/reviews/" + encodeURIComponent(review.review_id),
          { decision, subtask: record.binding }, lifetime.signal), refresh: () => ports.refresh(), error });
      lifetime.own(() => mounted.destroy());
      update = () => { if (lifetime.alive) ports.work.retitle(content); };
      lifetime.listen(document, "molis-work:language-changed", update);
    } else {
      const original = sdk!, childRun = original.conversation.child.child_run!;
      const route = (path: string) => (original.scope.kind === "project" ? "/projects/" + encodeURIComponent(original.scope.project_id) : "") + path;
      const show = ports.reviews({ mountPluginClient: node => { const child = ports.mountPluginClient(node); if (child) lifetime.own(() => child.dispose()); return child; }, route, headers: () => ({}),
        confirm: pageDialogs(lifetime, t.text, true).confirm,
        decide: (input, signal) => ports.api(ports.sdkPath(view.target) + "/reviews/" + encodeURIComponent(input.review_id), { ...input, child_run: childRun }, signal),
        onDecision: () => { if (lifetime.alive && lifetime.visible) ports.refresh(); } });
      update = () => { if (lifetime.alive) void show(content, [{ run_id: childRun.run_id }], null, null, { limit: 20 }, { lifetime, signal: lifetime.signal }).catch(error); };
    }
    return { update, destroy: () => lifetime.dispose() };
  };
  return {
    mount,
    rememberWork(target: string, binding: string, original: AssistantWorkView): MwSubtaskDetail[] {
      const parsed = JSON.parse(binding) as AssistantSubtaskBinding | null;
      if (!parsed) return [];
      const reviews = original.reviews.filter(one => one.run_id === parsed.run.run_id).filter((one): one is DrawnReview => typeof (one as Partial<DrawnReview>).html === "string");
      works.set(key(target, binding), { binding: parsed, workId: original.work.work_id, reviews });
      return reviews.map(review => ({ id: "review:" + review.review_id, title: review.summary, content: { text: "" }, expanded: true }));
    },
    rememberSdk(target: string, scope: AssistantScope, conversation: AgentSubagentConversation, hasReviews: boolean): MwSubtaskDetail[] {
      if (!conversation.child.child_run || !hasReviews) return [];
      children.set(key(target, JSON.stringify(conversation.child.child_run)), { scope, conversation });
      return [{ id: "sdk-reviews", title: t.text("workbench.subtask-conversation.approvals"), content: { text: "" }, expanded: true }];
    },
  };
}
