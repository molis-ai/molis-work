import { agentBodyIn } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { projectDirectoryWords } from "@molis-ai/molis-work-ui-host";
import { pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
import { matchLocale } from "@molis-ai/molis-work-plugin-sdk/ui";
import { directoryWordResolver } from "../ui-text-provider.js";
import { activeLocale, DEFAULT_WEB_LOCALE } from "../web-locale.js";
import { skillDisplayWords } from "./skill-display-words.js";
import { nativeSkill } from "../skill-portability.js";
import { localPublisherKeyId } from "../installed-plugin-publisher.js";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { SKILLS_PROVIDER_ID, skillErrors, type SkillAvailability } from "@molis-ai/molis-work-contracts/services/skills";
import { hostTextForCommit, type HostCompleteText } from "../host-complete-text.js";
import { resolveModelPrompt } from "./instructions.js";
import { SkillWorkshop } from "./skill-workshop.js";
import { HomeConsentLedger } from "../home-plugin-store.js";
import { SandboxPackageStore } from "../sandbox-package-store.js";
import { homeAgentDefinitions } from "./builtin-registrations.js";
import { skillCatalogProvider } from "./skill-catalog-actions.js";
import { scopeInstallations } from "../scope-installations.js";
import { SkillCatalog, type SkillCatalogPorts } from "./skill-catalog.js";
import type { ProjectPluginHost } from "../project-plugin-ports.js";
import { isDeepStrictEqual } from "node:util";
import { categoryAvailability, homeCategoryAccounts, type CategoryAccounts } from "./skill-connector-categories.js";
import type { CatalogSkill } from "./skill-catalog.js";
import type { AgentDefinitions } from "./agent-definitions.js";
import { SYSTEM_PACK_SIGNATURE, systemPackInstallId, systemSkillPacks, type SystemSkillPack } from "./system-skill-packs.js";

/** A system pack's name and what it is, in the caller's language: its own words, as an installed package's are read. */
export function systemSkillPackWords(pack: SystemSkillPack, callerLocale?: string): { name: string; summary?: string } {
  const { manifest, localePacks: reader } = pack;
  const locale = matchLocale(callerLocale ?? activeLocale(), manifest.ui.locales?.available ?? [], reader?.default ?? DEFAULT_WEB_LOCALE);
  return projectDirectoryWords({ ...manifest, ui: {} }, reader ? directoryWordResolver(reader, locale) : undefined);
}

/**
 * The catalog over this Home, with the drafts and replays of Skills (batch 42); it reads existing owners once per call: installations,
 * verified packages, declarations, and scoped settings. `completion`: the Host's injected text model, `null` for none, absent for the
 * person's configured model.
 */
export function skillCatalogProviderFor(home: string, source: ProjectPluginHost, systemSkillsDirectory?: string, completion?: HostCompleteText | null) {
  const definitions = homeAgentDefinitions(home), packages = new SandboxPackageStore(home);
  const ports = skillCatalogPorts(home, source, definitions, scopeInstallations, true, undefined, systemSkillsDirectory);
  const model = () => hostTextForCommit(home, completion);
  const workshop = new SkillWorkshop({ drafts: definitions.skillDrafts, withSkills: ports.withSkills,
    release: (pluginId, keyId, version) => { try { return packages.load(pluginId, keyId, version).packaged; } catch { return undefined; } },
    savedAt: (pluginId, keyId) => new Map(packages.retainedVersions(pluginId, keyId).map(row => [row.version, row.saved_at])),
    model, resolve: prompt => resolveModelPrompt(home, prompt, SKILLS_PROVIDER_ID) });
  return skillCatalogProvider(ports, workshop);
}

export function observedSkillCatalog(home: string, source: ProjectPluginHost, definitions: AgentDefinitions, installations: Awaited<ReturnType<typeof scopeInstallations>>,
  pins: ReadonlyMap<string, PluginPublisherPin>) {
  return new SkillCatalog(skillCatalogPorts(home, source, definitions, async () => installations, false, pins));
}

function skillCatalogPorts(home: string, source: ProjectPluginHost, definitions: AgentDefinitions, list: typeof scopeInstallations, prepare: boolean,
  observedPins?: ReadonlyMap<string, PluginPublisherPin>, systemSkillsDirectory?: string): SkillCatalogPorts {
  const packages = new SandboxPackageStore(home), ledger = new HomeConsentLedger(home);
  const publishers = () => new Map((prepare ? ledger.publishers() : ledger.observedPublishers()).map(pin => [pin.key_id, pin]));
  // The observation catalog is reserved for candidates with a current installation to pin.
  const systemPacks = () => prepare ? systemSkillPacks(systemSkillsDirectory) : [];
  const withSkills = async <Result>(caller: ActionCallContext, use: (skills: readonly CatalogSkill[]) => Result): Promise<Result> => {
    const { reference, installations } = await list(source, caller);
    const directory = await source.host.inspectActions(caller, reference, prepare);
    const localKey = localPublisherKeyId(home);
    // A publisher can be revoked during inspection while its installation still runs. Take one snapshot and use it synchronously.
    const pins = observedPins ?? publishers();
    // The person's accounts by connector category, read once and only when a Skill here declares one (ASC-38～40).
    const declaresCategories = installations.some(({ manifest }) => manifest?.methods?.some(method => method.connector_categories?.length))
      || systemPacks().some(pack => pack.manifest.methods?.some(method => method.connector_categories?.length));
    const accounts: CategoryAccounts = declaresCategories ? await homeCategoryAccounts(home) : new Map();
    const categoryFacts = (declared: readonly string[] | undefined) => declared?.length
      ? { category_accounts: new Map(declared.map(category => [category, accounts.get(category) ?? []])) as CategoryAccounts } : {};
    const result: CatalogSkill[] = [];
    for (const { record, manifest, scope, recoveryCode, readLocalePacks, assertCurrent: assertInstallation } of installations) {
      if (!manifest?.methods?.length) continue;
      const pin = pins.get(record.publisher_signature);
      let availability: SkillAvailability = { available: true };
      if (record.publisher_trust === "pinned" && (!pin || pin.revoked_at)) availability = { available: false, reason: "publisher_revoked" };
      else if (recoveryCode) availability = { available: false, reason: "resource_invalid" };
      else if (record.state !== "running") availability = { available: false, reason: "plugin_disabled" };
      const missing = manifest.requires?.find(required => !required.optional && !directory.some(action => action.capability_id === required.capability_id
        && action.version === required.version && action.availability.available));
      if (availability.available && missing) availability = { available: false, reason: "requires_unmet", detail: missing.reason };
      const registered = definitions.installation(record.plugin_id, record.install_id);
      let bodies = registered?.methods ?? [];
      let reader = record.publisher_trust === "host" ? readLocalePacks() : null;
      if (record.publisher_trust === "pinned") {
        try {
          const kept = packages.load(record.plugin_id, record.publisher_signature, record.version).packaged;
          if (kept?.manifest.kind === "content" && pluginManifestDigest(kept.manifest) === record.manifest_digest) reader = kept.localePacks ?? null;
          bodies = (kept?.agentBodies ?? []).filter(body => body.kind === "method").map(body => ({ skill_id: body.entry_id, version: manifest.methods!.find(method => method.skill_id === body.entry_id)!.version,
            name: body.name, summary: body.purpose, tools: [], body: body.body, ...(body.body_by_locale ? { body_by_locale: body.body_by_locale } : {}) }));
        } catch { availability = { available: false, reason: "resource_invalid" }; bodies = []; }
      }
      const locale = matchLocale(caller.locale ?? activeLocale(), manifest.ui.locales?.available ?? [], reader?.default ?? DEFAULT_WEB_LOCALE);
      const title = projectDirectoryWords({ ...manifest, ui: {} }, reader ? directoryWordResolver(reader, locale) : undefined).name;
      for (const declaration of manifest.methods) {
        const method = bodies.find(value => value.skill_id === declaration.skill_id && value.version === declaration.version);
        const body = method?.body;
        let available = availability;
        if (available.available && body === undefined) available = { available: false, reason: "resource_invalid" };
        // A declared category needs a connected account of a service that declares it; the missing ones are named (ASC-38).
        if (available.available && declaration.connector_categories?.length) available = categoryAvailability(declaration.connector_categories, accounts) ?? available;
        if (available.available && declaration.native_only_reason) available = { available: false, reason: "native_only", detail: declaration.native_only_reason };
        if (available.available && nativeSkill(body ?? "", (declaration.resources ?? []).map(resource => ({ path: resource.path, binary: !/^(text\/|application\/(json|xml)|image\/svg)/.test(resource.media_type) })))) available = { available: false, reason: "native_only" };
        const display = skillDisplayWords(declaration, reader, locale);
        result.push({ declaration, display, body: method ? agentBodyIn(method, caller.locale) : "", availability: available, ...categoryFacts(declaration.connector_categories),
          ref: { source: { kind: "plugin", plugin_id: record.plugin_id, plugin_version: record.version, publisher_signature: record.publisher_signature },
            skill_id: declaration.skill_id, version: declaration.version, install_id: record.install_id, installation_generation: record.installation_generation },
          pack: { plugin_id: record.plugin_id, title, version: record.version, publisher_label: pin?.label ?? manifest.publisher.publisher_id,
            trust: record.publisher_trust === "host" ? "host" : record.publisher_signature === localKey ? "home_local" : "pinned", scope },
          assertCurrent: assertInstallation,
          // After an await, the caller reads the ledger once and passes the live pins here instead of reopening it per Skill (N42–N44).
          assertPublisher: (live: ReadonlyMap<string, PluginPublisherPin>) => {
            if (record.publisher_trust !== "pinned") return;
            if (!isDeepStrictEqual(live.get(record.publisher_signature), pin)) throw skillErrors.read_refused("发布者授权已变化", { reason: "publisher_revoked" });
          } });
      }
    }
    // The packs that come with the system: the Host's own content, in every scope, with no installation to check or publisher to pin.
    for (const pack of systemPacks()) {
      const { manifest, localePacks: reader } = pack;
      const locale = matchLocale(caller.locale ?? activeLocale(), manifest.ui.locales?.available ?? [], reader?.default ?? DEFAULT_WEB_LOCALE);
      const title = systemSkillPackWords(pack, caller.locale).name;
      for (const declaration of manifest.methods ?? []) {
        const body = pack.bodies.find(item => item.kind === "method" && item.entry_id === declaration.skill_id);
        const ready: SkillAvailability = body ? { available: true } : { available: false, reason: "resource_invalid" };
        result.push({ declaration, display: skillDisplayWords(declaration, reader, locale), body: body ? agentBodyIn(body, caller.locale) : "",
          availability: ready.available && declaration.connector_categories?.length ? categoryAvailability(declaration.connector_categories, accounts) ?? ready : ready,
          default_state: pack.default_state, ...categoryFacts(declaration.connector_categories),
          ref: { source: { kind: "plugin", plugin_id: manifest.plugin_id, plugin_version: manifest.version, publisher_signature: SYSTEM_PACK_SIGNATURE },
            skill_id: declaration.skill_id, version: declaration.version, install_id: systemPackInstallId(manifest.plugin_id), installation_generation: manifest.version },
          pack: { plugin_id: manifest.plugin_id, title, version: manifest.version, publisher_label: "Molis Work", trust: "host", scope: "home" },
          assertCurrent: () => {}, assertPublisher: () => {} });
      }
    }
    return use(result);
  };
  return { definitions, withSkills, resource: (skill, path) => {
    const system = systemPacks().find(pack => systemPackInstallId(pack.manifest.plugin_id) === skill.ref.install_id);
    if (!system) return packages.skillResource(skill.ref.source.plugin_id, skill.ref.source.publisher_signature, skill.ref.source.plugin_version, skill.ref.skill_id, path);
    const bytes = system.file(path);
    if (!bytes) throw skillErrors.read_refused("技能的附带文件缺失", { reason: "resource_invalid" });
    return bytes;
  }, publishers };
}
