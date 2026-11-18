import { bindActionHandler, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { runActionCard, type ActionCard, type CardStore } from "@molis-ai/molis-work-plugin-sdk";
import { say } from "@molis-ai/molis-work-plugin-sdk/ui";
import { workBriefActions } from "./actions.js";
import type { BriefPorts } from "./briefs.js";
import { workBriefErrors } from "./error.js";
import { briefSubjectKey, type NextMark, type NextMarkState } from "./model.js";
import { readBriefSubjects } from "./reading.js";

/** A card kept in memory for one run: the claim and the result are written to the library around it, each in its own transaction. */
function memoryCards(): CardStore {
  return { update(card, expected, patch) {
    if (card.revision !== expected) throw workBriefErrors.conflict("这条下一步刚被处理过，请重新读取");
    return { ...card, ...patch, revision: card.revision + 1 };
  } };
}
const stateOf = (card: ActionCard): NextMarkState => card.status === "done" ? "done" : card.status === "failed" ? "failed" : card.status === "stale" ? "stale" : "unknown";

// The runs in flight in this process, per half. A Home has one executing process, so a `running` mark with no run here is one whose
// call ended without a result (cancelled, revoked, the process stopped): nothing more was written for it, and it reads as `unknown`.
const flights = new WeakMap<BriefPorts, Set<string>>();
const flying = (ports: BriefPorts) => flights.get(ports) ?? flights.set(ports, new Set()).get(ports)!;
const flight = (briefId: string, optionId: string) => JSON.stringify([briefId, optionId]);
/** The marks as they stand now: a `running` one that nothing is running any more is `unknown` (the stored row is not rewritten by a read). */
export function settledMarks(ports: BriefPorts, briefId: string, marks: readonly NextMark[]): NextMark[] {
  return marks.map(mark => mark.state === "running" && !flying(ports).has(flight(briefId, mark.option_id)) ? { ...mark, state: "unknown" } : mark);
}

/**
 * The next steps of a brief: the person's click runs the prepared action once, as the person, through the directory (SDK action card);
 * 「暂不」 and 「交给助理」 are only marks on this brief. Work Brief records how the option was dealt with here, never the outcome's facts.
 */
export function createNextHandlers(ports: BriefPorts): ActionHandlerBinding[] {
  const { read, write } = ports;
  const option = (briefId: string, optionId: string) => read(store => {
    const brief = store.get(briefId), found = store.version(brief)?.next.find(entry => entry.option_id === optionId);
    if (!found) throw workBriefErrors.option_stale("这条下一步已不在现行版里", { brief_id: briefId, option_id: optionId });
    return { found, mark: settledMarks(ports, briefId, store.marks(briefId)).find(mark => mark.option_id === optionId) };
  });
  const refuseDealt = (optionId: string, state: NextMarkState) => state === "unknown"
    ? workBriefErrors.option_stale("上一次执行没有确认结果。先到原处核对，再清除这条记录", { option_id: optionId, state })
    : workBriefErrors.option_stale("这条下一步已经处理过", { option_id: optionId, state });
  return [
    bindActionHandler(workBriefActions.runNext, async ({ brief_id, option_id }, caller) => {
      const { found, mark } = option(brief_id, option_id);
      if (found.act.kind !== "card") throw workBriefErrors.invalid("这条下一步是交给助理的，没有可直接执行的动作", { option_id });
      if (mark && mark.state !== "later" && mark.state !== "failed") throw refuseDealt(option_id, mark.state);
      const start = mark?.card ?? found.act.card, directory = ports.directory(), key = flight(brief_id, option_id);
      if (flying(ports).has(key)) throw refuseDealt(option_id, "running");
      flying(ports).add(key);
      try {
      // The claim: one run per option. A second click while this one runs meets `running` and stops.
      await write(caller, store => {
        const now = store.marks(brief_id).find(entry => entry.option_id === option_id);
        if (now && now.state !== "later" && now.state !== "failed") throw refuseDealt(option_id, now.state === "running" ? "unknown" : now.state);
        store.mark(brief_id, { option_id, state: "running", card: start, actor_id: caller.actor_id, at: ports.now() });
      });
      let card: ActionCard;
      try {
        const views = await directory.discover();
        card = await runActionCard(start, { revision: start.revision, values: {} }, { store: memoryCards(), now: () => new Date(ports.now()),
          authority: async () => ({ discover: async () => views, invoke: (reference, input) => directory.invoke(reference, input),
            check: (view, input) => directory.check({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input) }),
          readSubject: async subject => { const now = (await readBriefSubjects(directory, views, [subject])).get(briefSubjectKey(subject)); return now?.state === "ok" ? now.context : now?.state === "gone" ? "missing" : null; },
          refuse: (reason, message) => reason === "conflict" ? workBriefErrors.conflict(message) : workBriefErrors.option_stale(message, { option_id, reason }) });
      } catch (error) {
        // Refused before anything ran: the option is free again. A cancelled or revoked call writes nothing more: its claim stays, and reads as `unknown` once this run has ended.
        if (!caller.signal?.aborted) await write(caller, store => store.mark(brief_id, { option_id, state: null })).catch(() => undefined);
        throw error;
      }
      const result: NextMark = { option_id, state: stateOf(card), card, actor_id: caller.actor_id, at: ports.now() };
      // `unknown` is a read-time state, not a stored one: a run whose outcome was not confirmed keeps its `running` claim and
      // reads as `unknown` once this run ends; the person clears it after checking at the owner's. Writing it would violate
      // the library's state check and would invent a result the action never confirmed.
      if (result.state !== "unknown") await write(caller, store => store.mark(brief_id, result));
      if (card.status === "stale") throw workBriefErrors.option_stale(card.outcome ? say.text(card.outcome) : "它针对的对象已经变了，这条下一步不再执行", { option_id });
      return { mark: result };
      } finally { flying(ports).delete(key); }
    }),
    bindActionHandler(workBriefActions.setNext, ({ brief_id, option_id, state }, caller) => write(caller, store => {
      const brief = store.get(brief_id);
      if (!store.version(brief)?.next.some(entry => entry.option_id === option_id)) throw workBriefErrors.option_stale("这条下一步已不在现行版里", { brief_id, option_id });
      const mark = settledMarks(ports, brief_id, store.marks(brief_id)).find(entry => entry.option_id === option_id);
      // An unconfirmed run can only be cleared, by the person, after they checked at the owner's: the option is then free again.
      if (mark && mark.state !== "later" && mark.state !== "handed" && !(mark.state === "unknown" && state === null))
        throw workBriefErrors.conflict("这条下一步已经执行过，不能再改", { option_id, state: mark.state });
      store.mark(brief_id, state === null ? { option_id, state } : { option_id, state, actor_id: caller.actor_id, at: ports.now() });
      return { marks: settledMarks(ports, brief_id, store.marks(brief_id)) };
    })),
  ];
}
