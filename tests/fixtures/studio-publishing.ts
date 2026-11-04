import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginPrivateStorage, PluginExecutionControl } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { createStudioPublisher } from '@molis-ai/molis-work-app-local-host';
import { AgentBuilderWorkflow, type AgentBuilderPorts, type AgentBuild, type AgentRelease, type AgentDesign } from '@molis-ai/molis-work-plugin-builder';
import { packageFiles } from './sandbox-package.js';

/** The fixture's durable storage uses the same compare-and-set contract as the production Builder store. */
export function publicationStorage(path: string): PluginPrivateStorage {
  const read = (): Record<string, string> => JSON.parse(readFileSync(path, 'utf8'));
  return { get: key => read()[key] ?? null,
    set(key, value) { const state = read(); state[key] = value; writeFileSync(path, JSON.stringify(state)); },
    delete(key) { const state = read(); const found = key in state; delete state[key]; writeFileSync(path, JSON.stringify(state)); return found; },
    compareAndSet(key, expected, value) { const state = read(); if ((state[key] ?? null) !== expected) return false; state[key] = value; writeFileSync(path, JSON.stringify(state)); return true; } };
}

export const publicationAuthority = (): PluginExecutionControl => ({ signal: new AbortController().signal, beforeEffect: async () => {}, assert_authority_current() {} });

export function publicationPorts(home: string, root: string): AgentBuilderPorts {
  const unused = async (): Promise<never> => { throw new Error('This publication fixture must not generate, check, or install'); };
  return { projectId: 'author', catalog: async () => [], models: async () => [], agent: unused, validateContract() {}, prepareBuild: unused,
    check: unused, call: unused, resetPreview: async () => {}, browserAcceptance: unused, publish: createStudioPublisher(home, root), installations: async () => [], lifecycle: unused };
}

/** A previously checked fixed source, for publication boundary tests; real checking/browser coverage is separate. */
export function readyPublication(home: string, project: string, scope: 'project' | 'home' = 'home') {
  const root = join(home, 'plugin-builder', project); mkdirSync(root, { recursive: true });
  const statePath = join(root, 'fixture-state.json'); writeFileSync(statePath, '{}');
  const storage = publicationStorage(statePath), ports = publicationPorts(home, root), workflow = new AgentBuilderWorkflow(storage, ports), initial = workflow.store.create('Fixed notes publication');
  const pluginId = 'io.molis.work.generated.' + initial.id;
  const { files } = packageFiles('fixture', undefined, { pluginId });
  const contract = JSON.parse(files['contract.json']!) as SandboxPluginContract;
  contract.operations[1]!.effects.storage = ['write', 'read'];
  const surface = JSON.parse(files['interface.json']!) as { parts: AgentDesign['parts']; nodes: AgentBuild['nodes'] };
  const directory = join(root, 'builds', initial.id, 'one'), bundlePath = join(directory, 'build', 'plugin.mjs');
  mkdirSync(join(directory, 'build'), { recursive: true }); mkdirSync(join(directory, 'src'), { recursive: true });
  writeFileSync(bundlePath, files['plugin.mjs']!, { mode: 0o400 });
  const build = workflow.store.update(initial.id, initial.revision, value => Object.assign(value, {
    design: { id: 'notes', title: 'Fixed notes', description: 'A fixed publication fixture', rationale: 'Test the real publisher', journey: ['Add', 'Read'], contract, parts: surface.parts, acceptance: [] },
    title: 'Fixed notes', directory, nodes: surface.nodes, connected: ['notes.list', 'notes.add'], runtimeScope: scope === 'home' ? 'home' : undefined,
    checksScope: scope === 'home' ? 'home' : undefined, checks: { global: { passed: true, bundlePath, gates: [] } },
    browserResult: { passed: true, cases: [], at: '2026-11-01T00:00:00Z' }, phase: 'ready',
  }));
  const publish = async (authority = publicationAuthority()) => await workflow.action(build.id, { action: 'publish', revision: workflow.store.require(build.id).revision }, authority) as AgentRelease;
  return { root, statePath, storage, ports, workflow, build, publish };
}
