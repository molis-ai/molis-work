import { ActionError, requireSynchronous, type ActionCallContext, type ActionSubject, type ActionView, type RetainedSubjectState, type SubjectStateCapture, type ActionSubjectCurrentState } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentSessionLifecycleCapability, AgentSessionRef, AgentSessionWriteObservation } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { KnowledgeCardStorePort, KnowledgeListEntry } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { KnowledgeAccess, KnowledgeSource } from "@molis-ai/molis-work-service-knowledge";

export interface KnowledgeDispatchControl {
  beforeDispatch(): Promise<() => void>;
  dispose(): void;
}
export interface PreparedKnowledgeCatalog {
  catalog: { total: number; whole: boolean; pieces: KnowledgeListEntry[] };
  control?: KnowledgeDispatchControl;
}
/** Only the Host's automatic directory preparation carries this in-process extension. */
export interface KnowledgeCatalogAccess extends KnowledgeAccess {
  captureSubjectState?(subject: ActionSubject, source: KnowledgeSource, reader: ActionView, state: ActionView, sourceAction: ActionView): SubjectStateCapture;
}
interface SelectedSource {
  subject: ActionSubject;
  source: KnowledgeSource;
  provider: ActionView["provider"];
  retained: RetainedSubjectState;
  session: ActionSubjectCurrentState["execution_session"];
}
interface HeldObservation { session: AgentSessionRef; value: AgentSessionWriteObservation }
const sameSubject = (a: ActionSubject, b: ActionSubject) => a.kind === b.kind && a.id === b.id;
const sameSession = (a: ActionSubjectCurrentState["execution_session"], b: ActionSubjectCurrentState["execution_session"]) => a === null ? b === null
  : b !== null && a.runtime_id === b.runtime_id && a.session_id === b.session_id;
const changed = () => new ActionError("knowledge.source_changed", "所选项目资料当前不可用于本轮，请重新发起");

/** One bounded directory selection; ordinary title/brief edits keep their existing snapshot semantics. */
export function prepareKnowledgeDispatch(caller: ActionCallContext, cards: Pick<KnowledgeCardStorePort, "get">,
  lifecycle: (runtimeId: string) => AgentSessionLifecycleCapability | undefined): {
  capture: NonNullable<KnowledgeCatalogAccess["captureSubjectState"]>;
  select(pieces: readonly KnowledgeListEntry[]): KnowledgeDispatchControl | undefined;
  dispose(): void;
} {
  let selected: SelectedSource[] = [], observations: HeldObservation[] = [], disposed = false;
  const assertLive = () => { if (disposed) throw changed(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const held of observations) held.value.dispose();
    observations = []; selected = [];
  };
  const assertSelection = (entries: readonly SelectedSource[], held: readonly HeldObservation[]) => {
    assertLive();
    for (const entry of entries) requireSynchronous(entry.retained.authority.assertCurrent());
    for (const entry of entries) {
      const card = cards.get(caller.project_id!, entry.subject);
      if (!card || card.excluded || card.source_key !== entry.source.source_key || card.provider_id !== entry.source.provider_id || card.plugin_id !== entry.source.plugin_id) throw changed();
    }
    for (const entry of entries) {
      const current = requireSynchronous(entry.retained.current(), "来源当前状态必须同步读取");
      if (current.state !== "active" || !sameSubject(current.subject, entry.subject) || !sameSession(current.execution_session, entry.session)) throw changed();
    }
    for (const observation of held) {
      try { requireSynchronous(observation.value.assert_current()); } catch { throw changed(); }
    }
  };
  return {
    capture(subject, source, reader, state, sourceAction) {
      assertLive();
      const exact = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
      return { subject: { ...subject }, reader: exact(reader), source: exact(sourceAction),
        accept(retained) {
          assertLive();
          const current = retained.current();
          const entry = { subject: { ...subject }, source: { ...source }, provider: { ...state.provider }, retained, session: current.execution_session };
          selected = [...selected.filter(other => !sameSubject(other.subject, subject)), entry];
        } };
    },
    select(pieces) {
      assertLive();
      selected = selected.filter(entry => pieces.some(piece => sameSubject(piece.subject, entry.subject)));
      if (!selected.length) { dispose(); return undefined; }
      return {
        dispose,
        async beforeDispatch() {
          assertLive();
          const entries = [...selected], held: HeldObservation[] = [];
          // Only an observation already stale at entry may be renewed by this call.
          // Pin every still-current object before authority yields, including other sources.
          for (const entry of entries) {
            const observation = entry.session && observations.find(item => sameSession(item.session, entry.session));
            if (!observation || held.includes(observation)) continue;
            try { requireSynchronous(observation.value.assert_current()); held.push(observation); }
            catch { observation.value.dispose(); observations = observations.filter(item => item !== observation); }
          }
          for (const entry of entries) await entry.retained.authority();
          assertSelection(entries, held);
          for (const entry of entries) {
            assertLive();
            if (!entry.session) continue;
            const session = entry.session;
            let observation = held.find(item => sameSession(item.session, session)) ?? observations.find(item => sameSession(item.session, session));
            if (observation) {
              try { requireSynchronous(observation.value.assert_current()); }
              catch { throw changed(); }
            }
            let owner: Awaited<ReturnType<AgentSessionLifecycleCapability["read"]>>;
            try {
              const capability = lifecycle(session.runtime_id);
              if (!capability?.observeWrites) throw changed();
              if (!observation) {
                observation = { session: { ...session }, value: capability.observeWrites([session]) };
                observations.push(observation);
              }
              if (!held.includes(observation)) held.push(observation);
              owner = await capability.read(session);
              assertLive();
            } catch { throw changed(); }
            if (owner.view.state !== "active" || !sameSession(owner.view.session, session)
              || owner.owner.actor_id !== caller.actor_id || owner.owner.project_id !== caller.project_id
              || owner.owner.plugin_id !== entry.provider.plugin_id || owner.owner.install_id !== entry.provider.plugin_install_id) throw changed();
          }
          // Bind this dispatch to these exact objects. A later fresh observation cannot revive this fence.
          assertSelection(entries, held);
          return () => assertSelection(entries, held);
        },
      };
    },
    dispose,
  };
}
