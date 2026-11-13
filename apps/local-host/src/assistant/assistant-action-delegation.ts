import { ActionError, type ActionProvider, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { isPresentationValuesAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { AgentActionReviewAuthority, AgentDelegationTargetOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { extractActionDelegation } from "@molis-ai/molis-work-plugin-sdk";
import type { MolisWorkLocalHost } from "../project-host.js";
import type { StoredWork } from "./assistant-store.js";

type Host = Pick<MolisWorkLocalHost, "homePlugins" | "projectActionInstallations">;
type Owner = { readonly identity: AgentDelegationTargetOwner; assertCurrent(): void };

/** One project installation reader per proposal, independent of the directory discovery that chose the original action. */
export async function assistantActionOwners(host: Host, work: StoredWork, catalog: readonly ActionView[]) {
  const project = work.project_ref;
  const records = project && await host.projectActionInstallations(project);
  const capture = (provider: ActionProvider) => {
    const installId = provider.plugin_install_id;
    if (provider.kind !== "plugin" || !installId || provider.project_id && provider.project_id !== project?.project_id) return undefined;
    const read = () => provider.project_id ? records?.get(installId) : host.homePlugins?.installation(installId);
    const original = read();
    if (!original || original.state !== "running" || original.plugin_id !== provider.plugin_id || original.install_id !== installId) return undefined;
    const generation = original.installation_generation;
    return {
      generation,
      manifest: () => provider.project_id ? records?.manifest(installId) : host.homePlugins?.manifest(original.plugin_id),
      assertCurrent() {
        const current = read();
        if (!current || current.state !== "running" || current.install_id !== installId || current.plugin_id !== original.plugin_id
          || current.installation_generation !== generation || current.manifest_digest !== original.manifest_digest) {
          throw new ActionError("actions.provider_changed", "原授权目标的安装已停用或替换");
        }
      },
    };
  };
  const installations = new Map<string, ReturnType<typeof capture>>();
  const installation = (provider: ActionProvider) => {
    const key = JSON.stringify([provider.project_id ?? null, provider.plugin_install_id ?? null, provider.plugin_id ?? null]);
    if (!installations.has(key)) installations.set(key, capture(provider));
    return installations.get(key);
  };
  const owner = (kind: string) => {
    const readers = catalog.filter(row => row.operation === "query" && isPresentationValuesAction(row.action)
      && row.action.subject_kinds.includes(kind) && row.availability.available && row.provider.project_id === project?.project_id);
    if (readers.length !== 1) return undefined;
    const reader = readers[0]!, held = installation(reader.provider);
    if (!held) return undefined;
    return { reader, identity: { provider_id: reader.provider.provider_id, installation_generation: held.generation, kind },
      titleField: () => held.manifest()?.presentation?.objects?.find(item => item.kind === kind)?.fields.find(field => field.role === "title")?.key,
      assertCurrent: held.assertCurrent };
  };
  return { installation, owner };
}

export async function assistantActionDelegation(host: Host, work: StoredWork, view: ActionView, input: unknown, catalog: readonly ActionView[],
  confirmationRequired: () => boolean,
  captureReader: (view: ActionView, kind: string, id: string) => () => void): ReturnType<NonNullable<AgentActionReviewAuthority["resolveDelegation"]>> {
  const facts = await assistantActionOwners(host, work, catalog), provider = facts.installation(view.provider);
  const extracted = extractActionDelegation(view.action, input), targetOwners: Record<string, Owner> = Object.create(null);
  if (extracted.state === "resolved" && view.action.delegation && view.action.delegation !== "confirmation-only") {
    for (const target of view.action.delegation.targets) {
      const id = extracted.operations.find(operation => Object.hasOwn(operation.targets, target.key))?.targets[target.key];
      if (!id) continue;
      const owner = facts.owner(target.kind);
      if (!owner) continue;
      const readerCurrent = captureReader(owner.reader, target.kind, id);
      targetOwners[target.key] = { identity: owner.identity, assertCurrent: () => { readerCurrent(); owner.assertCurrent(); } };
    }
  }
  return { provider_installation_generation: provider?.generation ?? null, confirmationRequired,
    assertProviderCurrent: () => {
      if (!provider) throw new ActionError("actions.provider_changed", "无法核对原授权动作的安装");
      provider.assertCurrent();
    }, target_owners: targetOwners };
}
