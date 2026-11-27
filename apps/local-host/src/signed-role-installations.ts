import type { PluginInstanceRecord, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SignedAgentInstallation, SignedAgentReference } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { characterErrors } from "@molis-ai/molis-work-contracts/modules/characters";
import type { CharactersActionPorts } from "@molis-ai/molis-work-module-characters";
import { homeAgentDefinitions } from "./agent-definitions/builtin-registrations.js";
import { HomeConsentLedger } from "./home-plugin-store.js";

export function bindSignedRoleInstallations(home: string, projectId: string | null, projectRows: PluginRuntimeRepository | undefined,
  homeRows: () => readonly PluginInstanceRecord[], installs: readonly { install_id: string; source: SignedAgentReference["source"] }[], invalid: () => Error) {
  const ledger = new HomeConsentLedger(home), atBind = homeRows();
  const bound = new Map<string, { installation: SignedAgentInstallation; isCurrent(): boolean; assertCurrent(): void }>();
  for (const { install_id: installId, source } of installs) {
    const inProject = projectRows?.get(installId);
    const current = inProject ? () => projectRows!.get(installId) : () => homeRows().find(row => row.install_id === installId);
    const original = inProject ?? atBind.find(row => row.install_id === installId);
    if (!original || bound.has(installId)) continue;
    const isCurrent = () => {
      const record = current();
      return record?.state === "running" && record.installation_generation === original.installation_generation && record.plugin_id === source.plugin_id
        && record.version === source.plugin_version && record.publisher_signature === source.publisher_signature
        && record.publisher_trust === "pinned" && ledger.publishers().some(pin => pin.key_id === record.publisher_signature && !pin.revoked_at);
    };
    const assertCurrent = () => { if (!isCurrent()) throw invalid(); };
    bound.set(installId, { installation: { install_id: installId, installation_generation: original.installation_generation, project_id: inProject ? projectId : null }, isCurrent, assertCurrent });
  }
  return bound;
}

export function characterSignedTemplates(home: string, project: string, rows: PluginRuntimeRepository,
  homeRows: () => readonly PluginInstanceRecord[]): NonNullable<CharactersActionPorts["signedTemplates"]> {
  const invalid = () => characterErrors.invalid("角色来源已变化，请重新打开角色列表");
  const candidates = () => {
    const definitions = homeAgentDefinitions(home), roles = definitions.signedRoles();
    const bindings = bindSignedRoleInstallations(home, project, rows, homeRows, roles.map(role => ({ install_id: role.install_id, source: role.default_ref.source })), invalid);
    return roles.flatMap(role => {
      const binding = bindings.get(role.install_id);
      if (!binding?.isCurrent()) return [];
      return [{ role, binding, definitions }];
    });
  };
  return {
    list: () => candidates().map(({ role, binding }) => ({ install_id: role.install_id, generation: binding.installation.installation_generation,
      role_id: role.role_id, name: role.name, purpose: role.purpose })),
    read(ref) {
      const selected = candidates().find(({ role, binding }) => role.install_id === ref.install_id && role.role_id === ref.role_id && binding.installation.installation_generation === ref.generation);
      if (!selected) throw invalid();
      const { role, binding, definitions } = selected;
      return { origin: { source: { kind: "package", plugin_id: role.owner_id, version: role.default_ref.source.plugin_version }, part_id: role.role_id },
        name: role.name, body: definitions.signedMaterial(role.install_id, role.default_ref, undefined, "package").body, assertCurrent: binding.assertCurrent };
    },
  };
}
