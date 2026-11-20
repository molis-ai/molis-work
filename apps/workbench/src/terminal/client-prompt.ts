import { WORK_TERMINAL_PATH } from "@molis-ai/molis-work-contracts/platform/actions";
import { SUBJECT_CONTEXT_PATH, type SubjectContextAnswer } from "@molis-ai/molis-work-contracts/platform/plugin";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { TerminalTranslate } from "./client-dom.js";
import type { TerminalGuard } from "./client-guard.js";
import type { PanelRecord, TerminalRequest, WorkTerminalSubjectRef } from "./types.js";

export interface AdvancePromptOptions {
  text: TerminalTranslate;
  route(path: string): string;
  request: TerminalRequest;
  subject(): WorkTerminalSubjectRef;
  guard: TerminalGuard;
  current(): PanelRecord | null;
  sendPty(message: Record<string, unknown>): Promise<void>;
  copyBtn: HTMLButtonElement | null;
  showToast(message: string, error?: boolean): void;
}

const subjectKey = (ref: WorkTerminalSubjectRef) => JSON.stringify([ref.plugin_id, ref.subject_kind, ref.subject_id]);
const promptUrl = (route: (path: string) => string, ref: WorkTerminalSubjectRef) =>
  route(`${WORK_TERMINAL_PATH}/${encodeURIComponent(ref.plugin_id)}/${encodeURIComponent(ref.subject_kind)}/${encodeURIComponent(ref.subject_id)}/prompt`);

/**
 * The "advance this work" prompt: read from the platform work-terminal route, typed into the live panel (never sent unless asked),
 * or copied. Before it, the text the project's plugins keep about this object is read as the person (GAS-01) and handed to the
 * platform prompt, which binds it as untrusted data. Each read names the one object, so another object's text never arrives.
 */
export function createAdvancePrompt(options: AdvancePromptOptions) {
  const { route, subject, guard } = options;
  let promptCache: { key: string; text: string } | null = null;

  const sourceContexts = (ref: WorkTerminalSubjectRef) => options.request<SubjectContextAnswer | null>(
    route(`${SUBJECT_CONTEXT_PATH}?kind=${encodeURIComponent(ref.subject_kind)}&id=${encodeURIComponent(ref.subject_id)}`),
    { fallback: uiText.text("workbench.client-prompt.could-not-open") },
  ).then(answer => answer?.contexts ?? [], () => []);

  const loadAdvancePrompt = async (requested?: WorkTerminalSubjectRef) => {
    const current = subject();
    const target = requested ?? current;
    if (!target.plugin_id || !target.subject_kind || !target.subject_id) {
      throw new Error(uiText.text("workbench.client-prompt.could-not-open"));
    }
    if (guard.readOnly()) throw new Error(guard.readOnlyMessage());
    const key = subjectKey(target);
    if (requested && key !== subjectKey(current)) {
      throw new Error(uiText.text("workbench.client-prompt.page-has-switched-another-item-return-item-that"));
    }
    const contexts = await sourceContexts(target);
    const payload = await options.request<{ prompt?: string } | null>(
      promptUrl(route, target),
      { method: "POST", body: contexts.length ? { source_contexts: contexts } : {}, fallback: uiText.text("workbench.client-prompt.could-not-open") },
    );
    const text = payload?.prompt || (promptCache?.key === key ? promptCache.text : "");
    if (!text) throw new Error(uiText.text("workbench.client-prompt.could-not-open"));
    promptCache = { key, text };
    return text;
  };

  const writePrompt = async (send: boolean) => {
    const panel = options.current();
    if (!guard.canControlPanel(panel)) return;
    const text = await loadAdvancePrompt({ plugin_id: panel.plugin_id, subject_kind: panel.subject_kind, subject_id: panel.subject_id });
    const fillText = text
      .replace(/[\r\n]+/g, " ⏎ ")
      .replace(/[\u0000-\u001f\u007f]/g, " ");
    await options.sendPty({ type: "write", panelId: panel.panel_id, data: send ? `${fillText}\r` : fillText });
  };

  const copyAdvancePrompt = async () => {
    const text = await loadAdvancePrompt();
    const { copyBtn } = options;
    const copied = copyBtn && window.molisCopy ? await window.molisCopy(copyBtn, text, { done: uiText.text("workbench.client-prompt.copied"), failed: uiText.text("workbench.client-prompt.could-not-copy") })
      : await navigator.clipboard.writeText(text).then(() => true, () => false);
    if (!copied) options.showToast(uiText.text("workbench.client-prompt.clipboard-unavailable-copy-manually"), true);
  };

  return { writePrompt, copyAdvancePrompt, resetCache: () => { promptCache = null; } };
}
