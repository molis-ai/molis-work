import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginAttentionClient, PluginContextLedgerClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ContextAccess, ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GoalDecisionAttentionPort } from "./goal-decision-attention.js";
import type { GoalsEventInput, GoalsIdempotencyInput, GoalsJournal } from "./module/repository.js";
import type { GovernanceJournal } from "./governance/repository.js";
import { GOALS_PLUGIN_ID } from "./manifest.js";
import type { PluginSqlite } from "./plugin-sqlite.js";

const portErrors = defineErrorCodes("goals.ports", { project_mismatch: "forbidden" });

/**
 * What the modules' ports are, in a plugin (PG-094 S11): the platform's services, which already belong to one project and one caller,
 * behind the shapes the modules were written against. Each takes `PluginSqlite` for the window of the call it is in, so a write the
 * service makes joins the transaction the plugin's own rows are in. None of them chooses a project, an actor or an owner: a project
 * a caller names that is not this library's is refused, and the platform's service decides the rest.
 */
function same(projectId: string, wanted: string): void {
  if (projectId !== wanted) throw portErrors.project_mismatch("这个项目库只属于一个项目，不能代别的项目读写");
}

/** The project's journal as `GoalsJournal` and `GovernanceJournal` take it: this plugin's own events and idempotency records, in the window's transaction. */
export function journalOver(sqlite: PluginSqlite, projectId: string): GoalsJournal & GovernanceJournal {
  return {
    eventCursor(wanted) { same(wanted, projectId); return sqlite.journalReader().eventCursor(); },
    appendEvent(input: GoalsEventInput) {
      same(input.projectId, projectId);
      const { eventId, actorId, type, objectType, objectId, reason, payload, at } = input;
      return sqlite.journalWriter("写入日志").appendEvent({ eventId, actorId, type, objectType, objectId, reason, payload, at });
    },
    getIdempotency(wanted, actorId, operation, key) { same(wanted, projectId); return sqlite.journalReader().getIdempotency(actorId, operation, key); },
    putIdempotency(input: GoalsIdempotencyInput) {
      same(input.projectId, projectId);
      const { actorId, operation, key, requestHash, outcome, at } = input;
      sqlite.journalWriter("写入幂等记录").putIdempotency({ actorId, operation, key, requestHash, outcome, at });
    },
  };
}

/** Goal-decision Attention over `services.attention`: entries are recorded under Goals' id, and a write joins the call's transaction. */
export function attentionOver(sqlite: PluginSqlite, attention: PluginAttentionClient, projectId: string): GoalDecisionAttentionPort {
  const subject = (owner: string | null | undefined, subject_type: Parameters<GoalDecisionAttentionPort["query"]["findForSubject"]>[1], subject_id: string) =>
    ({ owner_plugin_id: owner ?? GOALS_PLUGIN_ID, subject_type, subject_id });
  return {
    query: {
      list(wanted) { same(wanted, projectId); return attention.list(); },
      findForSubject(wanted, subjectType, subjectId, owner) { same(wanted, projectId); return attention.findForSubject(subject(owner, subjectType, subjectId)); },
    },
    commands: {
      create(input) {
        same(input.project_id, projectId);
        const { subject_type, subject_id, reason, detail, entry_id } = input;
        return attention.join(sqlite.joined("写入提醒"), writer => writer.create({ ...subject(input.owner_plugin_id, subject_type, subject_id), reason,
          ...(detail ? { detail } : {}), ...(entry_id ? { entry_id } : {}) }));
      },
      setStatus(wanted, entryId, status, expectedRevision) {
        same(wanted, projectId);
        return attention.join(sqlite.joined("改提醒状态"), writer => writer.setStatus(entryId, status, expectedRevision));
      },
    },
  };
}

/** The Context Ledger over `services.contextLedger`: keys are stored under Goals' id, the scope is this project, the actor is the call's. */
export function ledgerOver(sqlite: PluginSqlite, ledger: PluginContextLedgerClient, projectId: string): ContextLedgerApi {
  const scoped = (access: ContextAccess) => {
    if (access.scope.kind !== "personal" || access.scope.id !== projectId) throw portErrors.project_mismatch("这个项目库只属于一个项目，不能代别的项目读写");
  };
  return {
    query: {
      get: (access, key) => { scoped(access); return ledger.get(key); },
      list: (access, query) => { scoped(access); return ledger.list(query); },
      history: (access, key) => { scoped(access); return ledger.history(key); },
    },
    commands: {
      put: (access, input) => { scoped(access); return ledger.join(sqlite.joined("记引用"), writer => writer.put(input)); },
      remove: (access, key, cause, recordedAt) => { scoped(access); return ledger.join(sqlite.joined("撤引用"), writer => writer.remove(key, cause, recordedAt)); },
    },
  };
}

const personalErrors = defineErrorCodes("goals.planning", { personal_not_loaded: "internal", personal_unavailable: "unavailable" });

/**
 * The person's own planning methods, as one call sees them. They live in the Home half, so a project's call asks for them (`load`)
 * outside any database window, and the window then reads this snapshot. A call that never reaches them never asks: the first read
 * with none loaded raises `goals.planning.personal_not_loaded`, and `run` loads once and runs the call again from the start (what
 * the first attempt wrote is rolled back with its failed transaction).
 */
export class PersonalMethodsSnapshot {
  private packs: readonly PlanningMethodPack[] | null = null;

  read(): readonly PlanningMethodPack[] {
    if (!this.packs) throw personalErrors.personal_not_loaded("这次调用还没有读取个人规划方法");
    return this.packs;
  }

  /** Runs the synchronous `body` with `packs` as the snapshot, and with none after. */
  within<T>(packs: readonly PlanningMethodPack[] | null, body: () => T): T {
    this.packs = packs;
    try { return body(); } finally { this.packs = null; }
  }

  async run<T>(load: () => Promise<readonly PlanningMethodPack[]>, attempt: (packs: readonly PlanningMethodPack[] | null) => Promise<T>): Promise<T> {
    try { return await attempt(null); } catch (error) {
      if ((error as { code?: unknown } | null)?.code !== "goals.planning.personal_not_loaded") throw error;
    }
    let packs: readonly PlanningMethodPack[];
    try { packs = await load(); } catch (error) {
      if ((error as { kind?: unknown } | null)?.kind === "cancelled") throw error;
      throw personalErrors.personal_unavailable("读不到个人规划方法：Home 的 Goals 没有回应");
    }
    return attempt(packs);
  }
}
