import type { ComposerOutcome } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { composerDeliveries, pickComposerDelivery } from "../composer-rules.js";
import type { ComposerDrafts } from "./composer-drafts.js";
import { attached, blocked, busy, sendable, type Composer, type Item } from "./composer-state.js";

/**
 * Sending (§3.2, §3.5): one send per request. It locks the button until it settles and carries one `request_id`, kept for a retry
 * of the same text and dropped once the text changes. Only `sent` clears the box; `failed` keeps everything and marks the
 * materials the target could not read; `unknown` offers 查一下 instead of another send. An outcome for a mount let go is dropped.
 * Attachments go to the page's own upload; each row says how it went.
 */

export interface ComposerSender { send(mode?: AgentSteerMode, key?: boolean): Promise<void>; confirm(): Promise<void>; upload(files: Iterable<File>): Promise<void> }

export function composerSender(c: Composer, drafts: ComposerDrafts, sentByKey: () => void): ComposerSender {
  const { options, labels, signal, field } = c;
  const values = () => Object.fromEntries((options.controls ?? []).flatMap((control) => {
    const node = c.shell.querySelector<HTMLElement>(`[data-composer-control="${CSS.escape(control.id)}"]`);
    if (control.kind === "select") return [[control.id, (node as HTMLSelectElement | null)?.value ?? control.value]];
    if (control.kind === "toggle") return [[control.id, (node?.getAttribute("aria-pressed") ?? String(control.on)) === "true" ? "on" : "off"]];
    return [];
  }));
  function settle(outcome: ComposerOutcome) {
    c.phase = ""; c.check = null;
    if (outcome.state === "sent") {
      field.value = ""; window.molisFit?.(field); c.items = []; c.requestId = ""; drafts.clear();
      const receipt = outcome.receipt, ai = c.ai;
      c.note = receipt && ai ? receipt.replayed ? { caption: labels.notice, text: ai.labels.replayed }
        : receipt.delivered === "queued" ? { caption: labels.notice, text: ai.labels.queued } : undefined : undefined;
    } else if (outcome.state === "failed") {
      c.phase = "failed"; c.failure = outcome.message;
      const listed = attached(c);
      for (const { index, reason } of outcome.unreadable ?? []) {
        const item = c.items.find((one) => one.material === listed[index]);
        if (item) Object.assign(item, { state: "failed", reason });
      }
      if (outcome.unreadable?.length) c.phase = "";
    } else { c.phase = "unknown"; c.check = outcome.check; }
    c.paint();
  }
  return {
    async send(mode, key = false) {
      if (signal.aborted || busy(c)) return;
      c.note = undefined;
      if (blocked(c)) return c.paint();
      if (!sendable(c)) return;
      const missing = options.required?.();
      if (missing) { c.note = { caption: labels.notice, text: missing, tone: "attention" }; return c.paint(); }
      let delivery: AgentSteerMode | undefined;
      if (c.ai && c.running) {
        const chosen = pickComposerDelivery(mode ?? "next-boundary", composerDeliveries(true, c.ai.delivery?.(), c.ai.labels.unsupported));
        if ("refused" in chosen) { c.note = { caption: labels.notice, text: chosen.refused, tone: "attention" }; return c.paint(); }
        delivery = chosen.mode;
      } else if (mode && mode !== "next-boundary") return;
      c.requestId ||= crypto.randomUUID();
      const text = field.value, materials = attached(c);
      c.phase = "sending"; c.close(); c.paint();
      let outcome: ComposerOutcome;
      try { outcome = await options.submit({ text, materials, ...(delivery ? { delivery } : {}), controls: values(), request_id: c.requestId }, signal); }
      catch (error) { outcome = { state: "failed", message: error instanceof Error ? error.message : String(error) }; }
      if (signal.aborted) return;
      if (key) sentByKey();
      settle(outcome);
    },
    async confirm() {
      if (!c.check) return;
      const asked = c.check; c.phase = "sending"; c.paint();
      let answer: "sent" | "not-sent" | "unknown";
      try { answer = await asked(); } catch { answer = "unknown"; }
      if (signal.aborted) return;
      if (answer === "sent") settle({ state: "sent" });
      else if (answer === "not-sent") { c.phase = ""; c.check = null; c.note = { caption: labels.notice, text: labels.notSent }; c.paint(); }
      else { c.phase = "unknown"; c.check = asked; c.paint(); }
    },
    async upload(files) {
      const take = options.attachments;
      if (!take) return;
      for (const file of files) {
        const item: Item = { title: file.name, state: "reading" };
        c.items = [...c.items, item]; c.requestId = ""; c.paint();
        let done: Awaited<ReturnType<typeof take.upload>>;
        try { done = await take.upload(file, signal); } catch (error) { done = { state: "failed", reason: error instanceof Error ? error.message : String(error) }; }
        if (signal.aborted || !c.items.includes(item)) return;
        Object.assign(item, done.state === "attached" ? { state: "attached", title: done.title, material: { kind: "attachment", ref: done.ref, title: done.title } } : { state: "failed", reason: done.reason });
        c.paint();
      }
    },
  };
}
