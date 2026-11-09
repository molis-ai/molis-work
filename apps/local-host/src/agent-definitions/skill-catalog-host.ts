import { nativeSkill } from "../skill-portability.js";
import { localPublisherKeyId } from "../plugin-builder/publisher-identity.js";
import { isDeepStrictEqual } from "node:util";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { skillErrors, type SkillAvailability } from "@molis-ai/molis-work-contracts/services/skills";
import { HomeConsentLedger } from "../home-plugin-store.js";
import { installedHomePlugins, installedPluginsInProject, type ProjectPluginHost } from "../project-plugin-ports.js";
import { pluginInstallRecords } from "../plugin-install-records.js";
import { SandboxPackageStore } from "../sandbox-package-store.js";
import { homeAgentDefinitions } from "./builtin-registrations.js";
import { skillCatalogProvider } from "./skill-catalog-actions.js";
import type { InstalledPluginEntry } from "../plugin-installed-view.js";
import type { CatalogSkill } from "./skill-catalog.js";

/** Installation identity, including its current state, is rechecked after any asynchronous permission check. */
function currentInstallation(record: PluginInstanceRecord, current: () => PluginInstanceRecord | null): () => void {
  const identity = (value: PluginInstanceRecord) => [value.install_id, value.installation_generation, value.plugin_id, value.version,
    value.publisher_signature, value.manifest_digest, value.state];
  const expected = identity(record);
  return () => {
    const now = current();
    if (!now || !isDeepStrictEqual(identity(now), expected)) throw skillErrors.read_refused("技能所在的安装已变化，请重新选择", { reason: "not_current" });
  };
}

/** The catalog reads existing owners once per call: installations, verified packages, declarations, and scoped settings. */
export function skillCatalogProviderFor(home: string, source: ProjectPluginHost) {
  const definitions = homeAgentDefinitions(home), packages = new SandboxPackageStore(home), ledger = new HomeConsentLedger(home);
  const skills = async (caller: ActionCallContext): Promise<CatalogSkill[]> => {
    const reference = caller.project_id ? source.host.projects().find(project => project.project_id === caller.project_id) : undefined;
    if (caller.project_id && !reference) throw new ActionError("actions.scope_mismatch", "技能目录需要当前项目");
    const homeRows = await installedHomePlugins(source.homePlugins());
    const projectRows = reference ? await installedPluginsInProject(source, reference.project_id) : [];
    const projectChecks = reference ? await source.host.withRuntime(reference, runtime => {
      const records = pluginInstallRecords(runtime.store.db);
      return new Map(projectRows.map(({ record }) => [record.install_id, currentInstallation(record, () => records.get(record.install_id))]));
    }) : new Map<string, () => void>();
    const localKey = localPublisherKeyId(home);
    const pins = new Map(ledger.publishers().map(pin => [pin.key_id, pin]));
    const directory = await source.host.inspectActions(caller, reference);
    // A project installation shadows the same identity's Home installation; two publishers remain distinct.
    const installations = new Map<string, InstalledPluginEntry & { scope: "home" | "project" }>([
      ...homeRows.map(row => [row.record.install_id, { ...row, scope: "home" as const }] as const),
      ...projectRows.map(row => [row.record.install_id, { ...row, scope: "project" as const }] as const),
    ]);
    const result: CatalogSkill[] = [];
    for (const { record, manifest, scope, recoveryError } of installations.values()) {
      if (!manifest?.methods?.length) continue;
      const pin = pins.get(record.publisher_signature);
      let availability: SkillAvailability = { available: true };
      if (record.publisher_trust === "pinned" && (!pin || pin.revoked_at)) availability = { available: false, reason: "publisher_revoked" };
      else if (recoveryError) availability = { available: false, reason: "resource_invalid" };
      else if (record.state !== "running") availability = { available: false, reason: "plugin_disabled" };
      const missing = manifest.requires?.find(required => !required.optional && !directory.some(action => action.capability_id === required.capability_id
        && action.version === required.version && action.availability.available));
      if (availability.available && missing) availability = { available: false, reason: "requires_unmet", detail: missing.reason };
      const registered = definitions.installation(record.plugin_id, record.install_id);
      let bodies = registered?.methods ?? [];
      if (record.publisher_trust === "pinned") {
        try {
          const kept = packages.load(record.plugin_id, record.publisher_signature, record.version).packaged;
          bodies = (kept?.agentBodies ?? []).filter(body => body.kind === "method").map(body => ({ skill_id: body.entry_id, version: manifest.methods!.find(method => method.skill_id === body.entry_id)!.version,
            name: body.name, summary: body.purpose, tools: [], body: body.body }));
        } catch { availability = { available: false, reason: "resource_invalid" }; bodies = []; }
      }
      const assertInstallation = scope === "home" ? currentInstallation(record, () => source.homePlugins()?.installation(record.install_id) ?? null) : projectChecks.get(record.install_id)!;
      for (const declaration of manifest.methods) {
        const body = bodies.find(value => value.skill_id === declaration.skill_id && value.version === declaration.version)?.body;
        let available = availability;
        if (available.available && body === undefined) available = { available: false, reason: "resource_invalid" };
        // Connector category binding belongs to the connection owner. Until that owner can resolve a declared category, it is unavailable.
        if (available.available && declaration.connector_categories?.length) available = { available: false, reason: "connection_missing", detail: declaration.connector_categories.join(", ") };
        if (available.available && declaration.native_only_reason) available = { available: false, reason: "native_only", detail: declaration.native_only_reason };
        if (available.available && nativeSkill(body ?? "", (declaration.resources ?? []).map(resource => ({ path: resource.path, binary: !/^(text\/|application\/(json|xml)|image\/svg)/.test(resource.media_type) })))) available = { available: false, reason: "native_only" };
        const english = caller.locale === "en", words = manifest.ui?.translations ?? {};
        const translated = english ? { ...declaration, name: words[declaration.name] ?? declaration.name, description: words[declaration.description] ?? declaration.description,
          ...(declaration.when_to_use ? { when_to_use: words[declaration.when_to_use] ?? declaration.when_to_use } : {}), ...(declaration.when_not_to_use ? { when_not_to_use: words[declaration.when_not_to_use] ?? declaration.when_not_to_use } : {}) } : declaration;
        result.push({ declaration: translated, body: body ?? "", availability: available,
          ref: { source: { kind: "plugin", plugin_id: record.plugin_id, plugin_version: record.version, publisher_signature: record.publisher_signature },
            skill_id: declaration.skill_id, version: declaration.version, install_id: record.install_id, installation_generation: record.installation_generation },
          pack: { plugin_id: record.plugin_id, title: english ? words[manifest.name] ?? manifest.name : manifest.name, version: record.version, publisher_label: pin?.label ?? manifest.publisher.publisher_id,
            trust: record.publisher_trust === "host" ? "host" : record.publisher_signature === localKey ? "home_local" : "pinned", scope },
          // The snapshot reads the ledger once; a read path compares its captured pin and never reopens an owner.
          assertCurrent: () => { assertInstallation(); },
          // After an await, the caller reads the ledger once and passes the live pins here instead of reopening it per Skill (N42–N44).
          assertPublisher: (live: ReadonlyMap<string, PluginPublisherPin>) => {
            if (record.publisher_trust !== "pinned") return;
            if (!isDeepStrictEqual(live.get(record.publisher_signature), pin)) throw skillErrors.read_refused("发布者授权已变化", { reason: "publisher_revoked" });
          } });
      }
    }
    return result;
  };
  return skillCatalogProvider({ definitions, skills, resource: (skill, path) => packages.skillResource(skill.ref.source.plugin_id,
    skill.ref.source.publisher_signature, skill.ref.source.plugin_version, skill.ref.skill_id, path),
    // Read once by an action that must recheck a publisher after an await; read paths use the snapshot's own pins.
    publishers: () => new Map(ledger.publishers().map(pin => [pin.key_id, pin])) });
}
