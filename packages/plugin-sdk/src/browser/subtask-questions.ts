import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ComposerDraftAdapter, InteractionClient, InteractionClientHost, InteractionValues } from "../page-globals.js";
import type { MwSubtaskDetail } from "../ui/subtask-conversation.js";
import { questionAnswer } from "../question-answers.js";
import type { SubtaskConversationOptions } from "./subtask-contract.js";
import { subtaskDraft } from "./subtask-draft.js";

type DrawnQuestion = AgentPendingQuestion & { html?: string };
/** The owner's original question renderer and interaction client inside the existing detail. No question is rebuilt from prose. */
export function createSubtaskQuestions(ports: {
  drafts: UiPageDrafts;
  interaction(root: HTMLElement, host: InteractionClientHost): InteractionClient;
  /** A product with an existing question draft owner supplies it here. Otherwise use the page's draft store. */
  draft?(target: string, binding: string, question: AgentPendingQuestion): (ComposerDraftAdapter & { flush(): Promise<unknown> }) | undefined;
  text(key: string): string;
}) {
  const questions = new Map<string, ReadonlyMap<string, DrawnQuestion>>(), drafts = new Map<string, { adapter: ComposerDraftAdapter; flush(): Promise<unknown> }>();
  const key = (target: string, binding: string) => JSON.stringify([target, binding]);
  const draft = (target: string, binding: string, id: string, question: AgentPendingQuestion) => {
    const name = JSON.stringify([target, binding, id]); let saved = drafts.get(name);
    if (!saved) { const adapter = ports.draft?.(target, binding, question); saved = adapter ? { adapter, flush: () => adapter.flush() } : subtaskDraft(ports.drafts, name); drafts.set(name, saved); } return saved;
  };
  const mount: NonNullable<SubtaskConversationOptions["mountDetail"]> = (root, view, detail, submit) => {
    let question = questions.get(key(view.target, view.binding))?.get(detail.id);
    if (!question?.html || !question!.pending_revision) return;
    const saved = draft(view.target, view.binding, detail.id, question); let alive = true, edited = false, client: InteractionClient;
    let definition = "";
    const problem = (text: string) => { const note = root.querySelector<HTMLElement>("[data-ix-note]"); if (alive && note) note.textContent = text; };
    const bind = (values?: InteractionValues) => {
      client?.destroy(); definition = question!.html!; root.innerHTML = definition;
      client = ports.interaction(root, {
      onChange: () => { edited = true; void saved.adapter.write(JSON.stringify(client.read())).catch(() => problem(ports.text("draft-unsaved"))); },
      onSubmit: () => {
        if (!alive || question!.answerable === false || root.inert) return;
        const values = client.read(), answer = questionAnswer(values);
        if (!answer) { problem(ports.text("answer-needed")); return; }
        const action = { id: "answer", ref: JSON.stringify({ pending_id: question!.pending_id, pending_revision: question!.pending_revision, ...answer }), label: question!.prompt };
        // Freeze the actual click before saving. A late save cannot retarget the original question or its exact run.
        client.showErrors({});
        void saved.adapter.write(JSON.stringify(values)).then(async () => {
          if (!alive) return;
          const outcome = await submit(action);
          if (alive && outcome?.state === "not-applied" && outcome.errors) client.showErrors({ ...outcome.errors }, { focus: true });
        }).catch(() => problem(ports.text("draft-unsaved")));
      },
      });
      if (values) client.write(values);
    };
    bind();
    void saved.adapter.read(new AbortController().signal).then(text => {
      if (text && alive && !edited) client.write(JSON.parse(text) as InteractionValues);
    }).catch(() => problem(ports.text("draft-unsaved")));
    return { update(next, item) {
      const latest = questions.get(key(next.target, next.binding))?.get(item.id);
      if (!latest?.html) return;
      question = latest;
      if (latest.html !== definition) bind(client.read());
    }, destroy() { alive = false; client.destroy(); } };
  };
  return {
    mount,
    remember(target: string, binding: string, found: readonly DrawnQuestion[]): MwSubtaskDetail[] {
      const entries = new Map(found.map(question => [`question:${question!.pending_id}:${question!.pending_revision}`, structuredClone(question)]));
      questions.set(key(target, binding), entries);
      return [...entries].map(([id, question]) => ({ id, title: question!.prompt, content: { text: "" }, expanded: true }));
    },
    async flush() { await Promise.all([...drafts.values()].map(one => one.flush())); },
  };
}
