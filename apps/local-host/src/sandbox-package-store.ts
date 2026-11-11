import { sandboxPackageBuildId } from '@molis-ai/molis-work-plugin-sdk';
/**
 * Where the Host keeps the signed packages it installed (the Home's `plugin-packages/`): the package exactly as it was verified and a
 * sandbox plugin's code beside it, written once and read-only. A package is read back with the same checks it was installed with, so
 * an installed plugin runs from bytes whose signature, form and publisher the Host has checked again, not from a record of having checked;
 * a content package whose files no longer match its declarations (a body, a resource's digest) is not read back, and does not run.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { readSnapshotFile } from "@molis-ai/molis-work-storage";
import { join } from 'node:path';
import { pluginErrors, SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { pluginManifestDigest, verifyPluginPackageSignature } from '@molis-ai/molis-work-plugin-runtime';
import { isContentPackage, isIntegrationPackage, readKeptPackage, type KeptPackage, type SandboxPackage } from './sandbox-package.js';
import type { InstalledRelease } from './installed-release.js';

const BUNDLE_FILE = 'bundle.json';

/**
 * What the Host runs a verified package from: the release, with the trust its publisher's pinned key gives it. An integration package
 * (BL-530) has no interface and no prompts: its release has none either. A content package has no code and no contract: its release
 * offers no operation, page or prompt, and Plugin Runtime never starts it (declared, not started); its Skills are its methods' bodies.
 */
export function packagedRelease(pkg: KeptPackage, directory: string, publishedAt: string): InstalledRelease {
  const { manifest } = pkg;
  const contract: SandboxPluginContract = isContentPackage(pkg)
    ? { version: /* @version format.sandbox.contract */ 1, pluginId: manifest.plugin_id, revision: pluginManifestDigest(manifest), operations: [], entities: [], pages: [], acceptance: [] } : pkg.contract;
  const app: Pick<SandboxPackage, 'parts' | 'nodes' | 'prompts' | 'presentation'> = isContentPackage(pkg) || isIntegrationPackage(pkg) ? { parts: [], nodes: [], prompts: [] } : pkg;
  const blueprint = isContentPackage(pkg) ? pkg.blueprint : undefined;
  return {
    // Names this plugin under this publisher: its actions are registered as `generated.<first 8>.<operation>`, so two plugins of one publisher must differ.
    buildId: sandboxPackageBuildId(manifest.plugin_id, manifest.publisher.signature), pluginId: manifest.plugin_id, version: 1,
    design: { id: contract.revision, title: manifest.name, description: '', rationale: '', journey: [], contract, parts: app.parts, acceptance: [], ...(app.presentation ? { presentation: app.presentation } : {}) },
    nodes: app.nodes, manifest: { version: /* @version format.builder.build-manifest */ 1, pluginId: contract.pluginId, revision: contract.revision, effects: pkg.permissions },
    directory, bundlePath: join(directory, SANDBOX_PACKAGE_FILES.entrypoint), packagePath: directory, permissions: pkg.permissions, publishedAt, prompts: app.prompts,
    packaged: { manifest, localePacks: pkg.localePacks, ...('agentBodies' in pkg ? { agentBodies: pkg.agentBodies } : {}), ...(blueprint ? { blueprint } : {}),
      trust: { level: 'pinned', publisher_key_id: manifest.publisher.signature } },
  };
}

export class SandboxPackageStore {
  constructor(private readonly home: string) {}

  private directory(pluginId: string, keyId: string, version: string): string {
    return join(this.home, 'plugin-packages', createHash('sha256').update(JSON.stringify([pluginId, keyId, version])).digest('hex').slice(0, 32));
  }

  /** Writes a verified package. The same package again changes nothing; other content under the same plugin, publisher and version is refused. */
  save(bundle: PluginPackageBundle, pkg: KeptPackage): string {
    const { manifest } = pkg, directory = this.directory(manifest.plugin_id, manifest.publisher.signature, manifest.version);
    const text = JSON.stringify(bundle);
    if (existsSync(join(directory, BUNDLE_FILE))) {
      if (readFileSync(join(directory, BUNDLE_FILE), 'utf8') !== text) throw pluginErrors.package_invalid('这个版本已经有一份内容不同的包，不能覆盖');
      return directory;
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const write = (name: string, content: string | Uint8Array) => { const path = join(directory, name); writeFileSync(path, content, { flag: 'w', mode: 0o600 }); chmodSync(path, 0o400); };
    if ('entrypoint' in pkg) write(SANDBOX_PACKAGE_FILES.entrypoint, pkg.entrypoint);
    write(BUNDLE_FILE, text);
    return directory;
  }

  /**
   * Where the packages kept for a plugin id say they run, if any is kept: a plugin id has one range, whoever signed it and whatever the
   * version (BL-628). Read without the package's checks, as it only refuses the install of another range; a directory it cannot read is not a package of this id.
   */
  scopeOf(pluginId: string): 'home' | 'project' | undefined {
    const root = join(this.home, 'plugin-packages');
    if (!existsSync(root)) return undefined;
    for (const name of readdirSync(root)) {
      try {
        const manifest = (JSON.parse(readFileSync(join(root, name, BUNDLE_FILE), 'utf8')) as { payload?: { manifest?: { plugin_id?: unknown; runtime?: { scope?: unknown } } } }).payload?.manifest;
        if (manifest?.plugin_id === pluginId) return manifest.runtime?.scope === 'home' ? 'home' : 'project';
      } catch { /* not a package directory */ }
    }
    return undefined;
  }

  /** All retained releases of this publisher's plugin, verified through the same reader as installations; uninstall keeps these bytes. */
  releases(pluginId: string, keyId: string): NonNullable<InstalledRelease['packaged']>[] {
    const root = join(this.home, 'plugin-packages');
    if (!existsSync(root)) return [];
    const releases: NonNullable<InstalledRelease['packaged']>[] = [];
    for (const name of readdirSync(root)) {
      const path = join(root, name, BUNDLE_FILE);
      const { payload } = JSON.parse(readSnapshotFile(path, 64 * 1024 * 1024).toString('utf8')) as PluginPackageBundle;
      if (payload.manifest.plugin_id !== pluginId || payload.manifest.publisher.signature !== keyId) continue;
      releases.push(this.load(pluginId, keyId, payload.manifest.version).packaged!);
    }
    return releases;
  }

  /** Reads an installed package back, checking it again: its signature, its form, and that it is the package the installation names. */
  /** Offline inspection reads only retained signed bytes and never imports the package or follows symlinks. */
  snapshotManifest(pluginId:string, keyId:string, version:string) {
    const path = join(this.directory(pluginId,keyId,version),BUNDLE_FILE);
    if (!lstatSync(path,{throwIfNoEntry:false})) return undefined;
    const {bundle,key_id} = verifyPluginPackageSignature(JSON.parse(readSnapshotFile(path,64 * 1024 * 1024).toString("utf8")));
    const {manifest} = readKeptPackage(bundle.payload);
    if (key_id !== keyId || manifest.plugin_id !== pluginId || manifest.version !== version)
      throw pluginErrors.signer_mismatch("留存发行包的身份与安装记录不符");
    return manifest;
  }

  private read(pluginId: string, keyId: string, version: string) {
    const directory = this.directory(pluginId, keyId, version);
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(directory, BUNDLE_FILE), 'utf8')); } catch { throw new Error('找不到已安装的插件包：' + pluginId + ' ' + version); }
    const { bundle, key_id } = verifyPluginPackageSignature(raw);
    const { manifest } = bundle.payload;
    if (key_id !== keyId || manifest.plugin_id !== pluginId || manifest.version !== version) throw new Error('已存的插件包与安装记录对不上：' + pluginId + ' ' + version);
    const pkg = readKeptPackage(bundle.payload);
    if ('entrypoint' in pkg && !Buffer.from(readFileSync(join(directory, SANDBOX_PACKAGE_FILES.entrypoint))).equals(Buffer.from(pkg.entrypoint))) throw new Error('已存的插件代码被改过：' + pluginId + ' ' + version);
    return { pkg, bundle, directory };
  }

  /** The kept bundle's text exactly as written, after the same checks as a load: what 「导出这个包」 hands out, never re-signed (capability-pack §4.9). */
  keptText(pluginId: string, keyId: string, version: string): string {
    const { directory } = this.read(pluginId, keyId, version);
    return readFileSync(join(directory, BUNDLE_FILE), 'utf8');
  }

  load(pluginId: string, keyId: string, version: string): InstalledRelease {
    const { pkg, directory } = this.read(pluginId, keyId, version);
    return packagedRelease(pkg, directory, statSync(join(directory, BUNDLE_FILE)).mtime.toISOString());
  }

  /** SKC-09: only a declared resource from the currently verified signed package, never a filesystem path from the caller. */
  skillResource(pluginId: string, keyId: string, version: string, skillId: string, resourcePath: string): Uint8Array {
    const { pkg, bundle } = this.read(pluginId, keyId, version);
    const declaration = pkg.manifest.methods?.find(skill => skill.skill_id === skillId)?.resources?.find(resource => resource.path === resourcePath);
    if (!declaration) throw pluginErrors.package_invalid("技能没有声明这个附带文件");
    const file = bundle.payload.files.find(item => item.path === resourcePath);
    if (!file) throw pluginErrors.package_invalid("技能的附带文件缺失");
    return Buffer.from(file.content_base64, "base64");
  }
}
