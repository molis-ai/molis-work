/**
 * Where the Host keeps the signed sandbox packages it installed (the Home's `plugin-packages/`): the package exactly as it was verified
 * and the plugin's code beside it, written once and read-only. A package is read back with the same checks it was installed with, so
 * an installed plugin runs from bytes whose signature, form and publisher the Host has checked again, not from a record of having checked.
 */
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pluginErrors, SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from '@molis-ai/molis-work-contracts/platform/plugin';
import { verifyPluginPackageSignature } from '@molis-ai/molis-work-plugin-runtime';
import { readSandboxPackage, type SandboxPackage } from './sandbox-package.js';
import type { InstalledRelease } from './installed-release.js';

const BUNDLE_FILE = 'bundle.json';

/** What the Host runs a verified package from: the release, with the trust its publisher's pinned key gives it. */
export function packagedRelease(pkg: SandboxPackage, directory: string, publishedAt: string): InstalledRelease {
  const { manifest, contract } = pkg;
  return {
    // Names this plugin under this publisher: its actions are registered as `generated.<first 8>.<operation>`, so two plugins of one publisher must differ.
    buildId: createHash('sha256').update(JSON.stringify([manifest.plugin_id, manifest.publisher.signature])).digest('hex').slice(0, 32), pluginId: manifest.plugin_id, version: 1,
    design: { id: contract.revision, title: manifest.name, description: '', rationale: '', journey: [], contract, parts: pkg.parts, acceptance: [], ...(pkg.presentation ? { presentation: pkg.presentation } : {}) },
    nodes: pkg.nodes, manifest: { version: 1, pluginId: contract.pluginId, revision: contract.revision, effects: pkg.permissions },
    directory, bundlePath: join(directory, SANDBOX_PACKAGE_FILES.entrypoint), packagePath: directory, permissions: pkg.permissions, publishedAt, prompts: pkg.prompts,
    packaged: { manifest, trust: { level: 'pinned', publisher_key_id: manifest.publisher.signature } },
  };
}

export class SandboxPackageStore {
  constructor(private readonly home: string) {}

  private directory(pluginId: string, keyId: string, version: string): string {
    return join(this.home, 'plugin-packages', createHash('sha256').update(JSON.stringify([pluginId, keyId, version])).digest('hex').slice(0, 32));
  }

  /** Writes a verified package. The same package again changes nothing; other content under the same plugin, publisher and version is refused. */
  save(bundle: PluginPackageBundle, pkg: SandboxPackage): string {
    const { manifest } = pkg, directory = this.directory(manifest.plugin_id, manifest.publisher.signature, manifest.version);
    const text = JSON.stringify(bundle);
    if (existsSync(join(directory, BUNDLE_FILE))) {
      if (readFileSync(join(directory, BUNDLE_FILE), 'utf8') !== text) throw pluginErrors.package_invalid('这个版本已经有一份内容不同的包，不能覆盖');
      return directory;
    }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const write = (name: string, content: string | Uint8Array) => { const path = join(directory, name); writeFileSync(path, content, { flag: 'w', mode: 0o600 }); chmodSync(path, 0o400); };
    write(SANDBOX_PACKAGE_FILES.entrypoint, pkg.entrypoint);
    write(BUNDLE_FILE, text);
    return directory;
  }

  /** Reads an installed package back, checking it again: its signature, its form, and that it is the package the installation names. */
  load(pluginId: string, keyId: string, version: string): InstalledRelease {
    const directory = this.directory(pluginId, keyId, version);
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(join(directory, BUNDLE_FILE), 'utf8')); } catch { throw new Error('找不到已安装的插件包：' + pluginId + ' ' + version); }
    const { bundle, key_id } = verifyPluginPackageSignature(raw);
    const { manifest } = bundle.payload;
    if (key_id !== keyId || manifest.plugin_id !== pluginId || manifest.version !== version) throw new Error('已存的插件包与安装记录对不上：' + pluginId + ' ' + version);
    const pkg = readSandboxPackage(bundle.payload);
    if (!Buffer.from(readFileSync(join(directory, SANDBOX_PACKAGE_FILES.entrypoint))).equals(Buffer.from(pkg.entrypoint))) throw new Error('已存的插件代码被改过：' + pluginId + ' ' + version);
    return packagedRelease(pkg, directory, statSync(join(directory, BUNDLE_FILE)).mtime.toISOString());
  }
}
