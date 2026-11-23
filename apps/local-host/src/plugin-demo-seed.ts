import { acceptanceActions, acceptanceRequestId, type AcceptanceDecideRequest, type AcceptanceSubject } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginCatalogFor } from "./home-side.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { decideProjectReview, readProjectReview } from "./project-review-commands.js";
import { projectReviewPerson } from "./project-review-entry.js";

const DEMO_ACTOR = "demo-user";

export interface DemoAcceptanceRequest {
  subject: AcceptanceSubject;
  version: string;
  accepts: Array<{ id: string; version: number }>;
}

/** Classification comes from the Home's project owner, never a request or the plugin. No catalog means no demo authority. */
export async function isRegenerableDemo(home: string | undefined, projectId: string): Promise<boolean> {
  const catalog = home ? pluginCatalogFor(home) : undefined;
  return catalog ? catalog({ homeDirectory: home }, value => value.listProjects().some(project => project.project_id === projectId && project.data_class === "regenerable_demo")) : false;
}

/** Runs the protected person-review entry for requirements a plugin's demo seed delivered on its own objects (S-acceptance-person-decides). */
export async function acceptDemoProjectRequirements(
  host: MolisWorkLocalHost,
  project: LocalHostProjectReference,
  items: readonly DemoAcceptanceRequest[],
  actorId = DEMO_ACTOR,
): Promise<void> {
  if (!items.length) return;
  const assertCurrent = () => { if (host.lifecycle() !== "running") throw new ActionError("actions.host_closed", "示例项目的宿主已关闭"); };
  const person = await projectReviewPerson({ host, project }, undefined, assertCurrent);
  const caller = { ...person, actor_id: actorId };
  const { capability_id, version } = acceptanceActions.decide;
  const provider = host.inspectActionMetadata(caller, project).find(row => row.capability_id === capability_id && row.version === version);
  if (!provider) throw new Error("示例决定的原动作未启动");
  const { provider_id } = provider.provider;
  for (const item of items) {
    const draft: AcceptanceDecideRequest = { subject: item.subject, version: item.version, accepts: item.accepts, returns: [] };
    const request_id = acceptanceRequestId(item.subject);
    const entry = {
      caller,
      action: Object.freeze({ source: "management" as const, conversation_ref: `demo:${item.subject.provider_id}`, message_ref: `demo:${request_id}` }),
      assertCurrent,
    };
    const { reference } = await readProjectReview(host, project, { action: { capability_id, version, provider_id }, request_id, draft }, entry);
    await decideProjectReview(host, project, { reference, choice_id: "apply", request_key: request_id }, entry);
  }
}

function demoAcceptanceRequestsOf(result: unknown, providerId: string): DemoAcceptanceRequest[] {
  if (!result || typeof result !== "object") return [];
  const raw = (result as { accept_demo_requirements?: unknown }).accept_demo_requirements;
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw.map(item => {
    const request = item as DemoAcceptanceRequest;
    if (request?.subject?.provider_id !== providerId) {
      throw new ActionError("actions.forbidden", "演示初始化只能请求认可本插件自己的对象");
    }
    return request;
  });
}

/** Invokes one plugin's declared `demo_seed` action, completing its optional host-mediated acceptance phase if requested. */
export async function runDemoPluginSeed(input: {
  projectId: string;
  actorId: string;
  client: ActionClient;
  entry: { manifest: PluginManifest; providerId: string; current(): boolean };
  assertCurrent: () => Promise<void> | void;
  assertSyncCurrent?: () => void;
  acceptDemoRequirements?: (items: readonly DemoAcceptanceRequest[]) => Promise<void>;
}): Promise<void> {
  const { entry } = input;
  const ref = entry.manifest.demo_seed;
  if (!ref || !entry.current()) return;
  const definition = entry.manifest.actions?.find(action => action.capability_id === ref.capability_id && action.version === ref.version);
  if (!definition) throw new ActionError("actions.unredeemed", "演示初始化动作未声明");
  const invoke = async () => {
    await input.assertCurrent();
    return await input.client.invoke({
      actor_id: input.actorId,
      project_id: input.projectId,
      audience: "workflow",
      permissions: [...definition.action.permissions],
      validate_authority: input.assertCurrent,
      assert_authority_current: () => {
        input.assertSyncCurrent?.();
        if (!entry.current()) throw new ActionError("actions.forbidden", "演示插件已经停止");
      },
    }, { ...ref, provider_id: entry.providerId }, {});
  };
  const first = await invoke();
  const requests = demoAcceptanceRequestsOf(first, entry.providerId);
  if (requests.length && input.acceptDemoRequirements) {
    await input.assertCurrent();
    await input.acceptDemoRequirements(requests);
    await invoke();
  }
}

/** Shared by every project platform, independent of publisher, package name and plugin implementation. */
export async function initializeDemoPlugins(input: {
  home?: string; projectId: string; actorId: string; client: ActionClient;
  entries: readonly { manifest: PluginManifest; providerId: string; current(): boolean }[];
  assertCurrent?(): void;
  acceptDemoRequirements?: (items: readonly DemoAcceptanceRequest[]) => Promise<void>;
}): Promise<void> {
  if (!await isRegenerableDemo(input.home, input.projectId)) return;
  for (const entry of input.entries) {
    if (!entry.manifest.demo_seed || !entry.current()) continue;
    const assertCurrent = async () => {
      input.assertCurrent?.();
      if (!entry.current() || !await isRegenerableDemo(input.home, input.projectId)) throw new ActionError("actions.forbidden", "演示项目或插件已经改变");
    };
    await runDemoPluginSeed({
      projectId: input.projectId,
      actorId: input.actorId,
      client: input.client,
      entry,
      assertCurrent,
      assertSyncCurrent: input.assertCurrent,
      acceptDemoRequirements: input.acceptDemoRequirements,
    });
  }
}
