import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentKind, PluginConsentRecord } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { portTypeKey } from "@molis-ai/molis-work-contracts/platform/plugin-wiring";
import { consentStands, consentSubject } from "@molis-ai/molis-work-plugin-runtime";
import type { PluginPlatform } from "./plugin-platform.js";

/**
 * Bind what the running plugins' Manifests declare as defaults (BL-087, W4-03): each input port's `default_source` and each
 * plugin's default input group. Only where nothing was previously chosen: a port that already reads another plugin's output or a
 * fixed 成果 version the person gave it keeps what it reads (installing a default would also drop that fixed version), and a
 * plugin whose group was selected keeps it. A default whose source is not running here, has no such output, or offers another
 * type is left unbound, as the person would find it.
 *
 * A default applies only on a standing agreement in the Home's consent ledger (PG-005, ac-trust T4, S-78): the plugin's own publisher
 * agreed to this port reading that source, for the publisher the source runs under now, so a plugin that took over the source's
 * `plugin_id` later is not read by default; the Host agrees on its own build's behalf for the plugins it ships, and a person agrees
 * to the rest when installing. No agreement, no default: a platform without a ledger binds none. A default that was bound
 * (`origin: "default"`) and has lost its agreement (revoked, or the source is now another publisher's) is taken off, and a port
 * the person chose is not touched. A default group is selected the same way; a selection records no origin, so one already
 * selected stays selected after its agreement is revoked.
 */
export function bindDeclaredDefaults(platform: PluginPlatform, projectId: string, actorId: string): void {
  const rows = new Map<string, readonly PluginConsentRecord[]>();
  const agreed = (manifest: PluginManifest, kind: PluginConsentKind, subject: string): boolean => {
    if (!rows.has(manifest.plugin_id)) rows.set(manifest.plugin_id, platform.consents?.consents(manifest.plugin_id) ?? []);
    return consentStands(rows.get(manifest.plugin_id)!, manifest.publisher.signature, kind, subject);
  };
  const wiring = (target: PluginManifest, port: string, source: { plugin_id: string; port: string }): boolean => {
    const signature = platform.supervisor.manifest(source.plugin_id)?.publisher.signature;
    return signature !== undefined && agreed(target, "default_wiring", consentSubject.defaultWiring(port, source, signature));
  };
  for (const target of platform.wiring.view().plugins) {
    const manifest = platform.supervisor.manifest(target.plugin_id);
    if (!manifest) continue;
    for (const input of manifest.ports?.inputs ?? []) {
      const current = target.ports.find(port => port.port === input.port);
      if (current?.origin === "default" && current.source && !wiring(manifest, input.port, { plugin_id: current.source.source_plugin_id, port: current.source.source_port })) {
        platform.wiring.unbind(target.plugin_id, input.port);
        continue;
      }
      const source = input.default_source;
      if (!source || !wiring(manifest, input.port, source)) continue;
      const output = platform.supervisor.manifest(source.plugin_id)?.ports?.outputs.find(port => port.port === source.port);
      if (!output || portTypeKey(output.artifact_type_id, output.schema_version) !== portTypeKey(input.artifact_type_id, input.schema_version)) continue;
      if (current?.source || current?.artifact) continue;
      platform.wiring.bind({ project_id: projectId, actor_id: actorId, target_plugin_id: target.plugin_id, target_port: input.port,
        source_plugin_id: source.plugin_id, source_port: source.port, origin: "default" });
    }
    const group = manifest.ports?.input_groups?.find(candidate => candidate.default === true);
    if (group && agreed(manifest, "default_group", consentSubject.defaultGroup(group.group_id)) && platform.wiring.selectedGroup(target.plugin_id) === undefined) {
      platform.wiring.selectInputGroup(target.plugin_id, group.group_id);
    }
  }
  platform.wiring.evaluateAll();
}
