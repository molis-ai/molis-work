import { ActionError, requireSynchronous, type ActionCallContext, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { RegisteredActionMetadata } from "@molis-ai/molis-work-kernel";
import type { HomeDirectoryEntry } from "./surface-home-directory.js";

const key = (reference: ActionReference) => JSON.stringify([reference.capability_id, reference.version, reference.provider_id]);
const viewKey = (view: RegisteredActionMetadata) => key({ ...view, provider_id: view.provider.provider_id });

/** Only the homepage's directory read can see a signed form through its component proof. Dispatch keeps the ordinary caller. */
export function homeFormDiscovery(caller: ActionCallContext, metadata: readonly RegisteredActionMetadata[], entries: readonly HomeDirectoryEntry[]) {
  if (!entries.some(entry => entry.signedForms.length)) return { caller, formOnly: (_view: ActionView) => false };
  const ordinary = new Set(caller.allowed_actions?.map(key));
  const registered = new Map<string, RegisteredActionMetadata | null>();
  for (const view of metadata) {
    const ref = viewKey(view);
    registered.set(ref, registered.has(ref) ? null : view);
  }
  const offers = new Set<string>();
  const forms = new Map<string, { reference: ActionReference; permissions: readonly string[]; assertCurrent(): void }>();
  for (const entry of entries) for (const form of entry.signedForms) {
    const ref = key(form.action);
    offers.add(ref);
    const view = registered.get(ref), { plugin, installation } = entry;
    if (!view || view.operation !== "command" || view.provider.kind !== "plugin" || view.provider.plugin_id !== plugin.plugin_id || view.provider.plugin_install_id !== installation.install_id
      || view.action.scope !== installation.scope || (view.provider.project_id ?? null) !== (installation.scope === "home" ? null : caller.project_id)) continue;
    try {
      const proof = form.retain();
      if (view.action.permissions.every(permission => proof.permissions.includes(permission))) forms.set(ref, { reference: form.action, ...proof });
    } catch (error) { if (!(error instanceof ActionError)) throw error; }
  }
  const formOnly = (view: ActionView) => forms.has(viewKey(view)) && !ordinary.has(viewKey(view));
  const check = (reference?: ActionReference, permissions: readonly string[] = []) => {
    const form = reference && forms.get(key(reference));
    if (!form) return false;
    requireSynchronous(caller.assert_authority_current?.());
    form.assertCurrent();
    if (!permissions.every(permission => form.permissions.includes(permission))) throw new ActionError("actions.provider_changed", "原组件动作权限已变化");
    return true;
  };
  return { formOnly, caller: {
    ...caller,
    permissions: [...new Set([...caller.permissions, ...[...forms.values()].flatMap(form => form.permissions)])],
    allowed_actions: [...(caller.allowed_actions ?? []).filter(reference => !offers.has(key(reference))), ...[...forms.values()].map(form => form.reference)],
    validate_authority: async (reference: ActionReference) => { if (!check(reference)) await caller.validate_authority?.(reference); },
    assert_authority_current: (reference?: ActionReference, permissions?: readonly string[]) => {
      if (!check(reference, permissions)) requireSynchronous(caller.assert_authority_current?.(reference, permissions));
    },
  } satisfies ActionCallContext };
}
