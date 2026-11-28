import { activeUiLocale, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { StepNode } from "./shapes.js";
import type { PagePorts, ReceiptLinks } from "./types.js";
import type { CodingPickedMaterial } from "../materials.js";

/** A supplement on its way to a round: the key it keeps until the Host answers, and the bubble that shows it. */
export interface Sent {
  readonly id: string;
  readonly run: string;
  readonly text: string;
  readonly command?: true;
  readonly mode: string;
  readonly key: string;
  readonly materials: readonly CodingPickedMaterial[];
  readonly acknowledge?: () => void;
  /** The answer was lost (the connection dropped, or the reply could not be read), so the same words go again under the same key. */
  lost: boolean;
  node?: HTMLElement;
}

export interface InputReceiptsPorts extends Pick<PagePorts, "api" | "q" | "translate"> {
  readonly refresh: () => unknown;
  /** One Element lookup under the Coding page's root, for what the page may not have drawn; none: null. */
  readonly find: <Found extends Element = HTMLElement>(selector: string) => Found | null;
  /** The supplement arrived though its answer was lost. */
  readonly landed: (sent: Sent, said: string) => void;
  readonly receipts: ReceiptLinks;
}

/** What a receipt may do to a supplement the round has not put in the context. */
export interface ReceiptActions {
  withdraw(inputId: string): Promise<string>;
  correct(about: string, text: string, key: string): Promise<string>;
}

/** The round as the bubble reads it: whether its record shows the supplement under a key. */
export interface BubbleRun { readonly turns: readonly { readonly steer?: { readonly key?: string } }[] }

export interface InputReceipts {
  /** An initial send keeps its source identity until its answer is known. */
  start<Result>(id: string, command: Record<string, unknown>): Promise<Result>;
  /** The button of a step added for a supplement, to the receipt Coding's conversation drew; null when it drew none. */
  from(node: StepNode | undefined, first?: () => void): Node | null;
  /** Sends words to a round under way; resolves to what the person is told. */
  steer(id: string, run: string, text: string, mode: string, materials?: readonly CodingPickedMaterial[], acknowledge?: () => void, commandPrompt?: true): Promise<string>;
  act(id: string, run: string): ReceiptActions;
  /** Normal owner reads may prove a lost response succeeded, including an input waiting for the next Run. */
  observe(id: string, keys: readonly (string | undefined)[]): void;
  /** The bubble a supplement shows while on its way; null when none is. */
  bubble(id: string, run: BubbleRun): HTMLElement | null;
}

interface Receipt { readonly delivered: string; readonly replayed?: boolean }

/**
 * An answer that never came, or could not be read: the request may or may not have arrived. The page's request client
 * says so with its own codes (a dropped connection or a cut reply is `outcome_unknown`, an unreadable one `invalid_response`).
 */
const UNSURE: ReadonlySet<string> = new Set(["ui_host.outcome_unknown", "ui_host.invalid_response"]);
const unsure = (error: unknown) => error !== null && typeof error === "object" && "code" in error && UNSURE.has(String(error.code));

const control = (id: string) => "/sessions/" + encodeURIComponent(id) + "/control";

const small = (text: string) => {
  const node = document.createElement("small");
  node.className = "coding-turn-receipt";
  node.textContent = text;
  return node;
};

/**
 * The person's words to a round under way, and what became of each (specs/ai-input-receipts §3.3, §4.1, §4.2): how a
 * supplement is sent and the bubble it shows while on its way. The receipt under it is the workbench's shared one
 * (`host.receipts`, the same as the Assistant's): it says what the run's own ledger says and, apart from that, what the AI
 * says, and it announces its own changes.
 *
 * Every supplement has a key from the moment it is sent. When the answer is lost (the connection dropped, or the reply
 * could not be read), the words and the mode stay in the composer and the bubble says to send again: the same words in
 * the same mode go under the same key, so the runtime returns the first one instead of taking it twice (§7). Changed
 * words are a new supplement. An answer the Host refused clears the bubble. When the run's record shows a supplement under
 * that key, the lost one did arrive: the bubble goes, so the same words are not shown twice with opposite claims, and the
 * page says once that it had arrived, as it does for a resend the runtime recognises (`landed`).
 *
 * From a receipt (`act`, stage 3b-2a) the person takes back a supplement the round has not put in the context, or sends a
 * correction naming it (`about`); both go through the round's control, and the receipt keeps the words until they arrive.
 *
 * A step a person added for a supplement says so (`from`, stage 3d-3): the plan card and the TaskBoard draw the same
 * 「来自补充「…」」 button, the shared receipt's own link to the receipt Coding's conversation drew; none when it drew none.
 *
 * Interrupting drops the reply the model was writing: the page dims the one it was showing being written and says so. The runtime's
 * record does not mark that reply (a Prologue need in the spec), so the mark is the page's own and a reload loses it.
 */
export function inputReceipts({ api, refresh, q, find, landed, receipts }: InputReceiptsPorts): InputReceipts {
  const sentText = (mode: string) => mode === "next-boundary" ? uiText.text("coding.sent.next-boundary")
    : mode === "interrupt" ? uiText.text("coding.sent.interrupt")
    : mode === "after-run" ? uiText.text("coding.sent.after-run") : "";
  const againText = () => uiText.text("coding.sent.again");
  let item: Sent | null = null;
  let initial: { signature: string; id: string } | undefined;
  const start = async <Result>(id: string, command: Record<string, unknown>): Promise<Result> => {
    const direct = typeof command.task === "string" && command.task.trim() && ["continued_from", "reask", "plan_revision", "continue_step_board_of", "origin_task", "wait_for"].every(key => command[key] === undefined);
    const signature = JSON.stringify([id, command]);
    if (direct && initial?.signature !== signature) initial = { signature, id: crypto.randomUUID() };
    const original = direct ? initial : undefined;
    const result = await api<Result>("/sessions/" + encodeURIComponent(id) + "/runs", "POST", { ...command,
      ...(original ? { original_input: { input_id: original.id, text: command.task } } : {}) });
    if (initial === original) initial = undefined;
    return result;
  };
  const supplement = (id: string, body: { run_id: string; text: string; key: string; mode?: string; about?: string; materials?: readonly CodingPickedMaterial[]; command_prompt?: true }) =>
    api<{ receipt: Receipt }>(control(id), "POST", { kind: "steer", ...body, original_input: { input_id: body.key.slice(5), text: body.text, use: "supplement" } });
  const send = async (sent: Sent) => {
    // A refusal of this retry cannot disprove acceptance of an earlier attempt with the same identity.
    const previouslyLost = sent.lost;
    sent.lost = false;
    item = sent;
    refresh();
    const writing = sent.mode === "interrupt" ? find(".coding-turn.is-writing") : null;
    try {
      const { receipt } = await supplement(sent.id, { run_id: sent.run, text: sent.text, key: sent.key, mode: sent.mode, command_prompt: sent.command, ...(sent.materials.length ? { materials: sent.materials } : {}) });
      if (item === sent) item = null;
      if (writing && receipt.delivered === "run" && !receipt.replayed) {
        writing.classList.add("is-dropped");
        writing.append(small(uiText.text("coding.sent.dropped")));
      }
      return receipt.replayed ? againText() : receipt.delivered === "queued" && sent.mode !== "after-run" ? uiText.text("coding.sent.just-ended") : sentText(sent.mode);
    } catch (error) {
      if (unsure(error) || previouslyLost) {
        sent.lost = true;
        throw new Error(uiText.text(previouslyLost && !unsure(error) ? "coding.sent.unconfirmed-retry" : "coding.sent.unconfirmed"));
      }
      if (item === sent) item = null;
      throw error;
    } finally {
      refresh();
    }
  };
  const observe = (id: string, keys: readonly (string | undefined)[]) => {
    if (item?.id !== id || !item.lost || !keys.includes(item.key)) return;
    const sent = item;
    item = null;
    sent.acknowledge?.();
    landed(sent, againText());
  };
  return {
    start,
    observe,
    from(node, first) {
      const one = node?.origins?.[0];
      return one ? receipts.link(q("[data-coding-turns]"), one.input_id, first, "origin") : null;
    },
    steer(id, run, text, mode, materials = [], acknowledge, command) {
      const again = item?.lost && item.id === id && item.run === run && item.text === text && item.mode === mode
        && item.command === command && JSON.stringify(item.materials) === JSON.stringify(materials);
      return send({ id, run, text, mode, materials, command, acknowledge, key: again ? item!.key : "send." + crypto.randomUUID(), lost: !!again });
    },
    act(id, run) {
      const path = control(id), lost = (error: unknown): never => {
        throw unsure(error) ? new Error(uiText.text("coding.sent.unconfirmed-again")) : error;
      };
      return {
        withdraw: inputId => api<{ withdrawn: { from: string } }>(path, "POST", { kind: "withdraw", run_id: run, input_id: inputId })
          .then(({ withdrawn }) => withdrawn.from === "queued" ? uiText.text("coding.sent.withdrawn") : "", lost).finally(refresh),
        correct: (about, text, key) => supplement(id, { run_id: run, text, about, key: "send." + key })
          .then(({ receipt }) => receipt.replayed ? againText() : receipt.delivered === "queued" ? sentText("after-run") : uiText.text("coding.sent.corrected"), lost).finally(refresh),
      };
    },
    bubble(id, run) {
      observe(id, run.turns.map(turn => turn.steer?.key));
      if (item?.id !== id) return null;
      // `data-lost` stays "1"/"0" (read by tests and styles); the language the bubble was drawn in is kept apart so a
      // language change redraws the same bubble in place.
      const mark = item.lost ? "1" : "0", locale = activeUiLocale() ?? "";
      if (item.node?.dataset.lost !== mark || item.node.dataset.locale !== locale) {
        const node = item.node = document.createElement("article");
        node.className = "coding-turn is-sending";
        node.dataset.kind = "user";
        node.dataset.lost = mark;
        node.dataset.locale = locale;
        node.textContent = item.text;
        node.append(small(item.lost ? uiText.text("coding.sent.lost") : uiText.text("coding.sent.sending")));
      }
      return item.node ?? null;
    },
  };
}
