import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CharacterImportRuntimeId } from "@molis-ai/molis-work-contracts/modules/characters";

interface PluginSources { runtime: CharacterImportRuntimeId; root: string; projectRoot?: string;
  text(path: string): string | null; entries(path: string): string[]; warn(message: string): void }
const inside = (root: string, target: string) => { const part = relative(root, target); return !part || (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`)); };
const isDir = (path: string) => { try { return statSync(path).isDirectory(); } catch { return false; } };
const component = (value: string) => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(value);

/** Read installation metadata only; never scan orphaned cache versions for Skills. */
export function installedPluginSkillRoots(source: PluginSources): string[] {
  const { runtime, root, text, entries, warn } = source, result = new Set<string>();
  const json = (path: string): Record<string, unknown> | null => {
    if (!existsSync(path)) return null;
    try { const body = text(path); if (body === null) return null; const value: unknown = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid object");
      return value as Record<string, unknown>;
    } catch { warn(`${path}：插件索引无法解析，未导入其技能`); return null; }
  };
  const add = (pluginRoot: string, manifestName: string) => {
    if (!isDir(pluginRoot)) { warn(`${pluginRoot}：安装索引引用的插件目录不存在`); return; }
    const cacheRoot = join(root, "plugins/cache");
    if (!isDir(cacheRoot) || !inside(realpathSync(cacheRoot), realpathSync(pluginRoot))) { warn(`${pluginRoot}：插件索引路径越出缓存，未导入`); return; }
    const manifest = json(join(pluginRoot, manifestName));
    if (!manifest) { warn(`${pluginRoot}：没有有效插件 manifest，未猜测技能目录`); return; }
    const values = manifest.skills === undefined ? ["./skills"] : [...(runtime === "claude-code" ? ["./skills"] : []), ...(Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills])];
    for (const value of values) {
      if (typeof value !== "string" || isAbsolute(value) || value.includes("\0") || value.includes("\\")) { warn(`${pluginRoot}：不支持的插件技能路径`); continue; }
      const path = resolve(pluginRoot, value);
      if (!inside(pluginRoot, path) || (existsSync(path) && !inside(realpathSync(pluginRoot), realpathSync(path)))) { warn(`${pluginRoot}：插件技能路径越界，未导入`); continue; }
      if (isDir(path)) result.add(path);
    }
  };
  if (runtime === "claude-code") {
    const index = json(join(root, "plugins/installed_plugins.json")), settings = json(join(root, "settings.json"));
    const enabled = { ...(settings?.enabledPlugins as Record<string, unknown> | undefined),
      ...(source.projectRoot ? json(join(source.projectRoot, ".claude/settings.json"))?.enabledPlugins as Record<string, unknown> | undefined : {}),
      ...(source.projectRoot ? json(join(source.projectRoot, ".claude/settings.local.json"))?.enabledPlugins as Record<string, unknown> | undefined : {}) };
    const marketplaces = json(join(root, "plugins/known_marketplaces.json"));
    if (index?.plugins && typeof index.plugins === "object" && !Array.isArray(index.plugins)) {
      for (const [id, installs] of Object.entries(index.plugins)) {
        if (enabled?.[id] === false || !Array.isArray(installs)) continue;
        const matching = installs.filter(value => value && typeof value === "object" &&
          (value.scope === "user" || (source.projectRoot && ["project", "local"].includes(value.scope) && value.projectPath === source.projectRoot)));
        if (matching.length > 1) { warn(`${id}：安装索引存在多个适用版本，未自动选择`); continue; }
        const install = matching[0];
        if (install && typeof install.installPath === "string" && isAbsolute(install.installPath)) {
          const cache = join(root, "plugins/cache");
          if (!isDir(install.installPath) || !isDir(cache) || !inside(realpathSync(cache), realpathSync(install.installPath))) { warn(`${id}：插件索引路径越界或不存在`); continue; }
          const manifest = json(join(install.installPath, ".claude-plugin/plugin.json"));
          const split = id.lastIndexOf("@"), name = id.slice(0, split), market = id.slice(split + 1);
          const location = (marketplaces?.[market] as Record<string, unknown> | undefined)?.installLocation;
          let marketDefault: unknown;
          if (typeof location === "string" && isAbsolute(location) && isDir(location)
            && inside(realpathSync(root), realpathSync(location))) {
            const registry = json(join(location, ".claude-plugin/marketplace.json"));
            if (Array.isArray(registry?.plugins)) marketDefault = registry.plugins.find(entry => entry && entry.name === name)?.defaultEnabled;
          }
          const defaultEnabled = typeof marketDefault === "boolean" ? marketDefault : manifest?.defaultEnabled !== false;
          if (enabled[id] === true || (enabled[id] !== false && defaultEnabled)) add(install.installPath, ".claude-plugin/plugin.json");
        }
      }
    }
  } else if (runtime === "codex") {
    const enabled = new Map<string, boolean>(), config = text(join(root, "config.toml")) ?? "";
    for (const match of config.matchAll(/^\[plugins\."([^"\r\n]+)"\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/gm)) {
      const value = match[2]!.match(/^enabled\s*=\s*(true|false)\s*(?:#.*)?$/m)?.[1];
      if (value) enabled.set(match[1]!, value === "true");
    }
    const installed = new Set([...enabled].filter(([, value]) => value).map(([id]) => id)), cache = join(root, "plugins/cache");
    let remote = false;
    // Remote installation markers are the only evidence consulted for remote entries absent in config.toml.
    for (const market of entries(cache)) if (component(market) && isDir(join(cache, market))) {
      for (const name of entries(join(cache, market))) if (component(name) && isDir(join(cache, market, name))) {
        const marker = json(join(cache, market, name, ".codex-remote-plugin-install.json"));
        if (marker?.schema_version === 1 && typeof marker.remote_plugin_id === "string" && enabled.get(`${name}@${market}`) !== false) {
          installed.add(`${name}@${market}`); remote = true;
        }
      }
    }
    if (remote) warn("Codex 远程插件根据本机安装标记发现；该标记不提供启用状态，请在预览中核对选择。");
    for (const id of installed) {
      const split = id.lastIndexOf("@"), name = id.slice(0, split), market = id.slice(split + 1);
      if (split < 1 || !component(name) || !component(market)) { warn(`${id}：插件标识无法安全解析`); continue; }
      const parent = join(cache, market, name);
      const versions = entries(parent).filter(version => component(version) && isDir(join(parent, version)) && existsSync(join(parent, version, ".codex-plugin/plugin.json")));
      if (versions.length !== 1) { warn(`${id}：安装索引未唯一确定缓存版本（${versions.length} 个），未自动选取技能`); continue; }
      add(join(parent, versions[0]!), ".codex-plugin/plugin.json");
    }
  } else if (existsSync(join(root, "plugins"))) warn("此 Agent 的插件启用索引尚未支持；未扫描插件缓存，仅导入所列独立 Skills。");
  return [...result];
}
