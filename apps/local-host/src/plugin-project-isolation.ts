import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginProjectStatements } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertPluginActionCurrent, assertPluginReadCurrent, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { SandboxError } from "@molis-ai/molis-work-plugin-sandbox";
import type { ProjectStatementProcess } from "./project-statement-process.js";
import { assertReadStatement, assertWriteStatement } from "./project-statement-protocol.js";
import { projectReviewCommitControl, projectReviewForWrite } from "./project-review-effect.js";

// A sandboxed plugin's statements in its own tables (`sdk.projectDatabase`), run in a process the Host can kill
// (`project-statement-process.ts`) instead of on the Host's thread. The rules are those of `pluginDatabaseClient`, asked here
// between the steps because the steps are asynchronous: every call asks the grants again, a write also asks the original caller of
// `instance`'s action (`assertPluginActionCurrent`) before the wait, right after it, before BEGIN's turn, before every statement and
// before COMMIT, and a call that was cancelled or revoked at any of these points commits nothing. S-46's check of each statement
// is the process's own (`project-statement-engine.ts`); a read asks the action's original caller too (`assertPluginReadCurrent`, BL-943)
// before it is sent and again before its rows come back, so a revoked call neither starts a read nor receives one.

/** `services.project_statements` over one plugin's process; `declaration` names the grants. */
export function isolatedProjectStatements(processes: ProjectStatementProcess, declaration: PluginDatabaseDeclaration,
  authorize: (permission: string) => void, instance: PluginInstance, closed: () => boolean, projectId?: string): PluginProjectStatements {
  const permit = (permission: string) => {
    if (closed()) throw new ActionError("actions.plugin_unavailable", "插件数据库已关闭");
    authorize("storage:private"); authorize(permission);
  };
  const permitRead = () => { permit(declaration.read_permission); assertPluginReadCurrent(instance); };
  const permitWrite = () => { permit(declaration.write_permission); assertPluginActionCurrent(instance); };
  return {
    async get(sql, parameters, limits, signal) {
      permitRead(); assertReadStatement(sql);
      const row = await processes.get(sql, parameters, limits, signal, permitRead);
      permitRead();
      return row;
    },
    async all(sql, parameters, limits, signal) {
      permitRead(); assertReadStatement(sql);
      const rows = await processes.all(sql, parameters, limits, signal, permitRead);
      permitRead();
      return rows;
    },
    async transaction(beforeEffect, statements, signal) {
      permitWrite();
      await beforeEffect();
      const decision = projectReviewForWrite(projectId, instance);
      if (decision && (!decision.row || !statements.some(statement => (statement.expected_changes ?? 0) > 0))) {
        throw new ActionError("actions.input_invalid", "本人决定的写入需要在事务内核对待审版本和预期的更新行数");
      }
      const target = decision?.review.review.target;
      const reviewed = decision?.row && target ? { row: decision.row, id: target.subject.id, version: target.version } : undefined;
      const control = decision && projectReviewCommitControl(instance);
      return await processes.transaction(signal, async transaction => {
        const results: Array<{ changes: number }> = [];
        for (const statement of statements) {
          signal.throwIfAborted(); permitWrite(); assertWriteStatement(statement.sql);
          const changes = await transaction.run(statement.sql, statement.parameters);
          if (statement.expected_changes !== undefined && changes !== statement.expected_changes) {
            throw new ActionError("actions.conflict", "原业务对象已变化，已撤销本次事务");
          }
          results.push({ changes });
        }
        signal.throwIfAborted(); permitWrite();
        let permitIssued = false;
        try { await transaction.commit(decision, control ? () => {
          permitWrite();
          control.submit();
          permitIssued = true;
        } : undefined, () => { if (permitIssued) { control?.rolledBack(); permitIssued = false; } }); }
        catch (error) { throw !decision || permitIssued ? committing(error, signal) : error; }
        return results;
      }, permitWrite, reviewed);
    },
  };
}

const ENDED_BY_THE_HOST = new Set(["plugin.project_database.statement_timeout", "plugin.project_database.statement_memory", "plugin.project_database.process_failed", "actions.plugin_unavailable"]);

/**
 * A COMMIT that SQLite itself refused is a refusal: nothing was written. A COMMIT the Host cut short (killed for its time or
 * memory, the process gone, the call cancelled) may have been applied just before: the plugin is told so, not that nothing was.
 */
function committing(error: unknown, signal: AbortSignal): unknown {
  const ended = signal.aborted || (error instanceof ActionError && ENDED_BY_THE_HOST.has(error.code));
  if (!ended) return error;
  const code = error instanceof ActionError ? error.code : "sandbox.database_error";
  return new SandboxError(code, `${error instanceof Error ? error.message : String(error)}；提交时被中断，这次写入可能已经生效`, "unknown");
}
