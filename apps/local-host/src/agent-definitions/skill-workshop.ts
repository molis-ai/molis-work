/**
 * Making a Skill better (batch 42, specs/skill-packs/authoring-path-design.md; 定样 docs/design/skill-improvement, scheme B): drafts,
 * their known answers, replays, the versions of one's own Skills and the sources of copies, over the catalog's own snapshot. Nothing
 * here is used by a round: a draft becomes a Skill only when the person adopts it (`adoptDraft` in `skill-authoring.ts`, the install provider's).
 *
 * A replay calls only the Host's text model. It hands the original model result guard to the draft writer.
 * Replays have no tools, workspace or actions, so by construction they change
 * nothing in a project and sends nothing out (PWA-16). It runs as a `trial` observation source, which reports and effect figures
 * leave out (PWA-83).
 */
import { builtinScenePlugins, skillAudienceDeclared } from "../memory/memory-plugin-scene.js";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ActionCallContext, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { fencedMaterials, instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { SandboxAgentBody } from "@molis-ai/molis-work-contracts/platform/plugin";
import { skillEntriesOf, SKILL_LIMITS, type PluginMethodDeclaration, type SkillAppliesTo } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { SKILL_CASE_LIMITS, SKILL_CASES_MAX, SKILL_REVISE_INSTRUCTION_CHARS, SKILL_TRIAL_OUTPUT_CHARS, skillErrors,
  type SkillAuthoredFields, type SkillCase, type SkillCaseFields, type SkillCasePutRequest, type SkillCatalogEntry, type SkillDraft, type SkillDraftCreateRequest,
  type SkillDraftDiscardResult, type SkillDraftOrigin, type SkillDraftReviseRequest, type SkillDraftSummary, type SkillDraftTarget, type SkillDraftUpdateRequest,
  type SkillDraftUpdateResult, type SkillScope, type SkillSourceRef, type SkillTrial, type SkillTrialCell, type SkillTrialConsumer, type SkillTrialRunRequest,
  type SkillTrialVerdict, type SkillVersion } from "@molis-ai/molis-work-contracts/services/skills";
import { withObservationSource } from "@molis-ai/molis-work-service-observation";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { textModelAvailability, textModelRequired, type HostTextForCommit } from "../host-complete-text.js";
import type { InstalledRelease } from "../installed-release.js";
import { SKILL_REVISE, SKILL_TRIAL, SKILL_TRIAL_JUDGE } from "./system-prompts.js";
import { isOwnSkill, skillFields, type CatalogSkill, type SkillCatalogPorts } from "./skill-catalog.js";
import { draftCases, skillCases, untriedCases, type SkillDraftStore, type StoredSkillDraft } from "./skill-drafts.js";

type Packaged = NonNullable<InstalledRelease["packaged"]>;

export interface SkillWorkshopPorts {
  drafts: SkillDraftStore;
  withSkills: SkillCatalogPorts["withSkills"];
  /** One kept release of a plugin by its publisher and version; absent when it is not kept. */
  release(pluginId: string, keyId: string, version: string): Packaged | undefined;
  /** When each kept release of a plugin by a publisher was saved, by package version. */
  savedAt(pluginId: string, keyId: string): ReadonlyMap<string, string>;
  /** The configured text model; absent when there is none. */
  model(): HostTextForCommit | undefined;
  /** The registered instructions as the person may have changed them, with their data. */
  resolve(prompt: InstructedPrompt): string;
}

const EMPTY: SkillAuthoredFields = { name: "", description: "", applies_to: "assistant", body: "" };
const scopeOfRef = (scopeRef: string): SkillScope => scopeRef === "home" ? "home" : "project";
/** The entries a draft is replayed in: the Assistant and the built-in plugin scenes `applies_to` names (BL-b44-coding-scene-enum). */
const consumersOf = (appliesTo: SkillAppliesTo): SkillTrialConsumer[] => skillEntriesOf(appliesTo, [...builtinScenePlugins().keys()]);
const sourceOf = (skill: CatalogSkill): SkillSourceRef => ({ install_id: skill.ref.install_id, plugin_id: skill.pack.plugin_id, skill_id: skill.ref.skill_id,
  version: skill.ref.version, name: (skill.display ?? skill.declaration).name });
const sameSkill = (skill: CatalogSkill, source: Pick<SkillSourceRef, "install_id" | "skill_id">) => skill.ref.install_id === source.install_id && skill.ref.skill_id === source.skill_id;
/** Each placeholder the person replaced, replaced again in a text that has it. */
const replaced = (text: string, replacements: Record<string, string>) =>
  Object.entries(replacements).reduce((value, [placeholder, own]) => own ? value.split(placeholder).join(own) : value, text);
const withReplacements = (fields: SkillAuthoredFields, replacements: Record<string, string>): SkillAuthoredFields =>
  ({ ...fields, body: replaced(fields.body, replacements), description: replaced(fields.description, replacements),
    ...(fields.when_not_to_use ? { when_not_to_use: replaced(fields.when_not_to_use, replacements) } : {}) });

/** Who opens a draft: the person on a page, or the Assistant in a piece of work (the work is the call context's audit actor). */
function originOf(caller: ActionCallContext, at: string): SkillDraftOrigin {
  if (caller.audience === "agent") return { by: "assistant", at, ...(caller.audit_actor_id ? { work_ref: caller.audit_actor_id } : {}) };
  return { by: "person", at };
}

/** A known answer as kept: trimmed, every field within its limit. Refused by name. */
function checkedCase(input: SkillCaseFields): SkillCaseFields {
  const refuse = (field: string, message: string): never => { throw skillErrors.case_invalid(message, { field }); };
  const title = input.title.trim(), task = input.task.trim(), expected = input.expected.trim(), material = input.material?.trim();
  if (!title) refuse("title", "请给已知答案起个标题");
  if (!task) refuse("task", "请写要做的事");
  if (!expected) refuse("expected", "请写你认可的结果");
  if (title.length > SKILL_CASE_LIMITS.titleChars) refuse("title", `标题限 ${SKILL_CASE_LIMITS.titleChars} 字`);
  if (task.length > SKILL_CASE_LIMITS.taskChars) refuse("task", `要做的事限 ${SKILL_CASE_LIMITS.taskChars} 字`);
  if ((material?.length ?? 0) > SKILL_CASE_LIMITS.materialChars) refuse("material", `材料限 ${SKILL_CASE_LIMITS.materialChars} 字`);
  if (expected.length > SKILL_CASE_LIMITS.expectedChars) refuse("expected", `结果限 ${SKILL_CASE_LIMITS.expectedChars} 字`);
  return { title, task, expected, ...(material ? { material } : {}) };
}

/** The draft's verdict: any of its cells differs, else any is not judged, else it matches. */
const overall = (cells: readonly SkillTrialCell[]): SkillTrialVerdict => {
  const draft = cells.filter(cell => cell.side === "draft");
  return draft.some(cell => cell.verdict === "differs") ? "differs" : draft.some(cell => cell.verdict !== "match") ? "unknown" : "match";
};

/** A model's JSON answer, without a code fence it may add anyway; undefined when it is no object. */
function parsedJson(answer: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(answer.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, ""));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

export class SkillWorkshop {
  constructor(private readonly ports: SkillWorkshopPorts) {}

  private get store() { return this.ports.drafts; }

  /** The scopes a call sees: the personal space, and its project when it has one. */
  private scopes(caller: ActionCallContext): string[] { return caller.project_id ? ["home", caller.project_id] : ["home"]; }

  private scopeRef(caller: ActionCallContext, scope: SkillScope): string {
    if (scope === "home") return "home";
    if (!caller.project_id) throw skillErrors.scope_mismatch("需要当前项目才能写项目里的技能");
    return caller.project_id;
  }

  /** An open draft this call can see, else `draft_unknown`; a discarded one only when `discarded` is asked for. */
  private open(caller: ActionCallContext, draftId: string, discarded = false): StoredSkillDraft {
    const draft = this.store.draft(draftId);
    if (!draft || !this.scopes(caller).includes(draft.scope_ref) || (draft.discarded_at && !discarded)) throw skillErrors.draft_unknown("这份草稿已经不在了，可能已被采用或放弃");
    return draft;
  }

  /**
   * The Assistant may replay or take back only a draft it opened in this same piece of work (S-skill-authoring): a draft the person
   * opened, or one from another work, is refused and left as it is.
   */
  private acting(caller: ActionCallContext, draft: StoredSkillDraft): StoredSkillDraft {
    if (caller.audience !== "agent") return draft;
    if (draft.origin.by !== "assistant" || !caller.audit_actor_id || draft.origin.work_ref !== caller.audit_actor_id) throw skillErrors.draft_refused("助理只能回放或撤回这次工作里自己起的草稿");
    return draft;
  }

  /** The person's own Skill of this id in the draft's scope, in this snapshot. */
  private own(skills: readonly CatalogSkill[], scope: SkillScope, skillId: string): CatalogSkill | undefined {
    return skills.find(skill => isOwnSkill(skill) && skill.pack.scope === scope && skill.ref.skill_id === skillId);
  }

  /** What a draft is compared with: the own Skill's version in use now, or the copy's source as installed now. */
  private base(skills: readonly CatalogSkill[], draft: StoredSkillDraft): CatalogSkill | undefined {
    const target = draft.target;
    if (target.kind === "own") return this.own(skills, scopeOfRef(draft.scope_ref), target.skill_id);
    if (target.kind === "custom") return skills.find(skill => sameSkill(skill, target.source));
    return undefined;
  }

  private view(draft: StoredSkillDraft, skills: readonly CatalogSkill[]): SkillDraft {
    const cases = this.store.cases(draftCases(draft.draft_id)), trial = this.store.latestTrial(draft.draft_id), base = this.base(skills, draft);
    const untried = untriedCases(cases, this.store.trialsOf(draft.draft_id, draft.revision));
    return { draft_id: draft.draft_id, scope: scopeOfRef(draft.scope_ref), target: draft.target, fields: draft.fields, revision: draft.revision, origin: draft.origin,
      created_at: draft.created_at, updated_at: draft.updated_at, cases, ...(trial ? { trial } : {}),
      ...(base ? { base: { version: base.ref.version, fields: skillFields(base) } } : {}), replacements: draft.replacements,
      untried, trial_needed: untried.length > 0 };
  }

  list(caller: ActionCallContext, includeDiscarded = false): { drafts: SkillDraftSummary[] } {
    return { drafts: this.store.drafts(this.scopes(caller), includeDiscarded).map(draft => {
      const verdict = summaryVerdict(
        this.store.trialsOf(draft.draft_id, draft.revision),
        this.store.cases(draftCases(draft.draft_id)),
      );
      return {
        draft_id: draft.draft_id,
        scope: scopeOfRef(draft.scope_ref),
        target: draft.target,
        name: draft.fields.name,
        revision: draft.revision,
        origin: draft.origin,
        updated_at: draft.updated_at,
        ...(verdict ? { verdict } : {}),
        ...(draft.discarded_at ? { discarded_at: draft.discarded_at } : {}),
      };
    }) };
  }

  read(caller: ActionCallContext, draftId: string): Promise<SkillDraft> {
    return this.ports.withSkills(caller, skills => this.view(this.open(caller, draftId), skills));
  }

  /**
   * A Skill's own version, read from the scope's signed releases: from the release in use back along each release's predecessor
   * (`compatible_from_versions`), so another project's package of the same id is never read as this one's history.
   */
  private chain(skill: CatalogSkill): Packaged[] {
    const { plugin_id, publisher_signature } = skill.ref.source, releases: Packaged[] = [], seen = new Set<string>();
    for (let version: string | undefined = skill.ref.source.plugin_version; version && !seen.has(version);) {
      seen.add(version);
      const release = this.ports.release(plugin_id, publisher_signature, version);
      if (!release) break;
      releases.push(release);
      version = release.manifest.upgrade_compatibility?.compatible_from_versions?.[0];
    }
    return releases;
  }

  async versions(caller: ActionCallContext, scope: SkillScope, skillId: string): Promise<{ versions: SkillVersion[] }> {
    this.scopeRef(caller, scope);
    const skill = await this.ports.withSkills(caller, skills => this.own(skills, scope, skillId));
    if (!skill) throw skillErrors.authored_unknown("这个范围里没有你写的这个技能");
    const saved = this.ports.savedAt(skill.ref.source.plugin_id, skill.ref.source.publisher_signature), found = new Map<number, SkillVersion>();
    for (const release of this.chain(skill)) {
      const declaration = release.manifest.methods?.find(method => method.skill_id === skillId);
      const body = (release.agentBodies as readonly SandboxAgentBody[] | undefined)?.find(item => item.kind === "method" && item.entry_id === skillId)?.body;
      if (!declaration || body === undefined) continue;
      // Walking back, a version seen again is an older release that held it unchanged: it was adopted no later than that release.
      const at = saved.get(release.manifest.version);
      found.set(declaration.version, { version: declaration.version, fields: fieldsOf(declaration, body), ...(at ? { adopted_at: at } : {}) });
    }
    return { versions: [...found.values()].sort((left, right) => right.version - left.version) };
  }

  /** The fields a new draft starts from, with its target as kept, the placeholders it replaces and the known answers it carries over. */
  private async start(caller: ActionCallContext, input: SkillDraftCreateRequest, scope: SkillScope, scopeRef: string) {
    const target = input.target;
    if (target.kind === "new") return { target: { kind: "new" } as SkillDraftTarget, fields: input.fields ?? EMPTY, replacements: {}, carried: [] as SkillCase[] };
    const skills = await this.ports.withSkills(caller, value => value);
    if (target.kind === "custom") {
      const source = skills.find(skill => isDeepStrictEqual(skill.ref, target.ref));
      if (!source) throw skillErrors.not_found("这个技能已经不是目录里的当前版本，请刷新后再试");
      source.assertCurrent();
      if (scope === "home" && source.pack.scope !== "home" && !caller.project_id) throw skillErrors.scope_mismatch("这个技能在项目里");
      return { target: { kind: "custom", source: sourceOf(source) } as SkillDraftTarget, fields: input.fields ?? skillFields(source), replacements: {}, carried: [] as SkillCase[] };
    }
    const own = this.own(skills, scope, target.skill_id);
    if (!own) throw skillErrors.authored_unknown("这个范围里没有你写的这个技能");
    const carried = this.store.cases(skillCases(scopeRef, target.skill_id));
    const kept: SkillDraftTarget = { kind: "own", skill_id: target.skill_id, base_version: own.ref.version };
    if (target.from_source) {
      const lineage = this.store.lineageOf(scopeRef, target.skill_id), source = lineage && skills.find(skill => sameSkill(skill, lineage.source));
      if (!lineage || !source) throw skillErrors.not_found("这个技能的来源已经不在了");
      return { target: { ...kept, rebase: sourceOf(source) } as SkillDraftTarget, fields: input.fields ?? withReplacements(skillFields(source), lineage.replacements),
        replacements: lineage.replacements, carried };
    }
    let fields = input.fields;
    if (!fields && target.from_version !== undefined && target.from_version !== own.ref.version) {
      fields = (await this.versions(caller, scope, target.skill_id)).versions.find(version => version.version === target.from_version)?.fields;
      if (!fields) throw skillErrors.authored_unknown(`找不到这个技能的第 ${target.from_version} 版`);
    }
    return { target: kept, fields: fields ?? skillFields(own), replacements: this.store.lineageOf(scopeRef, target.skill_id)?.replacements ?? {}, carried };
  }

  async create(caller: ActionExecutionContext, input: SkillDraftCreateRequest): Promise<SkillDraft> {
    const scopeRef = this.scopeRef(caller, input.scope);
    const given = input.case ? checkedCase(input.case) : undefined;
    const { target, fields, replacements, carried } = await this.start(caller, input, input.scope, scopeRef);
    const cases = [...carried.map(({ case_id: _id, ...item }) => item), ...given ? [{ ...given, origin: caller.audience === "agent" ? "conversation" as const : "person" as const }] : []];
    if (cases.length > SKILL_CASES_MAX) cases.splice(0, cases.length - SKILL_CASES_MAX);
    await caller.beforeEffect();
    const draft = this.store.create({ scope_ref: scopeRef, target, fields, replacements, origin: originOf(caller, new Date().toISOString()), actor_id: caller.actor_id, cases });
    return this.ports.withSkills(caller, skills => this.view(draft, skills));
  }

  async update(caller: ActionExecutionContext, input: SkillDraftUpdateRequest): Promise<SkillDraftUpdateResult> {
    this.open(caller, input.draft_id);
    await caller.beforeEffect();
    const result = this.store.update(input.draft_id, input.expected_revision, { fields: input.fields, ...(input.replacements ? { replacements: input.replacements } : {}) }, caller.actor_id);
    return { draft_id: input.draft_id, ...this.written(result) };
  }

  private written(result: StoredSkillDraft | "conflict" | "missing"): { revision: number; updated_at: string } {
    if (result === "missing") throw skillErrors.draft_unknown("这份草稿已经不在了，可能已被采用或放弃");
    if (result === "conflict") throw skillErrors.draft_conflict("草稿在别处改过了，请重新打开再改");
    return { revision: result.revision, updated_at: result.updated_at };
  }

  async discard(caller: ActionExecutionContext, draftId: string, restore: boolean): Promise<SkillDraftDiscardResult> {
    this.acting(caller, this.open(caller, draftId, true));
    await caller.beforeEffect();
    const result = this.store.discard(draftId, restore);
    if (result === "missing") throw skillErrors.draft_unknown("这份草稿已经不在了");
    return { draft_id: draftId, discarded: result };
  }

  async putCase(caller: ActionExecutionContext, input: SkillCasePutRequest): Promise<SkillCase> {
    this.open(caller, input.draft_id);
    const fields = checkedCase(input);
    await caller.beforeEffect();
    const result = this.store.putCase(input.draft_id, fields, input.case_id);
    if (result === "missing") throw skillErrors.case_invalid("这份草稿没有这个已知答案", { field: "case_id" });
    return result;
  }

  async removeCase(caller: ActionExecutionContext, draftId: string, caseId: string): Promise<{ case_id: string }> {
    this.open(caller, draftId);
    await caller.beforeEffect();
    if (!this.store.removeCase(draftId, caseId)) throw skillErrors.case_invalid("这份草稿没有这个已知答案", { field: "case_id" });
    return { case_id: caseId };
  }

  /** Replaying and 「告诉助理怎么改」 are offered only while a text model is set up; otherwise they say where to set one up. */
  modelAvailability(purpose: string) { return textModelAvailability(() => this.ports.model(), purpose); }

  private model(purpose: string): HostTextForCommit {
    const model = this.ports.model();
    if (!model) throw textModelRequired(purpose);
    return model;
  }

  /** 「告诉助理怎么改」: the model rewrites the draft's fields by one sentence; the result is the draft's next revision, against the one read. */
  async revise(caller: ActionExecutionContext, input: SkillDraftReviseRequest): Promise<SkillDraft> {
    const draft = this.open(caller, input.draft_id), asked = input.instruction.trim();
    if (!asked || asked.length > SKILL_REVISE_INSTRUCTION_CHARS) throw skillErrors.authored_invalid(`请用 1～${SKILL_REVISE_INSTRUCTION_CHARS} 字说怎么改`, { field: "instruction" });
    if (draft.revision !== input.expected_revision) throw skillErrors.draft_conflict("草稿在别处改过了，请重新打开再改", { revision: draft.revision });
    const complete = this.model("改技能草稿"), authority = { signal: caller.signal, beforeDispatch: caller.beforeEffect };
    await authority.beforeDispatch();
    const data = fencedMaterials({ draft: draft.fields, instruction: asked }, randomBytes(8).toString("hex"));
    const answer = await complete(this.ports.resolve(instructed(SKILL_REVISE, data)), authority);
    const fields = revisedFields(answer.value, draft.fields);
    if (!fields) throw skillErrors.draft_unreadable("助理没有给出能用的修改，请换个说法再试，或者自己改");
    await caller.beforeEffect();
    answer.validateResult();
    const result = this.store.update(draft.draft_id, input.expected_revision, { fields }, caller.actor_id);
    this.written(result);
    return this.ports.withSkills(caller, skills => this.view(result as StoredSkillDraft, skills));
  }

  /**
   * Replays one known answer against the draft's revision read: each entry the draft applies to, with the version in use (or the
   * copy's source) beside the draft, then one judge call over all results. Kept only if the draft is still at that revision.
   */
  async runTrial(caller: ActionExecutionContext, input: SkillTrialRunRequest): Promise<SkillTrial> {
    const draft = this.acting(caller, this.open(caller, input.draft_id));
    if (draft.revision !== input.expected_revision) throw skillErrors.draft_conflict("草稿在别处改过了，请重新打开再回放", { revision: draft.revision });
    const known = this.store.cases(draftCases(draft.draft_id)).find(item => item.case_id === input.case_id);
    if (!known) throw skillErrors.case_invalid("这份草稿没有这个已知答案", { field: "case_id" });
    if (!draft.fields.body.trim()) throw skillErrors.authored_invalid("请先写怎么做，再回放", { field: "body" });
    const base = await this.ports.withSkills(caller, skills => this.base(skills, draft));
    const complete = this.model("回放技能"), authority = { signal: caller.signal, beforeDispatch: caller.beforeEffect };
    const sides: Array<{ side: SkillTrialCell["side"]; fields: SkillAuthoredFields }> = [...base ? [{ side: "base" as const, fields: skillFields(base) }] : [], { side: "draft", fields: draft.fields }];
    const runs = consumersOf(draft.fields.applies_to).flatMap(consumer => sides.map(side => ({ consumer, ...side })));
    const { cells, answers } = await withObservationSource("trial", async () => {
      await authority.beforeDispatch();
      const outputs = await Promise.all(runs.map(run => {
        const data = fencedMaterials({ role: roleOf(run.consumer), skill: { name: run.fields.name, body: run.fields.body }, task: known.task, ...(known.material ? { material: known.material } : {}) },
          randomBytes(8).toString("hex"));
        return complete(this.ports.resolve(instructed(SKILL_TRIAL, data)), authority);
      }));
      const beforeJudge = async () => {
        await authority.beforeDispatch();
        for (const result of outputs) result.validateResult();
      };
      const values = outputs.map(result => cutHead(result.value.trim(), SKILL_TRIAL_OUTPUT_CHARS));
      const data = fencedMaterials({ expected: known.expected, results: values.map((output, index) => ({ index, output })) }, randomBytes(8).toString("hex"));
      await beforeJudge();
      const answer = await complete(this.ports.resolve(instructed(SKILL_TRIAL_JUDGE, data)), { ...authority, beforeDispatch: beforeJudge });
      const judged = judgement(answer.value, values.length);
      return { cells: runs.map((run, index): SkillTrialCell => ({ consumer: run.consumer, side: run.side, output: values[index]!, ...judged[index]! })),
        answers: [...outputs, answer] };
    });
    await caller.beforeEffect();
    for (const answer of answers) answer.validateResult();
    const recorded = this.store.recordTrial(draft.draft_id, { draft_revision: draft.revision, case_id: known.case_id, ran_at: new Date().toISOString(), cells, verdict: overall(cells) }, known, caller.actor_id);
    if (recorded === "missing") throw skillErrors.draft_unknown("这份草稿已经不在了，可能已被采用或放弃");
    if (recorded === "conflict") throw skillErrors.draft_conflict("回放时草稿又改过了，请再回放一次");
    return recorded;
  }

  async dismissSource(caller: ActionExecutionContext, scope: SkillScope, skillId: string, version: number): Promise<{ skill_id: string; seen_version: number }> {
    const scopeRef = this.scopeRef(caller, scope);
    await caller.beforeEffect();
    const seen = this.store.dismiss(scopeRef, skillId, version);
    if (seen === "missing") throw skillErrors.authored_unknown("这个技能不是从别的技能改来的");
    return { skill_id: skillId, seen_version: seen };
  }

  /**
   * The person's view of the catalog, with each own Skill's source and its newer version, and the open draft of each Skill. Only the
   * person's: a round's listing is metadata of installed Skills alone.
   */
  decorate(caller: ActionCallContext, skills: readonly CatalogSkill[], entries: SkillCatalogEntry[]): SkillCatalogEntry[] {
    if (caller.audience !== "user" || caller.skill_round) return entries;
    const drafts = this.store.drafts(this.scopes(caller)), lineage = new Map(this.scopes(caller).flatMap(scope => this.store.lineage(scope)).map(row => [`${row.scope_ref}\0${row.skill_id}`, row]));
    return entries.map(entry => {
      const skill = skills.find(item => isDeepStrictEqual(item.ref, entry.ref));
      if (!skill) return entry;
      const scopeRef = skill.pack.scope === "home" ? "home" : caller.project_id ?? "home", mine = isOwnSkill(skill);
      const draft = drafts.find(item => item.scope_ref === scopeRef && (mine ? item.target.kind === "own" && item.target.skill_id === skill.ref.skill_id
        : item.target.kind === "custom" && sameSkill(skill, item.target.source)));
      const row = mine ? lineage.get(`${scopeRef}\0${skill.ref.skill_id}`) : undefined, source = row && skills.find(item => sameSkill(item, row.source));
      const newer = source && source.ref.version > Math.max(row!.source.version, row!.seen_version) ? source.ref.version : undefined;
      return { ...entry, ...(row ? { based_on: { source: row.source, ...(newer ? { newer_version: newer } : {}) } } : {}), ...(draft ? { draft: { draft_id: draft.draft_id } } : {}) };
    });
  }
}

/** Aggregate verdict across the latest trial per active known answer on one draft revision, matching adoptDraft. */
function summaryVerdict(trials: readonly SkillTrial[], activeCases: readonly SkillCase[]): SkillTrial["verdict"] | undefined {
  if (activeCases.length === 0) return undefined;
  const allowed = new Set(activeCases.map(item => item.case_id));
  const latestByCase = new Map<string, SkillTrial>();
  for (const trial of trials) {
    if (!allowed.has(trial.case_id)) continue;
    if (!latestByCase.has(trial.case_id)) latestByCase.set(trial.case_id, trial);
  }
  const latest = [...latestByCase.values()];
  if (latest.some(trial => trial.verdict === "differs")) return "differs";
  if (latestByCase.size < allowed.size) return undefined;
  if (latest.some(trial => trial.verdict !== "match")) return "unknown";
  return "match";
}

/** The entries' roles in a replay, as each one works: the same words the trial instruction names. */
const ASSISTANT_ROLE = "助理：替用户处理日常工作的助手，面对的是用户本人，产出可以直接交给用户的结果（文字、清单、表格、草稿）。";
/** A plugin scene's entry works as the plugin that declares it says it does: its name and summary. */
const roleOf = (consumer: SkillTrialConsumer): string => {
  if (consumer === "assistant") return ASSISTANT_ROLE;
  const plugin = builtinScenePlugins().get(consumer);
  return plugin ? `${plugin.name}：${plugin.summary}` : consumer;
};

/** A kept version's fields, from its declaration and body. */
function fieldsOf(declaration: PluginMethodDeclaration, body: string): SkillAuthoredFields {
  return { name: declaration.name, description: declaration.description, applies_to: declaration.applies_to, body: body.replace(/\r\n?/gu, "\n").trim(),
    ...(declaration.when_not_to_use ? { when_not_to_use: declaration.when_not_to_use } : {}), ...(declaration.argument_hint ? { argument_hint: declaration.argument_hint } : {}) };
}

/** The judge's answer, one verdict per result; a result it said nothing readable of is `unknown`. */
function judgement(answer: string, count: number): Array<Pick<SkillTrialCell, "verdict" | "differences">> {
  const parsed = parsedJson(answer), items = Array.isArray(parsed?.results) ? parsed.results as unknown[] : [];
  return Array.from({ length: count }, (_unused, index) => {
    const item = items.find(value => (value as { index?: unknown })?.index === index) as { verdict?: unknown; differences?: unknown } | undefined;
    const verdict = item?.verdict === "match" || item?.verdict === "differs" ? item.verdict : "unknown";
    const differences = verdict === "differs" && Array.isArray(item?.differences)
      ? (item.differences as unknown[]).filter((value): value is string => typeof value === "string" && !!value.trim()).slice(0, 20).map(value => cutHead(value.trim(), 300)) : [];
    return { verdict: verdict === "differs" && !differences.length ? "unknown" : verdict, differences };
  });
}

/** The model's revision, cut to the draft's limits; a field it left out stays as it was. Undefined when the answer is no draft. */
function revisedFields(answer: string, before: SkillAuthoredFields): SkillAuthoredFields | undefined {
  const parsed = parsedJson(answer);
  if (!parsed) return undefined;
  const text = (key: keyof SkillAuthoredFields) => typeof parsed[key] === "string" ? (parsed[key] as string).trim() : undefined;
  const name = cutHead((text("name") ?? before.name).replace(/\s+/gu, " "), 80), description = cutHead(text("description") ?? before.description, SKILL_LIMITS.descriptionChars);
  const body = cutHead((text("body") ?? before.body).replace(/\r\n?/gu, "\n").split("\n").slice(0, SKILL_LIMITS.bodyLines).join("\n"), SKILL_LIMITS.bodyChars).trim();
  if (!name || !body) return undefined;
  const whenNot = cutHead(text("when_not_to_use") ?? before.when_not_to_use ?? "", SKILL_LIMITS.whenChars);
  const applies = skillAudienceDeclared(text("applies_to")) ? text("applies_to") as SkillAppliesTo : before.applies_to;
  return { name, description, applies_to: applies, body, ...(whenNot ? { when_not_to_use: whenNot } : {}), ...(before.argument_hint ? { argument_hint: before.argument_hint } : {}) };
}

