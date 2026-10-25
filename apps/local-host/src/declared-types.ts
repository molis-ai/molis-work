import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { readPluginReleaseManifest, readPluginRuntimeRecords } from "@molis-ai/molis-work-plugin-runtime";
import { HOST_ARTIFACT_PRODUCERS, type InstalledArtifactView } from "./artifact-type-registry.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

type Declares = { artifacts: Pick<PluginManifest["artifacts"], "produces">; process_items?: PluginManifest["process_items"] };

// The supervisors of one project, by its database connection: a project can run more than one (its own plugins, and the installed
// ones). A write is judged by the project it is written in, never by what other projects have open.
const projectViews = new WeakMap<object, Set<InstalledArtifactView>>();

/** The project whose database is `db` has this supervisor's installs to answer for. Returns the way to let go of it when the platform closes. */
export function bindProjectArtifacts(db: object, view: InstalledArtifactView): () => void {
  const views = projectViews.get(db) ?? new Set<InstalledArtifactView>();
  projectViews.set(db, views.add(view));
  return () => { views.delete(view); };
}

/** What this Build declares for a producer that ships with it: a built-in plugin's Manifest, or the Host's own producer's entry (it writes no process items). */
function shippedDeclaration(pluginId: string): Declares | undefined {
  return PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.manifest.plugin_id === pluginId)?.manifest
    ?? HOST_ARTIFACT_PRODUCERS.filter(host => host.plugin_id === pluginId).map(host => ({ artifacts: { produces: host.produces } }))[0];
}

/**
 * What a project's version stores ask before they write (specs/artifact-positioning A7; S-81). A producer writes only the types the
 * Manifest of its installation in THIS project declares, to the store it declares them for: 成果 under `artifacts.produces`,
 * process items under `process_items.produces`. A built-in plugin or the Host's own producer is held to the Manifest it is running
 * (the build's, where the project has no supervisor for it). Any other producer must be an installation in effect in this project;
 * one that was disabled or uninstalled here writes nothing, and a project the Host holds no supervisor for, or one that cannot be
 * asked, writes nothing for it either: the answer is a refusal, never a pass.
 * `restoring` is the one exception (S-81): a project rebuilt from a work-assets bundle takes the history of producers it has not installed
 * yet, and says so in its warnings. Its fresh connection reads the target's persisted installations and their exact release Manifests,
 * including disabled installations, without starting them. An unreadable installation or release refuses; ordinary writes still ask only their supervisors.
 */
export function projectTypeDeclared(db: Parameters<typeof readPluginRuntimeRecords>[0], restoring = false) {
  return (producer: { plugin_id: string }, type: { artifact_type_id: string; schema_version: number }, kind: "artifact" | "process_item"): string | null => {
    const store = kind === "artifact" ? "成果库" : "过程项";
    const shipped = shippedDeclaration(producer.plugin_id), views = [...projectViews.get(db) ?? []];
    let installed: PluginManifest | undefined, known = false;
    try {
      if (restoring) {
        // The restore opens another connection, with no supervisor bound to it. Ask the target's own persistent owner instead.
        const records = readPluginRuntimeRecords(db).filter(record => record.plugin_id === producer.plugin_id);
        known = records.length > 0;
        const record = records.find(record => record.state !== "uninstalled");
        if (record) {
          installed = readPluginReleaseManifest(db, record) ?? undefined;
          if (!installed) throw new Error(`读不到已装插件 ${producer.plugin_id}@${record.version} 的 Manifest`);
        }
      } else {
        installed = views.flatMap(view => view.effectiveManifests()).find(manifest => manifest.plugin_id === producer.plugin_id);
        known = views.some(view => view.knownPluginIds().includes(producer.plugin_id));
      }
    } catch (error) {
      return `${producer.plugin_id} 在这个项目里装着的情况查不到（${error instanceof Error ? error.message : String(error)}），不能写入${store}`;
    }
    if ((shipped || restoring) && known && !installed) return `${producer.plugin_id} 在这个项目里已停用或已卸载，不能写入${store}`;
    const source: Declares | undefined = installed ?? shipped;
    if (!source && restoring && !known) return null;
    if (!source) return views.length === 0 ? `${producer.plugin_id} 没有找到这个项目的插件监督器，不能确认它装着，不能写入${store}`
      : known ? `${producer.plugin_id} 在这个项目里已停用或已卸载，不能写入${store}` : `${producer.plugin_id} 不是这个项目里装着的插件，不能写入${store}`;
    const field = kind === "artifact" ? "artifacts.produces" : "process_items.produces";
    const list = kind === "artifact" ? source.artifacts.produces : source.process_items?.produces ?? [];
    return list.some(item => item.artifact_type_id === type.artifact_type_id && item.schema_version === type.schema_version) ? null
      : `${producer.plugin_id} 没有在 ${field} 声明 ${type.artifact_type_id}@${type.schema_version}，不能写入${store}`;
  };
}
