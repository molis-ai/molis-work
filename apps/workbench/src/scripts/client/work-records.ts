import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";

/** The page's request helper, installed before the workbench client runs. */
declare const molisWorkRequest: UiRequest;

interface ShownObject { readonly surface: string; readonly id: string }
interface RecordedSubject { readonly kind: string; readonly id: string; readonly version?: string }
interface UiFact {
  readonly fact: string;
  readonly stage?: string;
  readonly outcome?: string;
  readonly occurred_at?: string;
  readonly work?: { readonly work_ref: string };
  readonly subjects?: readonly RecordedSubject[];
  readonly detail?: Readonly<Record<string, string | number | boolean>>;
}
interface Minute { readonly at: string; readonly key: string; readonly surface: string; readonly id: string; seconds: number; scrolled: number }

/**
 * The shell's UI stages, as work records (specs/observation-collection/design.md §4「工作台界面行为」, contract-design §4 and §9; OCL-07,
 * OCL-10). Facts are `ui.*` only and go through the Host's own route, which issues the entry credential `observation.report@1` needs;
 * under a project's address they are that project's. Reports normally leave at most every two seconds, and at once on card confirmation or when the page is hidden; a
 * report that is refused or lost changes nothing on the page.
 *
 * What the shell records itself: which object is shown in the focused pane (`ui.open`), time spent on it and whether it was scrolled,
 * summed per object per minute (`ui.dwell`, design §9 D3: it cannot say how many seconds a single look lasted, nor scrolling inside an
 * isolated plugin page), and the stages of a list it presents (`ui.candidates`) and of finding the chosen thing (`ui.locate`), joined by
 * the one interaction they belong to. Clicking is never recorded as adopting or reading. What a plugin does inside its own page is the
 * plugin's to report; every action a page calls is the action exit's record.
 *
 * `host.current()` names what the focused pane shows, or null; `host.route(path)` adds the page's project prefix. Sent to the page as
 * its text (`WORK_RECORDS_FACTORY_SCRIPT`), so it uses nothing from outside its own body but the page's globals.
 */
export function workRecordsFactory(host: { readonly route: (path: string) => string; readonly current: () => ShownObject | null }) {
  const queue: UiFact[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined, lastSent = 0;
  const schedule = () => { timer ??= setTimeout(send, Math.max(0, 2000 - (Date.now() - lastSent))); };
  const send = (leaving?: boolean) => {
    clearTimeout(timer); timer = undefined;
    if (!queue.length) return;
    lastSent = Date.now();
    do {
      void molisWorkRequest(host.route("/api/observation/ui"), { body: { facts: queue.splice(0, 100) }, keepalive: leaving === true }).catch(() => undefined);
    } while (leaving === true && queue.length);
    if (queue.length) schedule();
  };
  // A page left open offline keeps at most this many; the rest of that stretch is not recorded.
  const record = (fact: UiFact) => { if (queue.length < 500) { queue.push({ outcome: "succeeded", occurred_at: new Date().toISOString(), ...fact }); schedule(); } };
  const subject = (kind: string, id: string, version?: string | number): RecordedSubject => ({ kind: String(kind).slice(0, 256), id: String(id).slice(0, 256),
    ...(version !== undefined && version !== null && version !== "" ? { version: String(version).slice(0, 256) } : {}) });
  const keyOf = (shown: ShownObject | null) => shown ? shown.surface + "\u0000" + shown.id : "";
  let shown: ShownObject | null = null, minute: Minute | null = null, scrolled = false;
  /** The last located interaction: its target and work, for the shell's own back step (the return stage). */
  let located: { readonly work: { readonly work_ref: string }; readonly item: RecordedSubject; readonly list: string } | null = null;
  const closeMinute = () => {
    if (minute) record({ fact: "ui.dwell", stage: "minute", occurred_at: minute.at, subjects: [subject(minute.surface, minute.id)],
      detail: { seconds: minute.seconds, scrolled_seconds: minute.scrolled } });
    minute = null;
  };
  const tick = () => {
    const now = host.current(), at = new Date().toISOString().slice(0, 16) + ":00.000Z";
    if (minute && (minute.at !== at || minute.key !== keyOf(now))) closeMinute();
    if (keyOf(now) !== keyOf(shown)) {
      if (now) record({ fact: "ui.open", stage: "shown", subjects: [subject(now.surface, now.id)], detail: { surface: now.surface } });
      shown = now;
    }
    if (now && document.visibilityState === "visible" && document.hasFocus()) {
      minute ??= { at, key: keyOf(now), surface: now.surface, id: now.id, seconds: 0, scrolled: 0 };
      minute.seconds += 1; if (scrolled) minute.scrolled += 1;
    }
    scrolled = false;
  };
  setInterval(tick, 1000);
  document.addEventListener("scroll", () => { scrolled = true; }, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") { closeMinute(); send(true); } });
  addEventListener("pagehide", () => { closeMinute(); send(true); });
  /** One interaction (a list shown, what was chosen from it, finding it): its stages share one reference. */
  const interaction = (list: string) => {
    const work = { work_ref: "ui:" + list + ":" + crypto.randomUUID() };
    located = null;
    return {
      presented: (items: readonly RecordedSubject[], detail: Readonly<Record<string, string | number | boolean>> = {}) =>
        record({ fact: "ui.candidates", stage: "presented", work, subjects: items.slice(0, 16), detail: { list, count: items.length, ...detail } }),
      chosen: (item: RecordedSubject, index: number) => record({ fact: "ui.candidates", stage: "chosen", work, subjects: [item], detail: { list, index } }),
      dismissed: () => record({ fact: "ui.candidates", stage: "dismissed", outcome: "no_action", work, detail: { list } }),
      locate: (stage: string, item: RecordedSubject, outcome?: string, detail: Readonly<Record<string, string | number | boolean>> = {}) => {
        if (stage === "requested") located = { work, item, list };
        return record({ fact: "ui.locate", stage, work, subjects: [item], ...(outcome ? { outcome } : {}), detail: { list, ...detail } });
      },
    };
  };
  /** The shell's back step after a locate: the person returned from the target to where they were. One record per locate. */
  const returned = () => {
    if (!located) return;
    record({ fact: "ui.locate", stage: "returned", work: located.work, subjects: [located.item], detail: { list: located.list } });
    located = null;
  };
  const observed = new Map<Element, { workId: string; cardId: string; revision: string; option: string }>();
  const seenOptions = new WeakMap<Element, string>();
  const cardFact = (stage: "presented" | "chosen", workId: string, cardId: string, revision: string, option: string) =>
    record({ fact: "ui.candidates", stage, work: { work_ref: workId }, subjects: [subject("automation_candidate", option, revision)],
      detail: { list: "automation", receipt_id: cardId + ":" + revision } });
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const candidate = observed.get(entry.target);
      if (!candidate || !entry.isIntersecting || document.hidden || !entry.target.isConnected) continue;
      cardFact("presented", candidate.workId, candidate.cardId, candidate.revision, candidate.option);
      observer.unobserve(entry.target);
      observed.delete(entry.target);
    }
  });
  const watchCard = (node: Element, workId: string, cardId: string, revision: string) => {
    for (const previous of observed.keys()) {
      if (previous.isConnected) continue;
      observer.unobserve(previous);
      observed.delete(previous);
    }
    for (const button of Array.from(node.querySelectorAll<HTMLElement>("[data-ix-field=adopt] [data-ix-option]"))) {
      const option = button.dataset.ixOption, key = JSON.stringify([workId, cardId, revision, option]);
      if (!option || seenOptions.get(button) === key) continue;
      seenOptions.set(button, key);
      observed.set(button, { workId, cardId, revision, option });
      observer.observe(button);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    for (const button of observed.keys()) {
      observer.unobserve(button);
      observer.observe(button);
    }
  });
  const cardChoice = (workId: string, cardId: string, revision: string, options: readonly string[]) => {
    for (const option of options) cardFact("chosen", workId, cardId, revision, option);
    send(); // Send the confirmed choice alongside the card invocation, before its owner can report the result.
  };
  return { record, subject, interaction, returned, watchCard, cardChoice };
}

export const WORK_RECORDS_FACTORY_SCRIPT = workRecordsFactory.toString();
