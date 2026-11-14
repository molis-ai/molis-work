import { actionEffect, type ActionCallContext, type ActionView, type ExactActionReference, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MolisWorkLocalHost } from "../project-host.js";
import { actionKey } from "./assistant-authority.js";
import { assistantErrors } from "./assistant-errors.js";
import type { AssistantStore } from "./assistant-store.js";

const metadataCaller = (reference?: LocalHostProjectReference): ActionCallContext => ({
  actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "runtime", project_id: reference?.project_id ?? null, audience: "agent", permissions: [],
});

type Metadata = Omit<ActionView, "availability">;
const matchesAction = (view: Metadata, action: ExactActionReference) =>
  view.capability_id === action.capability_id && view.version === action.version && view.provider.provider_id === action.provider_id;

function policyOf(view: Metadata, policies: ReturnType<AssistantStore["actionPolicies"]>) {
  const action = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  const key = actionKey(action), reversible = Boolean(view.action.undo && view.operation === "command");
  return { ...action, ...policies.forAction(key), reversible,
    provider: view.provider.title, title: view.action.title, description: view.action.description,
    operation: view.operation, effect: actionEffect(view.action, view.capability_id), scope: view.action.scope };
}

export async function assistantActionPolicies(host: MolisWorkLocalHost, store: AssistantStore, reference?: LocalHostProjectReference) {
  const catalog = await host.inspectPreparedActionMetadata(metadataCaller(reference), reference);
  const policies = store.actionPolicies(LOCAL_PERSON_ACTOR_ID);
  return catalog.map(view => policyOf(view, policies));
}

export async function assistantActionPolicyView(host: MolisWorkLocalHost, store: AssistantStore, reference: LocalHostProjectReference | undefined,
  action: ExactActionReference) {
  const caller = metadataCaller(reference), matches = (view: Metadata) => matchesAction(view, action);
  const selected = (await host.inspectPreparedActionMetadata(caller, reference)).find(matches);
  if (!selected) return undefined;
  const assertCurrent = () => {
    const current = host.inspectActionMetadata(caller, reference).find(matches);
    if (!current || current.action !== selected.action || current.provider !== selected.provider) throw assistantErrors.conflict("能力或提供方已经变化，请刷新后再决定");
  };
  return { ...policyOf(selected, store.actionPolicies(LOCAL_PERSON_ACTOR_ID)), assertCurrent };
}

export async function changeAssistantActionPolicy(host: MolisWorkLocalHost, store: AssistantStore, reference: LocalHostProjectReference | undefined,
  action: ExactActionReference, input: { expected: string; enabled?: boolean; confirm_always?: boolean }, control: { beforeEffect(): void | Promise<void>; assertCurrent(): void }) {
  const selected = await assistantActionPolicyView(host, store, reference, action);
  if (!selected) throw assistantErrors.not_found("当前目录找不到这项能力");
  return writeAssistantActionPolicy(store, selected, input, control);
}

export async function writeAssistantActionPolicy(store: AssistantStore, selected: NonNullable<Awaited<ReturnType<typeof assistantActionPolicyView>>>,
  input: { expected: string; enabled?: boolean; confirm_always?: boolean }, control: { beforeEffect(): void | Promise<void>; assertCurrent(): void }) {
  if (input.confirm_always !== undefined && !selected.reversible) throw assistantErrors.invalid("这项能力没有可改的确认方式");
  await control.beforeEffect();
  return store.changeActionPolicy(LOCAL_PERSON_ACTOR_ID, actionKey(selected), input, () => {
    control.assertCurrent(); selected.assertCurrent();
  });
}
