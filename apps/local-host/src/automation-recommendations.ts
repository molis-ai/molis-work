import { ActionError, bindActionClient, requireSynchronous, type ActionCallContext, type ActionClient, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { AUTOMATION_PROVIDER_ID, automationRecommendationActions } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AutomationRecommender, AutomationScanPorts } from "@molis-ai/molis-work-service-automation-recommender";
import { webEntryDoor, webEntryProvider } from "./web-entry-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { localWebActionContext } from "./local-web-actions.js";
import { HOST_PROVIDER_ID } from "./local-host.js";
import { registeredPagesProvider } from "./automation-project.js";

export interface RecommendationEntry {
  readonly service: AutomationRecommender;
  readonly incarnation: string;
  readonly source: Pick<AutomationScanPorts, "directories" | "assertCurrent">;
  readonly files: ActionClient;
  readonly candidates: (caller: ActionCallContext) => ReturnType<AutomationScanPorts["candidates"]>;
  readonly host: MolisWorkLocalHost;
  readonly project: LocalHostProjectReference;
}
const door = webEntryDoor<RecommendationEntry>("automation-recommendations", () => "请从当前项目的本机页面打开建议");
const a = automationRecommendationActions;
const subject = (entry: RecommendationEntry, caller: ActionExecutionContext) => ({
  actor: caller.actor_id, project: entry.project.project_id, incarnation: entry.incarnation,
});
function control(entry: RecommendationEntry, caller: ActionExecutionContext) {
  const assertCurrent = () => { requireSynchronous(caller.assert_authority_current?.()); entry.source.assertCurrent(); };
  return { assertCurrent, beforeEffect: async () => { await caller.beforeEffect(); assertCurrent(); } };
}

export const automationRecommendationProvider = () => webEntryProvider(AUTOMATION_PROVIDER_ID, "项目自动化建议", [
  door.bind(a.scan, (entry, _input, caller) => {
    const assertCurrent = () => { requireSynchronous(caller.assert_authority_current?.()); };
    const fileAction = { ...workspaceReadActions.file, provider_id: HOST_PROVIDER_ID };
    const files = bindActionClient(entry.files, () => ({
      actor_id: caller.actor_id, actor_kind: "user", project_id: caller.project_id, audience: "user", locale: caller.locale,
      permissions: ["workspace:read"], signal: caller.signal, query_only: true, allowed_actions: [fileAction],
      assert_authority_current: assertCurrent,
    }));
    return entry.service.scan(subject(entry, caller), { ...entry.source, locale: caller.locale, read: query => files.invoke(fileAction, query),
      candidates: () => entry.candidates(caller) }, { assertCurrent, beforeEffect: caller.beforeEffect });
  }),
  door.bind(a.preference, (entry, input, caller) => entry.service.change(subject(entry, caller), input, control(entry, caller))),
  door.bind(a.save, (entry, input, caller) => entry.service.save(subject(entry, caller), input.save_token, control(entry, caller),
    (document, guard) => createReport(entry, caller, document, guard))),
]);

export const invokeAutomationRecommendation = door.invoke;

async function createReport(entry: RecommendationEntry, original: ActionExecutionContext,
  input: { title: string; markdown: string; request_id: string }, control: { beforeEffect(): void | Promise<void>; assertCurrent(): void }) {
  // Save is a fresh person action. The token chooses the frozen draft. The Pages owner still supplies the current write authority.
  const caller = await localWebActionContext(entry.host, entry.project, LOCAL_OWNER_PERMISSIONS, original.signal, { assertCurrent: control.assertCurrent });
  const registered = registeredPagesProvider();
  const refs = caller.allowed_actions?.filter(ref => ref.capability_id === "pages.create" && ref.version === /* @version action.pages.create */ 1 && ref.provider_id === registered);
  if (refs?.length !== 1 || !refs[0]?.provider_id) throw new ActionError("actions.service_unavailable", "当前项目无法新建 Pages 文稿，请在项目里启用文稿后重试");
  const reference = refs[0];
  await control.beforeEffect();
  const output = await entry.host.actionClient(entry.project).invoke({ ...caller, allowed_actions: [reference],
    validate_authority: async target => { await control.beforeEffect(); await caller.validate_authority?.(target); },
    assert_authority_current: (target, required) => { control.assertCurrent(); caller.assert_authority_current?.(target, required); },
  }, reference, input) as { document?: { id?: unknown } };
  if (typeof output.document?.id !== "string" || !output.document.id) throw new ActionError("actions.output_invalid", "文稿已请求保存，暂时无法读取文稿编号");
  return { document_id: output.document.id };
}
