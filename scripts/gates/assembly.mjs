// Built-in plugin assembly gates (specs/repository-anti-corruption §4.6/R-01/R-03, W1-05).
//
// AGENTS.md: a new built-in plugin goes through the Plugin Runtime only (apps/local-host/src/project-plugins.ts). The old
// build-time path (a registerProvider line in project-host.ts, an <plugin>-native-plugin-http.ts file, a catalog entry) is
// frozen and may only shrink; tests/builtin-plugin-assembly-gate.test.ts holds the name lists and checks them against the
// disk. This adds the part a name list cannot do, as numbers compared with the merge-base (so a PR cannot widen them):
//   hostPluginFiles        plugin-named `<plugin>-actions.ts` and `<plugin>-native-plugin-http.ts` files in the Host
//   registerProviderSites  `registerProvider(…)` calls in apps/local-host/src, per file
//   hybridPlugins          a Runtime-assembled plugin that the Host ALSO assembles by hand: Host files named after it, and
//                          registerProvider(<plugin>…Provider(…)) lines. Shelf and Characters are the two today, and so
//                          are the workspace plugins whose Host files carry their name; the report flags them
//   pluginOutsideMentions  per built-in plugin, the files outside its own package that name its package (imports, package.json
//                          dependencies, the workspace map): what adding or removing that plugin touches besides itself
// A plugin that is new at the reference starts at NEW_PLUGIN_OUTSIDE_FILES for the last one; everything else starts at 0.
import ts from "typescript";
import { hasPath, recordMetric } from "./record-metric.mjs";

const HOST_SRC = /^apps\/local-host\/src\//;
const PLUGIN_PACKAGE = /^plugins\/native\/([^/]+)\/package\.json$/;
const PROJECT_PLUGINS = "apps/local-host/src/project-plugins.ts";

/**
 * Text the assembly gates read besides source files: plugin package manifests (names), the root and app manifests and the
 * scripts (they name plugin packages). Read from the merge-base too, so both sides see the same files.
 */
export const assemblyWantsText = (file) => hasPath(file, PLUGIN_PACKAGE, "package.json", /^apps\/[^/]+\/package\.json$/, /^scripts\/[^/]+\.(?:mjs|mts)$/);

/** The singular a Host file may use for a plural plugin directory (artifact-actions.ts for plugins/native/artifacts). */
export const NAME_ALIASES = { artifacts: ["artifact"], characters: ["character"] };
/**
 * What a new built-in plugin may be named in outside its own package, today: the smallest complete plugin (text-stats) is
 * named in this many files. The target is 0 (declaration-only registration, W4-01); no new plugin may take more than the
 * smallest existing one.
 */
export const NEW_PLUGIN_OUTSIDE_FILES = 7;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const camelCase = (name) => name.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
const stemsOf = (plugin) => [plugin, ...(NAME_ALIASES[plugin] ?? [])];

/** What the assembly gates need to know about the snapshot: the plugin directories, their package names, the Runtime set. */
export function describePlugins(snapshot) {
  const plugins = [];
  for (const file of snapshot.files) {
    const match = PLUGIN_PACKAGE.exec(file);
    if (!match) continue;
    let name;
    try { name = JSON.parse(snapshot.read(file) ?? "{}").name; } catch { name = undefined; }
    if (typeof name === "string") plugins.push({ dir: match[1], name });
  }
  const supervisor = snapshot.read(PROJECT_PLUGINS) ?? "";
  const runtime = new Set(plugins.filter((plugin) => supervisor.includes(`"${plugin.name}"`)).map((plugin) => plugin.dir));
  return { plugins: plugins.sort((a, b) => a.dir.localeCompare(b.dir)), runtime };
}

const hostSources = (snapshot, helpers) => snapshot.files.filter((file) => HOST_SRC.test(file) && helpers.isSource(file));
const basenameOf = (file) => file.slice(file.lastIndexOf("/") + 1);

/** `registerProvider(…)` calls of a source text, each with the name of the function that builds its provider (or ""). */
export function registerProviderCalls(file, text) {
  if (!text.includes("registerProvider")) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if ((ts.isIdentifier(callee) && callee.text === "registerProvider") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "registerProvider")) {
        const argument = node.arguments[0];
        calls.push(argument && ts.isCallExpression(argument) && ts.isIdentifier(argument.expression) ? argument.expression.text : "");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

export const assemblyMetrics = (helpers) => {
  const hostPluginFiles = recordMetric(helpers, {
    id: "hostPluginFiles",
    recordKey: "hostPluginFiles",
    totalKey: "hostPluginFilesTotal",
    title: "Host files named for a built-in plugin (<plugin>-actions.ts, <plugin>-native-plugin-http.ts)",
    summaryLabel: "plugin-named host files",
    measure(snapshot) {
      const { plugins } = describePlugins(snapshot);
      const stems = new Set(plugins.flatMap((plugin) => stemsOf(plugin.dir)));
      const record = {};
      for (const file of hostSources(snapshot, helpers)) {
        const match = /^(.+)-(actions|native-plugin-http)\.ts$/.exec(basenameOf(file));
        if (match && stems.has(match[1])) record[`${file}#${match[2]}`] = 1;
      }
      return record;
    },
    message: (key) => `new Host file named for a plugin: ${key.split("#")[0]}; built-in plugins are assembled by the Plugin Runtime and register their own actions and routes from their package (AGENTS.md); the hand-written Host files only shrink`,
  });

  const registerProviderSites = recordMetric(helpers, {
    id: "registerProviderSites",
    recordKey: "registerProviderSites",
    totalKey: "registerProviderSitesTotal",
    title: "registerProvider(…) calls in apps/local-host/src",
    summaryLabel: "host registerProvider",
    measure(snapshot) {
      const record = {};
      for (const file of hostSources(snapshot, helpers)) {
        const calls = registerProviderCalls(file, snapshot.read(file) ?? "").length;
        if (calls) record[`${file}#register-provider`] = calls;
      }
      return record;
    },
    message: (key, was, now) => `registerProvider calls in ${key.split("#")[0]} ${was} → ${now}; the Host does not hand-register another provider (a plugin registers its own through the Plugin Runtime); the existing lines only shrink`,
  });

  const hybridPlugins = recordMetric(helpers, {
    id: "hybridPlugins",
    recordKey: "hybridPlugins",
    totalKey: "hybridPluginsTotal",
    title: "Hybrid plugins: Runtime-assembled plugins that the Host also assembles by hand",
    summaryLabel: "hybrid plugin marks",
    measure(snapshot) {
      const { plugins, runtime } = describePlugins(snapshot);
      const record = {};
      const sources = hostSources(snapshot, helpers);
      const providerCalls = sources.map((file) => registerProviderCalls(file, snapshot.read(file) ?? ""));
      for (const plugin of plugins.filter((item) => runtime.has(item.dir))) {
        const stems = stemsOf(plugin.dir);
        const files = sources.filter((file) => stems.some((stem) => basenameOf(file).startsWith(`${stem}-`) || basenameOf(file) === `${stem}.ts`)).length;
        const providers = providerCalls.flat().filter((callee) => stems.some((stem) => callee.startsWith(camelCase(stem)) && /Provider$/.test(callee))).length;
        if (files) record[`${plugin.dir}#host-files`] = files;
        if (providers) record[`${plugin.dir}#host-providers`] = providers;
      }
      return record;
    },
    message: (key, was, now) => `hybrid plugin ${key.split("#")[0]} ${key.split("#")[1]} ${was} → ${now}; a plugin the Runtime starts does not also get Host code written for it; move the code into the plugin package or behind its declaration`,
    extraLines: (head) => {
      const names = [...new Set(Object.keys(head).map((key) => key.split("#")[0]))].sort();
      const lines = [names.length ? `  flagged as hybrid: ${names.join(", ")}` : "  no hybrid plugin"];
      if (names.includes("characters")) lines.push("  characters: decision 26 (2026-10-08) - no longer a Runtime plugin long-term; its code merges into the Host or a Module (wave 4), the interface stays a section of Settings");
      return lines;
    },
  });

  const pluginOutsideMentions = recordMetric(helpers, {
    id: "pluginOutsideMentions",
    recordKey: "pluginOutsideMentions",
    totalKey: "pluginOutsideMentionsTotal",
    title: "Files outside a built-in plugin's package that name its package",
    summaryLabel: "plugin outside mentions",
    newKeyAllowance: () => NEW_PLUGIN_OUTSIDE_FILES,
    measure(snapshot) {
      const { plugins } = describePlugins(snapshot);
      const candidates = snapshot.files.filter((file) => helpers.isSource(file) || assemblyWantsText(file));
      const texts = new Map(candidates.map((file) => [file, snapshot.read(file)]));
      const record = {};
      for (const plugin of plugins) {
        const own = `plugins/native/${plugin.dir}/`;
        const named = new RegExp(`${escapeRegExp(plugin.name)}(?![\\w-])`);
        let count = 0;
        for (const [file, text] of texts) if (text !== null && !file.startsWith(own) && named.test(text)) count++;
        record[`${plugin.dir}#outside-files`] = count;
      }
      return record;
    },
    message: (key, was, now, isNew) => `plugin ${key.split("#")[0]} is named in ${now} files outside its package (${isNew ? `a new plugin may be named in at most ${was}` : `was ${was}`}); a built-in plugin is registered by its own declaration, not by a name written into another package`,
  });

  return [hostPluginFiles, registerProviderSites, hybridPlugins, pluginOutsideMentions];
};
