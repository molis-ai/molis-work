import { bindActionHandler, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { runActionCard, type ActionCard, type CardStore } from "@molis-ai/molis-work-plugin-sdk";
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
const stateOf = (card: ActionCard): NextMarkState => card.status === "done" ? "done" : card.status === "failed" ? "failed" : card.status === "stale" ? "stale" : "running";

/**
 * The next steps of a brief: the person's click runs the prepared action once, as the person, through the directory (SDK action card);
 * 「暂不」 and 「交给助理」 are only marks on this brief. Work Brief records how the option was dealt with here, never the outcome's facts.
 */
export function createNextHandlers(ports: BriefPorts): ActionHandlerBinding[] {
  const { read, write } = ports;
  const option = (briefId: string, optionId: string) => read(store => {
    const brief = store.get(briefId), found = store.version(brief)?.next.find(entry => entry.option_id === optionId);
    if (!found) throw workBriefErrors.option_stale("这条下一步已不在现行版里", { brief_id: briefId, option_id: optionId });
    return { found, mark: store.marks(briefId).find(mark => mark.option_id === optionId) };
  });
  return [
    bindActionHandler(workBriefActions.runNext, async ({ brief_id, option_id }, caller) => {
      const { found, mark } = option(brief_id, option_id);
      if (found.act.kind !== "card") throw workBriefErrors.invalid("这条下一步是交给助理的，没有可直接执行的动作", { option_id });
      if (mark && mark.state !== "later" && mark.state !== "failed") throw workBriefErrors.option_stale("这条下一步已经处理过", { option_id, state: mark.state });
      const start = mark?.card ?? found.act.card, directory = ports.directory();
      // The claim: one run per option. A second click while this one runs meets `running` and stops.
      await write(caller, store => {
        const now = store.marks(brief_id).find(entry => entry.option_id === option_id);
        if (now && now.state !== "later" && now.state !== "failed") throw workBriefErrors.option_stale("这条下一步已经处理过", { option_id, state: now.state });
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
        // Refused before anything ran: the option is free again. A cancelled or revoked call writes nothing more (its claim stays `running`: the result is unknown).
        if (!caller.signal?.aborted) await write(caller, store => store.mark(brief_id, { option_id, state: null })).catch(() => undefined);
        throw error;
      }
      const result: NextMark = { option_id, state: stateOf(card), card, actor_id: caller.actor_id, at: ports.now() };
      await write(caller, store => store.mark(brief_id, result));
      if (card.status === "stale") throw workBriefErrors.option_stale(card.outcome ?? "它针对的对象已经变了，这条下一步不再执行", { option_id });
      return { mark: result };
    }),
    bindActionHandler(workBriefActions.setNext, ({ brief_id, option_id, state }, caller) => write(caller, store => {
      const brief = store.get(brief_id);
      if (!store.version(brief)?.next.some(entry => entry.option_id === option_id)) throw workBriefErrors.option_stale("这条下一步已不在现行版里", { brief_id, option_id });
      const mark = store.marks(brief_id).find(entry => entry.option_id === option_id);
      if (mark && mark.state !== "later" && mark.state !== "handed") throw workBriefErrors.conflict("这条下一步已经执行过，不能再改", { option_id, state: mark.state });
      store.mark(brief_id, state === null ? { option_id, state } : { option_id, state, actor_id: caller.actor_id, at: ports.now() });
      return { marks: store.marks(brief_id) };
    })),
  ];
}
