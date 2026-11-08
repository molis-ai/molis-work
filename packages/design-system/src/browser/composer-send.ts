import type { ComposerOutcome } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { AgentSteerMode } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { composerDeliveries, pickComposerDelivery } from "../composer-rules.js";
import type { ComposerDrafts } from "./composer-drafts.js";
import { attached, blocked, busy, itemKey, letGo, sendable, type Composer, type Item } from "./composer-state.js";

/**
 * Sending (§3.2, §3.5): one send per request. It locks the button until it settles and carries one `request_id`, kept for a retry
 * of the same text and dropped once the text changes. Only `sent` clears the box, of what that Send carried (words typed and files
 * added while it was on its way stay); `failed` keeps everything and marks the
 * materials the target could not read; `unknown` offers 查一下 instead of another send. An outcome for a mount let go is dropped.
 * Attachments go to the page's own upload; each row says how it went.
 */

export interface ComposerSender {
  send(mode?: AgentSteerMode, key?: boolean): Promise<void>; confirm(): Promise<void>; upload(files: Iterable<File>): Promise<void>;
  /** Reads a row that failed in a way trying again may mend, in the same row. */
  retry(key: string): Promise<void>;
}

export function composerSender(c: Composer, drafts: ComposerDrafts, sentByKey: () => void): ComposerSender {
  const { options, labels, signal, field } = c;
  const values = () => Object.fromEntries((options.controls ?? []).flatMap((control) => {
    const node = c.shell.querySelector<HTMLElement>(`[data-composer-control="${CSS.escape(control.id)}"]`);
    if (control.kind === "select") return [[control.id, (node as HTMLSelectElement | null)?.value ?? control.value]];
    if (control.kind === "toggle") return [[control.id, (node?.getAttribute("aria-pressed") ?? String(control.on)) === "true" ? "on" : "off"]];
    return [];
  }));
  // What the last Send carried: words and files added while it was on its way are not its, and stay.
  let went: { text: string; items: readonly Item[] } = { text: "", items: [] };
  function settle(outcome: ComposerOutcome) {
    c.phase = ""; c.check = null;
    if (outcome.state === "sent") {
      letGo(c.items.filter((item) => went.items.includes(item)));
      c.items = c.items.filter((item) => !went.items.includes(item)); c.requestId = "";
      if (field.value === went.text) { field.value = ""; window.molisFit?.(field); drafts.clear(); } else drafts.save();
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
      }
      // Nothing running: the next turn is now, so ⌘⇧↵ sends as ⌘↵ does, without a delivery.
      c.requestId ||= crypto.randomUUID();
      const text = field.value, materials = attached(c);
      went = { text, items: c.items.slice() };
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
      if (!options.attachments) return;
      // Every file has its row at once (VUX-18) and is read on its own: one waiting on the Host holds up none of the others, and
      // one let go while it is read is simply not brought back.
      const added: Item[] = Array.from(files, (file) => ({ key: itemKey(), title: file.name, state: "reading", file }));
      c.items = [...c.items, ...added]; c.requestId = ""; c.paint();
      await Promise.all(added.map(read));
    },
    async retry(key) {
      const item = c.items.find((one) => one.key === key);
      if (!item?.file || item.state !== "failed" || !item.retry) return;
      Object.assign(item, { state: "reading", title: item.file.name, reason: undefined, retry: undefined }); c.requestId = ""; c.paint();
      await read(item);
    },
  };

  /**
   * One row's read, kept in the same row: read (a picture with its own preview), or why not. A failure the page rejected with may
   * pass on a second try, so its row offers 重试; one it answered with will not, so only ×.
   */
  async function read(item: Item) {
    const take = options.attachments!, file = item.file!;
    let done: Awaited<ReturnType<typeof take.upload>>, retry = false;
    try { done = await take.upload(file, signal); }
    catch (error) { done = { state: "failed", reason: error instanceof Error ? error.message : String(error) }; retry = true; }
    if (signal.aborted || !c.items.includes(item) || item.state !== "reading") return;
    if (done.state === "attached") {
      Object.assign(item, { state: "attached", title: done.title, material: { kind: "attachment", ref: done.ref, title: done.title } });
      if (file.type.startsWith("image/")) item.thumb = URL.createObjectURL(file);
    } else Object.assign(item, { state: "failed", reason: done.reason, retry });
    c.paint();
  }
}
