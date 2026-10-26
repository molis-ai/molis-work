import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { assertContract } from '@molis-ai/molis-work-plugin-sandbox';
import { BUILDER_PLUGIN_ID, builderPromptVersion, type AgentBuilderPorts } from '@molis-ai/molis-work-plugin-builder';
import { agentDefinitionsFor } from '../agent-definitions/agent-definitions.js';
import { builtinRegistrations } from '../agent-definitions/builtin-registrations.js';
import { registeredInstructionBody } from '../agent-definitions/instructions.js';
import { resolvePrologueBuilder } from '../prologue-inference-host.js';
import type { ensureInstalledPlugins } from '../installed-plugin-host.js';
import { builderSkill } from './skill.js';
import { buildSources, readPluginPrompts } from './prompts.js';
import { STABLE_PREVIEW } from './storage.js';
import { buildManifest, canonical, createBuildProject, readBuildFile } from './build-project.js';
import { runPluginChecks } from './build-checks.js';
import { runBuilderBrowserAcceptance, inspectBuilderPresentation } from './browser.js';
import { slowOperations } from './capabilities.js';
import { CATALOG_VERSION, PLATFORM_PROVIDER_ID, designerCatalog } from './catalog.js';
import { PREVIEW_KEY, buildEffects, type StudioPreview } from './studio-preview.js';
import type { StudioModels } from './studio-models.js';
import type { AgentStudioOptions, Studio } from './studio-types.js';

/**
 * Plugin Builder's Agent prompts as the person left them in “Prompt 与 Character”. The version names which text ran
 * (`designer/3.2.0+user.2` for their second edit), so every run's record says so.
 */
export function builderPrompts(home: string): NonNullable<AgentBuilderPorts['prompt']> {
  return (name, shipped) => {
    const resolved = agentDefinitionsFor(home, builtinRegistrations).effective(BUILDER_PLUGIN_ID, { prompt_id: `builder-${name}`, version: builderPromptVersion(name), layer: "role", body: shipped.text });
    return resolved.user_revision === undefined ? shipped : { version: `${shipped.version}+user.${resolved.user_revision}`, text: resolved.body };
  };
}

/**
 * The two questions the studio puts to Jev (`choose.capability`, `choose.component`) as the person left them in 设置 › 提示词. Each
 * read is a recorded use, and the workflow reads one only when it really asks.
 */
export function builderInstructions(home: string): NonNullable<AgentBuilderPorts['instruction']> {
  return prompt => registeredInstructionBody(home, prompt, 'plugin-builder');
}

/** Each operation's last passing source for one build revision, beside (not inside) what the code agent can write. */
const settledFor = (directory: string) => directory + '.settled';

/** What the workflow asks of the Host: the catalog, the agents, the build directory, the checks, the trial, and the release folders. */
export function builderPorts(inputs: {
  options: AgentStudioOptions; home: string; studio: Studio; installed: Awaited<ReturnType<typeof ensureInstalledPlugins>>;
  models: StudioModels; preview: StudioPreview; mockups: NonNullable<AgentBuilderPorts['mockups']>;
  choice: NonNullable<AgentStudioOptions['choice']>;
}): AgentBuilderPorts {
  const { options, home, studio, installed, models: { selected, models: withModels, access }, preview: { previewFor, standIns, network, runnerFor, stopRunner, inTrial }, mockups: images, choice } = inputs;
  return {
    projectId: options.projectId,
    // What a design may use: the project's unified action directory, as offered to generated plugins.
    catalog: async () => designerCatalog(await studio.catalog()),
    catalogVersion: CATALOG_VERSION,
    // A design that uses a plugin this project has not enabled waits for the person; enabling it continues the build.
    async missingPlugins(design) {
      const used = new Set(design.contract.operations.flatMap(operation => operation.effects.capabilities ?? [])), missing = new Map<string, { pluginId: string; title: string; capabilities: string[] }>();
      for (const entry of await studio.catalog()) if (entry.offered && !entry.installed && used.has(entry.id) && entry.source.plugin_id) {
        const item = missing.get(entry.source.plugin_id) ?? { pluginId: entry.source.plugin_id, title: entry.source.title, capabilities: [] };
        item.capabilities.push(entry.title); missing.set(entry.source.plugin_id, item);
      }
      return [...missing.values()];
    },
    ...(options.enablePlugin ? { async enablePlugins(pluginIds: readonly string[]) { for (const pluginId of pluginIds) await options.enablePlugin!(pluginId); } } : {}),
    resources: [],
    ...(options.parallel ? { parallel: options.parallel } : {}),
    mockups: images,
    models: options.models,
    agent: options.agents ?? (async (build, purpose) => {
      const selection = selected();
      if (!selection) throw new Error('请先在右上角选择构建使用的模型');
      const buildRoot = purpose === 'code' && build.directory ? build.directory : join(studio.root, 'design', build.id);
      await mkdir(buildRoot, { recursive: true, mode: 0o700 });
      const create = await resolvePrologueBuilder(home);
      return create({ buildRoot, storageRoot: join(studio.root, 'runs', build.id), ...access(selection) });
    }),
    validateContract: contract => assertContract(contract),
    skill: stage => builderSkill(stage),
    prompt: builderPrompts(home), instruction: builderInstructions(home),
    async prepareBuild(previous, design, manifest) {
      const directory = join(studio.root, 'builds', previous.id, design.contract.revision);
      await rm(directory, { recursive: true, force: true }); await rm(settledFor(directory), { recursive: true, force: true }); await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
      // The code agent reads what each capability the design uses takes and returns, and how checks answer it.
      const used = new Set(design.contract.operations.flatMap(operation => operation.effects.capabilities ?? []));
      const described = (await studio.catalog()).filter(entry => entry.offered && used.has(entry.id)).map(entry => ({ id: entry.id, title: entry.title, description: entry.description, effect: entry.effect, input: entry.input, output: entry.output ?? null,
          inChecks: entry.provider_id === PLATFORM_PROVIDER_ID ? '由固定替身代答（见说明）' : entry.effect === 'read' ? '由替身按输出结构给出示例值（列表里一条记录，文字字段是「示例」）' : '由替身代答，不会真的写入' }));
      await createBuildProject(directory, design.contract, manifest, { capabilities: described as SandboxJson, resources: [] });
      // A revision keeps the implementation and tests of every operation whose contract did not change,
      // so only the parts that actually changed go back to the code agent.
      const before = previous.design, from = previous.directory;
      if (before && from) for (const [index, operation] of design.contract.operations.entries()) {
        const old = before.contract.operations.findIndex(item => item.id === operation.id);
        if (old < 0 || !isDeepStrictEqual(canonical(before.contract.operations[old]), canonical(operation))) continue;
        for (const kind of ['src', 'tests']) {
          try {
            const source = await readBuildFile(from, `${kind}/operations/${old}.ts`);
            await writeFile(join(directory, kind, 'operations', index + '.ts'), source, { mode: 0o600 });
            // It stays connected without another check, so it is settled as it was.
            if (kind === 'src' && previous.connected.includes(operation.id)) { const settled = join(settledFor(directory), 'src/operations'); await mkdir(settled, { recursive: true, mode: 0o700 }); await writeFile(join(settled, index + '.ts'), source, { mode: 0o600 }); }
          }
          catch { /* a missing or unsafe previous file is simply written again by the code agent */ }
        }
      }
      return directory;
    },
    check: (build, operationIds, signal) => runPluginChecks({ root: build.directory!, contract: build.design!.contract, manifest: buildManifest(build.design!.contract),
      operationIds, services: previewFor(), mockServices: { capability: standIns, network }, grants: buildEffects(build), signal, settled: settledFor(build.directory!),
      identity: { projectId: options.projectId, installationId: 'checks:' + build.id, pluginId: build.design!.contract.pluginId, namespace: 'preview' } }),
    call: async (build, operationId, input, control) => {
      const capabilities = await studio.catalog();
      return (await runnerFor(build, slowOperations(build.design!.contract, capabilities).has(operationId) ? 'slow' : 'quick', capabilities)).call(operationId, input, control);
    },
    async sources(build) {
      if (!build.directory) return [];
      const entries = await readdir(join(build.directory, 'src'), { withFileTypes: true }).catch(() => []);
      return entries.filter(entry => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts').map(entry => 'src/' + entry.name).sort();
    },
    async resetPreview(buildId, beforeReset) { beforeReset?.(); await stopRunner(buildId); beforeReset?.(); studio.storage.delete(PREVIEW_KEY + STABLE_PREVIEW + buildId); },
    presentation: true,
    visionAvailable: () => { const selection = selected(); return !!selection && withModels(store => store?.list().find(provider => provider.provider_id === selection.provider_id)?.models.find(model => model.model_id === selection.model_id)?.vision === true); },
    inspectPresentation: (build, signal) => inTrial(build, signal, options => inspectBuilderPresentation(build, options)),
    choose: choice.choose, selectionAvailable: () => choice.selectionAvailable(),
    browserAcceptance: (build, signal) => inTrial(build, signal, options => runBuilderBrowserAcceptance(build, options)),
    async publish(build, manifest, bundlePath, version) {
      const directory = join(studio.root, 'releases', build.id, 'v' + version);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const target = join(directory, 'plugin.mjs');
      await writeFile(target, await readBuildFile(dirname(bundlePath), bundlePath.slice(dirname(bundlePath).length + 1), 8 * 1024 * 1024), { mode: 0o400, flag: 'wx' });
      await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o400, flag: 'wx' });
      await writeFile(join(directory, 'contract.json'), JSON.stringify(build.design!.contract, null, 2), { mode: 0o400, flag: 'wx' });
      await writeFile(join(directory, 'interface.json'), JSON.stringify({ parts: build.design!.parts, nodes: build.nodes, acceptance: build.design!.acceptance, presentation: build.design!.presentation }, null, 2), { mode: 0o400, flag: 'wx' });
      // What it tells the model, as the checked sources declare it: registered when this version is installed.
      const { prompts, problems } = readPluginPrompts(await buildSources(build.directory!, settledFor(build.directory!), build.design!.contract.operations.length));
      if (problems.length) throw new Error('发布前请先修好调用模型的写法：' + problems[0]);
      await writeFile(join(directory, 'prompts.json'), JSON.stringify(prompts, null, 2), { mode: 0o400, flag: 'wx' });
      return { directory, bundlePath: target, packagePath: directory, prompts };
    },
    installations: async () => installed.installations(),
    lifecycle: installed.lifecycle,
  };
}
