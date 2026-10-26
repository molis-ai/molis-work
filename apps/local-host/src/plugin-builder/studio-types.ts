import type { LocalProjectDatabase } from '../project-database.js';
import type { PluginPrivateStorage, PluginExecutionControl } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxJson } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { SandboxRunner } from '@molis-ai/molis-work-plugin-sandbox';
import type { AgentBuilderWorkflow, AgentBuilderPorts } from '@molis-ai/molis-work-plugin-builder';
import type { PluginPlatformOptions } from '../plugin-platform.js';
import type { CapabilityImplementations } from './capabilities.js';
import type { CatalogCapability, ProjectActions } from './catalog.js';

export interface AgentStudioModel { provider_id: string; model_id: string; label: string }
export interface AgentStudioOptions {
  store: LocalProjectDatabase;
  projectId: string;
  homeDirectory?: string;
  routePrefix?: string;
  models(): Promise<readonly AgentStudioModel[]>;
  /** Replaces the Home Runtime agents only where a caller says so, e.g. a labelled local preview. */
  agents?: AgentBuilderPorts['agent'];
  /** Replaces the real model behind `model.generate` only where a caller says so, e.g. a labelled local preview. */
  generate?: CapabilityImplementations['generate'];
  /** Replaces Jev only where a caller says so. */
  choice?: { choose: NonNullable<AgentBuilderPorts['choose']>; selectionAvailable(): boolean };
  browserExecutable?: string;
  actorId?: string;
  dependencyCheck?: PluginPlatformOptions['dependencyCheck'];
  actions?: PluginPlatformOptions['actions'] & Pick<ProjectActions, 'inspect'>;
  /** Enables a built-in plugin in this project (by its manifest id), as project settings would. */
  enablePlugin?(pluginId: string): Promise<void>;
  /** How many operations the code agents write at once (default 3). */
  parallel?: number;
}
/** The studio of one project: its workflow, its private storage, and the trial runners and acceptance calls over them. */
export interface Studio {
  callAcceptance(buildId: string, key: string, componentId: string, binding: 'read' | 'submit', payload: unknown, control?: PluginExecutionControl): Promise<SandboxJson>;
  workflow: AgentBuilderWorkflow;
  storage: PluginPrivateStorage;
  root: string;
  /** The page's own origin; G7 opens the preview on the same local server. */
  origin?: string;
  runners: Map<string, { key: string; runner: Promise<SandboxRunner> }>;
  catalog(): Promise<CatalogCapability[]>;
  /** A proposal's picture from the images plugin (W7). */
  mockupImage?(jobId: string, imageId: string): Promise<{ base64: string; mime_type: string }>;
}
