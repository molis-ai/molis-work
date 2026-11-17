/**
 * Writing Skills of one's own in settings (specs/prologue-strategies/skill.md §10, batch 41 item 2; 定样 docs/design/skill-authoring, scheme
 * B). A scope's own Skills are one content package (`SKILL_AUTHORED_PLUGIN_IDS`), made by the packer an import uses, signed by
 * `plugins.local_packages.sign` with this Home's publisher identity and installed through the install service's own preview and
 * confirmation: a Skill written here is treated exactly as one imported from this machine. Saving one makes the package's next version
 * with every other Skill as it was; taking the last one away takes the package off. Only text: no resources, no scripts.
 */
import { randomUUID } from 'node:crypto';
import type { ActionExecutionContext } from '@molis-ai/molis-work-contracts/platform/actions';
import { instructed, composeInstructedPrompt, type InstructedPrompt } from '@molis-ai/molis-work-contracts/platform/model-prompts';
import { CONTENT_PACKAGE_FILES, type SandboxAgentBody } from '@molis-ai/molis-work-contracts/platform/plugin';
import { SKILL_APPLIES_TO, SKILL_LIMITS, type PluginMethodDeclaration, type SkillAppliesTo } from '@molis-ai/molis-work-contracts/platform/plugin-agent';
import { SKILL_AUTHORED_PLUGIN_IDS, SKILL_DRAFT_INTENT_CHARS, skillErrors, type SkillAuthoredFields, type SkillAuthoredRemoveRequest, type SkillAuthoredRemoveResult,
  type SkillAuthoredSaveResult, type SkillDraftAdoptRequest, type SkillDraftAdoptResult, type SkillScope } from '@molis-ai/molis-work-contracts/services/skills';
import { draftCases, untriedCases, type SkillDraftStore } from './agent-definitions/skill-drafts.js';
import { contentPackageDraft, type FolderSkill } from '@molis-ai/molis-work-plugin-sdk';
import { cutHead } from '@molis-ai/molis-work-plugin-sdk/whole-units';
import { SKILL_DRAFT } from './agent-definitions/system-prompts.js';
import { textModelRequired, type HostCompleteText } from './host-complete-text.js';
import type { InstalledRelease } from './installed-release.js';
import type { SkillImportPorts } from './skill-import.js';

/** The name this Home's publisher is pinned under the first time the person saves a Skill, as an import pins it. */
const PIN_LABEL = '这台电脑';
/** The package's own name; the settings page shows its own words for this plugin id. */
const PACKAGE_NAME = '我的技能';
const NAME_CHARS = 80, SUMMARY_CHARS = 300;

type Packaged = NonNullable<InstalledRelease['packaged']>;
interface Who { project_id: string; actor_id: string }
/** What a save writes: the fields, in a scope, as a new Skill or the next version of one of the person's own. */
type SkillSave = SkillAuthoredFields & { scope: SkillScope; skill_id?: string };

export interface SkillAuthoringPorts extends Pick<SkillImportPorts, 'installed' | 'publisherKeyId' | 'readSealedPublisherKeyId' | 'retained' | 'retainedOf' | 'sign' | 'install'> {
  /** Takes the scope's package of own Skills off, as the settings door's uninstall does; the caller has asked that door's entry. */
  uninstall(scope: SkillScope, who: Who, caller: ActionExecutionContext): Promise<void>;
  /** The publisher signature the scope's installed package of own Skills is recorded under; absent when none is installed. */
  installedPublisher(scope: SkillScope, projectId: string): Promise<string | undefined>;
}

const bodyPath = (skillId: string) => `${CONTENT_PACKAGE_FILES.skills}/${skillId}/${CONTENT_PACKAGE_FILES.body}`;
const lineCount = (text: string) => text.split('\n').length;

/** The fields as they are kept: trimmed, the body's line ends as `\n`. A field that is empty or over its limit is refused by name. */
function checkedFields(input: SkillAuthoredFields): SkillAuthoredFields {
  const refuse = (field: string, message: string): never => { throw skillErrors.authored_invalid(message, { field }); };
  const name = input.name.trim(), description = input.description.trim(), body = input.body.replace(/\r\n?/gu, '\n').trim();
  const whenNot = input.when_not_to_use?.trim(), hint = input.argument_hint?.trim();
  if (!name) refuse('name', '请给技能起个名称');
  if (name.length > NAME_CHARS) refuse('name', `名称限 ${NAME_CHARS} 字`);
  if (/[\r\n]/u.test(name)) refuse('name', '名称只能写一行');
  if (!description) refuse('description', '请写什么时候用它');
  if (description.length > SKILL_LIMITS.descriptionChars) refuse('description', `「什么时候用它」限 ${SKILL_LIMITS.descriptionChars} 字`);
  if (whenNot && whenNot.length > SKILL_LIMITS.whenChars) refuse('when_not_to_use', `「什么时候不用」限 ${SKILL_LIMITS.whenChars} 字`);
  if (hint && hint.length > SKILL_LIMITS.argumentHintChars) refuse('argument_hint', `参数提示限 ${SKILL_LIMITS.argumentHintChars} 字`);
  if (!body) refuse('body', '请写怎么做');
  if (body.length > SKILL_LIMITS.bodyChars || lineCount(body) > SKILL_LIMITS.bodyLines) refuse('body', `正文限 ${SKILL_LIMITS.bodyLines} 行、${SKILL_LIMITS.bodyChars} 字`);
  return { name, description, applies_to: input.applies_to, body, ...(whenNot ? { when_not_to_use: whenNot } : {}), ...(hint ? { argument_hint: hint } : {}) };
}

/** A new Skill's id: the name's own letters and digits when it has some, else a made one; never one the package already has. */
function newSkillId(name: string, taken: ReadonlySet<string>): string {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40).replace(/-+$/u, '');
  if (slug && /^[a-z0-9]/u.test(slug) && !taken.has(slug)) return slug;
  for (;;) {
    const id = `skill-${randomUUID().slice(0, 8)}`;
    if (!taken.has(id)) return id;
  }
}

const declarationOf = (skillId: string, version: number, fields: SkillAuthoredFields): PluginMethodDeclaration => ({
  skill_id: skillId, version, name: fields.name, summary: cutHead(fields.description, SUMMARY_CHARS), tools: [], description: fields.description,
  ...(fields.when_not_to_use ? { when_not_to_use: fields.when_not_to_use } : {}), applies_to: fields.applies_to,
  ...(fields.argument_hint ? { argument_hint: fields.argument_hint } : {}), body: bodyPath(skillId),
}) as PluginMethodDeclaration;

const folderSkill = (declaration: PluginMethodDeclaration, body: string | Uint8Array): FolderSkill =>
  ({ declaration, applies_to_written: true, files: new Map([[declaration.body!, typeof body === 'string' ? new TextEncoder().encode(body) : body]]) });

/** The package version after these: the first, or the next major, as an import counts it. */
const nextVersion = (retained: readonly Packaged[]): string => `${Math.max(0, ...retained.map(pkg => Number(pkg.manifest.version.split('.')[0]))) + 1}.0.0`;

export class SkillAuthoringService {
  constructor(private readonly ports: SkillAuthoringPorts) {}

  /** The scope's own Skills as kept, read back from the installed package; none when the scope has no such package. */
  private held(installed: Packaged | undefined): FolderSkill[] {
    return (installed?.manifest.methods ?? []).map(method => {
      const body = (installed!.agentBodies as readonly SandboxAgentBody[] | undefined)?.find(item => item.kind === 'method' && item.entry_id === method.skill_id)?.body;
      if (body === undefined || method.resources?.length) throw skillErrors.authored_unknown('这个范围里的「我的技能」包不是在设置里写的，不能在这里改；请到插件设置里处理它');
      return folderSkill(method, body);
    });
  }

  /** The package holding `skills` at the scope's next version, as it would be signed. */
  private draftOf(skills: readonly FolderSkill[], scope: SkillScope, installed: Packaged | undefined) {
    const retained = this.ports.retainedOf(SKILL_AUTHORED_PLUGIN_IDS[scope]);
    return contentPackageDraft({ plugin_id: SKILL_AUTHORED_PLUGIN_IDS[scope], name: PACKAGE_NAME, scope, ...(installed ? { compatible_from: [installed.manifest.version] } : {}),
      version: nextVersion(installed ? [...retained, installed] : retained), skills });
  }

  /**
   * Only a package this Home signed is the person's to rewrite or take off here: one of the same id from another publisher is an
   * installed plugin like any other. It is the installed record's publisher that is compared, not a version this Home also signed once.
   */
  private async assertOwn(installed: Packaged | undefined, scope: SkillScope, who: Who, draft: ReturnType<typeof contentPackageDraft>, caller: ActionExecutionContext): Promise<void> {
    if (!installed) return;
    const keyId = this.ports.publisherKeyId() ?? await this.ports.readSealedPublisherKeyId(draft, caller);
    if (!keyId || await this.ports.installedPublisher(scope, who.project_id) !== keyId) {
      throw skillErrors.authored_unknown('这个范围里的「我的技能」包不是这台电脑签名的，不能在这里改；请到插件设置里处理它');
    }
  }

  /** Signs the package holding `skills` at its next version and installs it over the installed one. */
  private async publish(skills: readonly FolderSkill[], scope: SkillScope, installed: Packaged | undefined, who: Who, caller: ActionExecutionContext) {
    const draft = this.draftOf(skills, scope, installed);
    await this.assertOwn(installed, scope, who, draft, caller);
    const { preview_id } = await this.ports.sign(draft, caller);
    const preview = this.ports.install.readPreview(preview_id, who);
    return this.ports.install.confirm({ preview_id, consent: true, ...(preview.publisher.pinned_label === null ? { pin_label: PIN_LABEL } : {}) }, who, caller);
  }

  /**
   * A new Skill at version 1, or the next version of one of the person's own after the version in use now; every other Skill of the
   * scope stays as it was. Since batch 42 only adopting a draft calls this: the person compared the draft with the version in use, so a
   * version adopted elsewhere in between is followed by the next one, not refused.
   */
  async save(input: SkillSave, who: Who, caller: ActionExecutionContext): Promise<SkillAuthoredSaveResult> {
    const fields = checkedFields(input);
    const installed = await this.ports.installed(SKILL_AUTHORED_PLUGIN_IDS[input.scope], input.scope, who.project_id), held = this.held(installed);
    const others = held.filter(skill => skill.declaration.skill_id !== input.skill_id);
    if (others.some(skill => skill.declaration.name.trim() === fields.name)) throw skillErrors.authored_name_taken(`你已经有一个叫「${fields.name}」的技能，换个名称`, { field: 'name' });
    let declaration: PluginMethodDeclaration;
    if (input.skill_id === undefined) {
      if (held.length >= SKILL_LIMITS.skillsPerPackage) throw skillErrors.authored_full(`这个范围里自己写的技能已有 ${SKILL_LIMITS.skillsPerPackage} 个，先删掉不用的`);
      declaration = declarationOf(newSkillId(fields.name, new Set(held.map(skill => skill.declaration.skill_id))), 1, fields);
    } else {
      const current = held.find(skill => skill.declaration.skill_id === input.skill_id)?.declaration;
      if (!current) throw skillErrors.authored_unknown('这个范围里没有你写的这个技能');
      declaration = declarationOf(current.skill_id, current.version + 1, fields);
    }
    const result = await this.publish([...others, folderSkill(declaration, fields.body)], input.scope, installed, who, caller);
    return { ...result, skill_id: declaration.skill_id, skill_version: declaration.version };
  }

  /** Takes one of the person's own Skills away: the package's next version without it, or the package itself when it was the last. */
  async remove(input: SkillAuthoredRemoveRequest, who: Who, caller: ActionExecutionContext): Promise<SkillAuthoredRemoveResult> {
    const installed = await this.ports.installed(SKILL_AUTHORED_PLUGIN_IDS[input.scope], input.scope, who.project_id), held = this.held(installed);
    const current = held.find(skill => skill.declaration.skill_id === input.skill_id)?.declaration;
    if (!current) throw skillErrors.authored_unknown('这个范围里没有你写的这个技能');
    if (current.version !== input.expected_version) throw skillErrors.authored_conflict('这个技能已经有更新的版本，请重新打开再删', { version: current.version });
    const rest = held.filter(skill => skill.declaration.skill_id !== input.skill_id);
    if (rest.length) await this.publish(rest, input.scope, installed, who, caller);
    else { await this.assertOwn(installed, input.scope, who, this.draftOf(held, input.scope, installed), caller); await this.ports.uninstall(input.scope, who, caller); }
    return { skill_id: input.skill_id, remaining: rest.length };
  }
}

/**
 * Adopting a draft (batch 42): the draft as read, checked, and — when it has known answers — replayed at this revision, with any
 * difference accepted by the person; then saved as above. The draft is then closed: its known answers become the Skill's, and a copy
 * remembers its source and the placeholders it replaced. Only the person's own act reaches this (`skills.drafts.adopt`).
 */
export async function adoptDraft(service: SkillAuthoringService, drafts: SkillDraftStore, input: SkillDraftAdoptRequest, who: Who, caller: ActionExecutionContext): Promise<SkillDraftAdoptResult> {
  const draft = drafts.draft(input.draft_id);
  if (!draft || draft.discarded_at || (draft.scope_ref !== 'home' && draft.scope_ref !== who.project_id)) throw skillErrors.draft_unknown('这份草稿已经不在了，可能已被采用或放弃');
  if (draft.revision !== input.expected_revision) throw skillErrors.draft_conflict('草稿在别处改过了，请重新打开再采用', { revision: draft.revision });
  const cases = drafts.cases(draftCases(draft.draft_id));
  if (cases.length) {
    const trials = drafts.trialsOf(draft.draft_id, draft.revision);
    if (untriedCases(cases, trials).length) throw skillErrors.trial_required('这份草稿有已知答案还没在这一版上回放，先回放再采用');
    if (cases.some(known => trials.find(trial => trial.case_id === known.case_id)?.verdict === 'differs') && !input.accept_differences) throw skillErrors.trial_differs('回放的结果和你认可的结果还有出入：仍然采用，还是回去改');
  }
  const scope: SkillScope = draft.scope_ref === 'home' ? 'home' : 'project', target = draft.target;
  return drafts.withAdoption(draft.draft_id, async () => {
    const result = await service.save({ ...draft.fields, scope, ...(target.kind === 'own' ? { skill_id: target.skill_id } : {}) }, who, caller);
    const source = target.kind === 'custom' ? target.source : target.kind === 'own' ? target.rebase : undefined;
    drafts.adopted(draft.draft_id, draft.scope_ref, result.skill_id, source && { source, replacements: draft.replacements, seen_version: source.version });
    return { ...result, ...(target.kind === 'custom' ? { source: target.source } : {}) };
  });
}

/**
 * One sentence into the form's fields, by the configured text model under the registered instructions (`skills.draft`). It proposes
 * only: what comes back is cut to the form's limits and handed to the person, and an answer that is not a draft is refused.
 */
export async function draftSkill(intent: string, complete: HostCompleteText | undefined, authority: Parameters<HostCompleteText>[1] | undefined,
  resolve: (prompt: InstructedPrompt) => string = value => composeInstructedPrompt(value.instruction.body, value.data)): Promise<SkillAuthoredFields> {
  const asked = intent.trim();
  if (!asked || asked.length > SKILL_DRAFT_INTENT_CHARS) throw skillErrors.authored_invalid(`请用 1～${SKILL_DRAFT_INTENT_CHARS} 字说想让这个技能做什么`, { field: 'intent' });
  if (!complete) throw textModelRequired('起草技能');
  await authority?.beforeDispatch?.();
  const answer = await complete(resolve(instructed(SKILL_DRAFT, `用户想要的技能：${asked}`)), authority);
  await authority?.beforeDispatch?.();
  const unreadable = () => skillErrors.draft_unreadable('助理没有给出能用的初稿，请再试一次，或者自己写');
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(answer.trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '')) as Record<string, unknown>; } catch { throw unreadable(); }
  const text = (key: string) => typeof parsed?.[key] === 'string' ? (parsed[key] as string).trim() : '';
  const name = cutHead(text('name').replace(/\s+/gu, ' '), NAME_CHARS), description = cutHead(text('description'), SKILL_LIMITS.descriptionChars);
  const body = cutHead(text('body').replace(/\r\n?/gu, '\n').split('\n').slice(0, SKILL_LIMITS.bodyLines).join('\n'), SKILL_LIMITS.bodyChars).trim();
  if (!name || !description || !body) throw unreadable();
  const whenNot = cutHead(text('when_not_to_use'), SKILL_LIMITS.whenChars);
  const applies = (SKILL_APPLIES_TO as readonly string[]).includes(text('applies_to')) ? text('applies_to') as SkillAppliesTo : 'assistant';
  return { name, description, applies_to: applies, body, ...(whenNot ? { when_not_to_use: whenNot } : {}) };
}
