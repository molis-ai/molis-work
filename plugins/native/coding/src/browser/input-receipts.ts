import type { StepNode } from "./shapes.js";
import type { PagePorts, ReceiptLinks } from "./types.js";

/** A supplement on its way to a round: the key it keeps until the Host answers, and the bubble that shows it. */
export interface Sent {
  readonly id: string;
  readonly run: string;
  readonly text: string;
  readonly mode: string;
  readonly key: string;
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
  /** The button of a step added for a supplement, to the receipt Coding's conversation drew; null when it drew none. */
  from(node: StepNode | undefined, first?: () => void): Node | null;
  /** Sends words to a round under way; resolves to what the person is told. */
  steer(id: string, run: string, text: string, mode: string): Promise<string>;
  act(id: string, run: string): ReceiptActions;
  /** The bubble a supplement shows while on its way; null when none is. */
  bubble(id: string, run: BubbleRun): HTMLElement | null;
}

interface Receipt { readonly delivered: string; readonly replayed?: boolean }

/** An answer that never came, or could not be read: the request may or may not have arrived. */
const unsure = (error: unknown) => error !== null && typeof error === "object" && "name" in error && (error.name === "TypeError" || error.name === "SyntaxError");

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
export function inputReceipts({ api, refresh, q, find, landed, receipts, translate: L }: InputReceiptsPorts): InputReceipts {
  const SENT: Readonly<Record<string, string>> = { "next-boundary": L("coding.sent.next-boundary"), interrupt: L("coding.sent.interrupt"), "after-run": L("coding.sent.after-run") };
  const AGAIN = L("coding.sent.again");
  let item: Sent | null = null;
  const send = async (sent: Sent) => {
    sent.lost = false;
    item = sent;
    refresh();
    const writing = sent.mode === "interrupt" ? find(".coding-turn.is-writing") : null;
    try {
      const { receipt } = await api<{ receipt: Receipt }>(control(sent.id), "POST", { kind: "steer", run_id: sent.run, text: sent.text, key: sent.key, mode: sent.mode });
      if (item === sent) item = null;
      if (writing && receipt.delivered === "run" && !receipt.replayed) {
        writing.classList.add("is-dropped");
        writing.append(small(L("coding.sent.dropped")));
      }
      return receipt.replayed ? AGAIN : receipt.delivered === "queued" && sent.mode !== "after-run" ? L("coding.sent.just-ended") : SENT[sent.mode] ?? "";
    } catch (error) {
      if (unsure(error)) {
        sent.lost = true;
        throw new Error(L("coding.sent.unconfirmed"));
      }
      if (item === sent) item = null;
      throw error;
    } finally {
      refresh();
    }
  };
  return {
    from(node, first) {
      const one = node?.origins?.[0];
      return one ? receipts.link(q("[data-coding-turns]"), one.input_id, first, "来自补充「") : null;
    },
    steer(id, run, text, mode) {
      const again = item?.lost && item.id === id && item.text === text && item.mode === mode;
      return send({ id, run, text, mode, key: again ? item!.key : "send." + crypto.randomUUID(), lost: false });
    },
    act(id, run) {
      const path = control(id), lost = (error: unknown): never => {
        throw unsure(error) ? new Error(L("coding.sent.unconfirmed-again")) : error;
      };
      return {
        withdraw: inputId => api<{ withdrawn: { from: string } }>(path, "POST", { kind: "withdraw", run_id: run, input_id: inputId })
          .then(({ withdrawn }) => withdrawn.from === "queued" ? L("coding.sent.withdrawn") : "", lost).finally(refresh),
        correct: (about, text, key) => api<{ receipt: Receipt }>(path, "POST", { kind: "steer", run_id: run, text, about, key: "send." + key })
          .then(({ receipt }) => receipt.replayed ? AGAIN : receipt.delivered === "queued" ? SENT["after-run"]! : L("coding.sent.corrected"), lost).finally(refresh),
      };
    },
    bubble(id, run) {
      if (item?.id !== id) return null;
      if (item.lost && run.turns.some(turn => turn.steer?.key === item?.key)) {
        const sent = item;
        item = null;
        landed(sent, AGAIN);
        return null;
      }
      const mark = item.lost ? "1" : "0";
      if (item.node?.dataset.lost !== mark) {
        const node = item.node = document.createElement("article");
        node.className = "coding-turn is-sending";
        node.dataset.kind = "user";
        node.dataset.lost = mark;
        node.textContent = item.text;
        node.append(small(item.lost ? L("coding.sent.lost") : L("coding.sent.sending")));
      }
      return item.node ?? null;
    },
  };
}
