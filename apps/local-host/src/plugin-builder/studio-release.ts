import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from '@molis-ai/molis-work-contracts/platform/plugin';
import { effectsFromContract, sandboxPluginManifest } from '@molis-ai/molis-work-plugin-sdk';
import { parsePluginPackage, signPluginPackage, verifyPluginPackageSignature } from '@molis-ai/molis-work-plugin-runtime';
import { assertContract } from '@molis-ai/molis-work-plugin-sandbox';
import { validatePluginComponentNodes, validatePluginPresentation } from '@molis-ai/molis-work-design-system';
import type { AgentBuilderPorts, AgentBuild, AgentRelease, AgentPublicationControl } from './agent-surface.js';
import { assertHomePackageAllowed } from '../home-package-admission.js';
import { readKeptSandboxPackage } from '../sandbox-package.js';
import { releaseVersion } from '../installed-release.js';
import { buildSources, readPluginPrompts } from './prompts.js';
import { readBuildFile } from './build-project.js';
import { studioPublisherIdentity } from './publisher-identity.js';

const SIGNED = 'signed-package.json';
const RELEASE_FILES = new Set<string>([...Object.values(SANDBOX_PACKAGE_FILES), SIGNED]);

function versionDirectory(root: string, buildId: string, version: number): string {
  if (!/^[a-f0-9-]{36}$/u.test(buildId) || !Number.isSafeInteger(version) || version < 1) throw new Error('发布版本定位无效');
  return join(root, 'releases', buildId, 'v' + version);
}

function releaseParent(root: string, buildId: string, control?: AgentPublicationControl): string {
  let path = root;
  for (const segment of ['', 'releases', buildId]) {
    if (segment) path = join(path, segment);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat && segment && control) { control.assertCurrent(); mkdirSync(path, { mode: 0o700 }); }
    else if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error('发布位置不是本流程的普通目录');
  }
  return path;
}

/** Only an explicit, currently authorized retry may reclaim an unreferenced interrupted publication. */
function reclaim(directory: string, build: AgentBuild, version: number, signer: string, control: AgentPublicationControl): void {
  const stat = lstatSync(directory, { throwIfNoEntry: false });
  if (!stat) return;
  if (control.referenced(directory)) throw new Error('发布目录已有版本引用，不能覆盖');
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('发布目录不是本流程的普通目录，保留待检查');
  const names = readdirSync(directory);
  if (names.length !== RELEASE_FILES.size) throw new Error('发布目录不完整，不能确认归属，保留待检查');
  for (const name of names) {
    const file = lstatSync(join(directory, name));
    if (!RELEASE_FILES.has(name) || !file.isFile() || file.isSymbolicLink() || file.nlink !== 1) throw new Error('发布目录包含未知文件，保留待检查');
  }
  // Final directories are renamed only after every file is complete. Partial/foreign directories are never ours to erase.
  const { bundle } = verifyPluginPackageSignature(JSON.parse(readFileSync(join(directory, SIGNED), 'utf8')));
  const kept = readKeptSandboxPackage(bundle.payload);
  if (bundle.payload.manifest.plugin_id !== build.design!.contract.pluginId || bundle.payload.manifest.version !== releaseVersion(version)
    || bundle.payload.manifest.publisher.signature !== signer) throw new Error('未登记发行物不属于这个草稿版本，保留待检查');
  for (const file of bundle.payload.files) if (file.path !== SANDBOX_PACKAGE_FILES.manifest && !readFileSync(join(directory, file.path)).equals(Buffer.from(file.content_base64, 'base64'))) throw new Error('发布目录与签名内容不符，保留待检查');
  const original: unknown = JSON.parse(readFileSync(join(directory, SANDBOX_PACKAGE_FILES.manifest), 'utf8'));
  if (!isDeepStrictEqual(original, { version: 1, pluginId: kept.contract.pluginId, revision: kept.contract.revision, effects: effectsFromContract(kept.contract) })) throw new Error('发布构建清单不符，保留待检查');
  control.assertCurrent();
  if (control.referenced(directory)) throw new Error('发布目录已被另一发布引用');
  rmSync(directory, { recursive: true });
}

/** One release owner per studio, serialized only by build. Its synchronous final section commits files then the store CAS. */
export function createStudioPublisher(home: string, root: string): AgentBuilderPorts['publish'] {
  const pending = new Map<string, Promise<unknown>>();
  return async (build, manifest, bundlePath, version, control) => {
    const run = async () => {
      await control.beforeEffect();
      if (control.versions().some(item => item.version === version)) throw new Error('发布版本已存在');
      const design = build.design!;
      assertContract(design.contract); validatePluginComponentNodes(build.nodes, design.parts, design.contract);
      if (design.presentation) validatePluginPresentation(design.presentation, design.parts, design.contract);
      const code = await readBuildFile(build.directory!, relative(build.directory!, bundlePath), 8 * 1024 * 1024);
      control.assertCurrent();
      const { prompts, problems } = readPluginPrompts(await buildSources(build.directory!, build.directory! + '.settled', design.contract.operations.length));
      control.assertCurrent();
      if (problems.length) throw new Error('发布前请先修好调用模型的写法：' + problems[0]);
      const scope = build.runtimeScope ?? 'project';
      const originalFiles = {
        'plugin.mjs': code, 'manifest.json': JSON.stringify(manifest), 'contract.json': JSON.stringify(design.contract),
        'interface.json': JSON.stringify({ parts: design.parts, nodes: build.nodes, acceptance: design.acceptance, presentation: design.presentation }),
        'prompts.json': JSON.stringify(prompts),
      };
      const candidate = (identity: string, compatible: string[] = []) => {
        const distributed = sandboxPluginManifest({ pluginId: design.contract.pluginId, name: design.title, version: releaseVersion(version),
          publisher: { publisher_id: 'molis-studio', signature: identity }, presentation: design.presentation !== undefined,
          effects: manifest.effects, contract: design.contract, upgradesFrom: compatible, ...(scope === 'home' ? { runtime: { scope: 'home' } } : {}) });
        const files = Object.entries({ ...originalFiles, 'manifest.json': JSON.stringify(distributed) }).map(([path, content]) => ({ path, content_base64: Buffer.from(content).toString('base64') }));
        return parsePluginPackage({ payload: { schema_version: 1, manifest: distributed, files }, signature: null, publisher_key: null });
      };
      const admitted = readKeptSandboxPackage(candidate('agent-built:' + build.id).payload);
      if (scope === 'home') assertHomePackageAllowed(admitted.manifest);
      const signer = await studioPublisherIdentity(home, control); control.assertCurrent();
      const ownerControl = control;
      control = { ...ownerControl, assertCurrent: signer.assertCurrent,
        async beforeEffect() { await ownerControl.beforeEffect(); signer.assertCurrent(); },
        commit(artifact) { signer.assertCurrent(); return ownerControl.commit(artifact); } };
      const compatible = control.versions().filter(item => item.distribution?.runtime_scope === scope && item.distribution.publisher_key_id === signer.publisher_identity).map(item => releaseVersion(item.version));
      const bundle = signPluginPackage(candidate(signer.publisher_identity, compatible), signer);
      const checked = readKeptSandboxPackage(verifyPluginPackageSignature(bundle).bundle.payload);
      if (scope === 'home') assertHomePackageAllowed(checked.manifest);
      const directory = versionDirectory(root, build.id, version);
      await control.beforeEffect(); const parent = releaseParent(root, build.id, control);
      // Directory ownership is fixed above; recovery never follows arbitrary paths from a request or a package.
      reclaim(directory, build, version, signer.publisher_identity, control);
      await control.beforeEffect(); const temporary = await mkdtemp(join(parent, '.publishing-'));
      let committed = false;
      try {
        control.assertCurrent();
        for (const [name, contents] of Object.entries({ ...originalFiles, [SIGNED]: JSON.stringify(bundle) })) {
          await control.beforeEffect(); await writeFile(join(temporary, name), contents, { mode: 0o400, flag: 'wx' }); control.assertCurrent();
        }
        const kept: unknown = JSON.parse(await readFile(join(temporary, SIGNED), 'utf8')); control.assertCurrent();
        const verified = readKeptSandboxPackage(verifyPluginPackageSignature(kept).bundle.payload);
        if (scope === 'home') assertHomePackageAllowed(verified.manifest);
        await control.beforeEffect();
        if (control.versions().some(item => item.version === version) || existsSync(directory)) throw new Error('发布版本已被占用');
        control.assertCurrent(); renameSync(temporary, directory); committed = true;
        // No await between this rename and the fact CAS. A crash here is recovered by the next explicit publication.
        return control.commit({ directory, bundlePath: join(directory, 'plugin.mjs'), packagePath: directory, prompts,
          distribution: { runtime_scope: scope, publisher_key_id: signer.publisher_identity } });
      } catch (error) {
        if (committed && !control.referenced(directory)) rmSync(directory, { recursive: true, force: true });
        throw error;
      } finally { if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true }); }
    };
    const next = (pending.get(build.id) ?? Promise.resolve()).then(run, run), settled = next.then(() => undefined, () => undefined);
    pending.set(build.id, settled);
    void settled.then(() => { if (pending.get(build.id) === settled) pending.delete(build.id); });
    return next;
  };
}

/** Owner-derived published bytes only; downloads do not initialize an identity or accept a caller-supplied path. */
export async function readStudioDistribution(root: string, release: AgentRelease): Promise<PluginPackageBundle> {
  if (!release.distribution) throw new Error('这个版本没有签名分发包');
  const directory = versionDirectory(root, release.buildId, release.version); releaseParent(root, release.buildId);
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('签名分发物不可读取');
  const { bundle } = verifyPluginPackageSignature(JSON.parse((await readBuildFile(directory, SIGNED, 64 * 1024 * 1024)).toString('utf8')));
  if (bundle.payload.manifest.plugin_id !== release.pluginId || bundle.payload.manifest.version !== releaseVersion(release.version)
    || bundle.payload.manifest.publisher.signature !== release.distribution.publisher_key_id
    || (bundle.payload.manifest.runtime?.scope ?? 'project') !== release.distribution.runtime_scope) throw new Error('签名分发物与发布记录不符');
  readKeptSandboxPackage(bundle.payload);
  return bundle;
}
