import { skillEntriesOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { builtinActiveSkillScenes, skillSceneChoicesOf, type ActiveSkillScene } from "../memory/memory-plugin-scene.js";
import type { SkillDisplayWords } from "./skill-display-words.js";
import { resolveCategoryPlaceholders, type CategoryAccounts } from "./skill-connector-categories.js";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ActionCallContext, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import type { PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { SkillRef } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { SKILL_AUTHORED_PLUGIN_IDS, SKILL_EXCERPT_CHARS, SKILL_ROUND_AUTO_LIMIT, SKILL_SETTINGS_LOCKED_REASONS, skillErrors, type SkillAuthoredFields, type SkillAuthoredSource, type SkillAvailability, type SkillBodyReadResult,
  type SkillCatalogEntry, type SkillCatalogListRequest, type SkillReadRefusal, type SkillResourceContent, type SkillSceneChoice, type SkillSettingsSetRequest } from "@molis-ai/molis-work-contracts/services/skills";
import type { AgentDefinitions } from "./agent-definitions.js";
import { USES_KEPT, type SkillSetting } from "./skill-settings.js";
import { skillSettingReceipt } from "./skill-setting-receipt.js";
import { KIT_LIMITS, type KitReport } from "@molis-ai/molis-work-contracts/platform/kit-report";

/** Ephemeral projection of the existing installation and Agent definition owners, never a second register. */
export interface CatalogSkill {
  ref: SkillRef;
  declaration: PluginMethodDeclaration;
  display?: SkillDisplayWords;
  body: string;
  pack: SkillCatalogEntry["pack"];
  availability: SkillAvailability;
  /** A pack that comes with the system says how its Skills start; every other Skill is `off` until the person enables it. */
  default_state?: "auto" | "manual";
  /** The accounts that stand in for the Skill's declared connector categories now (ASC-38～40); absent when it declares none. */
  category_accounts?: CategoryAccounts;
  /** The captured snapshot still holds (installation identity); no owner is reopened. */
  assertCurrent(): void;
  /** Recheck the publisher against the pins one boundary read after an await, never per Skill. */
  assertPublisher(live: ReadonlyMap<string, PluginPublisherPin>): void;
}
export interface SkillCatalogPorts {
  definitions: AgentDefinitions;
  /** After asynchronous preparation, read the current grants once and call the consumer synchronously with them. */
  withSkills<Result>(caller: ActionCallContext, use: (skills: readonly CatalogSkill[], scenes?: ReadonlyMap<string, ActiveSkillScene>) => Result): Promise<Result>;
  resource(skill: CatalogSkill, path: string): Uint8Array;
  /** Read after an await, once per action: the ledger's current pins, for `assertPublisher`. */
  publishers(): ReadonlyMap<string, PluginPublisherPin>;
  /** The person's view adds each own Skill's source and each Skill's open draft (batch 42, `SkillWorkshop.decorate`). */
  decorate?(caller: ActionCallContext, skills: readonly CatalogSkill[], entries: SkillCatalogEntry[]): SkillCatalogEntry[];
}

const settingKey = (install: string, skill: string) => `${install}\0${skill}`;
const scopeOf = (caller: ActionCallContext) => caller.project_id ?? "home";
/**
 * Which Skills apply is the round's consumer, which the Host writes on its own calls only (`ActionCallContext.skill_round`,
 * specs/capability-pack/contract-design.md §2.3); the person's own view, which is no round, sees them all.
 */
const applicable = (skill: CatalogSkill, caller: ActionCallContext) => {
  const consumer = caller.skill_round?.consumer;
  return (caller.audience === "user" && !consumer) || skill.declaration.applies_to === "both" || skill.declaration.applies_to === (consumer ?? "agent");
};

/**
 * Whether a catalog list may show one Skill (SKP-03, SKP-10). The person's view and a round's view keep the rules above; a plugin that is
 * no round — a page listing what it could offer before one starts, so no `skill_round` — gets the class it asked for in `applies_to`, and
 * only when it asked for one. That is directory metadata alone: reading a body or a resource still goes through `refusal` and `applicable`,
 * so a round's own reads need the Host's frozen `skill_round` whatever this lists.
 */
const listable = (skill: CatalogSkill, caller: ActionCallContext, appliesTo: SkillCatalogListRequest["applies_to"]): boolean => {
  if (appliesTo && skill.declaration.applies_to !== "both" && skill.declaration.applies_to !== appliesTo) return false;
  if (caller.audience === "user") return true;
  return (caller.audience === "plugin" && caller.skill_round === undefined && appliesTo !== undefined) || applicable(skill, caller);
};

function entry(skill: CatalogSkill, setting: SkillSetting | undefined): SkillCatalogEntry {
  const d = skill.declaration, resources = d.resources ?? [];
  const words = skill.display ?? d;
  return { ref: skill.ref, name: words.name, description: words.description, applies_to: d.applies_to,
    ...(words.when_to_use ? { when_to_use: words.when_to_use } : {}), ...(words.when_not_to_use ? { when_not_to_use: words.when_not_to_use } : {}),
    ...(d.argument_hint ? { argument_hint: d.argument_hint } : {}), user_invocable: d.user_invocable ?? true, tools: [...d.tools],
    resources: resources.map(({ path, role, bytes }) => ({ path, role, bytes })), connector_categories: [...d.connector_categories ?? []],
    runs_scripts: resources.some(resource => resource.role === "script"), excerpt: Array.from(skill.body).slice(0, SKILL_EXCERPT_CHARS).join(""),
    pack: skill.pack, state: setting?.state ?? skill.default_state ?? "off", settings_revision: setting?.revision ?? 0, availability: skill.availability,
    ...(setting && setting.state !== "off" ? { enabled: { at: setting.enabled_at, by: setting.enabled_by, scope: setting.scope_ref === "home" ? "home" as const : "project" as const } } : {}) };
}

/** One of the person's own: in the scope's package of Skills written in settings, signed by this Home. */
export const isOwnSkill = (skill: CatalogSkill): boolean => skill.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS[skill.pack.scope] && skill.pack.trust === "home_local";

/**
 * A catalog Skill as the form's fields, in the caller's language. An imported package keeps a frontmatter block before the body; a
 * Skill written in settings is stored as the body itself, so a leading horizontal rule is content and is not stripped
 * (BL-skill-authoring-b41-followups ②).
 */
export function skillFields(skill: CatalogSkill): SkillAuthoredFields {
  const d = skill.declaration, words = skill.display ?? d;
  const installed = skill.pack.trust !== "host" && !isOwnSkill(skill);
  const body = (installed ? skill.body.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, "") : skill.body).replace(/\r\n?/gu, "\n").trim();
  return { name: words.name, description: words.description ?? "", applies_to: d.applies_to, body,
    ...(words.when_not_to_use ? { when_not_to_use: words.when_not_to_use } : {}), ...(d.argument_hint ? { argument_hint: d.argument_hint } : {}) };
}

/** Rounds whose own picks the catalog still counts: more than any Home runs at once; the oldest leaves first. */
const ROUNDS_KEPT = 512;

export class SkillCatalog {
  /**
   * The `auto` Skills each round read of its own choice, by the round's number (`skill_round.round`): what the limit counts. In memory
   * only: a round does not outlive the Host that runs it, and what a round used is kept by its owner, from the round's own events.
   */
  private readonly picked = new Map<string, Set<string>>();

  constructor(private readonly ports: SkillCatalogPorts) {}

  /**
   * One read of a round's own choice (SKL-02): an `auto` Skill the person did not name, on a call that carries the round's number.
   * Reading the same one again is free; a different one past `SKILL_ROUND_AUTO_LIMIT` is `over_limit`. The first read of each is
   * recorded as used: the Host's round is what accepted it, so a read that is no round's (no number) still records nothing.
   */
  private pick(skill: CatalogSkill, caller: ActionCallContext, round: string): SkillReadRefusal | undefined {
    let held = this.picked.get(round);
    const key = settingKey(skill.ref.install_id, skill.ref.skill_id);
    if (held?.has(key)) return undefined;
    if ((held?.size ?? 0) >= SKILL_ROUND_AUTO_LIMIT) return "over_limit";
    if (!held) {
      if (this.picked.size >= ROUNDS_KEPT) this.picked.delete(this.picked.keys().next().value!);
      this.picked.set(round, held = new Set());
    }
    held.add(key);
    this.ports.definitions.skills.recordUse({ ref: skill.ref, name: (skill.display ?? skill.declaration).name, scope_ref: scopeOf(caller),
      caller: caller.skill_round?.consumer ?? "agent", at: new Date().toISOString() });
    return undefined;
  }

  private withSnapshot<Result>(caller: ActionCallContext, use: (skills: readonly CatalogSkill[], settings: ReadonlyMap<string, SkillSetting>, scenes: ReadonlyMap<string, ActiveSkillScene>) => Result): Promise<Result> {
    return this.ports.withSkills(caller, (skills, scenes) => {
      const settings = new Map(this.ports.definitions.skills.settings(scopeOf(caller)).map(row => [settingKey(row.install_id, row.skill_id), row]));
      return use(skills, settings, scenes ?? builtinActiveSkillScenes());
    });
  }

  list(caller: ActionCallContext, input: SkillCatalogListRequest): Promise<{ skills: SkillCatalogEntry[]; scenes?: SkillSceneChoice[] }> {
    return this.withSnapshot(caller, (skills, settings, scenes) => {
      const latest = this.ports.definitions.skills.latestUses(scopeOf(caller)), counted = this.ports.definitions.skills.usesByCaller(scopeOf(caller));
      const rows = skills.filter(skill => listable(skill, caller, input.applies_to)).map(skill => entry(skill, settings.get(settingKey(skill.ref.install_id, skill.ref.skill_id))))
        .map(row => {
          const key = settingKey(row.ref.install_id, row.ref.skill_id), used = latest.get(key), uses = counted.get(key);
          return { ...row, ...used ? { last_used: { at: used.at, caller: used.caller, ...(used.run_ref ? { run_ref: used.run_ref } : {}) } } : {}, ...uses ? { recent_uses: uses } : {} };
        })
        .filter(row => (caller.audience === "user" || row.state !== "off") && (!input.states || input.states.includes(row.state)));
      const listed = this.ports.decorate ? this.ports.decorate(caller, skills, rows) : rows;
      return caller.audience === "user" && !caller.skill_round ? { skills: listed, scenes: skillSceneChoicesOf(scenes) } : { skills: listed };
    });
  }

  private refusal(skill: CatalogSkill | undefined, ref: SkillRef, caller: ActionCallContext, setting: SkillSetting | undefined): SkillReadRefusal | undefined {
    if (!skill || !isDeepStrictEqual(skill.ref, ref)) return "not_current";
    try { skill.assertCurrent(); } catch { return "not_current"; }
    if (!skill.availability.available && !(skill.availability.reason === "native_only" && caller.skill_round?.engine === "local")) return skill.availability.reason;
    if (!applicable(skill, caller)) return "not_applicable";
    const state = setting?.state ?? skill.default_state ?? "off";
    if (state === "off") return "off";
    if (caller.skill_round?.named.some(named => isDeepStrictEqual(named, ref))) return undefined;
    // Not named: a `manual` Skill stays closed, and so does every `auto` one in a round the person asked to run without them.
    if (state === "manual" || caller.skill_round?.auto === false) return "not_named";
    return undefined;
  }

  readBodies(caller: ActionCallContext, refs: readonly SkillRef[]): Promise<{ results: SkillBodyReadResult[] }> {
    return this.withSnapshot(caller, (skills, settings) => {
      const byKey = new Map(skills.map(skill => [settingKey(skill.ref.install_id, skill.ref.skill_id), skill]));
      return { results: refs.map(ref => {
        const key = settingKey(ref.install_id, ref.skill_id), skill = byKey.get(key), round = caller.skill_round;
        const reason = this.refusal(skill, ref, caller, settings.get(key))
          ?? (round?.round && !round.named.some(named => isDeepStrictEqual(named, ref)) ? this.pick(skill!, caller, round.round) : undefined);
        const detail = reason === "connection_missing" && skill && !skill.availability.available ? skill.availability.detail : undefined;
        return reason ? { ref, ok: false as const, reason, ...(detail ? { detail } : {}) } : { ref, ok: true as const, name: (skill!.display ?? skill!.declaration).name,
          // What the model reads: the declared categories' placeholders filled with the accounts they use now (ASC-38～40).
          body: resolveCategoryPlaceholders(skill!.body, skill!.declaration.connector_categories ?? [], skill!.category_accounts ?? new Map(), caller.locale) };
      }) };
    });
  }

  /**
   * One Skill as the fields the settings form edits (batch 41): the person's own view, whatever state the Skill is in, since nothing is
   * used and no round reads it. `mine` says it sits in the package of Skills written in settings; whether this Home may rewrite that
   * package is the save's to check. The body is without its frontmatter, which an imported Skill's file carries.
   */
  readSource(caller: ActionCallContext, ref: SkillRef): Promise<SkillAuthoredSource> {
    return this.withSnapshot(caller, skills => {
      const skill = skills.find(item => isDeepStrictEqual(item.ref, ref));
      if (!skill) throw skillErrors.authored_unknown("这个技能已经不是目录里的当前版本，请刷新后再试");
      try { skill.assertCurrent(); } catch { throw skillErrors.authored_unknown("这个技能已经不是目录里的当前版本，请刷新后再试"); }
      return { skill_id: ref.skill_id, version: ref.version, scope: skill.pack.scope, mine: isOwnSkill(skill), ...skillFields(skill) };
    });
  }

  readResource(caller: ActionCallContext, ref: SkillRef, path: string): Promise<SkillResourceContent> {
    return this.withSnapshot(caller, (skills, settings) => {
      const skill = skills.find(item => item.ref.install_id === ref.install_id && item.ref.skill_id === ref.skill_id);
      const round = caller.skill_round;
      const reason = this.refusal(skill, ref, caller, settings.get(settingKey(ref.install_id, ref.skill_id)));
      if (reason) throw skillErrors.read_refused("这个技能当前不能读取", { reason });
      const resource = skill!.declaration.resources?.find(item => item.path === path);
      if (!resource) throw skillErrors.resource_undeclared("技能没有声明这个附带文件");
      let bytes: Buffer;
      try { bytes = Buffer.from(this.ports.resource(skill!, path)); }
      catch { throw skillErrors.read_refused("技能的附带文件无法读取", { reason: "resource_invalid" }); }
      if (bytes.length !== resource.bytes || createHash("sha256").update(bytes).digest("hex") !== resource.sha256)
        throw skillErrors.read_refused("技能的附带文件与声明不符", { reason: "resource_invalid" });
      // A resource is its Skill's: reading one is choosing that Skill, so it counts as the body does — but only once the
      // resource itself is known to be readable and unchanged. A refused read never takes one of the round's choices or
      // writes a use (S-skill-catalog).
      const chosen = round?.round && !round.named.some(named => isDeepStrictEqual(named, ref)) ? this.pick(skill!, caller, round.round) : undefined;
      if (chosen) throw skillErrors.read_refused("这个技能当前不能读取", { reason: chosen });
      const encoding = resource.media_type.startsWith("text/") || resource.media_type === "application/json" ? "utf8" : "base64";
      return { ref, ...resource, encoding, content: bytes.toString(encoding) };
    });
  }

  /**
   * The AI kit's Skill entries (specs/capability-pack/contract-design.md §4.8): the person's own view of the catalog, each entry as
   * `skills.catalog.list@1` gives it, in its installation's pack, with the uses on record. Who it comes from is the install record's.
   */
  async kitReport(caller: ActionCallContext): Promise<KitReport> {
    const { skills, scenes } = await this.list(caller, {}), counts = this.ports.definitions.skills.useCounts();
    const english = caller.locale === "en";
    const active = scenes ?? skillSceneChoicesOf(builtinActiveSkillScenes());
    const sceneNames = new Map(active.map(row => [row.scene, row.name]));
    const forWhom = (entry: string) => entry === "assistant" ? (english ? "Assistant" : "助理") : sceneNames.get(entry) ?? entry;
    return { entries: skills.map(skill => {
      const used = counts.get(settingKey(skill.ref.install_id, skill.ref.skill_id));
      return { kind: "skill" as const, entry_id: settingKey(skill.ref.install_id, skill.ref.skill_id).replace("\0", "/"), name: skill.name, description: skill.description,
        // A copy whose source has a newer version the person has not left says so as a prompt does (design §2.5): the copy stays in use.
        version: { label: english ? `v${skill.ref.version}` : `第 ${skill.ref.version} 版`, ...skill.based_on?.newer_version
          ? { change: { kind: "default_updated" as const, base_version: skill.based_on.source.version, default_version: skill.based_on.newer_version } } : {} },
        declares: { tools: skill.tools.slice(0, 64), permissions: [], connector_categories: skill.connector_categories.slice(0, 64) }, scope: skill.pack.scope,
        where: skillEntriesOf(skill.applies_to, active.map(row => row.scene)).slice(0, KIT_LIMITS.where).map(forWhom), availability: skill.availability.available
          ? { available: true as const } : { available: false as const, reason: skill.availability.reason, ...(skill.availability.detail ? { detail: skill.availability.detail } : {}) },
        usage: used ? { kind: "recent" as const, count: used.count, last_at: used.last_at, kept: { rows_per_key: USES_KEPT } } : { kind: "none" as const },
        export: skill.pack.trust === "host" ? "reference" as const : "package" as const, skill,
        source: { kind: "plugin" as const, plugin_id: skill.pack.plugin_id, title: skill.pack.title, version: skill.pack.version, install_id: skill.ref.install_id,
          publisher_label: skill.pack.publisher_label, trust: skill.pack.trust }, pack: `plugin:${skill.ref.install_id}` };
    }), scenes: active };
  }

  /** The trusted round owner calls this only with its acceptance receipt; reads alone never count as use. */
  async recordAcceptedUses(caller: ActionExecutionContext, receipt: { accepted: boolean; refs: readonly SkillRef[]; run_ref?: string }): Promise<void> {
    if (!receipt.accepted) return;
    const round = caller.skill_round;
    // A round owner records its round's uses; a call without a round consumer (such as a settings preview) records none.
    if (!round?.consumer) return;
    const skills = await this.ports.withSkills(caller, skills => skills);
    await caller.beforeEffect();
    caller.assert_authority_current?.(); caller.signal?.throwIfAborted();
    const store = this.ports.definitions.skills, scope = scopeOf(caller), seen = new Set<string>();
    // After the await: one settings read and one ledger read, reused for every reference (N42–N44), never one per Skill.
    const settings = new Map(store.settings(scope).map(row => [settingKey(row.install_id, row.skill_id), row]));
    const live = this.ports.publishers();
    for (const ref of receipt.refs) {
      const id = settingKey(ref.install_id, ref.skill_id);
      if (seen.has(id)) continue;
      seen.add(id);
      const skill = skills.find(value => isDeepStrictEqual(value.ref, ref));
      try { skill?.assertCurrent(); skill?.assertPublisher(live); } catch { continue; }
      if (this.refusal(skill, ref, caller, settings.get(id))) continue;
      store.recordUse({ ref, name: skill!.declaration.name, scope_ref: scope, caller: round.consumer,
        ...(receipt.run_ref ? { run_ref: receipt.run_ref } : {}), at: new Date().toISOString() });
    }
  }

  async setState(caller: ActionExecutionContext, input: SkillSettingsSetRequest): Promise<SkillCatalogEntry> {
    if (input.scope === "project" && !caller.project_id) throw skillErrors.scope_mismatch("需要当前项目才能设置项目技能");
    const scoped = input.scope === "home" ? { ...caller, project_id: null } : caller;
    // Await authority, then recheck the captured installation synchronously before committing.
    const skills = await this.ports.withSkills(scoped, skills => skills);
    await caller.beforeEffect();
    caller.assert_authority_current?.();
    caller.signal?.throwIfAborted();
    const skill = skills.find(item => item.ref.install_id === input.install_id && item.ref.skill_id === input.skill_id);
    if (!skill) throw skillErrors.not_found("这个范围里没有这个技能");
    const live = this.ports.publishers();
    skill.assertCurrent();
    skill.assertPublisher(live);
    if (input.scope === "home" && skill.pack.scope !== "home") throw skillErrors.scope_mismatch("项目技能不能设到个人空间");
    const availability = skill.availability;
    if (!availability.available && SKILL_SETTINGS_LOCKED_REASONS.some(reason => reason === availability.reason))
      throw skillErrors.settings_locked("请先恢复技能所在的插件", { reason: availability.reason });
    const store = this.ports.definitions.skills, scope = scopeOf(scoped), keepOff = skill.default_state !== undefined;
    const record = skillSettingReceipt(caller, input);
    const previous = record ? store.setting(scope, input.install_id, input.skill_id) : undefined;
    if (store.set(scope, input.install_id, input.skill_id, input.state, input.expected_revision, caller.actor_id, keepOff) === "conflict")
      throw skillErrors.settings_conflict("技能状态已变化，请刷新后再改");
    const result = entry(skill, store.setting(scope, input.install_id, input.skill_id));
    try { record?.(result); }
    catch (error) {
      // The local write cannot yield between committing its revision, recording it and restoring it on a receipt failure.
      store.set(scope, input.install_id, input.skill_id, previous?.state ?? skill.default_state ?? "off", result.settings_revision, caller.actor_id, keepOff);
      throw error;
    }
    return result;
  }
}
