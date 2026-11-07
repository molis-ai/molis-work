import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentTaskGrantActions, TASK_GRANT_SUBJECT_KEY_PATTERN, type TaskGrantSetCategory } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { WebRequestContext } from "./web-route-table.js";

const KEY = new RegExp(TASK_GRANT_SUBJECT_KEY_PATTERN, "u");

/**
 * The platform's reads area on a page's task (specs/proactive-assistant/task-grants-platform-area.md §2.3): only the trusted
 * shell reaches it, with its own page header and without the frame bridge's (`plugin-page-authority.ts`, `taskGrantsChoice`).
 * The installation and the project are the page's; the request names only the task's key and, to write, the categories the
 * shell composed (§3.6). Both go to the person's own `agent.task_grants.list` / `set`, so the actions check everything again.
 */
export async function pageTaskGrants(context: WebRequestContext, project: LocalHostProjectReference | undefined, body: Record<string, unknown>) {
  const page = pluginPageRequest(context.request);
  if (!page || !context.request.headers["x-molis-context-page"] || !project || project.project_id !== page.project_id)
    throw new ActionError("actions.forbidden", "读取授权需要当前项目的可信控件");
  const keys = body?.mode === "read" ? ["mode", "key"] : body?.mode === "set" ? ["mode", "key", "categories", "expected_revision"] : null;
  if (!keys || Object.keys(body).some(key => !keys.includes(key)) || typeof body.key !== "string" || !KEY.test(body.key)
    || body.mode === "set" && (!Array.isArray(body.categories) || typeof body.expected_revision !== "string"))
    throw new ActionError("actions.input_invalid", "读取授权请求无效");
  const plugin_install_id = page.taskGrantsInstall(), key = body.key;
  await page.beforeEffect();
  const original = await localWebActionContext(context.localHost, project, LOCAL_OWNER_PERMISSIONS, page.signal);
  // The page must still be current at each of the action's own checks, and just before it writes.
  const caller: ActionCallContext = { ...original,
    validate_authority: async (...args) => { await original.validate_authority?.(...args); await page.beforeEffect(); },
    assert_authority_current: (...args) => { original.assert_authority_current?.(...args); page.assertCurrent(); } };
  const client = bindActionClient(context.localHost.actionClient(project), () => caller);
  if (body.mode === "set") {
    const subject = await client.invoke(agentTaskGrantActions.set, { plugin_install_id, key, categories: body.categories as TaskGrantSetCategory[], expected_revision: body.expected_revision as string });
    await page.beforeEffect();
    return { subject: { revision: subject.revision, categories: subject.categories } };
  }
  const listed = await client.invoke(agentTaskGrantActions.list, { plugin_install_id });
  await page.beforeEffect();
  const subject = listed.subjects.find(item => item.plugin_install_id === plugin_install_id && item.key === key);
  return { categories: listed.categories, subject: { revision: subject?.revision ?? "", categories: subject?.categories ?? [] } };
}
