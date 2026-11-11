/**
 * Importing Skills from this machine (specs/skill-packs/contract-design.md §6, batch 08, 08-8): a local Agent's Skills folder, read by
 * Character import's scan (its roots, its link and size limits), made into one content package with the same packer as CLI
 * `pack-content`, signed by `plugins.local_packages.sign`, and installed by confirming its ordinary preview. The package is the copy made at
 * the preview; the folder changing afterwards changes nothing installed. Importing the same source again makes the next version of the
 * same plugin, each Skill's version counted up where its body, resources or 「给谁用」 changed (§4.3).
 *
 * Who a Skill is for (`applies_to`) is its SKILL.md's when it writes one, kept and never overridden; otherwise the person's, chosen at
 * the confirmation, the preview only pre-selecting it from the source (spec §9, 2026-11-08 用户定). The Host never fills it in itself.
 */
import { externalTool } from '@molis-ai/molis-work-contracts/platform/external-tools';
import { createHash, randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { ActionError, type ActionExecutionContext } from '@molis-ai/molis-work-contracts/platform/actions';
import type { CharacterImportRuntimeId, CharacterImportSkill } from '@molis-ai/molis-work-contracts/modules/characters';
import type { SandboxAgentBody } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SkillAppliesTo } from '@molis-ai/molis-work-contracts/platform/plugin-agent';
import type { LocalPackageSignInput, LocalPackageSignResult } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import { skillErrors, type SkillImportCandidate, type SkillImportConfirmRequest, type SkillImportConfirmResult, type SkillImportPreview, type SkillImportPreviewRequest,
  type SkillImportSource, type SkillScope } from '@molis-ai/molis-work-contracts/services/skills';
import { contentPackageDraft, skillFromFolder, type FolderSkill } from '@molis-ai/molis-work-plugin-sdk';
import { createCharacterDiscovery } from './character-import-discovery.js';
import type { InstalledRelease } from './installed-release.js';
import type { PluginInstallService } from './plugin-install-service.js';

/** The name this Home's publisher is pinned under the first time the person confirms an import. */
const PIN_LABEL = '这台电脑';
const PREVIEW_TTL_MS = 30 * 60 * 1000;
/** The 「给谁用」 an import pre-selects from its source: a coding tool's Skills folder suggests `coding`, any other source `both`. Only a suggestion. */
export function suggestedAppliesTo(source: SkillImportSource): SkillAppliesTo {
  return source.kind === 'runtime' ? 'coding' : 'both';
}

export interface SkillImportPorts {
  /** The Skills one local Runtime's folders hold, read by Character import's scan, and the folder it was read from; `null` when there is none here. */
  scan(runtime: CharacterImportRuntimeId): { root: string; skills: CharacterImportSkill[] } | null;
  /** The package of `pluginId` installed in the scope, as kept and checked again; the one an import of the same source upgrades. */
  installed(pluginId: string, scope: SkillScope, projectId: string): Promise<NonNullable<InstalledRelease['packaged']> | undefined>;
  publisherKeyId(): string | null;
  readSealedPublisherKeyId(input: LocalPackageSignInput, caller: ActionExecutionContext): Promise<string | null>;
  /** Verified releases retained by the Home, including uninstalled and other-project versions of this source. */
  retained(pluginId: string, keyId: string): NonNullable<InstalledRelease['packaged']>[];
  sign(input: LocalPackageSignInput, caller: ActionExecutionContext): Promise<LocalPackageSignResult>;
  install: Pick<PluginInstallService, 'readPreview' | 'confirm'>;
}

/** The person's own local Agents under `userHome`, read as Character import reads them: the Skills only, the rules are not this import's. */
export function localSkillScan(userHome: string, env: NodeJS.ProcessEnv = process.env): SkillImportPorts['scan'] {
  return runtime => {
    const [found] = createCharacterDiscovery({ userHome, env }).discover({ runtime_id: runtime });
    return found ? { root: found.snapshot.config_root, skills: found.snapshot.skills } : null;
  };
}

interface Who { project_id: string; actor_id: string }
/** A Skill the preview found importable: as read with the suggestion, and its folder's files, read again with the person's choice. */
interface HeldSkill { read: FolderSkill; files: Map<string, Uint8Array> }
interface Held { who: Who; plugin_id: string; name: string; skills: Map<string, HeldSkill>; expires: number }

/** Which file of a Skill's folder is a script, as `skillFromFolder` places it. */
const runsScripts = (skill: CharacterImportSkill) => skill.files.some(file => file.path.startsWith('scripts/'));
const bytesOf = (file: CharacterImportSkill['files'][number]) => Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');

/**
 * A Skill read from its folder, `applies_to` taken as suggested where SKILL.md writes none, or why it cannot be imported: each Skill
 * stands alone, so one that cannot leaves the others importable.
 */
function folderSkill(skill: CharacterImportSkill, suggested: SkillAppliesTo): HeldSkill | string {
  if (lstatSync(skill.path, { throwIfNoEntry: false })?.isSymbolicLink()) return '技能目录是一个符号链接：导入只读来源目录之内，请从它实际所在的目录导入';
  const files = new Map(skill.files.map((file): [string, Uint8Array] => [file.path, bytesOf(file)]));
  try {
    const read = skillFromFolder(files, { applies_to: suggested });
    if (skill.compatibility === 'native-only') read.declaration.native_only_reason = skill.reason ?? '包含本地 Agent 才能使用的依赖。';
    return { read, files };
  }
  catch (error) {
    if (!(error instanceof ActionError)) throw error;
    const problems = (error.details as { problems?: Array<{ path?: string; reason: string }> } | undefined)?.problems;
    return problems?.length ? problems.map(problem => problem.path ? `${problem.path}：${problem.reason}` : problem.reason).join('；') : error.message;
  }
}

/** What an installed version of a Skill is made of: its body, each resource's path and digest, and who it is for. */
const contentKey = (body: string | Uint8Array | undefined, resources: ReadonlyArray<{ path: string; sha256: string }> = [], appliesTo: string | undefined, nativeOnly: string | undefined) =>
  createHash('sha256').update(JSON.stringify([typeof body === 'string' ? body : body === undefined ? null : Buffer.from(body).toString('utf8'),
    resources.map(item => [item.path, item.sha256]).sort(), appliesTo ?? null, nativeOnly ?? null])).digest('hex');

/** The version an imported Skill takes: 1 when new, the installed one when nothing changed, one more when its body, resources or 「给谁用」 did. */
function versionOf(skill: FolderSkill, installed: NonNullable<InstalledRelease['packaged']> | undefined): number {
  const held = installed?.manifest.methods?.find(method => method.skill_id === skill.declaration.skill_id);
  if (!held) return 1;
  const body = (installed!.agentBodies as readonly SandboxAgentBody[] | undefined)?.find(item => item.kind === 'method' && item.entry_id === held.skill_id)?.body;
  const same = contentKey(body, held.resources, held.applies_to, held.native_only_reason) === contentKey(skill.files.get(skill.declaration.body!), skill.declaration.resources, skill.declaration.applies_to, skill.declaration.native_only_reason);
  return same ? held.version : held.version + 1;
}

export class SkillImportService {
  private readonly held = new Map<string, Held>();
  constructor(private readonly ports: SkillImportPorts, private readonly now: () => number = Date.now) {}

  /** Reads the source and says what importing it would make, with the 「给谁用」 it pre-selects; installs nothing, signs nothing. */
  async preview(input: SkillImportPreviewRequest, who: Who): Promise<SkillImportPreview> {
    if (input.source.kind !== 'runtime') throw skillErrors.import_source_unavailable('还不能从项目目录导入技能：请从本机 Agent 的技能目录导入');
    const runtime = input.source.runtime_id, found = this.ports.scan(runtime);
    if (!found) throw skillErrors.import_source_unavailable(`这台电脑上没有 ${externalTool(runtime).display_name} 的技能目录`);
    // The source's kind and root name the plugin, so importing the same source again is its upgrade.
    const plugin_id = `io.molis.work.imported-skills.${runtime}-${createHash('sha256').update(`runtime\0${runtime}\0${found.root}`).digest('hex').slice(0, 12)}`;
    const installed = await this.ports.installed(plugin_id, 'project', who.project_id) ?? await this.ports.installed(plugin_id, 'home', who.project_id);
    const applies_to = suggestedAppliesTo(input.source), skills = new Map<string, HeldSkill>(), candidates: SkillImportCandidate[] = [];
    for (const skill of found.skills) {
      const read = folderSkill(skill, applies_to), id = typeof read === 'string' ? skill.name : read.read.declaration.skill_id;
      const refused = typeof read === 'string' ? read : skills.has(id) ? `与前面一个技能同名（${id}）：一个包里的技能名不能重复` : undefined;
      if (!refused) skills.set(id, read as HeldSkill);
      const folder = typeof read === 'string' ? undefined : read.read, declaration = folder?.declaration;
      candidates.push({ skill_id: id, name: declaration?.name ?? skill.name, description: declaration?.description ?? skill.description, file_count: skill.files.length,
        bytes: skill.files.reduce((sum, file) => sum + bytesOf(file).length, 0), importable: !refused,
        ...(!refused && folder ? { applies_to: folder.declaration.applies_to, applies_to_from: folder.applies_to_written ? 'file' as const : 'suggested' as const } : {}),
        compatibility: skill.compatibility,
        ...(refused ? { reason: refused } : skill.reason ? { reason: skill.reason } : {}), runs_scripts: runsScripts(skill),
        change: installed?.manifest.methods?.some(method => method.skill_id === id) ? 'upgrade' : 'new' });
    }
    const preview_id = randomUUID();
    this.held.set(preview_id, { who, plugin_id, name: `从 ${externalTool(runtime).display_name} 导入的技能`, skills, expires: this.now() + PREVIEW_TTL_MS });
    const keyId = this.ports.publisherKeyId();
    const retained = keyId ? this.ports.retained(plugin_id, keyId) : [];
    return { preview_id, package: { plugin_id, version: nextVersion(retained), installed_version: installed?.manifest.version ?? null }, applies_to, candidates };
  }

  /**
   * Makes the chosen Skills into one package, signs it with this Home's publisher identity and installs it in the scope through the
   * install service's own preview and confirmation (pinning this Home's publisher the first time). A preview is used once, by the
   * person it was made for, in the project it was made in; a Skill it did not find importable is refused. A chosen Skill whose SKILL.md
   * writes no `applies_to` takes the person's choice and is refused without one; one that writes its own keeps it, and a choice for it is refused.
   */
  async confirm(input: SkillImportConfirmRequest, who: Who, caller: ActionExecutionContext): Promise<SkillImportConfirmResult> {
    const held = this.held.get(input.preview_id);
    if (!held || held.expires < this.now() || held.who.actor_id !== who.actor_id || held.who.project_id !== who.project_id) {
      throw skillErrors.import_preview_unknown('这次导入预览不存在、已过期或不是你在这个项目里做的，请重新预览');
    }
    this.held.delete(input.preview_id);
    const found = input.skill_ids.map(id => [id, held.skills.get(id) ?? (() => { throw skillErrors.import_skill_unknown(`${id} 不是这次预览里能导入的技能`); })()] as const);
    const choices = new Map<string, SkillAppliesTo>();
    for (const item of input.applies_to ?? []) {
      if (choices.has(item.skill_id) || !input.skill_ids.includes(item.skill_id)) throw skillErrors.import_applies_to_invalid(`${item.skill_id} 不是这次选中的技能，或给谁用写了两次`);
      choices.set(item.skill_id, item.applies_to);
    }
    const chosen = found.map(([id, skill]) => {
      const choice = choices.get(id);
      if (skill.read.applies_to_written) {
        if (choice) throw skillErrors.import_applies_to_invalid(`${id} 的 SKILL.md 自己写了给谁用（${skill.read.declaration.applies_to}），导入不改它`);
        return skill.read;
      }
      if (!choice) throw skillErrors.import_applies_to_invalid(`${id} 的 SKILL.md 没写给谁用：请为它选一个`);
      const selected = skillFromFolder(skill.files, { applies_to: choice });
      if (skill.read.declaration.native_only_reason) selected.declaration.native_only_reason = skill.read.declaration.native_only_reason;
      return selected;
    });
    const installed = await this.ports.installed(held.plugin_id, input.scope, who.project_id);
    const packageFields = { plugin_id: held.plugin_id, name: held.name, scope: input.scope,
      ...(installed ? { compatible_from: [installed.manifest.version] } : {}) };
    const keyId = this.ports.publisherKeyId() ?? await this.ports.readSealedPublisherKeyId(
      contentPackageDraft({ ...packageFields, version: nextVersion(installed ? [installed] : []), skills: chosen }), caller);
    const retained = keyId ? this.ports.retained(held.plugin_id, keyId) : [];
    const skills = chosen.map(skill => {
      const prior = retained.filter(pkg => pkg.manifest.methods?.some(method => method.skill_id === skill.declaration.skill_id))
        .sort((a, b) => b.manifest.methods!.find(method => method.skill_id === skill.declaration.skill_id)!.version - a.manifest.methods!.find(method => method.skill_id === skill.declaration.skill_id)!.version)[0];
      return { ...skill, declaration: { ...skill.declaration, version: versionOf(skill, prior) } };
    });
    const draft = contentPackageDraft({ ...packageFields, version: nextVersion(installed ? [...retained, installed] : retained), skills });
    const { preview_id } = await this.ports.sign(draft, caller);
    const preview = this.ports.install.readPreview(preview_id, who);
    return this.ports.install.confirm({ preview_id, consent: true, ...(preview.publisher.pinned_label === null ? { pin_label: PIN_LABEL } : {}) }, who, caller);
  }
}

/** The package version an import makes: the first, or the next major after the installed one. */
function nextVersion(retained: NonNullable<InstalledRelease['packaged']>[]): string {
  return `${Math.max(0, ...retained.map(pkg => Number(pkg.manifest.version.split('.')[0]))) + 1}.0.0`;
}
