import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ActionError, IMAGE_GENERATION_ROLES, imageGenerationRoleOf, type ActionCallContext, type ActionView, type ImageGenerationRole } from '@molis-ai/molis-work-contracts/platform/actions';
import type { StudioImageBinding } from '@molis-ai/molis-work-plugin-studio';
import { assertStageInstallation, installedStageIdentity } from '../installed-stage-identity.js';
import type { ensureInstalledPlugins } from '../installed-plugin-host.js';
import { matchingActions } from '../local-host-types.js';
import { imageTypeOf } from '../material-attachments.js';
import { currentProjectPlatform } from '../project-plugins.js';
import type { AgentBuilderPorts, AgentStudioOptions, Studio } from './agent-surface.js';

type ImageRoles = Record<ImageGenerationRole, ActionView>;
type Generator = { roles: ImageRoles; permissions: string[] };
type Job = { id: string; connection_id: string; status: string; images: Array<{ id: string }>; error: string };
type Service = { id: string; available?: boolean };
const changed = () => new ActionError('actions.provider_changed', '原来的配图插件或连接已经变化，请重新选择。');

function generators(views: readonly ActionView[]): Generator[] {
  const groups = new Map<string, Partial<ImageRoles>>();
  for (const view of views) {
    const role = imageGenerationRoleOf(view.action);
    if (!view.availability.available || !role || view.provider.kind !== 'plugin' || !view.provider.plugin_install_id) continue;
    const key = JSON.stringify([view.provider.project_id ?? null, view.provider.plugin_install_id, view.provider.provider_id]);
    const group = groups.get(key) ?? {};
    group[role] ??= view;
    groups.set(key, group);
  }
  const complete: Generator[] = [];
  for (const group of groups.values()) {
    if (!IMAGE_GENERATION_ROLES.every(role => group[role])) continue;
    const roles = group as ImageRoles;
    complete.push({ roles, permissions: [...new Set(IMAGE_GENERATION_ROLES.flatMap(role => roles[role].action.permissions))] });
  }
  return complete;
}
export function imageGeneratorOf(views: readonly ActionView[]): Generator | undefined { return generators(views)[0]; }

export function studioImages(options: AgentStudioOptions, installed: Awaited<ReturnType<typeof ensureInstalledPlugins>>) {
  const { actions } = installed;
  const person = (permissions: readonly string[], signal?: AbortSignal): ActionCallContext => ({
    actor_id: options.actorId ?? 'web-user', project_id: actions.project_id, audience: 'user', permissions, signal,
  });
  const catalog = async (signal?: AbortSignal, owner?: StudioImageBinding) => {
    signal?.throwIfAborted();
    const declared = await options.actions?.inspect?.(person([], signal)) ?? [];
    const roles = declared.filter(({ action, provider }) => imageGenerationRoleOf(action) && provider.kind === 'plugin'
      && provider.plugin_install_id && (!owner || provider.provider_id === owner.provider_id && provider.plugin_install_id === owner.install_id
        && (provider.project_id ?? null) === (owner.scope === 'project' ? owner.project_id : null)));
    if (!roles.length) return [];
    const permissions = [...new Set(roles.flatMap(view => view.action.permissions))];
    // One availability snapshot for the declared roles. Each actual invocation still uses only its own permissions.
    const key = (row: Pick<ActionView, 'capability_id' | 'version'>, provider: ActionView['provider']) =>
      JSON.stringify([provider.project_id, provider.plugin_install_id, provider.provider_id, row.capability_id, row.version]);
    const declaredKeys = new Set(roles.map(view => key(view, view.provider)));
    const checked = await matchingActions(actions.client, person(permissions, signal),
      (definition, provider) => declaredKeys.has(key(definition, provider)));
    const byKey = new Map(checked.map(view => [key(view, view.provider), view]));
    return generators(roles.flatMap(view => byKey.get(key(view, view.provider)) ?? []));
  };
  const recordOf = (scope: 'project' | 'home', id: string) => scope === 'home' ? options.homeInstallation?.(id)
    : currentProjectPlatform(options.store, options.projectId)?.runtime.list().find(record => record.install_id === id)
      ?? installed.platform.runtime.list().find(record => record.install_id === id);
  const assertOwner = (owner: StudioImageBinding) => {
    if (owner.project_id !== options.projectId) throw changed();
    assertStageInstallation(owner.scope, recordOf(owner.scope, owner.install_id), owner);
  };
  async function invoke<T>(group: Generator, role: ImageGenerationRole, input: unknown, owner: StudioImageBinding, signal?: AbortSignal): Promise<T> {
    const view = group.roles[role];
    if (view.provider.plugin_install_id !== owner.install_id || view.provider.provider_id !== owner.provider_id
      || (view.provider.project_id ?? null) !== (owner.scope === 'project' ? owner.project_id : null)) throw changed();
    const check = () => {
      signal?.throwIfAborted();
      assertOwner(owner);
    };
    check();
    const result = await actions.client.invoke({ ...person(view.action.permissions, signal), validate_authority: check, assert_authority_current: check },
      { capability_id: view.capability_id, version: view.version, provider_id: owner.provider_id }, input);
    check();
    return result as T;
  }
  async function* choices(signal?: AbortSignal) {
    for (const group of await catalog(signal)) {
      const provider = group.roles.generate.provider, scope = provider.project_id ? 'project' : 'home';
      if (provider.project_id && provider.project_id !== options.projectId) continue;
      const record = recordOf(scope, provider.plugin_install_id!);
      if (!record || record.state !== 'running') continue;
      const owner = { ...installedStageIdentity(scope, record), provider_id: provider.provider_id, project_id: options.projectId, connection_id: '' };
      let listed: { connections: Service[] };
      try { listed = await invoke<{ connections: Service[] }>(group, 'services.list', {}, owner, signal); }
      catch {
        signal?.throwIfAborted();
        continue;
      }
      for (const connection of listed.connections.filter(item => item.available !== false)) {
        const binding = { ...owner, connection_id: connection.id };
        const key = createHash('sha256').update(JSON.stringify(binding)).digest('hex');
        yield { group, owner: binding, key, title: provider.title + ' · ' + connection.id };
      }
    }
  }
  async function choose(signal?: AbortSignal) { for await (const item of choices(signal)) return item; }
  async function imageChoices() {
    const offered: { key: string; title: string }[] = [];
    for await (const { key, title } of choices()) offered.push({ key, title });
    return offered;
  }
  async function checkConnection(group: Generator, owner: StudioImageBinding, signal?: AbortSignal) {
    const listed = await invoke<{ connections: Service[] }>(group, 'services.list', {}, owner, signal);
    if (!listed.connections.some(service => service.id === owner.connection_id && service.available !== false)) throw changed();
  }
  async function bound(owner: StudioImageBinding, signal?: AbortSignal) {
    assertOwner(owner);
    const [group] = await catalog(signal, owner);
    if (!group) throw changed();
    await checkConnection(group, owner, signal);
    return group;
  }
  const mockups: NonNullable<AgentBuilderPorts['mockups']> = {
    available: async signal => Boolean(await choose(signal).catch(() => undefined)),
    async select(key) {
      for await (const item of choices()) if (item.key === key) return item.owner;
      throw changed();
    },
    async draw(request, signal) {
      const previous = request.previous;
      const chosen = previous?.binding ? { group: await bound(previous.binding, signal), owner: previous.binding } : await choose(signal);
      if (!chosen) return { reason: '没有可用的生图服务' };
      const { group, owner } = chosen;
      // Commit the binding before the first charge. A lost reply can only repeat this request id with the same owner.
      request.checkpoint({ binding: owner, ...(previous?.jobId ? { jobId: previous.jobId } : {}) });
      let { job } = previous?.jobId
        ? await invoke<{ job: Job }>(group, 'generations.get', { id: previous.jobId }, owner, signal)
        : await invoke<{ job: Job }>(group, 'generate', { request_id: 'builder-' + request.key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120), connection_id: owner.connection_id, prompt: request.prompt }, owner, signal);
      if (!job.id || job.connection_id !== owner.connection_id || previous?.jobId && previous.jobId !== job.id) throw changed();
      const jobId = job.id;
      request.checkpoint({ binding: owner, jobId });
      for (let waited = 0; job.status === 'running' && waited < 180_000; waited += 3_000) {
        await delay(3_000, undefined, { signal });
        await checkConnection(group, owner, signal);
        ({ job } = await invoke<{ job: Job }>(group, 'generations.get', { id: jobId }, owner, signal));
        if (job.id !== jobId || job.connection_id !== owner.connection_id) throw changed();
      }
      return job.status === 'succeeded' && job.images[0] ? { jobId, imageId: job.images[0].id, binding: owner }
        : { reason: job.error || (job.status === 'running' ? '三分钟内没有画完' : '没有画出来'), ...(job.status !== 'running' ? { regenerate: true as const } : {}) };
    },
  };
  const mockupImage: NonNullable<Studio['mockupImage']> = async (jobId, imageId, owner) => {
    const group = await bound(owner);
    const { job } = await invoke<{ job: Job }>(group, 'generations.get', { id: jobId }, owner);
    if (job.id !== jobId || job.connection_id !== owner.connection_id || !job.images.some(image => image.id === imageId)) throw changed();
    const image = await invoke<{ base64: string; mime_type: string }>(group, 'image.read', { id: jobId, image_id: imageId }, owner);
    const bytes = Buffer.from(image.base64, 'base64'), type = imageTypeOf(bytes);
    if ((type !== 'image/png' && type !== 'image/jpeg' && type !== 'image/webp') || type !== image.mime_type) return null;
    return { bytes, type };
  };
  return { mockups, mockupImage, imageChoices };
}
