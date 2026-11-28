import type { PluginInstanceRecord, PluginRuntimeRepository } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SignedAgentInstallation, SignedAgentReference } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { characterErrors } from "@molis-ai/molis-work-contracts/modules/characters";
import type { CharactersActionPorts } from "@molis-ai/molis-work-module-characters";
import { homeAgentDefinitions } from "./agent-definitions/builtin-registrations.js";
import { HomeConsentLedger } from "./home-plugin-store.js";

export function bindSignedRoleInstallations(home: string, projectId: string | null, projectRows: PluginRuntimeRepository | undefined,
  homeRows: () => readonly PluginInstanceRecord[], installs: readonly { install_id: string; source: SignedAgentReference["source"] }[], invalid: () => Error) {
  const bound = new Map<string, { installation: SignedAgentInstallation; assertCurrent(): void }>();
  if (!installs.length) return bound;
  const ledger = new HomeConsentLedger(home);
  const trustedPublishers = () => new Set(ledger.observedPublishers().filter(pin => !pin.revoked_at).map(pin => pin.key_id));
  const pins = trustedPublishers();
  const projectRecords = new Map(projectRows?.list().map(row => [row.install_id, row]));
  const homeRecords = new Map(homeRows().map(row => [row.install_id, row]));
  for (const { install_id: installId, source } of installs) {
    if (bound.has(installId)) continue;
    const inProject = projectRecords.get(installId);
    const original = inProject ?? homeRecords.get(installId);
    if (!original) continue;
    const matches = (row: PluginInstanceRecord | null | undefined, publishers: ReadonlySet<string>) =>
      row?.state === "running" && row.installation_generation === original.installation_generation && row.plugin_id === source.plugin_id
      && row.version === source.plugin_version && row.publisher_signature === source.publisher_signature
      && row.publisher_trust === "pinned" && publishers.has(source.publisher_signature);
    if (!matches(original, pins)) continue;
    const assertCurrent = () => {
      const record = inProject ? projectRows!.get(installId) : homeRows().find(row => row.install_id === installId);
      if (!matches(record, trustedPublishers())) throw invalid();
    };
    bound.set(installId, { installation: { install_id: installId, installation_generation: original.installation_generation, project_id: inProject ? projectId : null }, assertCurrent });
  }
  return bound;
}

export function characterSignedTemplates(home: string, project: string, rows: PluginRuntimeRepository,
  homeRows: () => readonly PluginInstanceRecord[]): NonNullable<CharactersActionPorts["signedTemplates"]> {
  const invalid = () => characterErrors.invalid("角色来源已变化，请重新打开角色列表");
  const candidates = (selection?: { install_id: string; role_id: string }) => {
    const definitions = homeAgentDefinitions(home);
    const roles = definitions.signedRoles().filter(role => !selection || role.install_id === selection.install_id && role.role_id === selection.role_id);
    const bindings = bindSignedRoleInstallations(home, project, rows, homeRows, roles.map(role => ({ install_id: role.install_id, source: role.default_ref.source })), invalid);
    return roles.flatMap(role => {
      const binding = bindings.get(role.install_id);
      if (!binding) return [];
      return [{ role, binding, definitions }];
    });
  };
  return {
    list: () => candidates().map(({ role, binding }) => ({ install_id: role.install_id, generation: binding.installation.installation_generation,
      role_id: role.role_id, name: role.name, purpose: role.purpose })),
    read(ref) {
      const selected = candidates(ref).find(({ binding }) => binding.installation.installation_generation === ref.generation);
      if (!selected) throw invalid();
      const { role, binding, definitions } = selected;
      return { origin: { source: { kind: "package", plugin_id: role.owner_id, version: role.default_ref.source.plugin_version }, part_id: role.role_id },
        name: role.name, body: definitions.signedMaterial(role.install_id, role.default_ref, undefined, "package").body, assertCurrent: binding.assertCurrent };
    },
  };
}
