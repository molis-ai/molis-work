import { ActionError, bindActionClient, requireSynchronous, type ActionCallContext, type ActionClient, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { AUTOMATION_PROVIDER_ID, automationRecommendationActions } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AutomationRecommender, AutomationScanPorts } from "@molis-ai/molis-work-service-automation-recommender";
import { webEntryDoor, webEntryProvider } from "./web-entry-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { bindLocalWebAction } from "./local-web-actions.js";
import { HOST_PROVIDER_ID } from "./local-host.js";
import { createHash } from "node:crypto";
import type { OnboardingDocumentsInput, OnboardingDocumentsResult } from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import type { OnboardingTaker } from "./onboarding-takers.js";

export interface RecommendationEntry {
  readonly service: AutomationRecommender;
  readonly incarnation: string;
  readonly source: Pick<AutomationScanPorts, "directories" | "assertCurrent">;
  readonly files: ActionClient;
  readonly candidates: (caller: ActionCallContext) => ReturnType<AutomationScanPorts["candidates"]>;
  readonly host: MolisWorkLocalHost;
  readonly project: LocalHostProjectReference;
  /** The project's plugins that declare they keep a handed-over text as a document, read when the person saves. */
  readonly documentTakers: () => Promise<readonly OnboardingTaker[]>;
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
  // Save is a fresh person action. The token chooses the frozen draft. The plugin that keeps it, by its `documents` declaration,
  // still supplies the current write authority; with none, or more than one, in the project there is no telling where it goes.
  const takers = await entry.documentTakers();
  if (takers.length !== 1) throw new ActionError("actions.service_unavailable", takers.length
    ? "项目里有不止一个能保存文档的插件，暂时不能确定存到哪一个" : "当前项目没有能保存文档的插件，请在项目里启用一个后重试");
  const definition = takers[0]!.take as ActionDefinition<OnboardingDocumentsInput, OnboardingDocumentsResult>;
  const keeper = bindLocalWebAction(entry.host, entry.project, definition, { signal: original.signal, assertCurrent: control.assertCurrent });
  // The same report always has the same request: its id from the frozen draft, its hash from the text, so a repeat finds the first.
  const request_hash = createHash("sha256").update(JSON.stringify({ title: input.title, markdown: input.markdown })).digest("hex");
  await control.beforeEffect();
  const output = await keeper.invoke(definition, { request_id: input.request_id, request_hash, title: input.title, markdown: input.markdown },
    { beforeEffect: async () => { await control.beforeEffect(); }, assert_authority_current: control.assertCurrent });
  const first = output.parts?.[0];
  if (!first?.subject.id || !first.open.id) throw new ActionError("actions.output_invalid", "文稿已请求保存，暂时无法读取文稿编号");
  return { document_id: first.subject.id, open: { surface: first.open.surface, id: first.open.id, title: first.open.title } };
}
