import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginProjectStatements } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertPluginActionCurrent, type PluginInstance } from "@molis-ai/molis-work-plugin-runtime";
import { SandboxError } from "@molis-ai/molis-work-plugin-sandbox";
import type { ProjectStatementProcess } from "./project-statement-process.js";
import { assertReadStatement, assertWriteStatement } from "./project-statement-protocol.js";

// A sandboxed plugin's statements in its own tables (`sdk.projectDatabase`), run in a process the Host can kill
// (`project-statement-process.ts`) instead of on the Host's thread. The rules are those of `pluginDatabaseClient`, asked here
// between the steps because the steps are asynchronous: every call asks the grants again, a write also asks the original caller of
// `instance`'s action (`assertPluginActionCurrent`) before the wait, right after it, before BEGIN's turn, before every statement and
// before COMMIT, and a call that was cancelled or revoked at any of these points commits nothing. S-46's check of each statement
// is the process's own (`project-statement-engine.ts`); a read comes back to this side only if the plugin still holds its grant.

/** `services.project_statements` over one plugin's process; `declaration` names the grants. */
export function isolatedProjectStatements(processes: ProjectStatementProcess, declaration: PluginDatabaseDeclaration,
  authorize: (permission: string) => void, instance: PluginInstance, closed: () => boolean): PluginProjectStatements {
  const permit = (permission: string) => {
    if (closed()) throw new ActionError("actions.plugin_unavailable", "插件数据库已关闭");
    authorize("storage:private"); authorize(permission);
  };
  const permitRead = () => permit(declaration.read_permission);
  const permitWrite = () => { permit(declaration.write_permission); assertPluginActionCurrent(instance); };
  return {
    async get(sql, parameters, limits, signal) {
      permitRead(); assertReadStatement(sql);
      const row = await processes.get(sql, parameters, limits, signal);
      permitRead();
      return row;
    },
    async all(sql, parameters, limits, signal) {
      permitRead(); assertReadStatement(sql);
      const rows = await processes.all(sql, parameters, limits, signal);
      permitRead();
      return rows;
    },
    async transaction(beforeEffect, statements, signal) {
      permitWrite();
      await beforeEffect();
      return await processes.transaction(signal, async transaction => {
        const results: Array<{ changes: number }> = [];
        for (const statement of statements) {
          signal.throwIfAborted(); permitWrite(); assertWriteStatement(statement.sql);
          results.push({ changes: await transaction.run(statement.sql, statement.parameters) });
        }
        signal.throwIfAborted(); permitWrite();
        try { await transaction.commit(); } catch (error) { throw committing(error, signal); }
        return results;
      }, permitWrite);
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
