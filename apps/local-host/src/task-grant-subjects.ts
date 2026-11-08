import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { TASK_GRANT_SUBJECT_KEY_PATTERN } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { removeMcpActionGrants } from "./mcp-settings-store.js";

/**
 * Who a task grant subject is (specs/proactive-assistant/schedule-task-reads.md §3.1): `agent:task:<project_id>:<plugin_install_id>:<key>`.
 * The Host writes the project and the installation from the call it is answering; the plugin gives only the key. The `agent:` prefix
 * makes it an Agent-audience client (`actionClientAudience`), which the action gateway refuses from any forwarding process (S-08).
 *
 * The id is read from the right: a key matches `TASK_GRANT_SUBJECT_KEY_PATTERN` and an installation id is the Plugin Runtime's
 * `plugin-install-<hex>` (`installIdentity`), so neither holds a `:`, and the project id is everything between the prefix and them.
 * A project id the catalog made is `<prefix>-<uuid>` or a fixed name, but nothing here relies on it holding no `:`, so a subject of
 * project `a` and one of project `a:b` stay apart; cleanup compares parsed fields, never a string prefix.
 */
export const TASK_GRANT_SUBJECT_PREFIX = "agent:task:";

const KEY = new RegExp(TASK_GRANT_SUBJECT_KEY_PATTERN, "u");

export interface TaskGrantSubjectIdentity {
  readonly project_id: string;
  readonly plugin_install_id: string;
  readonly key: string;
}

export function isTaskGrantSubject(clientId: string): boolean {
  return clientId.startsWith(TASK_GRANT_SUBJECT_PREFIX);
}

/** The subject of one key of one installation in one project; refuses a key or an id that would make it ambiguous. */
export function taskGrantSubjectId(projectId: string | null | undefined, installId: string | undefined, key: unknown): string {
  if (typeof key !== "string" || !KEY.test(key)) throw new ActionError("actions.input_invalid", "任务的授权主体只能用字母、数字、点、下划线和连字符");
  if (!projectId) throw new ActionError("actions.project_required", "任务的授权只在项目里设置");
  if (!installId || installId.includes(":")) throw new ActionError("actions.input_invalid", "插件安装编号无效");
  return `${TASK_GRANT_SUBJECT_PREFIX}${projectId}:${installId}:${key}`;
}

/** The three parts of a subject id, or null for any other client id (or a malformed one, which then belongs to no task). */
export function parseTaskGrantSubject(clientId: string): TaskGrantSubjectIdentity | null {
  if (!isTaskGrantSubject(clientId)) return null;
  const rest = clientId.slice(TASK_GRANT_SUBJECT_PREFIX.length);
  const keyAt = rest.lastIndexOf(":"), installAt = keyAt > 0 ? rest.lastIndexOf(":", keyAt - 1) : -1;
  if (installAt <= 0) return null;
  const identity = { project_id: rest.slice(0, installAt), plugin_install_id: rest.slice(installAt + 1, keyAt), key: rest.slice(keyAt + 1) };
  return identity.plugin_install_id && KEY.test(identity.key) ? identity : null;
}

/**
 * Takes every task grant of the subjects `match` picks out of the Home's action grants, in one write: a deleted project's, or an
 * uninstalled installation's. A grant left behind would read again for a project or installation that came back under the same id.
 */
export async function forgetTaskGrantSubjects(homeDirectory: string, match: (subject: TaskGrantSubjectIdentity) => boolean): Promise<number> {
  return removeMcpActionGrants(homeDirectory, grant => {
    const subject = parseTaskGrantSubject(grant.client_id);
    return subject !== null && match(subject);
  });
}
