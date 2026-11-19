import { ActionError, bindActionClient, requireSynchronous, type ActionCallContext, type ActionClient, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { AUTOMATION_PROVIDER_ID, automationRecommendationActions } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { AutomationRecommender, AutomationScanPorts } from "@molis-ai/molis-work-service-automation-recommender";
import { webEntryDoor, webEntryProvider } from "./web-entry-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { bindLocalWebAction } from "./local-web-actions.js";
import { HOST_PROVIDER_ID } from "./local-host.js";
import { registeredPagesCreate } from "./automation-project.js";
import { offersQuiet, setOffersQuiet } from "@molis-ai/molis-work-service-automation-recommender";
import { lookedRecently, offerProjectAutomation, type AutomationOfferHooks } from "./automation-proactive.js";

export interface RecommendationEntry {
  readonly service: AutomationRecommender;
  readonly incarnation: string;
  readonly source: Pick<AutomationScanPorts, "directories" | "assertCurrent">;
  readonly files: ActionClient;
  readonly candidates: (caller: ActionCallContext) => ReturnType<AutomationScanPorts["candidates"]>;
  readonly host: MolisWorkLocalHost;
  readonly project: LocalHostProjectReference;
  readonly home: string;
  /** Where the Assistant's card goes, when the request came through a project page that has the Assistant. */
  readonly assistant?: AutomationOfferHooks;
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

/** The project read as the person, only the files of its folders, nothing written (AUT-01). */
function scanAs(entry: RecommendationEntry, caller: ActionExecutionContext) {
  const assertCurrent = () => { requireSynchronous(caller.assert_authority_current?.()); };
  const fileAction = { ...workspaceReadActions.file, provider_id: HOST_PROVIDER_ID };
  const files = bindActionClient(entry.files, () => ({
    actor_id: caller.actor_id, actor_kind: "user", project_id: caller.project_id, audience: "user", locale: caller.locale,
    permissions: ["workspace:read"], signal: caller.signal, query_only: true, allowed_actions: [fileAction],
    assert_authority_current: assertCurrent,
  }));
  return entry.service.scan(subject(entry, caller), { ...entry.source, locale: caller.locale, read: query => files.invoke(fileAction, query),
    candidates: () => entry.candidates(caller) }, { assertCurrent, beforeEffect: caller.beforeEffect });
}

export const automationRecommendationProvider = () => webEntryProvider(AUTOMATION_PROVIDER_ID, "项目自动化建议", [
  door.bind(a.scan, (entry, _input, caller) => scanAs(entry, caller)),
  door.bind(a.offer, async (entry, _input, caller) => {
    if (!entry.assistant) return { offered: false, reason: "no-assistant" };
    if (offersQuiet(entry.home, caller.actor_id)) return { offered: false, reason: "off" };
    const who = subject(entry, caller);
    if (lookedRecently(entry.home, who)) return { offered: false, reason: "recent" };
    const report = await scanAs(entry, caller);
    await caller.beforeEffect();
    control(entry, caller).assertCurrent();
    return offerProjectAutomation(entry.home, who, report, entry.assistant);
  }),
  door.bind(a.offers, (entry, _input, caller) => ({ enabled: !offersQuiet(entry.home, caller.actor_id) })),
  door.bind(a.setOffers, async (entry, input, caller) => {
    const guard = control(entry, caller);
    await guard.beforeEffect();
    setOffersQuiet(entry.home, caller.actor_id, !input.enabled, guard.assertCurrent);
    return { enabled: input.enabled };
  }),
  door.bind(a.preference, (entry, input, caller) => entry.service.change(subject(entry, caller), input, control(entry, caller))),
  door.bind(a.save, (entry, input, caller) => entry.service.save(subject(entry, caller), input.save_token, control(entry, caller),
    (document, guard) => createReport(entry, caller, document, guard))),
]);

export const invokeAutomationRecommendation = door.invoke;

async function createReport(entry: RecommendationEntry, original: ActionExecutionContext,
  input: { title: string; markdown: string; request_id: string }, control: { beforeEffect(): void | Promise<void>; assertCurrent(): void }) {
  // Save is a fresh person action. The token chooses the frozen draft. The Pages owner still supplies the current write authority.
  const definition = registeredPagesCreate();
  if (!definition) throw new ActionError("actions.service_unavailable", "当前项目无法新建 Pages 文稿，请在项目里启用文稿后重试");
  const pages = bindLocalWebAction(entry.host, entry.project, definition, { signal: original.signal, assertCurrent: control.assertCurrent });
  await control.beforeEffect();
  const output = await pages.invoke(definition, input, { beforeEffect: async () => { await control.beforeEffect(); },
    assert_authority_current: control.assertCurrent }) as { document?: { id?: unknown } };
  if (typeof output.document?.id !== "string" || !output.document.id) throw new ActionError("actions.output_invalid", "文稿已请求保存，暂时无法读取文稿编号");
  return { document_id: output.document.id };
}
