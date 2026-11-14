/**
 * The Skill packs that come with the system (用户 2026-11-14 定): content packs under `plugins/content/` whose `pack-content.json`
 * writes `system`, packed by `pnpm build` into `system-skills/` in this package's build output. They are the Host's own content, as a
 * built-in plugin's methods are: nobody installs, signs or removes one, each is in every Home's Skill catalog from the first start,
 * and each Skill is in the pack's `default_state` until the person changes it in the catalog. Nothing else names this folder; only a
 * test hands the Host another (`MolisWorkLocalHostOptions.systemSkillsDirectory`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginManifest, SandboxAgentBody } from '@molis-ai/molis-work-contracts/platform/plugin';
import { completeContentPackagePayload } from '@molis-ai/molis-work-plugin-sdk';
import { hostLog } from '../host-log.js';
import { readKeptPackage, type KeptPackage } from '../sandbox-package.js';

/** The publisher signature a system pack's Manifest and Skill references carry: no key signs it, the build that ships the Host does. */
export const SYSTEM_PACK_SIGNATURE = 'ed25519:sha256:' + '0'.repeat(64);
/** A system pack's place in a `SkillRef`: there is no installation, so its id is the pack's. */
export const systemPackInstallId = (pluginId: string) => `system:${pluginId}`;

export interface SystemSkillPack {
  manifest: PluginManifest;
  bodies: readonly SandboxAgentBody[];
  localePacks: KeptPackage['localePacks'];
  default_state: 'auto' | 'manual';
  /** A declared resource's bytes, by its package path. */
  file(path: string): Uint8Array | undefined;
}

export function systemSkillsDirectory(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'system-skills');
}

const read = new Map<string, readonly SystemSkillPack[]>();

/** Every pack in the folder, read once per process: the folder is build output and does not change under a running Host. */
export function systemSkillPacks(directory = systemSkillsDirectory()): readonly SystemSkillPack[] {
  const held = read.get(directory);
  if (held) return held;
  const packs: SystemSkillPack[] = [];
  let names: string[] = [];
  try { names = readdirSync(directory).filter(name => name.endsWith('.json')).sort(); } catch { /* A build without system packs has no folder. */ }
  for (const name of names) {
    try {
      const { default_state, manifest: declared, files } = JSON.parse(readFileSync(path.join(directory, name), 'utf8')) as {
        default_state?: unknown; manifest: Record<string, unknown>; files: Array<{ path: string; content_base64: string }> };
      if (default_state !== 'auto' && default_state !== 'manual') throw new Error('default_state 只能是 auto 或 manual');
      const kept = readKeptPackage(completeContentPackagePayload({ manifest: declared, files }, { publisher_id: 'molis-work', signature: SYSTEM_PACK_SIGNATURE }));
      if (kept.manifest.kind !== 'content' || name !== `${kept.manifest.plugin_id}.json`) throw new Error('随系统带的技能包要是只有声明的插件，文件名是它的插件 ID');
      const bytes = new Map(files.map(file => [file.path, Buffer.from(file.content_base64, 'base64')]));
      packs.push({ manifest: kept.manifest, bodies: 'agentBodies' in kept ? kept.agentBodies : [], localePacks: kept.localePacks, default_state, file: at => bytes.get(at) });
    } catch (error) { hostLog.warn('skills', 'system_pack_unreadable', error, { file: name }); }
  }
  read.set(directory, packs);
  return packs;
}
