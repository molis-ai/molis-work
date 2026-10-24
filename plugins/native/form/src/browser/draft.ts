import type { FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import type { FormClientHost, FormRequest, Translate } from "./types.js";

/** What the model answered: either it needs a few things first, or the form with its new questions. */
type DraftAnswer = { status: "needs_input"; interaction: { interaction_id: string; html?: string } } | { status: "done"; form: FormRecord };

interface DraftPorts {
  readonly host: FormClientHost;
  readonly request: FormRequest;
  readonly L: Translate;
  readonly ask: HTMLElement;
  readonly prompt: HTMLTextAreaElement | HTMLInputElement;
  readonly button: HTMLButtonElement;
  readonly form: () => FormRecord | null;
  readonly done: (record: FormRecord) => Promise<void>;
  /** The editor's note line, for the draft's own words; `note("", false)` takes back only a note the draft put there. */
  readonly note: (text: string, isError: boolean) => void;
}

/**
 * 「AI 生成题目」 in the Forms page (specs/ai-interaction-experience S1): sends the request; when the model first needs to know a
 * few things, shows the Host's shared question card under the prompt and binds it with the shared client the workbench gives
 * every plugin page (`host.interaction`), then sends the answer to go on. The first question takes focus once the page is no
 * longer busy, which brings the card into view, and an earlier try's error is taken back (QA-002). Field problems come back
 * beside their fields, worded by the Host; the person's picks stay in the card, which is inert while a request is out.
 */
export function formDraft({ host, request, L, ask, prompt, button, form, done, note }: DraftPorts) {
  let bound: ReturnType<NonNullable<FormClientHost["interaction"]>> | null = null;
  const close = () => { if (bound) bound.destroy(); bound = null; ask.replaceChildren(); ask.hidden = true; };
  const send = async (extra: Record<string, unknown>) => {
    const record = form();
    if (!record) return;
    button.disabled = ask.inert = true;
    const sent = request<DraftAnswer>("POST", "/" + encodeURIComponent(record.id) + "/draft-questions", { prompt: prompt.value, expected_version: record.version, ...extra })
      .finally(() => { button.disabled = ask.inert = false; });
    try {
      const payload = await sent;
      if (payload.status === "needs_input") show(payload.interaction);
      else { close(); await done(payload.form); }
    } catch (failure) {
      const errors = (failure as { details?: { errors?: Record<string, string> } }).details?.errors;
      if (bound && errors) { bound.showErrors(errors, { focus: true }); note("", false); }
      else note((failure as Error).message, true);
    }
  };
  const show = (interaction: { interaction_id: string; html?: string }) => {
    close();
    const template = document.createElement("template"); template.innerHTML = interaction.html || "";
    const card = template.content.firstElementChild;
    if (!(card instanceof HTMLElement)) { note(L("这里画不出补充问题，请把要求写得更具体后重试"), true); return; }
    ask.append(card); ask.hidden = false; note("", false);
    const client = host.interaction(card, { onSubmit: () => send({ interaction: { interaction_id: interaction.interaction_id, values: client.read() } }) });
    bound = client;
    requestAnimationFrame(() => bound?.focusField("q0"));
  };
  return { start: () => send({}), close };
}
